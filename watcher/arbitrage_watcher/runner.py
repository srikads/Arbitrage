"""One watcher run: gather data, score, build signals/alerts/digests, write the feed."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from arbitrage_watcher import alerts as al
from arbitrage_watcher import digest as dg
from arbitrage_watcher import events as ev
from arbitrage_watcher import feed as fd
from arbitrage_watcher import fx, log, market, narrative, notify
from arbitrage_watcher.context import ConfigMissing, Context, load, padding_ok, prepare_instruments
from arbitrage_watcher.crowd.collect import collect, crowd_evidence, top_items
from arbitrage_watcher.crypto import write_encrypted
from arbitrage_watcher.factors import Inputs
from arbitrage_watcher.lexicon import score_text
from arbitrage_watcher.llm import Ollama
from arbitrage_watcher.matching import build_matcher
from arbitrage_watcher.news import NewsItem, fetch_news, tag_items
from arbitrage_watcher.pricing import next_earnings_date, run_prices
from arbitrage_watcher.prices import Snapshot
from arbitrage_watcher.scoring import llm_pending, score_all
from arbitrage_watcher.signals import compute_signal
from arbitrage_watcher.state import prune
from arbitrage_watcher.summary import print_summary
from arbitrage_watcher.util import iso, parse_iso, utcnow

DEEP_INTERVAL_MIN = int(os.environ.get("ARB_DEEP_INTERVAL_MIN", "180"))


@dataclass
class Options:
    mode: str = "auto"
    repo_dir: Path = Path(".")
    ollama_url: str = "http://127.0.0.1:11434"
    model: str = "qwen2.5:3b"
    dry_run: bool = False
    llm_budget: float = 480.0


def gather_items(ctx: Context, now: datetime) -> tuple[list[NewsItem], list[NewsItem]]:
    """(relevant news items, matched crowd items) — all matching happens locally."""
    matcher = build_matcher(ctx.tracked)
    news: list[NewsItem] = []
    if ctx.settings["sources"].get("news", True):
        with log.timed("news"):
            news = tag_items(fetch_news(), matcher)
    crowd: list[NewsItem] = []
    if padding_ok(ctx):
        with log.timed("crowd"):
            crowd = collect(ctx.tracked, ctx.decoys, matcher, ctx.settings, ctx.state, now, ctx.rng)
    log.info("relevant items: %d news, %d crowd", len(news), len(crowd))
    return news, crowd


def plan_llm(ctx: Context, news: list[NewsItem], now: datetime) -> tuple[bool, str]:
    """Cheap decision for CI: does this run need the LLM, and which mode?"""
    if market.digest_due(now, ctx.state, ctx.settings):
        return True, "digest"
    # Instrument news always counts; macro-only news only if it looks high-impact.
    pending = [p for p in llm_pending(news, ctx.state) if p[1] != "*" or score_text(p[0].text).impact == "high"]
    last_dt = parse_iso(ctx.state["last"].get("deep"))
    interval_ok = last_dt is None or now - last_dt >= timedelta(minutes=DEEP_INTERVAL_MIN)
    if pending and interval_ok:
        return True, "deep"
    return False, "light"


def _inputs(ctx: Context, t: Any, snap: Snapshot, events: list[dict[str, Any]], macro: list, now: datetime) -> Inputs:
    tech = snap.data["technicals"]
    att = ctx.state["attention"].get(t.id) or {}
    s = ctx.settings
    return Inputs(
        now=now, is_holding=t.is_holding, price=snap.data["price"], change1d=snap.data["changePct1d"],
        move1h=tech["move1hPct"], rsi14=tech["rsi14"], sma50=tech["sma50"], sma200=tech["sma200"],
        volume_z=tech["volumeZ"], drawdown=tech["drawdownFrom52wHighPct"], volatility=snap.volatility,
        next_earnings=next_earnings_date(snap),
        news=ev.evidence_from_events(events, ("news",), now), macro=macro,
        crowd=crowd_evidence(ctx.state, t.id), attention_z=att.get("z"),
        buy_price=t.buy_price, stop_loss_pct=t.stop_loss_pct or s["defaultStopLossPct"],
        take_profit_pct=t.take_profit_pct or s["defaultTakeProfitPct"], target_price=t.target_price,
    )


def build_instruments(ctx: Context, news: list[NewsItem], crowd: list[NewsItem], snaps: dict[str, Snapshot],
                      llm: Ollama | None, now: datetime) -> tuple[dict[str, Any], list[Any]]:
    """Per-instrument events, signals, narratives and alert candidates."""
    scores = ctx.state["scores"]
    prev_instr = ctx.prev_feed.get("instruments") or {}
    macro = ev.macro_evidence(news, scores)
    out: dict[str, Any] = {}
    candidates: list[Any] = []
    for t in ctx.tracked:
        snap = snaps[t.id]
        prev_events = (prev_instr.get(t.id) or {}).get("events") or []
        prev_ids = {e.get("id") for e in prev_events}
        crowd_top = top_items(crowd, t.id)
        new_events = ev.events_for(t.id, news + crowd_top, scores, include_macro=t.is_holding)
        att = ctx.state["attention"].get(t.id) or {}
        extra = [ev.price_event(t.id, now, snap.data["changePct1d"], snap.data["technicals"]["move1hPct"]),
                 ev.earnings_event(t.id, now, next_earnings_date(snap)),
                 ev.attention_event(t.id, now, att.get("z") if att.get("date") == now.date().isoformat() else None,
                                    att.get("views"))]
        new_events += [e for e in extra if e]
        events = ev.merge_events(new_events, prev_events, now, ev.irrelevant_ids(t.id, news, scores))
        inp = _inputs(ctx, t, snap, events, macro, now)
        signal = compute_signal(inp, ctx.settings["risk"])
        narrative.fill(t, signal, events, ctx.state, llm)
        prev_action = (ctx.state["signals"].get(t.id) or {}).get("action")
        fresh = [e for e in new_events if e["id"] not in prev_ids]
        candidates += al.instrument_alerts(al.AlertContext(t, signal, prev_action, inp, fresh), now, ctx.settings["risk"])
        ctx.state["signals"][t.id] = {"action": signal["action"], "confidence": signal["confidence"],
                                      "score": signal["score"], "t": iso(now)}
        out[t.id] = {**snap.data, "signal": signal, "events": events}
    seen_macro = {e.get("id") for p in prev_instr.values() for e in (p.get("events") or [])}
    macro_events = [e for e in ev.events_for("*", news, scores, include_macro=True) if e["id"] not in seen_macro]
    candidates += al.macro_alerts(macro_events, now) if any(t.is_holding for t in ctx.tracked) else []
    return out, candidates


def _digests(ctx: Context, instruments: dict[str, Any], now: datetime, llm: Ollama | None,
             forced: bool) -> list[dict[str, Any]]:
    made = []
    local = now.astimezone(market.BERLIN)
    want_daily = market.daily_digest_due(now, ctx.state, ctx.settings) or (forced and local.weekday() < 5)
    want_weekly = market.weekly_digest_due(now, ctx.state, ctx.settings) or (forced and local.weekday() >= 5)
    rates = {"EUR": 1.0}
    if want_daily or want_weekly:
        currencies = {(instruments.get(t.id) or {}).get("currency") or t.currency for t in ctx.tracked if t.is_holding}
        rates = fx.fetch_rates(currencies)
    if want_daily:
        made.append(dg.build("daily", ctx.tracked, instruments, now, llm, rates))
        ctx.state["last"]["digestDaily"] = local.date().isoformat()
    if want_weekly:
        made.append(dg.build("weekly", ctx.tracked, instruments, now, llm, rates))
        ctx.state["last"]["digestWeekly"] = market.iso_week(local.date())
    return made


def run(opts: Options) -> int:
    t0 = time.monotonic()
    now = utcnow()
    try:
        ctx = load(opts.repo_dir)
    except ConfigMissing:
        print("No data/config.enc yet: set up the app first. Nothing to do.")
        return 0
    except RuntimeError as exc:
        print(f"Error: {exc}")
        return 1
    with log.timed("prepare"):
        prepare_instruments(ctx)
    news, crowd = gather_items(ctx, now)
    llm = Ollama(opts.ollama_url, opts.model, budget_sec=opts.llm_budget) if opts.mode != "light" else None
    mode = market.choose_mode(opts.mode, now, ctx.state, ctx.settings, len(llm_pending(news, ctx.state)),
                              bool(llm and llm.available()))
    if mode == "light" or (mode == "deep" and not (llm and llm.available())):
        mode, llm = "light", None
    if llm is not None and not llm.available():
        llm = None
    log.info("mode: %s, llm: %s", mode, "yes" if llm else "no")
    with log.timed("scoring"):
        score_all(news + crowd, ctx.by_id, ctx.state, llm)
    with log.timed("prices"):
        snaps = run_prices(ctx, now)
    instruments, candidates = build_instruments(ctx, news, crowd, snaps, llm, now)
    new_alerts = al.apply_cooldown(candidates, ctx.state, now)
    digests_new = _digests(ctx, instruments, now, llm, forced=opts.mode == "digest") if mode == "digest" else []
    force_ids = []
    for d in digests_new:
        _, a = al.make_alert(f"digest_{d['kind']}", now, None, "info", d["title"], "Your digest is ready.")
        new_alerts.append(a)
        force_ids.append(a["id"])
    all_alerts = al.merge_alerts(new_alerts, ctx.prev_feed.get("alerts") or [])
    if not opts.dry_run:
        p = notify.plan(new_alerts, all_alerts, ctx.state, ctx.settings, now, force_ids)
        if notify.execute(p, ctx.config.get("push"), ctx.state, ctx.settings, now) == "expired":
            _, a = al.make_alert("push_expired", now, None, "info", "Notifications stopped",
                                 "The push subscription expired. Open the app and enable notifications again.")
            all_alerts = al.merge_alerts([a], all_alerts)
    if llm is not None and mode in ("deep", "digest"):
        ctx.state["last"]["deep"] = iso(now)
    digests = ctx.prev_feed.get("digests") or []
    for d in digests_new:
        digests = dg.merge_digests(d, digests)
    feed = fd.assemble(
        generated_at=iso(now), mode=mode, llm=opts.model if llm else None, duration=time.monotonic() - t0,
        market_open=market.is_open(now), market_note=market.market_note(now), instruments=instruments,
        alerts=all_alerts, digests=digests, resolved=ctx.resolved,
    )
    problems = fd.validate(feed)
    if problems:
        log.warn("feed validation: %d problem(s)", len(problems))
    prune(ctx.state)
    log.info("run: %d instruments, %d new alerts, %d digests, %.1fs", len(instruments), len(new_alerts),
             len(digests_new), time.monotonic() - t0)
    if opts.dry_run:
        print_summary(feed, ctx.tracked)
        return 0
    write_encrypted(ctx.data_dir / "feed.enc", feed, ctx.passphrase)
    write_encrypted(ctx.data_dir / "state.enc", ctx.state, ctx.passphrase)
    return 0


def plan(opts: Options) -> int:
    """Decide whether the next run needs the LLM; writes needs_llm/mode to $GITHUB_OUTPUT."""
    now = utcnow()
    try:
        ctx = load(opts.repo_dir)
        needs, mode = False, "light"
        if ctx.settings["sources"].get("news", True) or market.digest_due(now, ctx.state, ctx.settings):
            news = tag_items(fetch_news(), build_matcher(ctx.tracked)) if ctx.settings["sources"].get("news", True) else []
            needs, mode = plan_llm(ctx, news, now)
    except ConfigMissing:
        needs, mode = False, "light"
    except RuntimeError as exc:
        print(f"Error: {exc}")
        needs, mode = False, "light"
    lines = f"needs_llm={'true' if needs else 'false'}\nmode={mode}\n"
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(lines)
    print(lines, end="")
    return 0
