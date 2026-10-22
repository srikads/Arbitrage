"""XETRA trading hours, holidays, digest timing and run-mode selection."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from functools import lru_cache
from typing import Any
from zoneinfo import ZoneInfo

BERLIN = ZoneInfo("Europe/Berlin")
OPEN, CLOSE = time(9, 0), time(17, 30)
DAILY_DIGEST_START, DAILY_DIGEST_END = time(17, 35), time(21, 0)   # wide window: scheduled runs can be late
WEEKLY_DIGEST_START = time(17, 0)


def easter(year: int) -> date:
    """Gregorian Easter Sunday (Anonymous Gregorian algorithm)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    day = (h + l_ - 7 * m + 114) % 31 + 1
    return date(year, month, day)


@lru_cache(maxsize=8)
def holidays(year: int) -> frozenset[date]:
    """XETRA full-day closures: New Year, Good Friday, Easter Monday, 1 May, 24–26 Dec, 31 Dec."""
    e = easter(year)
    return frozenset({
        date(year, 1, 1), e - timedelta(days=2), e + timedelta(days=1), date(year, 5, 1),
        date(year, 12, 24), date(year, 12, 25), date(year, 12, 26), date(year, 12, 31),
    })


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d not in holidays(d.year)


def is_open(now: datetime) -> bool:
    local = now.astimezone(BERLIN)
    return is_trading_day(local.date()) and OPEN <= local.time() < CLOSE


def next_open(now: datetime) -> datetime:
    local = now.astimezone(BERLIN)
    d = local.date()
    if local.time() >= OPEN:
        d += timedelta(days=1)
    while not is_trading_day(d):
        d += timedelta(days=1)
    return datetime.combine(d, OPEN, BERLIN)


def market_note(now: datetime) -> str:
    if is_open(now):
        return "XETRA open, closes 17:30 Europe/Berlin"
    nxt = next_open(now)
    return f"XETRA closed, opens {nxt.strftime('%a %d %b %H:%M')} Europe/Berlin"


def iso_week(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def daily_digest_due(now: datetime, state: dict[str, Any], settings: dict[str, Any]) -> bool:
    local = now.astimezone(BERLIN)
    if not settings.get("digest", {}).get("daily", True) or not is_trading_day(local.date()):
        return False
    in_window = DAILY_DIGEST_START <= local.time() <= DAILY_DIGEST_END
    return in_window and state["last"].get("digestDaily") != local.date().isoformat()


def weekly_digest_due(now: datetime, state: dict[str, Any], settings: dict[str, Any]) -> bool:
    local = now.astimezone(BERLIN)
    if not settings.get("digest", {}).get("weekly", True) or local.weekday() != 6:
        return False
    return local.time() >= WEEKLY_DIGEST_START and state["last"].get("digestWeekly") != iso_week(local.date())


def digest_due(now: datetime, state: dict[str, Any], settings: dict[str, Any]) -> bool:
    return daily_digest_due(now, state, settings) or weekly_digest_due(now, state, settings)


def choose_mode(requested: str, now: datetime, state: dict[str, Any], settings: dict[str, Any],
                llm_pending: int, llm_available: bool) -> str:
    """Resolve --mode auto into light | deep | digest."""
    if requested != "auto":
        return requested
    if digest_due(now, state, settings):
        return "digest"
    if llm_pending > 0 and llm_available:
        return "deep"
    return "light"
