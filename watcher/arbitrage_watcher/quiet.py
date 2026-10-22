"""Quiet-hours logic in the user's time zone."""

from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def _parse_hhmm(value: str) -> time | None:
    try:
        h, m = value.strip().split(":")
        return time(int(h), int(m))
    except (ValueError, AttributeError):
        return None


def zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "Europe/Berlin")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("Europe/Berlin")


def is_quiet(now: datetime, start: str, end: str, tz: str | None) -> bool:
    """True if `now` falls inside [start, end) local time; handles windows across midnight.

    start == end (or unparsable values) means no quiet hours.
    """
    s, e = _parse_hhmm(start), _parse_hhmm(end)
    if s is None or e is None or s == e:
        return False
    t = now.astimezone(zone(tz)).time()
    if s < e:
        return s <= t < e
    return t >= s or t < e


def local_date(now: datetime, tz: str | None) -> str:
    return now.astimezone(zone(tz)).date().isoformat()
