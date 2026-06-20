from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bitget_client import BitgetClient
from config import FRONTEND_ORIGIN
from regime_engine import compute_regime, integrate_liquidation_proximity, ASSET_CONFIDENCE_THRESHOLDS
from indicators import (
    parse_candles,
    calculate_ema,
    calculate_rsi,
    calculate_macd_histogram,
    calculate_sma,
    calculate_bollinger_bands,
    find_support_resistance,
)

import asyncio
import json
import os
import uuid
import secrets
import requests
from datetime import datetime, timezone, date
from pathlib import Path

app = FastAPI(title="CycleMind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bitget = BitgetClient()

# ==================== CONSTANTS ====================

LEVERAGE_TIERS = [5, 10, 25, 50, 100]
RISK_PROFILE_TARGETS = {
    "conservative": {"BTC": 50, "ETH": 25, "SOL": 10, "USDT": 15},
    "balanced":     {"BTC": 40, "ETH": 30, "SOL": 15, "USDT": 15},
    "aggressive":   {"BTC": 30, "ETH": 30, "SOL": 30, "USDT": 10},
}

DEMO_STARTING_BALANCE = 10000.0
MIN_TRADE_SIZE_USD = 10.0
MAX_TRADE_SIZE_USD = 1000.0
DEFAULT_TRADE_SIZE_USD = 250.0
AUTO_TRADE_COOLDOWN_SECONDS = 900   # 15-min cooldown per coin
AUTO_TRADE_INTERVAL_SECONDS = 60    # background loop frequency
DAILY_LOSS_LIMIT_PCT = 10.0         # halt auto-trade if daily drawdown exceeds this
MAX_POSITION_PCT = 40.0             # max single-asset exposure via auto-trade
MAX_EQUITY_HISTORY_POINTS = 200

USERS_FILE = Path("users.json")
BREVO_API_KEY = os.environ.get("BREVO_API_KEY")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "amostony333@gmail.com")
BREVO_SENDER_NAME = "CycleMind"
MAGIC_LINKS_FILE = Path("magic_links.json")
MAGIC_LINK_EXPIRY_MINUTES = 15
FRONTEND_URL = "https://cyclemind.vercel.app"

# ==================== MODELS ====================

class APICredentials(BaseModel):
    api_key: str
    api_secret: str
    passphrase: str


class RebalanceRequest(BaseModel):
    api_key: str
    api_secret: str
    passphrase: str
    risk_profile: str = "balanced"


class EmailSignup(BaseModel):
    email: str
    wallet_address: str


class DemoTradeRequest(BaseModel):
    email: str
    coin: str       # "BTC" | "ETH" | "SOL"
    side: str       # "buy" | "sell"
    amount_usd: float


class UserSettings(BaseModel):
    email: str
    default_trade_size_usd: float | None = None
    auto_trade_enabled: bool | None = None
    confirm_risk_acknowledged: bool | None = None   # required True when enabling auto-trade

# ==================== USER STORE HELPERS ====================

def _load_users():
    if not USERS_FILE.exists():
        return {}
    try:
        return json.loads(USERS_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _save_users(users):
    USERS_FILE.write_text(json.dumps(users, indent=2))


def _load_links():
    if not MAGIC_LINKS_FILE.exists():
        return {}
    try:
        return json.loads(MAGIC_LINKS_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def _save_links(links):
    MAGIC_LINKS_FILE.write_text(json.dumps(links, indent=2))


def _get_user(email: str):
    users = _load_users()
    return users.get(email.lower())


def _update_user(email: str, data: dict):
    users = _load_users()
    key = email.lower()
    if key not in users:
        raise HTTPException(status_code=404, detail="User not found")
    users[key].update(data)
    _save_users(users)
    return users[key]


def _ensure_user_defaults(user: dict) -> dict:
    user.setdefault("default_trade_size_usd", DEFAULT_TRADE_SIZE_USD)
    user.setdefault("auto_trade_enabled", False)
    user.setdefault("last_auto_trade", {})
    user.setdefault("kill_switch_active", False)
    user.setdefault("daily_start_equity", DEMO_STARTING_BALANCE)
    user.setdefault("daily_start_date", date.today().isoformat())
    user.setdefault("auto_trade_halted_reason", None)
    user.setdefault("equity_history", [])   # [{ "t": iso_timestamp, "equity": float }]
    return user

# ==================== BREVO EMAIL HELPER ====================

def _send_email_brevo(to_email: str, subject: str, html_content: str):
    """Send a transactional email via Brevo API."""
    if not BREVO_API_KEY:
        raise HTTPException(status_code=500, detail="Email service not configured — BREVO_API_KEY missing")

    resp = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={
            "api-key": BREVO_API_KEY,
            "Content-Type": "application/json",
        },
        json={
            "sender": {"name": BREVO_SENDER_NAME, "email": BREVO_SENDER_EMAIL},
            "to": [{"email": to_email}],
            "subject": subject,
            "htmlContent": html_content,
        },
        timeout=10,
    )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Could not send email: {resp.text}")
    return resp

# ==================== RISK / EQUITY HELPERS ====================

def _compute_equity(user: dict) -> float:
    """Mark-to-market total equity (cash + positions) using live prices."""
    coin_map = {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT"}
    equity = user["demo_balance_usdt"]
    for coin, pos in user.get("demo_positions", {}).items():
        symbol = coin_map.get(coin)
        if not symbol:
            continue
        ticker = bitget.get_futures_ticker(symbol)
        try:
            price = float(ticker["data"][0]["lastPr"])
        except (KeyError, IndexError, ValueError, TypeError):
            price = pos["avg_entry"]
        equity += pos["amount"] * price
    return equity


def _roll_daily_tracking_if_needed(user: dict) -> dict:
    today = date.today().isoformat()
    if user.get("daily_start_date") != today:
        user["daily_start_date"] = today
        user["daily_start_equity"] = _compute_equity(user)
        user["equity_history"] = []     # fresh sparkline each day
    return user


def _record_equity_snapshot(email: str, user: dict):
    """Appends an equity point, capped to MAX_EQUITY_HISTORY_POINTS for today."""
    equity = _compute_equity(user)
    history = user.get("equity_history", [])
    history.append({"t": datetime.now(timezone.utc).isoformat(), "equity": round(equity, 2)})
    if len(history) > MAX_EQUITY_HISTORY_POINTS:
        history = history[-MAX_EQUITY_HISTORY_POINTS:]
    _update_user(email, {"equity_history": history})
    return history


def _check_risk_limits(user: dict, coin: str, side: str, amount_usd: float) -> str | None:
    """Returns a reason string if a trade should be blocked, else None."""
    if user.get("kill_switch_active"):
        return "Kill switch is active. Auto-trading is halted until manually reset."

    user = _roll_daily_tracking_if_needed(user)
    equity = _compute_equity(user)

    # Daily loss limit
    daily_pnl_pct = ((equity - user["daily_start_equity"]) / user["daily_start_equity"]) * 100
    if daily_pnl_pct <= -DAILY_LOSS_LIMIT_PCT:
        return f"Daily loss limit reached ({daily_pnl_pct:.1f}% ≤ -{DAILY_LOSS_LIMIT_PCT}%). Auto-trading halted for today."

    # Max position cap (buys only)
    if side == "buy":
        existing = user.get("demo_positions", {}).get(coin, {"amount": 0.0, "avg_entry": 0.0})
        coin_map = {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT"}
        ticker = bitget.get_futures_ticker(coin_map[coin])
        try:
            price = float(ticker["data"][0]["lastPr"])
        except (KeyError, IndexError, ValueError, TypeError):
            price = existing["avg_entry"] or 1.0
        projected_position_value = (existing["amount"] * price) + amount_usd
        projected_pct = (projected_position_value / equity) * 100 if equity else 0
        if projected_pct > MAX_POSITION_PCT:
            return f"Trade would push {coin} to {projected_pct:.1f}% of portfolio, exceeding the {MAX_POSITION_PCT}% cap."

    return None

# ==================== HEALTH ====================

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "CycleMind"}

# ==================== LIVE PRICES ====================

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
            prices[coin_map[symbol]] = {"usd": price, "usd_24h_change": round(change, 2)}
        except (KeyError, IndexError, ValueError, TypeError):
            prices[coin_map[symbol]] = {"usd": 0, "usd_24h_change": 0}
    return prices

# ==================== TRENDING ====================

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
                    "market_cap_rank": None,
                }
            })
        except (KeyError, IndexError, ValueError, TypeError):
            continue
    trending.sort(key=lambda x: abs(x["item"]["change_24h"]), reverse=True)
    return {"coins": trending}

# ==================== PUBLIC MARKET DATA ====================

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

# ==================== AUTHENTICATED ACCOUNT ====================

@app.post("/api/account/spot-balance")
def get_spot_balance(creds: APICredentials):
    client = BitgetClient(creds.api_key, creds.api_secret, creds.passphrase)
    return client.get_spot_account_balance()


@app.post("/api/account/futures-balance")
def get_futures_balance(creds: APICredentials):
    client = BitgetClient(creds.api_key, creds.api_secret, creds.passphrase)
    return client.get_futures_account()

# ==================== LIQUIDATION HEATMAP ====================

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

# ==================== FUNDING SIGNAL ====================

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

# ==================== REGIME DETECTION ====================

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
            btc_dominance_change_pct = (
                (btc_candles[-1]["close"] - btc_candles[0]["close"]) / btc_candles[0]["close"]
            ) * 100
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
        clusters = [
            {
                "leverage": lev,
                "long_liquidation_price": round(mark_price * (1 - 1 / lev), 2),
                "short_liquidation_price": round(mark_price * (1 + 1 / lev), 2),
            }
            for lev in LEVERAGE_TIERS
        ]
        response["liquidation_context"] = integrate_liquidation_proximity(result, mark_price, clusters)
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

# ==================== MARKET OVERVIEW ====================

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

# ==================== ENTRY / EXIT SIGNALS ====================

@app.get("/api/entry-exit/{symbol}")
def entry_exit_signal(symbol: str):
    candles_raw = bitget.get_candles(symbol, granularity="1H", limit=100)
    daily_raw = bitget.get_candles(symbol, granularity="1D", limit=60)
    try:
        candles = parse_candles(candles_raw["data"])
        daily_candles = parse_candles(daily_raw["data"])
    except (KeyError, TypeError, ValueError, IndexError):
        raise HTTPException(status_code=502, detail="Could not parse candle data")
    if len(candles) < 20 or len(daily_candles) < 50:
        raise HTTPException(status_code=502, detail="Insufficient candle history")

    closes_1h = [c["close"] for c in candles]
    daily_closes = [c["close"] for c in daily_candles]
    current_price = closes_1h[-1]

    bb = calculate_bollinger_bands(closes_1h, period=20, num_std=2.0)
    sr = find_support_resistance(candles, lookback=50)
    sma_20d = calculate_sma(daily_closes, 20)
    sma_50d = calculate_sma(daily_closes, 50)

    if bb is None or sma_20d is None or sma_50d is None:
        raise HTTPException(status_code=502, detail="Could not compute indicators")

    score = 0
    reasons = []

    if current_price <= bb["lower"]:
        score += 2
        reasons.append("Price at/below lower Bollinger Band (oversold)")
    elif current_price >= bb["upper"]:
        score -= 2
        reasons.append("Price at/above upper Bollinger Band (overbought)")

    if sma_20d > sma_50d:
        score += 1
        reasons.append("20D MA above 50D MA (bullish daily trend)")
    else:
        score -= 1
        reasons.append("20D MA below 50D MA (bearish daily trend)")

    if current_price > sma_20d:
        score += 1
        reasons.append("Price above 20D moving average")
    else:
        score -= 1
        reasons.append("Price below 20D moving average")

    near_support = any(abs(current_price - lvl) / lvl * 100 <= 0.75 for lvl in sr["support"])
    near_resistance = any(abs(current_price - lvl) / lvl * 100 <= 0.75 for lvl in sr["resistance"])
    if near_support:
        score += 2
        reasons.append("Price near key support level")
    if near_resistance:
        score -= 2
        reasons.append("Price near key resistance level")

    if score >= 3:
        action = "enter_long"
    elif score <= -3:
        action = "exit_or_avoid"
    else:
        action = "wait"

    take_profit = sr["resistance"][0] if sr["resistance"] else bb["upper"]
    stop_loss = sr["support"][0] if sr["support"] else bb["lower"]

    return {
        "symbol": symbol,
        "current_price": round(current_price, 2),
        "action": action,
        "score": score,
        "reasons": reasons,
        "bollinger_bands": {k: round(v, 2) if v else v for k, v in bb.items()},
        "daily_moving_averages": {"sma_20d": round(sma_20d, 2), "sma_50d": round(sma_50d, 2)},
        "support_resistance": sr,
        "suggested_take_profit": round(take_profit, 2),
        "suggested_stop_loss": round(stop_loss, 2),
        "note": "Suggested levels only. Not financial advice.",
    }


@app.get("/api/entry-exit-overview")
def entry_exit_overview():
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    overview = {}
    for symbol in symbols:
        try:
            overview[symbol] = entry_exit_signal(symbol)
        except HTTPException as e:
            overview[symbol] = {"error": e.detail}
    return overview

# ==================== PORTFOLIO REBALANCER ====================

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
            total = float(asset.get("available", 0)) + float(asset.get("frozen", 0))
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
        ticker = bitget.get_spot_ticker(f"{coin}USDT")
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
        try:
            regime_result = get_regime(f"{coin}USDT")
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
        rebalance_plan.append({
            "asset": coin,
            "current_pct": current_pct,
            "target_pct": target_pct,
            "action": "buy" if diff_usd > 0 else "sell",
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

# ==================== AUTH: EMAIL SIGNUP ====================

@app.post("/api/auth/email-signup")
def email_signup(req: EmailSignup):
    users = _load_users()
    key = req.email.lower()
    if key not in users:
        users[key] = {
            "email": req.email,
            "wallet_address": req.wallet_address,
            "demo_balance_usdt": DEMO_STARTING_BALANCE,
            "demo_positions": {},
            "demo_trade_log": [],
            "bitget_linked": False,
        }
        _save_users(users)
    return users[key]

# ==================== AUTH: MAGIC LINK ====================

class MagicLinkRequest(BaseModel):
    email: str


@app.post("/api/auth/magic-link/request")
def request_magic_link(req: MagicLinkRequest):
    token = secrets.token_urlsafe(32)
    links = _load_links()
    links[token] = {
        "email": req.email.lower(),
        "expires_at": (datetime.now(timezone.utc).timestamp() + MAGIC_LINK_EXPIRY_MINUTES * 60),
        "used": False,
    }
    _save_links(links)

    link_url = f"{FRONTEND_URL}/?magic_token={token}"

    html_content = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0a0f1e;border-radius:12px;">
        <h2 style="color:#0078ff;margin-bottom:8px;">CycleMind</h2>
        <p style="color:#c0d0e8;margin-bottom:24px;">Click the button below to sign in to your demo account.</p>
        <a href="{link_url}"
           style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#0078ff,#00c6ff);
                  color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:1rem;">
            Sign in to CycleMind
        </a>
        <p style="color:#607090;font-size:0.8rem;margin-top:28px;">
            This link expires in {MAGIC_LINK_EXPIRY_MINUTES} minutes.<br>
            If you didn't request this, you can safely ignore it.
        </p>
    </div>
    """

    _send_email_brevo(
        to_email=req.email,
        subject="Your CycleMind sign-in link",
        html_content=html_content,
    )

    return {"status": "sent"}


@app.get("/api/auth/magic-link/verify/{token}")
def verify_magic_link(token: str):
    links = _load_links()
    record = links.get(token)
    if not record or record["used"]:
        raise HTTPException(status_code=400, detail="Invalid or already-used link")
    if datetime.now(timezone.utc).timestamp() > record["expires_at"]:
        raise HTTPException(status_code=400, detail="Link expired — request a new one")

    record["used"] = True
    links[token] = record
    _save_links(links)

    email = record["email"]
    users = _load_users()
    if email not in users:
        users[email] = {
            "email": email,
            "demo_balance_usdt": DEMO_STARTING_BALANCE,
            "demo_positions": {},
            "demo_trade_log": [],
            "bitget_linked": False,
        }
        _save_users(users)
    return {"email": email}

# ==================== DEMO ACCOUNT ====================

@app.get("/api/demo/account/{email}")
def get_demo_account(email: str):
    user = _get_user(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    coin_map = {"BTC": "BTCUSDT", "ETH": "ETHUSDT", "SOL": "SOLUSDT"}
    positions_value = 0.0
    positions_detail = {}
    for coin, pos in user.get("demo_positions", {}).items():
        symbol = coin_map.get(coin)
        if not symbol:
            continue
        ticker = bitget.get_futures_ticker(symbol)
        try:
            price = float(ticker["data"][0]["lastPr"])
        except (KeyError, IndexError, ValueError, TypeError):
            price = pos["avg_entry"]
        value = pos["amount"] * price
        pnl = value - (pos["amount"] * pos["avg_entry"])
        pnl_pct = (pnl / (pos["amount"] * pos["avg_entry"]) * 100) if pos["avg_entry"] else 0
        positions_value += value
        positions_detail[coin] = {
            "amount": pos["amount"],
            "avg_entry": pos["avg_entry"],
            "current_price": price,
            "value_usd": round(value, 2),
            "pnl_usd": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
        }
    total_equity = user["demo_balance_usdt"] + positions_value
    return {
        "email": user["email"],
        "cash_usdt": round(user["demo_balance_usdt"], 2),
        "positions": positions_detail,
        "total_equity_usd": round(total_equity, 2),
        "starting_balance": DEMO_STARTING_BALANCE,
        "total_return_pct": round((total_equity - DEMO_STARTING_BALANCE) / DEMO_STARTING_BALANCE * 100, 2),
        "trade_log": user.get("demo_trade_log", [])[-20:],
        "is_demo": True,
    }


@app.post("/api/demo/trade")
def execute_demo_trade(req: DemoTradeRequest):
    user = _get_user(req.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if req.coin not in ("BTC", "ETH", "SOL"):
        raise HTTPException(status_code=400, detail="Unsupported coin")
    if req.amount_usd <= 0:
        raise HTTPException(status_code=400, detail="amount_usd must be positive")

    symbol = f"{req.coin}USDT"
    ticker = bitget.get_futures_ticker(symbol)
    try:
        price = float(ticker["data"][0]["lastPr"])
    except (KeyError, IndexError, ValueError, TypeError):
        raise HTTPException(status_code=502, detail="Could not fetch live price")

    positions = user.setdefault("demo_positions", {})
    trade_log = user.setdefault("demo_trade_log", [])

    if req.side == "buy":
        if req.amount_usd > user["demo_balance_usdt"]:
            raise HTTPException(status_code=400, detail="Insufficient demo balance")
        qty = req.amount_usd / price
        existing = positions.get(req.coin, {"amount": 0.0, "avg_entry": price})
        new_amount = existing["amount"] + qty
        new_avg_entry = (
            (existing["amount"] * existing["avg_entry"] + qty * price) / new_amount
            if new_amount > 0 else price
        )
        positions[req.coin] = {"amount": new_amount, "avg_entry": new_avg_entry}
        user["demo_balance_usdt"] -= req.amount_usd

    elif req.side == "sell":
        existing = positions.get(req.coin)
        if not existing or existing["amount"] <= 0:
            raise HTTPException(status_code=400, detail=f"No {req.coin} position to sell")
        qty = min(req.amount_usd / price, existing["amount"])
        proceeds = qty * price
        existing["amount"] -= qty
        if existing["amount"] <= 1e-9:
            del positions[req.coin]
        user["demo_balance_usdt"] += proceeds
    else:
        raise HTTPException(status_code=400, detail="side must be 'buy' or 'sell'")

    trade_log.append({
        "id": str(uuid.uuid4())[:8],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "coin": req.coin,
        "side": req.side,
        "price": round(price, 2),
        "amount_usd": round(req.amount_usd, 2),
    })

    _update_user(req.email, {
        "demo_balance_usdt": user["demo_balance_usdt"],
        "demo_positions": positions,
        "demo_trade_log": trade_log,
    })

    updated_user = _get_user(req.email)
    _record_equity_snapshot(req.email, updated_user)

    return {
        "status": "ok",
        "executed_price": round(price, 2),
        "new_cash_balance": round(user["demo_balance_usdt"], 2),
    }


@app.post("/api/demo/reset/{email}")
def reset_demo_account(email: str):
    user = _get_user(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _update_user(email, {
        "demo_balance_usdt": DEMO_STARTING_BALANCE,
        "demo_positions": {},
        "demo_trade_log": [],
    })
    return {"status": "ok", "message": "Demo account reset."}

# ==================== SETTINGS ====================

@app.get("/api/settings/{email}")
def get_settings(email: str):
    user = _get_user(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user = _ensure_user_defaults(user)
    return {
        "email": user["email"],
        "default_trade_size_usd": user["default_trade_size_usd"],
        "auto_trade_enabled": user["auto_trade_enabled"],
        "min_trade_size_usd": MIN_TRADE_SIZE_USD,
        "max_trade_size_usd": MAX_TRADE_SIZE_USD,
    }


@app.post("/api/settings")
def update_settings(req: UserSettings):
    user = _get_user(req.email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user = _ensure_user_defaults(user)
    updates = {}
    if req.default_trade_size_usd is not None:
        if not (MIN_TRADE_SIZE_USD <= req.default_trade_size_usd <= MAX_TRADE_SIZE_USD):
            raise HTTPException(
                status_code=400,
                detail=f"Trade size must be between ${MIN_TRADE_SIZE_USD} and ${MAX_TRADE_SIZE_USD}",
            )
        updates["default_trade_size_usd"] = req.default_trade_size_usd
    if req.auto_trade_enabled is not None:
        if req.auto_trade_enabled:
            if user.get("kill_switch_active"):
                raise HTTPException(status_code=400, detail="Reset the kill switch before re-enabling auto-trading.")
            if not req.confirm_risk_acknowledged:
                raise HTTPException(status_code=400, detail="Explicit risk acknowledgment is required to enable auto-trading.")
            updates["auto_trade_halted_reason"] = None
        updates["auto_trade_enabled"] = req.auto_trade_enabled
    _update_user(req.email, updates)
    return {"status": "ok", **updates}

# ==================== RISK STATUS ====================

@app.get("/api/risk-status/{email}")
def get_risk_status(email: str):
    user = _get_user(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user = _ensure_user_defaults(user)
    user = _roll_daily_tracking_if_needed(user)
    equity = _compute_equity(user)
    daily_pnl_pct = (
        ((equity - user["daily_start_equity"]) / user["daily_start_equity"]) * 100
        if user["daily_start_equity"] else 0
    )
    return {
        "kill_switch_active": user["kill_switch_active"],
        "auto_trade_enabled": user["auto_trade_enabled"],
        "auto_trade_halted_reason": user.get("auto_trade_halted_reason"),
        "daily_pnl_pct": round(daily_pnl_pct, 2),
        "daily_loss_limit_pct": DAILY_LOSS_LIMIT_PCT,
        "max_position_pct": MAX_POSITION_PCT,
        "last_auto_trade": user.get("last_auto_trade", {}),
    }

# ==================== KILL SWITCH ====================

@app.post("/api/kill-switch/{email}")
def trigger_kill_switch(email: str):
    user = _get_user(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _update_user(email, {
        "kill_switch_active": True,
        "auto_trade_enabled": False,
        "auto_trade_halted_reason": "Manual kill switch triggered.",
    })
    return {"status": "ok", "message": "Kill switch activated. Auto-trading halted."}


@app.post("/api/kill-switch/{email}/reset")
def reset_kill_switch(email: str):
    user = _get_user(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _update_user(email, {
        "kill_switch_active": False,
        "auto_trade_halted_reason": None,
    })
    return {"status": "ok", "message": "Kill switch reset. You may re-enable auto-trading."}

# ==================== EQUITY HISTORY ====================

@app.get("/api/equity-history/{email}")
def get_equity_history(email: str):
    user = _get_user(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user = _ensure_user_defaults(user)
    user = _roll_daily_tracking_if_needed(user)
    history = user.get("equity_history", [])
    if not history:
        history = _record_equity_snapshot(email, user)
    return {
        "points": history,
        "daily_start_equity": round(user["daily_start_equity"], 2),
        "daily_loss_limit_pct": DAILY_LOSS_LIMIT_PCT,
    }

# ==================== AUTO-TRADE BACKGROUND LOOP ====================

async def _run_auto_trade_cycle():
    users = _load_users()
    overview = entry_exit_overview()

    for email, user in users.items():
        user = _ensure_user_defaults(user)
        if not user.get("auto_trade_enabled") or user.get("kill_switch_active"):
            continue

        trade_size = user["default_trade_size_usd"]
        last_trades = user.get("last_auto_trade", {})
        now = datetime.now(timezone.utc)

        for symbol, signal in overview.items():
            if "error" in signal:
                continue
            coin = symbol.replace("USDT", "")
            action = signal.get("action")
            if action not in ("enter_long", "exit_or_avoid"):
                continue

            last_time_str = last_trades.get(coin)
            if last_time_str:
                last_time = datetime.fromisoformat(last_time_str)
                if (now - last_time).total_seconds() < AUTO_TRADE_COOLDOWN_SECONDS:
                    continue

            side = "buy" if action == "enter_long" else "sell"

            if side == "sell":
                positions = user.get("demo_positions", {})
                if coin not in positions or positions[coin]["amount"] <= 0:
                    continue

            block_reason = _check_risk_limits(user, coin, side, trade_size)
            if block_reason:
                _update_user(email, {
                    "auto_trade_enabled": False,
                    "auto_trade_halted_reason": block_reason,
                })
                break

            try:
                execute_demo_trade(DemoTradeRequest(email=email, coin=coin, side=side, amount_usd=trade_size))
                last_trades[coin] = now.isoformat()
                _update_user(email, {"last_auto_trade": last_trades})
                updated_user = _get_user(email)
                _record_equity_snapshot(email, updated_user)
            except HTTPException:
                continue


async def _auto_trade_loop():
    while True:
        try:
            await _run_auto_trade_cycle()
        except Exception as e:
            print(f"Auto-trade cycle error: {e}")
        await asyncio.sleep(AUTO_TRADE_INTERVAL_SECONDS)


@app.on_event("startup")
async def start_auto_trade_loop():
    asyncio.create_task(_auto_trade_loop())

# ==================== ENTRYPOINT ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
