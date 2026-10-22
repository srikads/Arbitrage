"""Contract types (docs/CONTRACT.md §4/§5) and config helpers.

The feed and config are plain dicts on the wire; these TypedDicts document the
shapes and keep type checkers useful.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, TypedDict

SignalAction = Literal["hold", "watch", "consider_trim", "consider_sell", "consider_buy", "consider_add"]
Impact = Literal["low", "medium", "high"]
Severity = Literal["info", "important", "critical"]
EventKind = Literal["news", "bluesky", "forum", "attention", "price", "earnings"]
Horizon = Literal["hours", "days", "weeks", "months"]

ACTIONS: tuple[str, ...] = ("hold", "watch", "consider_trim", "consider_sell", "consider_buy", "consider_add")
IMPACTS: tuple[str, ...] = ("low", "medium", "high")
HORIZONS: tuple[str, ...] = ("hours", "days", "weeks", "months")


class Factor(TypedDict):
    name: str
    value: float
    weight: float
    note: str


class Signal(TypedDict):
    action: str
    confidence: float
    risk: str
    score: float
    horizon: str
    headline: str
    reasoning: str
    factors: list[Factor]
    updatedAt: str


class Event(TypedDict):
    id: str
    time: str
    kind: str
    title: str
    summary: str
    url: str | None
    source: str
    sentiment: float
    impact: str


class Alert(TypedDict):
    id: str
    time: str
    instrumentId: str | None
    severity: str
    title: str
    body: str
    action: str | None
    confidence: float | None
    eventIds: list[str]
    pushed: bool


class Digest(TypedDict):
    id: str
    time: str
    kind: str
    title: str
    markdown: str


DEFAULT_SETTINGS: dict[str, Any] = {
    "risk": 0.3,
    "quietHours": {"start": "22:00", "end": "07:30"},
    "timezone": "Europe/Berlin",
    "defaultStopLossPct": 15,
    "defaultTakeProfitPct": 30,
    "sources": {"news": True, "bluesky": True, "forums": True, "wikipedia": True},
    "digest": {"daily": True, "weekly": True},
}


@dataclass
class Tracked:
    """A user instrument (holding or candidate) with the fields the engine needs."""

    id: str
    symbol: str
    name: str
    type: str
    currency: str
    isin: str | None = None
    aliases: list[str] = field(default_factory=list)
    wikipedia: str | None = None
    role: Literal["holding", "candidate"] = "holding"
    quantity: float = 0.0
    buy_price: float | None = None
    stop_loss_pct: float | None = None
    take_profit_pct: float | None = None
    target_price: float | None = None

    @property
    def is_holding(self) -> bool:
        return self.role == "holding"


def _num(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _tracked(raw: dict[str, Any], role: Literal["holding", "candidate"]) -> Tracked | None:
    symbol = str(raw.get("symbol") or "").strip()
    isin = raw.get("isin") or None
    ident = str(raw.get("id") or isin or symbol).strip()
    if not ident:
        return None
    return Tracked(
        id=ident,
        symbol=symbol,
        name=str(raw.get("name") or symbol or ident),
        type=str(raw.get("type") or "stock"),
        currency=str(raw.get("currency") or "EUR"),
        isin=str(isin) if isin else None,
        aliases=[str(a) for a in raw.get("aliases") or [] if str(a).strip()],
        wikipedia=raw.get("wikipedia") or None,
        role=role,
        quantity=_num(raw.get("quantity")) or 0.0,
        buy_price=_num(raw.get("buyPrice")),
        stop_loss_pct=_num(raw.get("stopLossPct")),
        take_profit_pct=_num(raw.get("takeProfitPct")),
        target_price=_num(raw.get("targetPrice")),
    )


def tracked_from_config(config: dict[str, Any]) -> list[Tracked]:
    """Holdings and candidates, de-duplicated by id (a holding wins over a candidate)."""
    out: dict[str, Tracked] = {}
    for raw in config.get("holdings") or []:
        t = _tracked(raw, "holding")
        if t and t.id not in out:
            out[t.id] = t
    for raw in config.get("candidates") or []:
        t = _tracked(raw, "candidate")
        if t and t.id not in out:
            out[t.id] = t
    return list(out.values())


def settings_from_config(config: dict[str, Any]) -> dict[str, Any]:
    """Merge config settings over defaults (one level deep for nested dicts)."""
    merged: dict[str, Any] = {}
    raw = config.get("settings") or {}
    for key, default in DEFAULT_SETTINGS.items():
        value = raw.get(key, default)
        if isinstance(default, dict) and isinstance(value, dict):
            value = {**default, **value}
        merged[key] = value
    try:
        merged["risk"] = max(0.0, min(1.0, float(merged["risk"])))
    except (TypeError, ValueError):
        merged["risk"] = DEFAULT_SETTINGS["risk"]
    return merged
