"""Shared HTTP client with retries and a neutral User-Agent."""

from __future__ import annotations

import random
import time
from typing import Any

import httpx

from arbitrage_watcher import __version__

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
# Wikimedia asks API clients to send a descriptive User-Agent instead of a browser one.
BOT_UA = f"arbitrage-watcher/{__version__} (self-hosted personal market watcher; python-httpx)"

RETRY_STATUS = {429, 500, 502, 503, 504}


def client(timeout: float = 15.0, ua: str = BROWSER_UA, **kwargs: Any) -> httpx.Client:
    return httpx.Client(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": ua, "Accept-Language": "de-DE,de;q=0.9,en;q=0.8"},
        **kwargs,
    )


def get(c: httpx.Client, url: str, *, params: dict[str, Any] | None = None,
        retries: int = 2, backoff: float = 1.5) -> httpx.Response | None:
    """GET with exponential backoff on 429/5xx and transport errors; None on failure."""
    for attempt in range(retries + 1):
        try:
            resp = c.get(url, params=params)
        except httpx.HTTPError:
            resp = None
        if resp is not None and resp.status_code not in RETRY_STATUS:
            return resp if resp.status_code < 400 else None
        if attempt < retries:
            delay = backoff * (2**attempt) + random.uniform(0, 0.5)
            if resp is not None and resp.headers.get("retry-after", "").isdigit():
                delay = min(30.0, float(resp.headers["retry-after"]))
            time.sleep(delay)
    return None
