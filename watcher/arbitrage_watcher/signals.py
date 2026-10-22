"""Deterministic signal engine: factors -> score, confidence, action, risk, horizon.

Thresholds scale with Settings.risk (0 = conservative: only very strong,
well-supported evidence yields sell/buy; 1 = balanced).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from arbitrage_watcher import factors as fx
from arbitrage_watcher.factors import Inputs
from arbitrage_watcher.models import Factor
from arbitrage_watcher.util import clamp, iso

MIN_WEIGHT_MASS = 0.6     # thin evidence shrinks the score toward 0
WATCH_SCORE = 0.2


@dataclass(frozen=True)
class Thresholds:
    strong: float
    moderate: float
    conf_strong: float
    conf_moderate: float


def thresholds(risk: float) -> Thresholds:
    r = clamp(risk, 0.0, 1.0)
    return Thresholds(
        strong=0.60 - 0.20 * r,
        moderate=0.45 - 0.17 * r,
        conf_strong=0.75 - 0.15 * r,
        conf_moderate=0.55 - 0.10 * r,
    )


def collect_factors(inp: Inputs) -> list[Factor]:
    base = [f for f in (fx.news_factor(inp), fx.macro_factor(inp), fx.crowd_factor(inp)) if f]
    direction = sum(f["value"] * f["weight"] for f in base)
    rest = [
        fx.attention_factor(inp, direction), fx.trend_factor(inp), fx.rsi_factor(inp), fx.move_factor(inp),
        fx.volume_factor(inp), fx.position_factor(inp), fx.target_factor(inp), fx.earnings_factor(inp),
    ]
    return base + [f for f in rest if f]


def combine(factors: list[Factor]) -> tuple[float, float]:
    """Return (score -1..1, confidence 0..1).

    Confidence = agreement between factors × amount of evidence × strength.
    """
    active = [f for f in factors if f["weight"] > 0]
    wsum = sum(f["weight"] for f in active)
    if wsum <= 0:
        return 0.0, 0.1
    signed = sum(f["weight"] * f["value"] for f in active)
    absolute = sum(f["weight"] * abs(f["value"]) for f in active)
    score = clamp(signed / max(wsum, MIN_WEIGHT_MASS))
    agreement = abs(signed) / absolute if absolute > 1e-9 else 0.0
    evidence = 1 - math.exp(-wsum / 0.5)
    strength = min(1.0, abs(score) / 0.6)
    confidence = 0.1 + 0.85 * agreement * evidence * (0.4 + 0.6 * strength)
    return round(score, 3), round(clamp(confidence, 0.0, 0.95), 3)


def base_action(score: float, conf: float, is_holding: bool, t: Thresholds) -> str:
    if is_holding:
        if score <= -t.strong and conf >= t.conf_strong:
            return "consider_sell"
        if score <= -t.moderate and conf >= t.conf_moderate:
            return "consider_trim"
        if score >= t.strong and conf >= t.conf_strong:
            return "consider_add"
    elif score >= t.strong and conf >= t.conf_strong:
        return "consider_buy"
    return "watch" if abs(score) >= WATCH_SCORE else "hold"


def apply_rules(action: str, score: float, conf: float, inp: Inputs, t: Thresholds) -> tuple[str, float]:
    """Position rules (stop-loss / take-profit / candidate target) override the score-based action."""
    if fx.stop_loss_hit(inp):
        return ("consider_trim" if score >= t.moderate else "consider_sell"), max(conf, 0.7)
    if fx.take_profit_hit(inp) and action != "consider_sell":
        if score >= t.strong:
            return "watch", conf
        return "consider_trim", max(conf, 0.55)
    if fx.target_hit(inp):
        if score <= -t.moderate:
            return "watch", conf
        return "consider_buy", max(conf, 0.55)
    return action, conf


def risk_level(inp: Inputs) -> str:
    points = 0
    vol = inp.volatility
    if vol is not None:
        points += 2 if vol > 0.35 else 1 if vol > 0.25 else 0
    days = fx.earnings_days(inp)
    if days is not None:
        points += 2 if days <= 1 else 1 if days <= 3 else 0
    if fx.is_sharp_move(inp):
        points += 1
    if inp.drawdown is not None and inp.drawdown < -25:
        points += 1
    if inp.attention_z is not None and inp.attention_z >= 3:
        points += 1
    if any(e.impact == "high" and e.sentiment < -0.3 for e in inp.news):
        points += 1
    if fx.stop_loss_hit(inp):
        points += 1
    return "high" if points >= 4 else "medium" if points >= 2 else "low"


_HORIZON_BY_FACTOR = {
    "news": "days", "crowd": "days", "attention": "days", "rsi": "days", "price_move": "hours", "volume": "days",
    "macro": "weeks", "trend": "months", "position": "weeks", "target": "weeks",
}


def horizon(factors: list[Factor], inp: Inputs) -> str:
    if fx.is_sharp_move(inp):
        return "hours"
    active = [f for f in factors if f["weight"] > 0 and abs(f["value"]) > 0.05]
    if not active:
        days = fx.earnings_days(inp)
        return "days" if days is not None and days <= 3 else "months"
    top = max(active, key=lambda f: f["weight"] * abs(f["value"]))
    return _HORIZON_BY_FACTOR.get(top["name"], "weeks")


def compute_signal(inp: Inputs, risk_setting: float) -> dict:
    """Build a contract Signal (headline/reasoning filled by the narrative step)."""
    factors = collect_factors(inp)
    score, conf = combine(factors)
    t = thresholds(risk_setting)
    action = base_action(score, conf, inp.is_holding, t)
    action, conf = apply_rules(action, score, conf, inp, t)
    risk = risk_level(inp)
    if action == "hold" and risk == "high":
        action = "watch"
    return {
        "action": action,
        "confidence": round(conf, 3),
        "risk": risk,
        "score": score,
        "horizon": horizon(factors, inp),
        "headline": "",
        "reasoning": "",
        "factors": factors,
        "updatedAt": iso(inp.now),
    }
