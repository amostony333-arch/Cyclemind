import requests
import time
import hmac
import hashlib
import base64
import json
from config import BITGET_BASE_URL, BITGET_API_KEY, BITGET_API_SECRET, BITGET_PASSPHRASE


class BitgetClient:
    """
    Wrapper around Bitget's v2 REST API.
    Public market-data endpoints (funding rate, open interest, ticker) do not
    require authentication. Account/balance endpoints do, and expect a valid
    API key, secret, and passphrase generated from a user's Bitget account.
    """

    def __init__(self, api_key=None, api_secret=None, passphrase=None):
        self.api_key = api_key or BITGET_API_KEY
        self.api_secret = api_secret or BITGET_API_SECRET
        self.passphrase = passphrase or BITGET_PASSPHRASE
        self.base_url = BITGET_BASE_URL
        self.session = requests.Session()

    def _generate_signature(self, message: str) -> str:
        mac = hmac.new(
            self.api_secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256
        )
        return base64.b64encode(mac.digest()).decode("utf-8")

    def _signed_headers(self, method: str, endpoint: str, query_string: str = "", body: str = ""):
        timestamp = str(int(time.time() * 1000))
        prehash = timestamp + method.upper() + endpoint
        if query_string:
            prehash += "?" + query_string
        if body:
            prehash += body

        return {
            "Content-Type": "application/json",
            "ACCESS-KEY": self.api_key,
            "ACCESS-SIGN": self._generate_signature(prehash),
            "ACCESS-TIMESTAMP": timestamp,
            "ACCESS-PASSPHRASE": self.passphrase,
            "locale": "en-US",
        }

    def _public_get(self, endpoint: str, params: dict = None):
        """For endpoints that don't require authentication."""
        try:
            response = self.session.get(
                f"{self.base_url}{endpoint}",
                params=params or {},
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": str(e)}

    def _private_get(self, endpoint: str, params: dict = None):
        """For endpoints that require signed authentication."""
        params = params or {}
        query_string = "&".join([f"{k}={v}" for k, v in sorted(params.items())])
        headers = self._signed_headers("GET", endpoint, query_string=query_string)

        try:
            response = self.session.get(
                f"{self.base_url}{endpoint}",
                params=params,
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": str(e)}

    def _private_post(self, endpoint: str, body: dict = None):
        """For endpoints that require signed authentication and a POST body."""
        body = body or {}
        body_str = json.dumps(body)
        headers = self._signed_headers("POST", endpoint, body=body_str)

        try:
            response = self.session.post(
                f"{self.base_url}{endpoint}",
                data=body_str,
                headers=headers,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": str(e)}

    # ---------- Public Market Data ----------

    def get_current_funding_rate(self, symbol: str, product_type: str = "USDT-FUTURES"):
        return self._public_get(
            "/api/v2/mix/market/current-fund-rate",
            params={"symbol": symbol, "productType": product_type}
        )

    def get_history_funding_rates(self, symbol: str, product_type: str = "USDT-FUTURES", limit: int = 100):
        return self._public_get(
            "/api/v2/mix/market/history-fund-rate",
            params={"symbol": symbol, "productType": product_type, "pageSize": str(limit)}
        )

    def get_open_interest(self, symbol: str, product_type: str = "USDT-FUTURES"):
        return self._public_get(
            "/api/v2/mix/market/open-interest",
            params={"symbol": symbol, "productType": product_type}
        )

    def get_contract_config(self, symbol: str = None, product_type: str = "USDT-FUTURES"):
        params = {"productType": product_type}
        if symbol:
            params["symbol"] = symbol
        return self._public_get("/api/v2/mix/market/contracts", params=params)

    def get_spot_ticker(self, symbol: str):
        return self._public_get("/api/v2/spot/market/tickers", params={"symbol": symbol})

    def get_futures_ticker(self, symbol: str, product_type: str = "USDT-FUTURES"):
        return self._public_get(
            "/api/v2/mix/market/ticker",
            params={"symbol": symbol, "productType": product_type}
        )

    def get_candles(self, symbol: str, granularity: str = "1H", limit: int = 100, product_type: str = "USDT-FUTURES"):
        """
        Fetches OHLCV candles. granularity examples: 1m, 5m, 15m, 1H, 4H, 1D.
        Returns raw Bitget kline array format:
        [timestamp, open, high, low, close, baseVolume, quoteVolume]
        """
        return self._public_get(
            "/api/v2/mix/market/candles",
            params={
                "symbol": symbol,
                "productType": product_type,
                "granularity": granularity,
                "limit": str(limit),
            }
        )

    # ---------- Authenticated Account Data (requires user's own keys) ----------

    def get_spot_account_balance(self):
        return self._private_get("/api/v2/spot/account/assets")

    def get_futures_account(self, product_type: str = "USDT-FUTURES"):
        return self._private_get(
            "/api/v2/mix/account/accounts",
            params={"productType": product_type}
        )

    # ---------- Trading (requires user's own keys) ----------

    def set_leverage(self, symbol: str, leverage: int, hold_side: str = "long", product_type: str = "USDT-FUTURES"):
        """
        Sets leverage for a futures position.
        hold_side: 'long' or 'short' (used in hedge mode). In one-way mode, pass either.
        """
        return self._private_post(
            "/api/v2/mix/account/set-leverage",
            body={
                "symbol": symbol,
                "productType": product_type,
                "leverage": str(leverage),
                "holdSide": hold_side,
            }
        )

    def place_futures_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        size: str,
        price: str = None,
        trade_side: str = "open",
        product_type: str = "USDT-FUTURES",
        client_oid: str = None,
    ):
        """
        Places a futures order.
        side:        'buy' or 'sell'
        order_type:  'limit' or 'market'
        size:        quantity in contracts (as a string)
        price:       required for limit orders
        trade_side:  'open' or 'close'
        client_oid:  optional custom order ID for tracking
        """
        body = {
            "symbol": symbol,
            "productType": product_type,
            "side": side,
            "orderType": order_type,
            "size": size,
            "tradeSide": trade_side,
        }
        if price:
            body["price"] = price
        if client_oid:
            body["clientOid"] = client_oid

        return self._private_post("/api/v2/mix/order/place-order", body=body)

    def get_futures_positions(self, symbol: str = None, product_type: str = "USDT-FUTURES"):
        """
        Returns open futures positions.
        If symbol is omitted, returns all positions for the given product type.
        """
        params = {"productType": product_type}
        if symbol:
            params["symbol"] = symbol
        return self._private_get("/api/v2/mix/position/all-position", params=params)

    # ---------- External: Fear & Greed Index ----------

    def get_fear_greed_index(self):
        try:
            response = requests.get("https://api.alternative.me/fng/?limit=1", timeout=10)
            data = response.json()
            return data["data"][0] if data.get("data") else None
        except requests.exceptions.RequestException:
            return None
