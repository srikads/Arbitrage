"""Parsers for RSS, Bluesky, forums and Wikipedia (offline samples)."""

from datetime import datetime, timedelta, timezone

from arbitrage_watcher.crowd import bluesky, forums, wikipedia
from arbitrage_watcher.matching import build_matcher
from arbitrage_watcher.news import parse_feed, tag_items
from tests.conftest import tracked

NOW = datetime(2026, 10, 22, 12, tzinfo=timezone.utc)

RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
<item><title>Siemens: Auftragseingang &amp; Gewinn steigen</title><link>https://ex.com/a</link>
<description>&lt;p&gt;Der Konzern &lt;b&gt;w\xc3\xa4chst&lt;/b&gt;&lt;/p&gt;</description>
<pubDate>Thu, 22 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Old news</title><link>https://ex.com/b</link><pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Inflation in Eurozone sinkt</title><link>https://ex.com/c</link><pubDate>Thu, 22 Oct 2026 09:00:00 GMT</pubDate></item>
</channel></rss>"""


def test_rss_parse_and_tag():
    items = parse_feed(RSS, "tagesschau.de", NOW)
    assert [i.title for i in items] == ["Siemens: Auftragseingang & Gewinn steigen", "Inflation in Eurozone sinkt"]
    assert items[0].summary == "Der Konzern wächst"
    relevant = tag_items(items, build_matcher([tracked()]))
    assert relevant[0].instruments == ["DE0007236101"] and relevant[1].macro


def test_bluesky_parse():
    payload = {"posts": [
        {"uri": "at://did:plc:x/app.bsky.feed.post/3k", "author": {"handle": "a.bsky.social"},
         "record": {"text": "Siemens looks strong", "createdAt": "2026-10-22T11:00:00Z"}},
        {"uri": "at://did:plc:y/app.bsky.feed.post/3j", "author": {"handle": "b"},
         "record": {"text": "too old", "createdAt": "2026-10-01T11:00:00Z"}},
    ]}
    items = bluesky.parse_posts(payload, NOW)
    assert len(items) == 1 and items[0].url == "https://bsky.app/profile/a.bsky.social/post/3k"
    assert bluesky.query_for("Siemens AG") == "Siemens"
    assert bluesky.query_for("Deutsche Telekom AG") == '"Deutsche Telekom"'


def test_forum_board_parse():
    html = """<html><body><a href="/diskussion/1234-siemens-aktie">Siemens - langfristig ein Kauf?</a>
    <a href="/impressum">Impressum</a><a href="/diskussion/55">kurz</a></body></html>"""
    board = forums.Board("wallstreet-online", "https://www.wallstreet-online.de/community/", "/diskussion/")
    items = forums.parse_board(html, board)
    assert len(items) == 1 and items[0].url.startswith("https://www.wallstreet-online.de/diskussion/")
    assert items[0].kind == "forum"


def test_wikipedia_z():
    assert wikipedia.attention_z([100] * 30 + [100]) < 1
    assert wikipedia.attention_z([100 + (i % 5) * 10 for i in range(30)] + [1000]) > 5
    assert wikipedia.attention_z([1, 2]) is None
    url = wikipedia.url_for("Linde plc", NOW.date())
    assert "/Linde_plc/daily/" in url and url.endswith("2026102200")
    assert wikipedia.parse_views({"items": [{"timestamp": "2", "views": 5}, {"timestamp": "1", "views": 3}]}) == [3, 5]
