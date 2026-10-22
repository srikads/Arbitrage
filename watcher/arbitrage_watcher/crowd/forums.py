"""German investor forums: broad board / latest-post pages only (contract §6.3).

Pages are parsed generically (thread links with titles) and matched locally.
Everything fails soft; Playwright is used only if installed and the static
HTML has (almost) no thread links.
"""

from __future__ import annotations

from html.parser import HTMLParser
from typing import NamedTuple
from urllib.parse import urljoin

from arbitrage_watcher import http, log
from arbitrage_watcher.news import NewsItem
from arbitrage_watcher.util import stable_hash, truncate, utcnow


class Board(NamedTuple):
    source: str
    url: str
    thread_hint: str   # substring every thread link contains


BOARDS: tuple[Board, ...] = (
    Board("wallstreet-online", "https://www.wallstreet-online.de/community/", "/diskussion/"),
    Board("wallstreet-online", "https://www.wallstreet-online.de/community/neueste-beitraege", "/diskussion/"),
    Board("ariva", "https://www.ariva.de/forum/", "/forum/"),
    Board("finanzen.net", "https://www.finanzen.net/forum/", "/forum/"),
)
MIN_LINKS = 5


class _LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href is not None:
            self.links.append((self._href, " ".join("".join(self._text).split())))
            self._href = None


def parse_board(html: str, board: Board) -> list[NewsItem]:
    """Extract thread titles + links from a board page."""
    p = _LinkParser()
    try:
        p.feed(html)
    except Exception:
        return []
    now = utcnow()
    items: dict[str, NewsItem] = {}
    for href, text in p.links:
        if board.thread_hint not in href or len(text) < 8 or len(text) > 200:
            continue
        url = urljoin(board.url, href)
        iid = stable_hash(url)
        items.setdefault(iid, NewsItem(
            id=iid, time=now, title=truncate(text, 200), summary="", url=url, source=board.source, kind="forum",
        ))
    return list(items.values())


def _render_with_playwright(url: str) -> str | None:
    try:
        from playwright.sync_api import sync_playwright  # optional extra "forums"
    except ImportError:
        return None
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            page = browser.new_page(user_agent=http.BROWSER_UA)
            page.goto(url, timeout=20000, wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            html = page.content()
            browser.close()
            return html
    except Exception as exc:
        log.error("forum render", exc)
        return None


def fetch_forums(boards: tuple[Board, ...] = BOARDS) -> list[NewsItem]:
    items: dict[str, NewsItem] = {}
    ok = 0
    with http.client(timeout=15.0) as c:
        for board in boards:
            resp = http.get(c, board.url, retries=1)
            found = parse_board(resp.text, board) if resp is not None else []
            if len(found) < MIN_LINKS:
                html = _render_with_playwright(board.url)
                found = parse_board(html, board) if html else found
            ok += bool(found)
            for item in found:
                items.setdefault(item.id, item)
    log.info("forums: %d/%d boards parsed, %d threads", ok, len(boards), len(items))
    return list(items.values())
