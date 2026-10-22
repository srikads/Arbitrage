"""Build contract Events per instrument and evidence lists for the signal engine."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Iterable, Sequence

from arbitrage_watcher.factors import Evidence
from arbitrage_watcher.models import Event
from arbitrage_watcher.news import NewsItem
from arbitrage_watcher.scoring import MACRO, score_key
from arbitrage_watcher.util import iso, parse_iso, stable_hash, truncate

MIN_RELEVANCE = 0.3
MAX_EVENTS = 50
KEEP_DAYS = 30
SIGNAL_WINDOW = timedelta(days=7)
MACRO_PREFIX = "m-"   # macro events shown on holdings; excluded from instrument news evidence


def item_event(item: NewsItem, rec: dict[str, Any]) -> Event:
    return {
        "id": item.id,
        "time": iso(item.time),
        "kind": item.kind,
        "title": item.title,
        "summary": rec.get("sum") or truncate(item.summary, 280),
        "url": item.url,
        "source": item.source,
        "sentiment": round(float(rec.get("s", 0.0)), 3),
        "impact": rec.get("imp", "low"),
    }


def events_for(iid: str, items: Sequence[NewsItem], scores: dict[str, dict[str, Any]],
               include_macro: bool) -> list[Event]:
    """Events from this run's items for one instrument (low-relevance matches dropped)."""
    out: list[Event] = []
    for item in items:
        prefix = ""
        if iid in item.instruments:
            rec = scores.get(score_key(item.id, iid))
        elif include_macro and item.macro:
            rec = scores.get(score_key(item.id, MACRO))
            if rec is None or rec.get("imp") != "high":
                continue
            prefix = MACRO_PREFIX
        else:
            continue
        if rec is not None and float(rec.get("rel", 1.0)) >= MIN_RELEVANCE:
            ev = item_event(item, rec)
            ev["id"] = prefix + ev["id"]
            out.append(ev)
    return out


def irrelevant_ids(iid: str, items: Sequence[NewsItem], scores: dict[str, dict[str, Any]]) -> set[str]:
    """Item ids the LLM judged unrelated to this instrument (to purge from earlier events)."""
    out = set()
    for item in items:
        if iid in item.instruments:
            rec = scores.get(score_key(item.id, iid))
            if rec is not None and float(rec.get("rel", 1.0)) < MIN_RELEVANCE:
                out.add(item.id)
    return out


def merge_events(new: Iterable[Event], previous: Iterable[dict[str, Any]], now: datetime,
                 dropped_ids: set[str] | None = None) -> list[Event]:
    """Merge with the previous feed's events (new wins), drop old ones, newest first, max 50."""
    dropped_ids = dropped_ids or set()
    merged: dict[str, Event] = {}
    for e in previous:
        if isinstance(e, dict) and e.get("id") and e["id"] not in dropped_ids:
            merged[e["id"]] = e  # type: ignore[assignment]
    for e in new:
        merged[e["id"]] = e
    cutoff = now - timedelta(days=KEEP_DAYS)
    fresh = [e for e in merged.values() if (parse_iso(e.get("time")) or now) >= cutoff]
    fresh.sort(key=lambda e: e.get("time") or "", reverse=True)
    return fresh[:MAX_EVENTS]


def evidence_from_events(events: Sequence[dict[str, Any]], kinds: tuple[str, ...], now: datetime,
                         relevance: float = 0.8) -> list[Evidence]:
    """Evidence for the signal engine from (merged) events of the last 7 days."""
    out = []
    for e in events:
        t = parse_iso(e.get("time"))
        if e.get("kind") not in kinds or t is None or now - t > SIGNAL_WINDOW:
            continue
        if str(e.get("id", "")).startswith(MACRO_PREFIX):
            continue
        out.append(Evidence(float(e.get("sentiment", 0.0)), str(e.get("impact", "low")), relevance, t))
    return out


def macro_evidence(items: Sequence[NewsItem], scores: dict[str, dict[str, Any]]) -> list[Evidence]:
    out = []
    for item in items:
        if not item.macro:
            continue
        rec = scores.get(score_key(item.id, MACRO))
        if rec and float(rec.get("rel", 1.0)) >= MIN_RELEVANCE:
            out.append(Evidence(float(rec["s"]), rec.get("imp", "low"), float(rec.get("rel", 0.8)), item.time))
    return out


def price_event(iid: str, now: datetime, change1d: float | None, move1h: float | None) -> Event | None:
    """A 'price' event for sharp moves (one per instrument, day and direction)."""
    if move1h is not None and abs(move1h) > 3:
        title, move = f"Sharp move: {move1h:+.1f}% within an hour", move1h
    elif change1d is not None and abs(change1d) > 5:
        title, move = f"Sharp move: {change1d:+.1f}% today", change1d
    else:
        return None
    direction = "up" if move > 0 else "down"
    return {
        "id": stable_hash(iid, "price", now.date().isoformat(), direction),
        "time": iso(now), "kind": "price", "title": title, "summary": "", "url": None, "source": "Market data",
        "sentiment": round(max(-1.0, min(1.0, move / 10)), 3), "impact": "high" if abs(move) > 8 else "medium",
    }


def earnings_event(iid: str, now: datetime, next_earnings: date | None) -> Event | None:
    if next_earnings is None:
        return None
    days = (next_earnings - now.date()).days
    if days not in (0, 1):
        return None
    return {
        "id": stable_hash(iid, "earnings", next_earnings.isoformat()),
        "time": iso(now), "kind": "earnings",
        "title": f"Earnings report {'today' if days == 0 else 'tomorrow'} ({next_earnings.isoformat()})",
        "summary": "Quarterly results can move the price sharply in either direction.",
        "url": None, "source": "Earnings calendar", "sentiment": 0.0, "impact": "medium",
    }


def attention_event(iid: str, now: datetime, z: float | None, views: int | None) -> Event | None:
    if z is None or z < 2.5 or (views or 0) < 150:
        return None
    return {
        "id": stable_hash(iid, "attention", now.date().isoformat()),
        "time": iso(now), "kind": "attention",
        "title": f"Unusual public attention (Wikipedia views z-score {z:.1f})",
        "summary": f"{views} page views yesterday, well above the 30-day norm.",
        "url": None, "source": "Wikipedia", "sentiment": 0.0, "impact": "medium" if z < 4 else "high",
    }
