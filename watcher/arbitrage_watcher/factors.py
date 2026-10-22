"""Individual signal factors. Each returns a Factor dict (value -1..1, weight >= 0)."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Sequence

from arbitrage_watcher.models import Factor
from arbitrage_watcher.util import clamp

IMPACT_W = {"low": 0.35, "medium": 0.7, "high": 1.0}
NEWS_HALF_LIFE_H = 36.0
CROWD_HALF_LIFE_H = 24.0

W_NEWS = 0.35
W_MACRO = 0.08
W_CROWD = 0.12
W_ATTENTION = 0.10
W_TREND = 0.20
W_RSI = 0.08
W_MOVE = 0.10
W_VOLUME = 0.05
W_STOP = 0.30
W_TAKE = 0.15
W_TARGET = 0.25


@dataclass(frozen=True)
class Evidence:
    """A scored item as the signal engine sees it."""

    sentiment: float
    impact: str
    relevance: float
    time: datetime


@dataclass
class Inputs:
    """Everything the signal engine needs for one instrument (no I/O)."""

    now: datetime
    is_holding: bool
    price: float | None = None
    change1d: float | None = None
    move1h: float | None = None
    rsi14: float | None = None
    sma50: float | None = None
    sma200: float | None = None
    volume_z: float | None = None
    drawdown: float | None = None
    volatility: float | None = None
    next_earnings: date | None = None
    news: Sequence[Evidence] = field(default_factory=list)
    macro: Sequence[Evidence] = field(default_factory=list)
    crowd: Sequence[Evidence] = field(default_factory=list)
    attention_z: float | None = None
    buy_price: float | None = None
    stop_loss_pct: float = 15.0
    take_profit_pct: float = 30.0
    target_price: float | None = None


def factor(name: str, value: float, weight: float, note: str) -> Factor:
    return {"name": name, "value": round(clamp(value), 3), "weight": round(max(0.0, weight), 3), "note": note}


def _decay(t: datetime, now: datetime, half_life_h: float) -> float:
    age_h = max(0.0, (now - t).total_seconds() / 3600)
    return 0.5 ** (age_h / half_life_h)


def _aggregate(items: Sequence[Evidence], now: datetime, half_life: float) -> tuple[float, float]:
    """(weighted sentiment sum, evidence mass) with recency decay and impact weighting."""
    total = mass = 0.0
    for e in items:
        w = IMPACT_W.get(e.impact, 0.35) * e.relevance * _decay(e.time, now, half_life)
        total += e.sentiment * w
        mass += w
    return total, mass


def news_factor(inp: Inputs) -> Factor | None:
    total, mass = _aggregate(inp.news, inp.now, NEWS_HALF_LIFE_H)
    if mass < 0.05:
        return None
    n = len(inp.news)
    tone = "positive" if total > 0.05 else "negative" if total < -0.05 else "mixed/neutral"
    return factor("news", math.tanh(total / 1.2), W_NEWS * min(1.0, mass), f"{n} recent news item(s), tone {tone}")


def macro_factor(inp: Inputs) -> Factor | None:
    if not inp.is_holding:
        return None
    total, mass = _aggregate(inp.macro, inp.now, NEWS_HALF_LIFE_H)
    if mass < 0.1:
        return None
    return factor("macro", math.tanh(total / 2.0), W_MACRO * min(1.0, mass / 2),
                  f"{len(inp.macro)} macro item(s) (rates, inflation, trade)")


def crowd_factor(inp: Inputs) -> Factor | None:
    n = len(inp.crowd)
    if n < 5:
        return None  # too little volume to mean anything
    total, mass = _aggregate(inp.crowd, inp.now, CROWD_HALF_LIFE_H)
    mean = total / mass if mass else 0.0
    return factor("crowd", mean * 1.5, W_CROWD * min(1.0, n / 15), f"{n} social/forum posts, average tone {mean:+.2f}")


def attention_factor(inp: Inputs, direction: float) -> Factor | None:
    z = inp.attention_z
    if z is None or z < 2.0:
        return None
    strength = min(1.0, z / 6)
    if abs(direction) < 0.05:
        return factor("attention", 0.0, 0.0, f"unusual public attention (z={z:.1f}) without a clear direction")
    return factor("attention", math.copysign(strength, direction), W_ATTENTION,
                  f"unusual public attention (z={z:.1f}) amplifies the current tone")


def trend_factor(inp: Inputs) -> Factor | None:
    p, s50, s200 = inp.price, inp.sma50, inp.sma200
    if not p:
        return None
    if s200 and s50:
        dev = p / s200 - 1
        cross = 1.0 if s50 >= s200 else -1.0
        value = 0.5 * clamp(dev * 4) + 0.5 * cross * min(1.0, abs(s50 / s200 - 1) * 20)
        state = "above" if dev >= 0 else "below"
        trend = "rising (50d over 200d)" if cross > 0 else "falling (50d under 200d)"
        return factor("trend", value, W_TREND, f"price {abs(dev) * 100:.1f}% {state} 200-day average, trend {trend}")
    if s50:
        dev = p / s50 - 1
        return factor("trend", clamp(dev * 5) * 0.6, W_TREND / 2, f"price {dev * 100:+.1f}% vs 50-day average")
    return None


def rsi_factor(inp: Inputs) -> Factor | None:
    r = inp.rsi14
    if r is None:
        return None
    if r > 70:
        return factor("rsi", -(r - 70) / 30, W_RSI, f"RSI {r:.0f}: overbought, pullback risk")
    if r < 30:
        return factor("rsi", (30 - r) / 30, W_RSI, f"RSI {r:.0f}: oversold, rebound possible")
    return None


def is_sharp_move(inp: Inputs) -> bool:
    return (inp.move1h is not None and abs(inp.move1h) > 3) or (inp.change1d is not None and abs(inp.change1d) > 5)


def move_factor(inp: Inputs) -> Factor | None:
    d = inp.change1d
    if d is None or abs(d) < 2:
        return None
    weight = W_MOVE if is_sharp_move(inp) else W_MOVE / 2
    h = f", {inp.move1h:+.1f}% in the last hour" if inp.move1h is not None and abs(inp.move1h) > 1 else ""
    return factor("price_move", d / 8, weight, f"{d:+.1f}% today{h}")


def volume_factor(inp: Inputs) -> Factor | None:
    z, d = inp.volume_z, inp.change1d
    if z is None or z < 2 or d is None or abs(d) < 0.5:
        return None
    return factor("volume", math.copysign(min(1.0, (z - 2) / 3 + 0.3), d), W_VOLUME,
                  f"trading volume unusually high (z={z:.1f})")


def pnl_pct(inp: Inputs) -> float | None:
    if not inp.is_holding or not inp.buy_price or not inp.price:
        return None
    return (inp.price / inp.buy_price - 1) * 100


def stop_loss_hit(inp: Inputs) -> bool:
    p = pnl_pct(inp)
    return p is not None and p <= -abs(inp.stop_loss_pct)


def take_profit_hit(inp: Inputs) -> bool:
    p = pnl_pct(inp)
    return p is not None and p >= abs(inp.take_profit_pct)


def target_hit(inp: Inputs) -> bool:
    return (not inp.is_holding and inp.target_price is not None and inp.price is not None
            and inp.price <= inp.target_price)


def position_factor(inp: Inputs) -> Factor | None:
    p = pnl_pct(inp)
    if p is None:
        return None
    if stop_loss_hit(inp):
        return factor("position", -1.0, W_STOP, f"{p:+.1f}% vs buy price: stop-loss (-{inp.stop_loss_pct:g}%) reached")
    if p <= -abs(inp.stop_loss_pct) + 3:
        return factor("position", -0.4, W_STOP / 3, f"{p:+.1f}% vs buy price: close to stop-loss")
    if take_profit_hit(inp):
        return factor("position", -0.3, W_TAKE, f"{p:+.1f}% vs buy price: take-profit (+{inp.take_profit_pct:g}%) reached")
    return None


def target_factor(inp: Inputs) -> Factor | None:
    if inp.is_holding or inp.target_price is None or not inp.price:
        return None
    gap = (inp.price / inp.target_price - 1) * 100
    if target_hit(inp):
        return factor("target", 0.8, W_TARGET, f"price at/below your target ({gap:+.1f}%)")
    if gap <= 3:
        return factor("target", 0.3, W_TARGET / 3, f"price {gap:.1f}% above your target")
    return None


def earnings_days(inp: Inputs) -> int | None:
    if inp.next_earnings is None:
        return None
    days = (inp.next_earnings - inp.now.date()).days
    return days if days >= 0 else None


def earnings_factor(inp: Inputs) -> Factor | None:
    days = earnings_days(inp)
    if days is None or days > 7:
        return None
    when = "today" if days == 0 else "tomorrow" if days == 1 else f"in {days} days"
    return factor("earnings", 0.0, 0.0, f"earnings report {when}: expect higher volatility")
