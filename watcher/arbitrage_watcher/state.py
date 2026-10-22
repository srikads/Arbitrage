"""Opaque watcher state (data/state.enc): dedupe caches, timers, cooldowns."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from arbitrage_watcher.util import iso, parse_iso, utcnow

STATE_VERSION = 1


def new_state() -> dict[str, Any]:
    return {
        "version": STATE_VERSION,
        "decoys": [],            # ids from the universe used as stable decoys
        "scores": {},            # "<itemHash>:<instrumentId|*>" -> score record
        "signals": {},           # instrumentId -> last signal summary
        "narratives": {},        # instrumentId -> {"key","headline","reasoning"}
        "alertLog": {},          # "<instrumentId|*>|<kind>" -> {"t": iso, "sev": int}
        "pushes": {},            # local date -> count
        "pendingPush": [],       # alert ids waiting for quiet hours to end
        "last": {},              # timers: forums, bluesky, wikipedia, dailyRefresh, deep, ...
        "earnings": {},          # symbol -> "YYYY-MM-DD" | None
        "resolved": {},          # isin -> {symbol, name, currency}
        "resolveFailed": {},     # isin -> iso time of last failed attempt
        "crowd": {},             # instrumentId -> cached crowd aggregates
        "attention": {},         # instrumentId -> {"z": float, "views": int, "date": str}
        "pushExpired": None,     # endpoint hash once a subscription returned 404/410
    }


def load_state(raw: Any) -> dict[str, Any]:
    """Merge a decrypted state over defaults so missing keys never crash."""
    state = new_state()
    if isinstance(raw, dict) and raw.get("version") == STATE_VERSION:
        for key, value in raw.items():
            if key in state and type(value) is type(state[key]) or state.get(key) is None:
                state[key] = value
    return state


def due(state: dict[str, Any], timer: str, every: timedelta) -> bool:
    last = parse_iso(state["last"].get(timer))
    return last is None or utcnow() - last >= every


def mark(state: dict[str, Any], timer: str) -> None:
    state["last"][timer] = iso(utcnow())


def prune(state: dict[str, Any], keep_days: int = 14) -> None:
    """Drop old score records, alert-log entries and push counters."""
    cutoff = utcnow() - timedelta(days=keep_days)
    state["scores"] = {
        k: v for k, v in state["scores"].items() if (parse_iso(v.get("t")) or cutoff) > cutoff
    }
    state["alertLog"] = {
        k: v for k, v in state["alertLog"].items() if (parse_iso(v.get("t")) or cutoff) > cutoff
    }
    dates = sorted(state["pushes"])[-7:]
    state["pushes"] = {d: state["pushes"][d] for d in dates}
