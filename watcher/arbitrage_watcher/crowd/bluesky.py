"""Bluesky public search (padded with decoy queries, first page only)."""

from __future__ import annotations

import random
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Any, Sequence

import httpx

from arbitrage_watcher import http, log
from arbitrage_watcher.matching import strip_legal
from arbitrage_watcher.news import NewsItem
from arbitrage_watcher.util import parse_iso, stable_hash, truncate, utcnow

ENDPOINTS = (
    "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts",
    "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts",
)
MAX_AGE = timedelta(hours=48)


def query_for(name: str) -> str:
    """Search term for an instrument name (legal suffix stripped, quoted phrase)."""
    short = strip_legal(name).strip()
    return f'"{short}"' if " " in short else short


def _post_url(post: dict[str, Any]) -> str | None:
    uri = str(post.get("uri") or "")
    handle = (post.get("author") or {}).get("handle")
    if not uri.startswith("at://") or not handle:
        return None
    return f"https://bsky.app/profile/{handle}/post/{uri.rsplit('/', 1)[-1]}"


def parse_posts(payload: dict[str, Any], now: datetime | None = None) -> list[NewsItem]:
    now = now or utcnow()
    items: list[NewsItem] = []
    for post in payload.get("posts") or []:
        record = post.get("record") or {}
        text = str(record.get("text") or "").strip()
        t = parse_iso(record.get("createdAt") or post.get("indexedAt"))
        if not text or t is None or now - t > MAX_AGE:
            continue
        items.append(NewsItem(
            id=stable_hash(str(post.get("uri") or text)),
            time=min(t, now),
            title=truncate(text.replace("\n", " "), 200),
            summary=truncate(text, 400),
            url=_post_url(post),
            source="Bluesky",
            kind="bluesky",
        ))
    return items


def _search(c: httpx.Client, q: str) -> dict[str, Any] | None:
    params = {"q": q, "limit": 25, "sort": "latest"}
    for url in ENDPOINTS:
        resp = http.get(c, url, params=params, retries=1)
        if resp is not None:
            try:
                return resp.json()
            except ValueError:
                return None
    return None


def search(queries: Sequence[str], rng: random.Random | None = None, workers: int = 3) -> list[NewsItem]:
    """Run padded, shuffled queries (caller mixes real + decoy names); returns all posts.

    Results for decoy queries are fetched like any other and simply not matched later.
    """
    rng = rng or random.SystemRandom()
    order = list(queries)
    rng.shuffle(order)

    def one(q: str) -> list[NewsItem]:
        time.sleep(rng.uniform(0.2, 0.8))  # polite pacing
        with http.client(timeout=10.0) as c:
            payload = _search(c, q)
        return parse_posts(payload) if payload else []

    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(one, order))
    ok = sum(1 for r in results if r)
    items = {i.id: i for r in results for i in r}
    log.info("bluesky: %d/%d queries returned posts, %d unique posts", ok, len(order), len(items))
    return list(items.values())
