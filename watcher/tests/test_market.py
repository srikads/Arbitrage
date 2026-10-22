from datetime import date, datetime, timezone

from arbitrage_watcher.market import choose_mode, easter, is_open, is_trading_day, market_note
from arbitrage_watcher.models import DEFAULT_SETTINGS
from arbitrage_watcher.state import new_state


def test_easter_and_holidays():
    assert easter(2026) == date(2026, 4, 5)
    assert not is_trading_day(date(2026, 4, 3))    # Good Friday
    assert not is_trading_day(date(2026, 12, 24))
    assert not is_trading_day(date(2026, 10, 24))  # Saturday
    assert is_trading_day(date(2026, 10, 22))


def test_open_hours():
    assert is_open(datetime(2026, 10, 22, 8, 0, tzinfo=timezone.utc))       # 10:00 Berlin
    assert not is_open(datetime(2026, 10, 22, 15, 45, tzinfo=timezone.utc))  # 17:45 Berlin
    assert "opens Fri" in market_note(datetime(2026, 10, 22, 20, 0, tzinfo=timezone.utc))


def test_mode_selection():
    st = new_state()
    after_close = datetime(2026, 10, 22, 15, 50, tzinfo=timezone.utc)   # 17:50 Berlin
    assert choose_mode("auto", after_close, st, DEFAULT_SETTINGS, 0, False) == "digest"
    st["last"]["digestDaily"] = "2026-10-22"
    assert choose_mode("auto", after_close, st, DEFAULT_SETTINGS, 0, False) == "light"
    midday = datetime(2026, 10, 22, 10, 0, tzinfo=timezone.utc)
    assert choose_mode("auto", midday, st, DEFAULT_SETTINGS, 3, True) == "deep"
    assert choose_mode("auto", midday, st, DEFAULT_SETTINGS, 3, False) == "light"
    sunday = datetime(2026, 10, 25, 17, 30, tzinfo=timezone.utc)        # 18:30 Berlin (CET)
    assert choose_mode("auto", sunday, st, DEFAULT_SETTINGS, 0, False) == "digest"
    assert choose_mode("light", sunday, st, DEFAULT_SETTINGS, 0, False) == "light"
