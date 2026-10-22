"""Price download (yfinance, padded with decoys) and snapshot computation."""

from __future__ import annotations

import contextlib
import io
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Iterator, Sequence

import pandas as pd

from arbitrage_watcher import log, technicals as ta
from arbitrage_watcher.models import Tracked
from arbitrage_watcher.util import finite, iso, rnd


@dataclass
class PriceData:
    daily: pd.DataFrame = field(default_factory=pd.DataFrame)   # Close, Volume; tz-naive date index
    intraday: pd.Series = field(default_factory=lambda: pd.Series(dtype=float))  # tz-aware index


@contextlib.contextmanager
def _silenced() -> Iterator[None]:
    """yfinance prints failed symbols to stdout/stderr; never let that reach logs."""
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        yield


def _split(df: pd.DataFrame, symbols: Sequence[str]) -> dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    if df is None or df.empty:
        return out
    if isinstance(df.columns, pd.MultiIndex):
        level0 = set(df.columns.get_level_values(0))
        for sym in symbols:
            if sym in level0:
                sub = df[sym].dropna(how="all")
                if not sub.empty:
                    out[sym] = sub
    elif len(symbols) == 1:
        out[symbols[0]] = df.dropna(how="all")
    return out


def download(symbols: Sequence[str], period: str, interval: str, retries: int = 2) -> dict[str, pd.DataFrame]:
    """Batch download; symbols that fail are retried once more, partial results are fine."""
    import yfinance as yf

    result: dict[str, pd.DataFrame] = {}
    pending = list(symbols)
    for attempt in range(retries + 1):
        if not pending:
            break
        try:
            with _silenced():
                df = yf.download(
                    pending, period=period, interval=interval, group_by="ticker",
                    auto_adjust=False, actions=False, threads=True, progress=False,
                )
            result.update(_split(df, pending))
        except Exception as exc:  # network, rate limit, parsing
            log.error(f"price download ({interval})", exc)
        pending = [s for s in pending if s not in result]
        if pending and attempt < retries:
            time.sleep(2.0 * (attempt + 1))
    return result


def fetch_prices(symbols: Sequence[str], full_history: bool) -> dict[str, PriceData]:
    """Daily (5y on a full refresh, else 1y) and intraday (5d, 15m) data per symbol."""
    daily = download(symbols, "5y" if full_history else "1y", "1d")
    intra = download(symbols, "5d", "15m")
    out: dict[str, PriceData] = {}
    for sym in symbols:
        d = daily.get(sym, pd.DataFrame())
        if not d.empty:
            d = d[[c for c in ("Close", "Volume") if c in d.columns]].dropna(subset=["Close"])
            d.index = pd.DatetimeIndex(d.index).tz_localize(None).normalize()
        i = intra.get(sym, pd.DataFrame())
        series = i["Close"].dropna() if not i.empty and "Close" in i.columns else pd.Series(dtype=float)
        if not series.empty and series.index.tz is None:
            series.index = series.index.tz_localize("UTC")
        out[sym] = PriceData(daily=d, intraday=series)
    log.info("prices: %d/%d symbols with daily data, %d with intraday", len(daily), len(symbols), len(intra))
    return out


def _calendar_date(sym: str) -> str | None:
    import yfinance as yf

    try:
        with _silenced():
            cal = yf.Ticker(sym).calendar
    except Exception:
        return None
    dates = cal.get("Earnings Date") if isinstance(cal, dict) else None
    today = date.today()
    for d in dates or []:
        d = d.date() if isinstance(d, datetime) else d
        if isinstance(d, date) and d >= today:
            return d.isoformat()
    return None


def fetch_earnings(symbols: Sequence[str], workers: int = 4) -> dict[str, str | None]:
    """Next earnings date per symbol (caller pads/shuffles the symbol list)."""
    with ThreadPoolExecutor(max_workers=workers) as pool:
        dates = list(pool.map(_calendar_date, symbols))
    found = sum(1 for d in dates if d)
    log.info("earnings: %d/%d symbols with a date", found, len(symbols))
    return dict(zip(symbols, dates))


def merge_history(prev: list[list[Any]] | None, daily: pd.DataFrame) -> list[list[Any]]:
    """Merge fresh daily closes into a previous [date, close] history (fresh wins)."""
    merged: dict[str, float] = {}
    for row in prev or []:
        if isinstance(row, (list, tuple)) and len(row) == 2 and finite(row[1]) is not None:
            merged[str(row[0])] = float(row[1])
    if not daily.empty:
        for ts, close in daily["Close"].items():
            c = finite(close)
            if c is not None:
                merged[pd.Timestamp(ts).strftime("%Y-%m-%d")] = round(c, 4)
    return [[d, merged[d]] for d in sorted(merged)][-1300:]


@dataclass
class Snapshot:
    """Price part of an InstrumentSnapshot plus extras the signal engine needs."""

    data: dict[str, Any]
    volatility: float | None = None
    change5dPct: float | None = None


def build_snapshot(t: Tracked, pdata: PriceData | None, prev_daily: list[list[Any]] | None,
                   next_earnings: str | None) -> Snapshot:
    pdata = pdata or PriceData()
    history = merge_history(prev_daily, pdata.daily)
    closes = pd.Series([h[1] for h in history], index=pd.DatetimeIndex([h[0] for h in history]), dtype=float)
    intra = pdata.intraday
    price, as_of, prev_close = _price_now(closes, intra)
    volume = pdata.daily["Volume"] if "Volume" in pdata.daily.columns else pd.Series(dtype=float)
    data = {
        "id": t.id,
        "price": rnd(price),
        "currency": t.currency,
        "changePct1d": rnd((price / prev_close - 1) * 100, 3) if price and prev_close else None,
        "asOf": as_of,
        "history": {
            "daily": history,
            "intraday": [[iso(ts.to_pydatetime()), round(float(v), 4)] for ts, v in intra.items()],
        },
        "technicals": {
            "rsi14": rnd(ta.rsi(closes), 2),
            "sma50": rnd(ta.sma(closes, 50)),
            "sma200": rnd(ta.sma(closes, 200)),
            "volumeZ": rnd(ta.volume_z(volume), 2),
            "drawdownFrom52wHighPct": rnd(ta.drawdown_from_high(closes, price), 2),
            "move1hPct": rnd(ta.move_over(intra, 60), 3),
        },
        "nextEarnings": next_earnings if t.type != "etf" else None,
    }
    return Snapshot(data=data, volatility=ta.volatility(closes),
                    change5dPct=ta.change_over_sessions(closes, 5, price))


def _price_now(closes: pd.Series, intra: pd.Series) -> tuple[float | None, str | None, float | None]:
    """Latest price, its time and the previous session's close."""
    if closes.empty and intra.empty:
        return None, None, None
    last_daily_day = closes.index[-1].date() if not closes.empty else None
    if not intra.empty:
        last_ts = intra.index[-1]
        local_day = last_ts.date()  # index is in exchange time zone from yfinance
        if last_daily_day is None or local_day >= last_daily_day:
            prior = closes[closes.index.date < local_day] if not closes.empty else closes
            prev = float(prior.iloc[-1]) if not prior.empty else None
            return float(intra.iloc[-1]), iso(last_ts.to_pydatetime().astimezone(timezone.utc)), prev
    price = float(closes.iloc[-1])
    prev = float(closes.iloc[-2]) if len(closes) > 1 else None
    as_of = iso(datetime.combine(last_daily_day, datetime.min.time(), timezone.utc).replace(hour=15, minute=30))
    return price, as_of, prev
