"""Pure technical-indicator helpers on pandas Series (no I/O)."""

from __future__ import annotations

from datetime import timedelta

import numpy as np
import pandas as pd

from arbitrage_watcher.util import finite


def rsi(close: pd.Series, period: int = 14) -> float | None:
    """Wilder's RSI of the last bar."""
    close = close.dropna()
    if len(close) <= period:
        return None
    delta = close.diff().dropna()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    g, l_ = float(gain.iloc[-1]), float(loss.iloc[-1])
    if l_ == 0:
        return 100.0 if g > 0 else 50.0
    return finite(100 - 100 / (1 + g / l_))


def sma(close: pd.Series, window: int) -> float | None:
    close = close.dropna()
    if len(close) < window:
        return None
    return finite(close.iloc[-window:].mean())


def volume_z(volume: pd.Series, window: int = 20) -> float | None:
    """Z-score of the last volume vs the previous `window` sessions."""
    volume = volume.dropna()
    volume = volume[volume > 0]
    if len(volume) < window + 1:
        return None
    hist = volume.iloc[-window - 1 : -1]
    std = float(hist.std(ddof=0))
    if std == 0:
        return None
    return finite((float(volume.iloc[-1]) - float(hist.mean())) / std)


def drawdown_from_high(close: pd.Series, price: float | None, days: int = 365) -> float | None:
    """Percent below the trailing 52-week high (<= 0)."""
    close = close.dropna()
    if close.empty or price is None:
        return None
    cutoff = close.index[-1] - timedelta(days=days)
    high = max(float(close[close.index >= cutoff].max()), price)
    return finite((price / high - 1) * 100) if high > 0 else None


def move_over(intraday: pd.Series, minutes: int = 60) -> float | None:
    """Percent move of the last price vs the price `minutes` earlier (same data set)."""
    s = intraday.dropna()
    if len(s) < 2:
        return None
    last_t = s.index[-1]
    earlier = s[s.index <= last_t - timedelta(minutes=minutes)]
    if earlier.empty or last_t - earlier.index[-1] > timedelta(minutes=minutes + 45):
        return None  # gap (overnight/weekend): not a 1h move
    base = float(earlier.iloc[-1])
    return finite((float(s.iloc[-1]) / base - 1) * 100) if base else None


def volatility(close: pd.Series, window: int = 20) -> float | None:
    """Annualised stdev of daily returns over `window` sessions."""
    rets = close.dropna().pct_change().dropna()
    if len(rets) < window:
        return None
    return finite(float(rets.iloc[-window:].std(ddof=0)) * np.sqrt(252))


def change_over_sessions(close: pd.Series, sessions: int, price: float | None) -> float | None:
    """Percent change of `price` vs the close `sessions` bars ago."""
    close = close.dropna()
    if price is None or len(close) <= sessions:
        return None
    base = float(close.iloc[-sessions - 1])
    return finite((price / base - 1) * 100) if base else None
