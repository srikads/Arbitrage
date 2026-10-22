"""Assemble the Feed (contract §5) and validate its shape."""

from __future__ import annotations

from typing import Any, Sequence

from arbitrage_watcher.models import ACTIONS, HORIZONS, IMPACTS

MAX_ALERTS = 200
MAX_DIGESTS = 30
MAX_EVENTS = 50


def assemble(*, generated_at: str, mode: str, llm: str | None, duration: float, market_open: bool,
             market_note: str, instruments: dict[str, dict[str, Any]], alerts: Sequence[dict[str, Any]],
             digests: Sequence[dict[str, Any]], resolved: dict[str, dict[str, str]]) -> dict[str, Any]:
    for snap in instruments.values():
        snap["events"] = list(snap.get("events") or [])[:MAX_EVENTS]
    return {
        "version": 1,
        "generatedAt": generated_at,
        "run": {"mode": mode, "llm": llm, "durationSec": round(duration, 1)},
        "market": {"isOpen": market_open, "note": market_note},
        "instruments": instruments,
        "alerts": list(alerts)[:MAX_ALERTS],
        "digests": list(digests)[:MAX_DIGESTS],
        "resolved": resolved,
    }


SNAPSHOT_KEYS = {"id", "price", "currency", "changePct1d", "asOf", "history", "technicals", "nextEarnings", "signal", "events"}
TECH_KEYS = {"rsi14", "sma50", "sma200", "volumeZ", "drawdownFrom52wHighPct", "move1hPct"}
SIGNAL_KEYS = {"action", "confidence", "risk", "score", "horizon", "headline", "reasoning", "factors", "updatedAt"}
EVENT_KEYS = {"id", "time", "kind", "title", "summary", "url", "source", "sentiment", "impact"}
ALERT_KEYS = {"id", "time", "instrumentId", "severity", "title", "body", "action", "confidence", "eventIds", "pushed"}
DIGEST_KEYS = {"id", "time", "kind", "title", "markdown"}
EVENT_KINDS = {"news", "bluesky", "forum", "attention", "price", "earnings"}


def _check_keys(obj: Any, keys: set[str], where: str, errors: list[str]) -> bool:
    if not isinstance(obj, dict):
        errors.append(f"{where}: not an object")
        return False
    if set(obj) != keys:
        errors.append(f"{where}: keys {sorted(set(obj) ^ keys)} differ")
        return False
    return True


def _check_signal(sig: Any, where: str, errors: list[str]) -> None:
    if not _check_keys(sig, SIGNAL_KEYS, where, errors):
        return
    if sig["action"] not in ACTIONS or sig["risk"] not in IMPACTS or sig["horizon"] not in HORIZONS:
        errors.append(f"{where}: bad enum")
    if not 0 <= sig["confidence"] <= 1 or not -1 <= sig["score"] <= 1:
        errors.append(f"{where}: out of range")
    for f in sig["factors"]:
        _check_keys(f, {"name", "value", "weight", "note"}, f"{where}.factor", errors)


def validate(feed: dict[str, Any]) -> list[str]:
    """Return a list of schema problems (empty list = valid)."""
    errors: list[str] = []
    _check_keys(feed, {"version", "generatedAt", "run", "market", "instruments", "alerts", "digests", "resolved"},
                "feed", errors)
    if errors:
        return errors
    _check_keys(feed["run"], {"mode", "llm", "durationSec"}, "run", errors)
    if feed["run"]["mode"] not in ("light", "deep", "digest"):
        errors.append("run.mode: bad enum")
    _check_keys(feed["market"], {"isOpen", "note"}, "market", errors)
    for iid, snap in feed["instruments"].items():
        w = f"instruments[{iid}]"
        if not _check_keys(snap, SNAPSHOT_KEYS, w, errors):
            continue
        _check_keys(snap["technicals"], TECH_KEYS, f"{w}.technicals", errors)
        _check_keys(snap["history"], {"daily", "intraday"}, f"{w}.history", errors)
        _check_signal(snap["signal"], f"{w}.signal", errors)
        for e in snap["events"]:
            if _check_keys(e, EVENT_KEYS, f"{w}.event", errors) and (e["kind"] not in EVENT_KINDS or e["impact"] not in IMPACTS):
                errors.append(f"{w}.event: bad enum")
    for a in feed["alerts"]:
        if _check_keys(a, ALERT_KEYS, "alert", errors):
            if a["severity"] not in ("info", "important", "critical") or len(a["body"]) > 180:
                errors.append("alert: bad severity or body too long")
            if a["action"] is not None and a["action"] not in ACTIONS:
                errors.append("alert: bad action")
    for d in feed["digests"]:
        if _check_keys(d, DIGEST_KEYS, "digest", errors) and d["kind"] not in ("daily", "weekly"):
            errors.append("digest: bad kind")
    for iid, r in feed["resolved"].items():
        _check_keys(r, {"symbol", "name", "currency"}, f"resolved[{iid}]", errors)
    return errors
