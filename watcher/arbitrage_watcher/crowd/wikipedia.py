"""Wikipedia pageviews (real + decoy articles, shuffled) → attention z-score."""

from __future__ import annotations

import math
import random
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Any, Sequence
from urllib.parse import quote

from arbitrage_watcher import http, log

API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{title}/daily/{start}/{end}"
BASELINE_DAYS = 30
MIN_VIEWS = 150


def url_for(title: str, end: date, days: int = BASELINE_DAYS + 5) -> str:
    start = end - timedelta(days=days)
    return API.format(
        title=quote(title.replace(" ", "_"), safe=""),
        start=start.strftime("%Y%m%d00"),
        end=end.strftime("%Y%m%d00"),
    )


def parse_views(payload: dict[str, Any]) -> list[int]:
    items = sorted(payload.get("items") or [], key=lambda i: str(i.get("timestamp")))
    return [int(i.get("views") or 0) for i in items]


def attention_z(views: Sequence[int]) -> float | None:
    """Z-score of the last day's (log) views vs the preceding baseline."""
    if len(views) < 10:
        return None
    hist = [math.log1p(v) for v in views[-BASELINE_DAYS - 1 : -1]]
    mean = sum(hist) / len(hist)
    std = math.sqrt(sum((x - mean) ** 2 for x in hist) / len(hist))
    last = math.log1p(views[-1])
    if std < 0.05:
        std = 0.05
    return round((last - mean) / std, 2)


def fetch_pageviews(titles: Sequence[str], rng: random.Random | None = None,
                    workers: int = 4) -> dict[str, list[int]]:
    """Daily views for each title (order shuffled; caller pads with decoys)."""
    rng = rng or random.SystemRandom()
    order = list(dict.fromkeys(titles))
    rng.shuffle(order)
    end = date.today() - timedelta(days=1)

    def one(title: str) -> tuple[str, list[int]]:
        time.sleep(rng.uniform(0.05, 0.3))
        with http.client(timeout=10.0, ua=http.BOT_UA) as c:
            resp = http.get(c, url_for(title, end), retries=1)
        try:
            return title, parse_views(resp.json()) if resp is not None else []
        except ValueError:
            return title, []

    with ThreadPoolExecutor(max_workers=workers) as pool:
        result = dict(pool.map(one, order))
    log.info("wikipedia: %d/%d articles with data", sum(1 for v in result.values() if v), len(order))
    return result
