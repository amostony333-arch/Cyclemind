from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bitget_client import BitgetClient
from config import FRONTEND_ORIGIN
from regime_engine import compute_regime, integrate_liquidation_proximity, ASSET_CONFIDENCE_THRESHOLDS
from indicators import parse_candles, calculate_ema, calculate_rsi, calculate_macd_histogram

app = FastAPI(title="CycleMind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bitget = BitgetClient()


class APICredentials(BaseModel):
    api_key: str
    api_secret: str
    passphrase: str


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "CycleMind"}


# ---------- Live Prices from Bitget ----------

@app.get("/api/prices")
def get_live_prices():
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    coin_map = {"BTCUSDT": "bitcoin", "ETHUSDT": "ethereum", "SOLUSDT": "solana"}
    prices = {}
    for symbol in symbols:
        ticker = bitget.get_futures_ticker(symbol)
        try:
            price = float(ticker["data"][0]["lastPr"])
            change = float(ticker["data"][0].get("change24h", 0)) * 100
            prices[coin_map[symbol]] = {
                "usd": price,
                "usd_24h_change": round(change, 2)
            }
        except (KeyError, IndexError, ValueError, TypeError):
            prices[coin_map[symbol]] = {"usd": 0, "usd_24h_change": 0}
    return prices


# ---------- Trending from Bitget (top movers) ----------

@app.get("/api/trending")
def get_trending():
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"]
    trending = []
    for symbol in symbols:
        ticker = bitget.get_futures_ticker(symbol)
        try:
            price = float(ticker["data"][0]["lastPr"])
            change = float(ticker["data"][0].get("change24h", 0)) * 100
            volume = float(ticker["data"][0].get("baseVolume", 0))
            trending.append({
                "item": {
                    "name": symbol.replace("USDT", ""),
                    "symbol": symbol.replace("USDT", ""),
                    "price": price,
                    "change_24h": round(change, 2),
                    "volume": volume,
                    "market_cap_rank": None
                }
            })
        except (KeyError, IndexError, ValueError, TypeError):
            continue
    trending.sort(key=lambda x: abs(x["item"]["change_24h"]), reverse=True)
    return {"coins": trending}


# ---------- Public Market Data Routes ----------

@app.get("/api/funding-rate/{symbol}")
def get_funding_rate(symbol: str):
    return bitget.get_current_funding_rate(symbol)


@app.get("/api/funding-history/{symbol}")
def get_funding_history(symbol: str, limit: int = 100):
    return bitget.get_history_funding_rates(symbol, limit=limit)


@app.get("/api/open-interest/{symbol}")
def get_open_interest(symbol: str):
    return bitget.get_open_interest(symbol)


@app.get("/api/contract-config/{symbol}")
def get_contract_config(symbol: str):
    return bitget.get_contract_config(symbol=symbol)


@app.get("/api/ticker/{symbol}")
def get_ticker(symbol: str):
    return bitget.get_futures_ticker(symbol)


@app.get("/api/fear-greed")
def get_fear_greed():
    data = bitget.get_fear_greed_index()
    if data is None:
        raise HTTPException(status_code=503, detail="Fear & Greed index unavailable")
    return data


# ---------- Authenticated Account Routes ----------

@app.post("/api/account/spot-balance")
def get_spot_balance(creds: APICredentials):
    client = BitgetClient(creds.api_key, creds.api_secret, creds.passphrase)
    return client.get_spot_account_balance()


@app.post("/api/account/futures-balance")
def get_futures_balance(creds: APICredentials):
    client = BitgetClient(creds.api_key, creds.api_secret, creds.passphrase)
    return client.get_futures_account()


# ---------- Module: Liquidation Heatmap ----------

LEVERAGE_TIERS = [5, 10, 25, 50, 100]


@app.get("/api/liquidation-heatmap/{symbol}")
def liquidation_heatmap(symbol: str):
    ticker = bitget.get_futures_ticker(symbol)
    oi = bitget.get_open_interest(symbol)
    try:
        mark_price = float(ticker["data"][0]["lastPr"])
    except (KeyError, IndexError, ValueError, TypeError):
        raise HTTPException(status_code=502, detail="Could not retrieve current price")
    clusters = []
    for leverage in LEVERAGE_TIERS:
        long_liq = mark_price * (1 - 1 / leverage)
        short_liq = mark_price * (1 + 1 / leverage)
        clusters.append({
            "leverage": leverage,
            "long_liquidation_price": round(long_liq, 2),
            "short_liquidation_price": round(short_liq, 2),
        })
    return {
        "symbol": symbol,
        "mark_price": mark_price,
        "open_interest": oi.get("data"),
        "clusters": clusters,
    }


# ---------- Module: Funding Rate Capture Signal ----------

@app.get("/api/funding-signal/{symbol}")
def funding_signal(symbol: str):
    history = bitget.get_history_funding_rates(symbol, limit=100)
    current = bitget.get_current_funding_rate(symbol)
    try:
        rates = [float(item["fundingRate"]) for item in history.get("data", [])]
        current_rate = float(current["data"][0]["fundingRate"])
    except (KeyError, IndexError, ValueError, TypeError):
        raise HTTPException(status_code=502, detail="Could not compute funding signal")
    if not rates:
        raise HTTPException(status_code=502, detail="No funding rate history available")
    rates_sorted = sorted(rates)
    n = len(rates_sorted)
    rank = sum(1 for r in rates_sorted if r <= current_rate)
    percentile = rank / n * 100
    is_extreme = percentile >= 90 or percentile <= 10
    suggested_direction = None
    if is_extreme:
        suggested_direction = "short_perp_long_spot" if current_rate > 0 else "long_perp_short_spot"
    return {
        "symbol": symbol,
        "current_funding_rate": current_rate,
        "percentile_vs_30d": round(percentile, 1),
        "is_extreme": is_extreme,
        "suggested_strategy": suggested_direction,
    }


# ---------- Module: Composite Regime Detection ----------

@app.get("/api/regime/{symbol}")
def get_regime(symbol: str):
    candles_raw = bitget.get_candles(symbol, granularity="1H", limit=100)
    funding = bitget.get_current_funding_rate(symbol)
    ticker = bitget.get_futures_ticker(symbol)
    try:
        candles = parse_candles(candles_raw["data"])
    except (KeyError, TypeError, ValueError, IndexError):
        raise HTTPException(status_code=502, detail="Could not parse candle data")
    if len(candles) < 30:
        raise HTTPException(status_code=502, detail="Insufficient candle history")
    closes = [c["close"] for c in candles]
    rsi = calculate_rsi(closes)
    macd_hist = calculate_macd_histogram(closes)
    ema_50 = calculate_ema(closes, 50)
    try:
        funding_rate = float(funding["data"][0]["fundingRate"])
    except (KeyError, IndexError, ValueError, TypeError):
        funding_rate = 0.0
    btc_dominance_change_pct = 0.0
    if symbol != "BTCUSDT":
        btc_candles_raw = bitget.get_candles("BTCUSDT", granularity="1H", limit=30)
        try:
            btc_candles = parse_candles(btc_candles_raw["data"])
            btc_dominance_change_pct = ((btc_candles[-1]["close"] - btc_candles[0]["close"]) / btc_candles[0]["close"]) * 100
        except (KeyError, TypeError, ValueError, IndexError):
            pass
    result = compute_regime(
        symbol=symbol,
        candles=candles,
        rsi=rsi,
        macd_histogram=macd_hist,
        ema_50=ema_50,
        funding_rate=funding_rate,
        btc_dominance_change_pct=btc_dominance_change_pct,
    )
    response = {
        "symbol": result.symbol,
        "regime": result.regime.value,
        "confidence": result.confidence,
        "threshold": result.threshold,
        "meets_threshold": result.meets_threshold,
        "components": result.components,
    }
    try:
        mark_price = float(ticker["data"][0]["lastPr"])
        clusters = []
        for leverage in [5, 10, 25, 50, 100]:
            clusters.append({
                "leverage": leverage,
                "long_liquidation_price": round(mark_price * (1 - 1 / leverage), 2),
                "short_liquidation_price": round(mark_price * (1 + 1 / leverage), 2),
            })
        liq_context = integrate_liquidation_proximity(result, mark_price, clusters)
        response["liquidation_context"] = liq_context
    except (KeyError, IndexError, ValueError, TypeError):
        response["liquidation_context"] = None
    return response


@app.get("/api/regime-overview")
def regime_overview():
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    overview = {}
    for symbol in symbols:
        try:
            overview[symbol] = get_regime(symbol)
        except HTTPException as e:
            overview[symbol] = {"error": e.detail}
    return overview


# ---------- Module: Market Overview (no auth needed) ----------

@app.get("/api/market-overview")
def market_overview():
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    overview = []
    for symbol in symbols:
        ticker = bitget.get_futures_ticker(symbol)
        funding = bitget.get_current_funding_rate(symbol)
        oi = bitget.get_open_interest(symbol)
        try:
            price = float(ticker["data"][0]["lastPr"])
            change = float(ticker["data"][0].get("change24h", 0)) * 100
            funding_rate = float(funding["data"][0]["fundingRate"])
            oi_val = oi.get("data", [{}])
            overview.append({
                "symbol": symbol,
                "price": price,
                "change_24h": round(change, 2),
                "funding_rate": round(funding_rate * 100, 4),
                "open_interest": oi_val,
            })
        except (KeyError, IndexError, ValueError, TypeError):
            overview.append({"symbol": symbol, "error": "unavailable"})
    return {"markets": overview}


# ---------- Module: Portfolio Rebalancer ----------

RISK_PROFILE_TARGETS = {
    "conservative": {"BTC": 50, "ETH": 25, "SOL": 10, "USDT": 15},
    "balanced":     {"BTC": 40, "ETH": 30, "SOL": 15, "USDT": 15},
    "aggressive":   {"BTC": 30, "ETH": 30, "SOL": 30, "USDT": 10},
}


class RebalanceRequest(BaseModel):
    api_key: str
    api_secret: str
    passphrase: str
    risk_profile: str = "balanced"


@app.post("/api/rebalance")
def rebalance_portfolio(req: RebalanceRequest):
    if req.risk_profile not in RISK_PROFILE_TARGETS:
        raise HTTPException(status_code=400, detail="risk_profile must be conservative, balanced, or aggressive")
    client = BitgetClient(req.api_key, req.api_secret, req.passphrase)
    balance_data = client.get_spot_account_balance()
    if "error" in balance_data or balance_data.get("code") not in (None, "00000"):
        raise HTTPException(status_code=502, detail=f"Could not fetch balance: {balance_data}")
    holdings = {}
    try:
        for asset in balance_data.get("data", []):
            coin = asset.get("coin")
            available = float(asset.get("available", 0))
            frozen = float(asset.get("frozen", 0))
            total = available + frozen
            if total > 0:
                holdings[coin] = total
    except (ValueError, TypeError):
        raise HTTPException(status_code=502, detail="Could not parse balance data")
    if not holdings:
        return {"holdings": {}, "message": "No balances found on this account."}
    prices = {"USDT": 1.0}
    for coin in holdings:
        if coin == "USDT":
            continue
        symbol = f"{coin}USDT"
        ticker = bitget.get_spot_ticker(symbol)
        try:
            prices[coin] = float(ticker["data"][0]["lastPr"])
        except (KeyError, IndexError, ValueError, TypeError):
            prices[coin] = None
    total_value_usd = 0.0
    valued_holdings = {}
    for coin, amount in holdings.items():
        price = prices.get(coin)
        if price is None:
            continue
        value = amount * price
        valued_holdings[coin] = {"amount": amount, "price": price, "value_usd": round(value, 2)}
        total_value_usd += value
    if total_value_usd == 0:
        return {"holdings": holdings, "message": "Could not price any holdings."}
    current_allocation_pct = {
        coin: round((data["value_usd"] / total_value_usd) * 100, 1)
        for coin, data in valued_holdings.items()
    }
    target = dict(RISK_PROFILE_TARGETS[req.risk_profile])
    for coin in ["BTC", "ETH", "SOL"]:
        symbol = f"{coin}USDT"
        try:
            regime_result = get_regime(symbol)
            regime = regime_result.get("regime", "")
            if "downtrend" in regime and coin in target:
                shift = 5 if regime == "weak_downtrend" else 8
                shift = min(shift, target[coin])
                target[coin] -= shift
                target["USDT"] = target.get("USDT", 0) + shift
        except HTTPException:
            continue
    rebalance_plan = []
    for coin, target_pct in target.items():
        current_pct = current_allocation_pct.get(coin, 0)
        diff_pct = target_pct - current_pct
        if abs(diff_pct) < 1.0:
            continue
        diff_usd = (diff_pct / 100) * total_value_usd
        action = "buy" if diff_usd > 0 else "sell"
        rebalance_plan.append({
            "asset": coin,
            "current_pct": current_pct,
            "target_pct": target_pct,
            "action": action,
            "amount_usd": round(abs(diff_usd), 2),
        })
    return {
        "total_value_usd": round(total_value_usd, 2),
        "current_allocation_pct": current_allocation_pct,
        "target_allocation_pct": target,
        "risk_profile": req.risk_profile,
        "rebalance_plan": rebalance_plan,
        "note": "Suggested plan only. No trades executed.",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
