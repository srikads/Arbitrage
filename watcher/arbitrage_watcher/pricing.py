"""Price stage of a run: padded downloads, earnings dates, snapshots."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from arbitrage_watcher import log
from arbitrage_watcher.context import Context, padding_ok
from arbitrage_watcher.market import BERLIN
from arbitrage_watcher.prices import Snapshot, build_snapshot, fetch_earnings, fetch_prices
from arbitrage_watcher.universe import padded


def _local_day(now: datetime) -> str:
    return now.astimezone(BERLIN).date().isoformat()


def run_prices(ctx: Context, now: datetime) -> dict[str, Snapshot]:
    """Download real+decoy symbols, compute snapshots for the user's instruments only."""
    real = [t for t in ctx.tracked if t.symbol]
    data: dict[str, Any] = {}
    if real and padding_ok(ctx):
        today = _local_day(now)
        full = ctx.state["last"].get("dailyRefresh") != today
        symbols = padded([t.symbol for t in real], [d["symbol"] for d in ctx.decoys], ctx.rng)
        data = fetch_prices(list(dict.fromkeys(symbols)), full_history=full)
        if full and data:
            ctx.state["last"]["dailyRefresh"] = today
        _refresh_earnings(ctx, today)
    elif real:
        log.warn("prices skipped: not enough decoys")
    prev = (ctx.prev_feed.get("instruments") or {}) if isinstance(ctx.prev_feed, dict) else {}
    snaps: dict[str, Snapshot] = {}
    for t in ctx.tracked:
        prev_daily = ((prev.get(t.id) or {}).get("history") or {}).get("daily")
        earn = ctx.state["earnings"].get(t.symbol)
        if earn and date.fromisoformat(earn) < now.astimezone(BERLIN).date():
            earn = None
        snaps[t.id] = build_snapshot(t, data.get(t.symbol), prev_daily, earn)
    return snaps


def _refresh_earnings(ctx: Context, today: str) -> None:
    """Once per day: next earnings dates for stocks (padded with decoy stocks)."""
    if ctx.state["last"].get("earnings") == today:
        return
    stocks = [t.symbol for t in ctx.tracked if t.symbol and t.type != "etf"]
    if not stocks:
        ctx.state["last"]["earnings"] = today
        return
    decoy_stocks = [d["symbol"] for d in ctx.decoys if d.get("type") != "etf"]
    if len(decoy_stocks) < 3 * len(stocks):
        decoy_stocks = [d["symbol"] for d in ctx.decoys]
    symbols = padded(stocks, decoy_stocks, ctx.rng)
    dates = fetch_earnings(list(dict.fromkeys(symbols)))
    ctx.state["earnings"] = {s: dates.get(s) for s in stocks}
    ctx.state["last"]["earnings"] = today


def next_earnings_date(snap: Snapshot) -> date | None:
    value = snap.data.get("nextEarnings")
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None

