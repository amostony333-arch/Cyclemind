"""
Lightweight technical indicator calculations — no external TA library
dependency, just plain Python over a list of closing prices.
"""


def parse_candles(raw_candles: list) -> list[dict]:
    """
    Converts Bitget's raw kline array format into a list of dicts,
    ordered oldest -> newest:
    [timestamp, open, high, low, close, baseVolume, quoteVolume]
    """
    parsed = []
    for c in raw_candles:
        parsed.append({
            "timestamp": int(c[0]),
            "open": float(c[1]),
            "high": float(c[2]),
            "low": float(c[3]),
            "close": float(c[4]),
            "volume": float(c[5]),
        })
    # Bitget returns newest-first; reverse to oldest-first for indicator math
    parsed.sort(key=lambda x: x["timestamp"])
    return parsed


def calculate_sma(closes: list[float], period: int) -> float | None:
    if len(closes) < period:
        return None
    return sum(closes[-period:]) / period


def calculate_ema(closes: list[float], period: int) -> float:
    if len(closes) < period:
        return closes[-1] if closes else 0.0

    multiplier = 2 / (period + 1)
    ema = sum(closes[:period]) / period  # seed with SMA

    for price in closes[period:]:
        ema = (price - ema) * multiplier + ema

    return ema


def calculate_rsi(closes: list[float], period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0  # neutral default when insufficient data

    gains = []
    losses = []
    for i in range(1, len(closes)):
        change = closes[i] - closes[i - 1]
        gains.append(max(change, 0))
        losses.append(max(-change, 0))

    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def calculate_macd_histogram(closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9) -> float:
    if len(closes) < slow + signal:
        return 0.0

    # Build EMA series for fast and slow periods
    def ema_series(values: list[float], period: int) -> list[float]:
        multiplier = 2 / (period + 1)
        series = [sum(values[:period]) / period]
        for price in values[period:]:
            series.append((price - series[-1]) * multiplier + series[-1])
        return series

    fast_series = ema_series(closes, fast)
    slow_series = ema_series(closes, slow)

    # Align series lengths (fast series is longer since it starts earlier)
    offset = len(fast_series) - len(slow_series)
    macd_line = [fast_series[i + offset] - slow_series[i] for i in range(len(slow_series))]

    if len(macd_line) < signal:
        return 0.0

    signal_line = ema_series(macd_line, signal)
    macd_histogram = macd_line[-1] - signal_line[-1]
    return macd_histogram


def calculate_bollinger_bands(closes: list[float], period: int = 20, num_std: float = 2.0):
    if len(closes) < period:
        return None
    window = closes[-period:]
    sma = sum(window) / period
    variance = sum((c - sma) ** 2 for c in window) / period
    std_dev = variance ** 0.5
    return {
        "middle": sma,
        "upper": sma + num_std * std_dev,
        "lower": sma - num_std * std_dev,
        "bandwidth": ((sma + num_std * std_dev) - (sma - num_std * std_dev)) / sma * 100 if sma else None,
    }


def find_support_resistance(candles: list[dict], lookback: int = 50, tolerance_pct: float = 0.5):
    """Finds clustered swing highs/lows over the lookback window as S/R levels."""
    recent = candles[-lookback:] if len(candles) > lookback else candles
    highs = [c["high"] for c in recent]
    lows = [c["low"] for c in recent]

    def cluster_levels(values, tolerance_pct):
        sorted_vals = sorted(values)
        clusters = []
        current_cluster = [sorted_vals[0]]
        for v in sorted_vals[1:]:
            if abs(v - current_cluster[-1]) / current_cluster[-1] * 100 <= tolerance_pct:
                current_cluster.append(v)
            else:
                clusters.append(current_cluster)
                current_cluster = [v]
        clusters.append(current_cluster)
        clusters.sort(key=len, reverse=True)
        return [round(sum(c) / len(c), 2) for c in clusters[:3]]

    resistance_levels = cluster_levels(highs, tolerance_pct)
    support_levels = cluster_levels(lows, tolerance_pct)
    return {
        "support": sorted(support_levels),
        "resistance": sorted(resistance_levels, reverse=True),
    }
