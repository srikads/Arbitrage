"""Alert generation with cooldowns. Push planning lives in `notify.py`."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Sequence

from arbitrage_watcher import factors as fx
from arbitrage_watcher.factors import Inputs
from arbitrage_watcher.models import Alert, Event, Tracked
from arbitrage_watcher.narrative import ACTION_TEXT
from arbitrage_watcher.signals import thresholds
from arbitrage_watcher.util import iso, parse_iso, stable_hash, truncate

SEV_RANK = {"info": 0, "important": 1, "critical": 2}
COOLDOWN = timedelta(hours=6)
MAX_ALERTS = 200
BODY_MAX = 180


@dataclass
class AlertContext:
    tracked: Tracked
    signal: dict[str, Any]
    prev_action: str | None
    inp: Inputs
    new_events: Sequence[Event] = field(default_factory=list)


def make_alert(kind: str, now: datetime, iid: str | None, severity: str, title: str, body: str,
               action: str | None = None, confidence: float | None = None,
               event_ids: Sequence[str] = ()) -> tuple[str, Alert]:
    key = f"{iid or '*'}|{kind}"
    alert: Alert = {
        "id": stable_hash(key, iso(now)),
        "time": iso(now),
        "instrumentId": iid,
        "severity": severity,
        "title": truncate(title, 80),
        "body": truncate(body, BODY_MAX),
        "action": action,
        "confidence": None if confidence is None else round(confidence, 3),
        "eventIds": list(event_ids)[:10],
        "pushed": False,
    }
    return key, alert


def _position_alerts(ctx: AlertContext, now: datetime) -> list[tuple[str, Alert]]:
    t, inp, sig = ctx.tracked, ctx.inp, ctx.signal
    pnl = fx.pnl_pct(inp)
    out = []
    if fx.stop_loss_hit(inp) and pnl is not None:
        out.append(make_alert("stop_loss", now, t.id, "critical", f"{t.name}: stop-loss reached",
                              f"{pnl:+.1f}% vs your buy price (limit -{inp.stop_loss_pct:g}%). "
                              f"Suggestion: {ACTION_TEXT[sig['action']].split(' —')[0].lower()}; review your plan.",
                              sig["action"], sig["confidence"]))
    elif fx.take_profit_hit(inp) and pnl is not None:
        out.append(make_alert("take_profit", now, t.id, "important", f"{t.name}: take-profit reached",
                              f"{pnl:+.1f}% vs your buy price (target +{inp.take_profit_pct:g}%). "
                              f"{ACTION_TEXT[sig['action']].split(' —')[0]}.", sig["action"], sig["confidence"]))
    if fx.target_hit(inp):
        out.append(make_alert("target_hit", now, t.id, "important", f"{t.name}: target price reached",
                              f"Price {inp.price:.2f} is at or below your target {inp.target_price:.2f}. "
                              f"{ACTION_TEXT[sig['action']].split(' —')[0]}.", sig["action"], sig["confidence"]))
    return out


def _signal_alert(ctx: AlertContext, now: datetime, risk_setting: float) -> list[tuple[str, Alert]]:
    sig, t = ctx.signal, ctx.tracked
    action, prev = sig["action"], ctx.prev_action or "hold"
    if action == prev or action == "hold":
        return []
    if action == "watch":
        severity = "info"
    elif sig["confidence"] < thresholds(risk_setting).conf_moderate:
        return []
    else:
        severity = "important"
    return [make_alert("signal", now, t.id, severity, f"{t.name}: {ACTION_TEXT[action].split(' —')[0].lower()}",
                       sig["headline"] or ACTION_TEXT[action], action, sig["confidence"])]


def _event_alerts(ctx: AlertContext, now: datetime) -> list[tuple[str, Alert]]:
    t, inp, sig = ctx.tracked, ctx.inp, ctx.signal
    out = []
    news = [e for e in ctx.new_events if e["kind"] == "news" and e["impact"] == "high" and abs(e["sentiment"]) >= 0.3
            and not e["id"].startswith("m-")]
    if news:
        top = max(news, key=lambda e: abs(e["sentiment"]))
        out.append(make_alert("news", now, t.id, "important", f"{t.name}: {'positive' if top['sentiment'] > 0 else 'negative'} news",
                              top["summary"] or top["title"], sig["action"], sig["confidence"], [e["id"] for e in news]))
    price_events = [e for e in ctx.new_events if e["kind"] == "price"]
    if price_events and fx.is_sharp_move(inp):
        big = (inp.change1d is not None and abs(inp.change1d) > 8) or (inp.move1h is not None and abs(inp.move1h) > 5)
        severity = ("critical" if big else "important") if t.is_holding else "info"
        out.append(make_alert("move", now, t.id, severity, f"{t.name}: {price_events[0]['title'].lower()}",
                              f"{sig['headline']}", sig["action"], sig["confidence"], [price_events[0]["id"]]))
    earnings = [e for e in ctx.new_events if e["kind"] == "earnings" and "tomorrow" in e["title"]]
    if earnings:
        out.append(make_alert("earnings", now, t.id, "important" if t.is_holding else "info",
                              f"{t.name}: earnings tomorrow", "Results are due tomorrow; expect a bigger price move "
                              "than usual in either direction.", None, None, [earnings[0]["id"]]))
    return out


def instrument_alerts(ctx: AlertContext, now: datetime, risk_setting: float) -> list[tuple[str, Alert]]:
    out = _position_alerts(ctx, now)
    if not out:  # a position alert already carries the suggested action
        out += _signal_alert(ctx, now, risk_setting)
    return out + _event_alerts(ctx, now)


def macro_alerts(new_macro_events: Sequence[Event], now: datetime) -> list[tuple[str, Alert]]:
    high = [e for e in new_macro_events if e["impact"] == "high" and abs(e["sentiment"]) >= 0.3]
    if not high:
        return []
    top = max(high, key=lambda e: abs(e["sentiment"]))
    severity = "important" if abs(top["sentiment"]) >= 0.5 else "info"
    return [make_alert("macro", now, None, severity, "Market-wide news", top["summary"] or top["title"],
                       event_ids=[e["id"] for e in high])]


def apply_cooldown(candidates: Sequence[tuple[str, Alert]], state: dict[str, Any], now: datetime) -> list[Alert]:
    """Suppress repeats of the same instrument+kind within 6h unless severity escalates."""
    log: dict[str, dict[str, Any]] = state["alertLog"]
    out: list[Alert] = []
    for key, alert in candidates:
        rank = SEV_RANK[alert["severity"]]
        prev = log.get(key)
        if prev:
            last = parse_iso(prev.get("t"))
            if last and now - last < COOLDOWN and rank <= int(prev.get("sev", 0)):
                continue
        log[key] = {"t": iso(now), "sev": rank}
        out.append(alert)
    return out


def merge_alerts(new: Sequence[Alert], previous: Sequence[dict[str, Any]]) -> list[Alert]:
    """New alerts first, then previous ones; newest first, max 200."""
    seen = {a["id"] for a in new}
    merged = list(new) + [a for a in previous if isinstance(a, dict) and a.get("id") not in seen]  # type: ignore[misc]
    merged.sort(key=lambda a: a.get("time") or "", reverse=True)
    return merged[:MAX_ALERTS]
