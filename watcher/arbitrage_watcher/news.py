"""Fetch broad RSS feeds and match items to instruments locally."""

from __future__ import annotations

import calendar
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Sequence

import feedparser

from arbitrage_watcher import http, log
from arbitrage_watcher.matching import Matcher, is_macro
from arbitrage_watcher.news_sources import FEEDS, MAX_AGE_HOURS, Feed
from arbitrage_watcher.util import stable_hash, strip_html, truncate, utcnow


@dataclass
class NewsItem:
    id: str
    time: datetime
    title: str
    summary: str
    url: str | None
    source: str
    kind: str = "news"          # news | bluesky | forum
    instruments: list[str] = field(default_factory=list)
    macro: bool = False

    @property
    def text(self) -> str:
        return f"{self.title}. {self.summary}"


def _entry_time(entry: feedparser.FeedParserDict) -> datetime | None:
    for key in ("published_parsed", "updated_parsed"):
        st = entry.get(key)
        if st:
            return datetime.fromtimestamp(calendar.timegm(st), tz=timezone.utc)
    return None


def parse_feed(content: bytes, source: str, now: datetime | None = None) -> list[NewsItem]:
    """Parse RSS/Atom bytes into recent NewsItems."""
    now = now or utcnow()
    parsed = feedparser.parse(content)
    items: list[NewsItem] = []
    for e in parsed.entries:
        title = strip_html(e.get("title"))
        if not title:
            continue
        t = _entry_time(e) or now
        if now - t > timedelta(hours=MAX_AGE_HOURS):
            continue
        link = e.get("link") or None
        items.append(NewsItem(
            id=stable_hash(link or title, title),
            time=min(t, now),
            title=truncate(title, 300),
            summary=truncate(strip_html(e.get("summary") or e.get("description")), 500),
            url=link,
            source=source,
        ))
    return items


def _fetch_one(feed: Feed) -> list[NewsItem]:
    with http.client(timeout=12.0) as c:
        resp = http.get(c, feed.url, retries=1)
    if resp is None:
        return []
    try:
        return parse_feed(resp.content, feed.source)
    except Exception as exc:
        log.error("feed parse", exc)
        return []


def fetch_news(feeds: Sequence[Feed] = FEEDS, workers: int = 8) -> list[NewsItem]:
    """Fetch all feeds in parallel; dead feeds are skipped. Items are de-duplicated by id/title."""
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(_fetch_one, feeds))
    alive = sum(1 for r in results if r)
    seen_ids: set[str] = set()
    seen_titles: set[str] = set()
    items: list[NewsItem] = []
    for item in (i for r in results for i in r):
        key = item.title.lower()
        if item.id in seen_ids or key in seen_titles:
            continue
        seen_ids.add(item.id)
        seen_titles.add(key)
        items.append(item)
    log.info("news: %d/%d feeds responded, %d items", alive, len(feeds), len(items))
    return items


def tag_items(items: Sequence[NewsItem], matcher: Matcher) -> list[NewsItem]:
    """Attach instrument ids / macro flag; return only relevant items."""
    relevant: list[NewsItem] = []
    for item in items:
        item.instruments = matcher.match(item.text)
        item.macro = item.kind == "news" and not item.instruments and is_macro(item.text)
        if item.instruments or item.macro:
            relevant.append(item)
    return relevant
