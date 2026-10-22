"""Run the crowd sources on their own timers and keep compact aggregates in state."""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any, Sequence

from arbitrage_watcher import log
from arbitrage_watcher.crowd import bluesky, forums, wikipedia
from arbitrage_watcher.factors import Evidence
from arbitrage_watcher.lexicon import score_text
from arbitrage_watcher.matching import Matcher
from arbitrage_watcher.models import Tracked
from arbitrage_watcher.news import NewsItem
from arbitrage_watcher.state import due, mark
from arbitrage_watcher.util import iso, parse_iso

BLUESKY_EVERY = timedelta(hours=2, minutes=30)
FORUMS_EVERY = timedelta(hours=2, minutes=30)
CROWD_KEEP = timedelta(hours=48)
MAX_POSTS_PER_INSTRUMENT = 100
EVENTS_PER_RUN = 3   # only the most opinionated posts become visible events


def _remember(state: dict[str, Any], items: Sequence[NewsItem], now: datetime) -> None:
    """Store [time, sentiment] per matched post for the crowd factor (48h window)."""
    crowd: dict[str, dict[str, list[Any]]] = state["crowd"]
    for item in items:
        s = score_text(item.text).sentiment
        for iid in item.instruments:
            crowd.setdefault(iid, {})[item.id] = [iso(item.time), s]
    cutoff = now - CROWD_KEEP
    for iid in list(crowd):
        posts = {k: v for k, v in crowd[iid].items() if (parse_iso(v[0]) or now) >= cutoff}
        newest = sorted(posts.items(), key=lambda kv: kv[1][0], reverse=True)[:MAX_POSTS_PER_INSTRUMENT]
        crowd[iid] = dict(newest)
        if not crowd[iid]:
            del crowd[iid]


def crowd_evidence(state: dict[str, Any], iid: str) -> list[Evidence]:
    out = []
    for t, s in (state["crowd"].get(iid) or {}).values():
        ts = parse_iso(t)
        if ts:
            out.append(Evidence(float(s), "low", 0.6, ts))
    return out


def top_items(items: Sequence[NewsItem], iid: str) -> list[NewsItem]:
    mine = [i for i in items if iid in i.instruments]
    return sorted(mine, key=lambda i: -abs(score_text(i.text).sentiment))[:EVENTS_PER_RUN]


def collect(tracked: Sequence[Tracked], decoys: Sequence[dict[str, Any]], matcher: Matcher,
            settings: dict[str, Any], state: dict[str, Any], now: datetime,
            rng: random.Random | None = None) -> list[NewsItem]:
    """Fetch due crowd sources; returns matched posts/threads from this run."""
    rng = rng or random.SystemRandom()
    sources = settings.get("sources") or {}
    found: list[NewsItem] = []
    if sources.get("bluesky", True) and tracked and due(state, "bluesky", BLUESKY_EVERY):
        names = [t.name for t in tracked] + [d["name"] for d in decoys]
        posts = bluesky.search([bluesky.query_for(n) for n in names], rng)
        found += [p for p in posts if _tag(p, matcher)]
        mark(state, "bluesky")
    if sources.get("forums", True) and tracked and due(state, "forums", FORUMS_EVERY):
        threads = forums.fetch_forums()
        found += [p for p in threads if _tag(p, matcher)]
        mark(state, "forums")
    _remember(state, found, now)
    if sources.get("wikipedia", True):
        _attention(tracked, decoys, state, now, rng)
    log.info("crowd: %d matched posts/threads this run", len(found))
    return found


def _tag(item: NewsItem, matcher: Matcher) -> bool:
    item.instruments = matcher.match(item.text)
    return bool(item.instruments)


def _attention(tracked: Sequence[Tracked], decoys: Sequence[dict[str, Any]], state: dict[str, Any],
               now: datetime, rng: random.Random) -> None:
    """Once per day (after ~06:00 UTC, when yesterday's views are published)."""
    today = now.date().isoformat()
    if state["last"].get("wikipedia") == today or now.hour < 6:
        return
    real = {t.id: t.wikipedia for t in tracked if t.wikipedia}
    if not real:
        return
    titles = list(real.values()) + [d["wikipedia"] for d in decoys if d.get("wikipedia")]
    views = wikipedia.fetch_pageviews(titles, rng)
    for iid, title in real.items():
        series = views.get(title) or []
        z = wikipedia.attention_z(series)
        state["attention"][iid] = {"z": z, "views": series[-1] if series else None, "date": today}
    state["last"]["wikipedia"] = today
