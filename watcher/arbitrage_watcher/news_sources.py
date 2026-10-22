"""Broad RSS feeds (contract §6.1: general business/market news only, never per-ticker).

Dead or blocked feeds are tolerated; add/remove entries freely.
"""

from __future__ import annotations

from typing import NamedTuple


class Feed(NamedTuple):
    source: str
    url: str
    lang: str


FEEDS: tuple[Feed, ...] = (
    Feed("tagesschau.de", "https://www.tagesschau.de/wirtschaft/index~rss2.xml", "de"),
    Feed("n-tv.de", "https://www.n-tv.de/wirtschaft/rss", "de"),
    Feed("finanzen.net", "https://www.finanzen.net/rss/news", "de"),
    Feed("boerse.de", "https://www.boerse.de/rss/", "de"),
    Feed("onvista.de", "https://www.onvista.de/news/feed/rss.xml", "de"),
    Feed("handelsblatt.com", "https://www.handelsblatt.com/contentexport/feed/finanzen", "de"),
    Feed("handelsblatt.com", "https://www.handelsblatt.com/contentexport/feed/unternehmen", "de"),
    Feed("faz.net", "https://www.faz.net/rss/aktuell/finanzen/", "de"),
    Feed("faz.net", "https://www.faz.net/rss/aktuell/wirtschaft/", "de"),
    Feed("spiegel.de", "https://www.spiegel.de/wirtschaft/index.rss", "de"),
    Feed("wiwo.de", "https://www.wiwo.de/contentexport/feed/rss/finanzen", "de"),
    Feed("deraktionaer.de", "https://www.deraktionaer.de/aktionaer-news.rss", "de"),
    Feed("Google News", "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=de&gl=DE&ceid=DE:de", "de"),
    Feed("Google News", "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-GB&gl=GB&ceid=GB:en", "en"),
    Feed("Google News", "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en", "en"),
    Feed("cnbc.com", "https://www.cnbc.com/id/100003114/device/rss/rss.html", "en"),
    Feed("cnbc.com", "https://www.cnbc.com/id/10001147/device/rss/rss.html", "en"),
    Feed("marketwatch.com", "https://feeds.content.dowjones.io/public/rss/mw_topstories", "en"),
    Feed("marketwatch.com", "https://feeds.content.dowjones.io/public/rss/mw_marketpulse", "en"),
    Feed("ecb.europa.eu", "https://www.ecb.europa.eu/rss/press.html", "en"),
    Feed("bundesbank.de", "https://www.bundesbank.de/service/rss/de/633286/feed.rss", "de"),
)

MAX_AGE_HOURS = 72
