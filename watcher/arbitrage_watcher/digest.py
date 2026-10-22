"""Daily (after close) and weekly (Sunday) markdown digests."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Sequence

from arbitrage_watcher import prompts
from arbitrage_watcher.calendar_data import upcoming_ecb
from arbitrage_watcher.llm import Ollama
from arbitrage_watcher.market import BERLIN, iso_week
from arbitrage_watcher.models import Digest, Tracked
from arbitrage_watcher.narrative import ACTION_TEXT
from arbitrage_watcher.util import iso, parse_iso, truncate

DISCLAIMER = "_Not financial advice — automated summary of public data for your own research._"
MAX_DIGESTS = 30


def _fmt_money(v: float, cur: str) -> str:
    return f"{v:,.2f} {cur}"


def _pct(v: float | None) -> str:
    return "n/a" if v is None else f"{v:+.2f}%"


def _period_change(snap: dict[str, Any], kind: str) -> float | None:
    if kind == "daily":
        return snap.get("changePct1d")
    hist = snap.get("history", {}).get("daily") or []
    price = snap.get("price")
    if not price or len(hist) < 6:
        return None
    base = hist[-6][1]
    return (price / base - 1) * 100 if base else None


def portfolio_section(holdings: Sequence[Tracked], snaps: dict[str, dict[str, Any]], kind: str) -> list[str]:
    totals: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])   # value, period change, cost
    rows = []
    for t in holdings:
        s = snaps.get(t.id) or {}
        price = s.get("price")
        if not price or not t.quantity:
            continue
        value = price * t.quantity
        chg = _period_change(s, kind)
        delta = value - value / (1 + chg / 100) if chg is not None else 0.0
        cost = (t.buy_price or 0) * t.quantity
        cur = s.get("currency") or t.currency
        tot = totals[cur]
        tot[0] += value
        tot[1] += delta
        tot[2] += cost
        pnl = f"{(price / t.buy_price - 1) * 100:+.1f}%" if t.buy_price else "n/a"
        rows.append(f"| {t.name} | {_fmt_money(value, cur)} | {_pct(chg)} | {pnl} |")
    if not rows:
        return ["_No priced holdings._"]
    period = "today" if kind == "daily" else "this week"
    lines = []
    for cur, (value, delta, cost) in totals.items():
        prev = value - delta
        pct = delta / prev * 100 if prev else 0.0
        pl = f", total P&L {_fmt_money(value - cost, cur)}" if cost else ""
        lines.append(f"**Value:** {_fmt_money(value, cur)} ({delta:+,.2f} {cur} / {pct:+.2f}% {period}{pl})")
    lines += ["", f"| Holding | Value | {period.capitalize()} | Since buy |", "|---|---:|---:|---:|", *rows]
    return lines


def movers_section(tracked: Sequence[Tracked], snaps: dict[str, dict[str, Any]], kind: str) -> list[str]:
    moves = [(t, _period_change(snaps.get(t.id) or {}, kind)) for t in tracked]
    moves = sorted([m for m in moves if m[1] is not None], key=lambda m: -abs(m[1]))[:5]
    return [f"- {t.name}: {m:+.2f}%" for t, m in moves] or ["- no price data"]


def signals_section(tracked: Sequence[Tracked], snaps: dict[str, dict[str, Any]]) -> list[str]:
    lines = []
    for t in tracked:
        sig = (snaps.get(t.id) or {}).get("signal") or {}
        if sig.get("action") and sig["action"] != "hold":
            label = ACTION_TEXT[sig["action"]].split(" —")[0]
            lines.append(f"- **{t.name}** — {label} ({sig.get('confidence', 0):.0%} confidence, "
                         f"{sig.get('risk')} risk): {sig.get('headline', '')}")
    return lines or ["- All positions: hold — nothing that calls for action."]


def events_section(tracked: Sequence[Tracked], snaps: dict[str, dict[str, Any]], since: datetime) -> list[str]:
    items = []
    for t in tracked:
        for e in (snaps.get(t.id) or {}).get("events") or []:
            ts = parse_iso(e.get("time"))
            if ts and ts >= since and e.get("impact") in ("medium", "high") and not e["id"].startswith("m-"):
                items.append((abs(e.get("sentiment", 0)) + (1 if e["impact"] == "high" else 0), t, e))
    items.sort(key=lambda x: -x[0])
    out = []
    for _, t, e in items[:8]:
        link = f" ([{e['source']}]({e['url']}))" if e.get("url") else f" ({e['source']})"
        out.append(f"- **{t.name}:** {truncate(e['title'], 140)}{link}")
    return out or ["- Nothing notable."]


def calendar_section(tracked: Sequence[Tracked], snaps: dict[str, dict[str, Any]], today: date, days: int) -> list[str]:
    out = []
    for t in tracked:
        d = (snaps.get(t.id) or {}).get("nextEarnings")
        if d and 0 <= (date.fromisoformat(d) - today).days <= days:
            out.append((d, f"- {d}: {t.name} earnings"))
    out += [(d.isoformat(), f"- {d.isoformat()}: ECB monetary policy decision") for d in upcoming_ecb(today, days)]
    return [line for _, line in sorted(out)] or ["- No scheduled events found."]


def build(kind: str, tracked: Sequence[Tracked], snaps: dict[str, dict[str, Any]], now: datetime,
          llm: Ollama | None = None) -> Digest:
    local = now.astimezone(BERLIN)
    holdings = [t for t in tracked if t.is_holding]
    since = now - (timedelta(days=1) if kind == "daily" else timedelta(days=7))
    horizon = 7 if kind == "daily" else 14
    sections = {
        "Portfolio": portfolio_section(holdings, snaps, kind),
        "Top movers": movers_section(tracked, snaps, kind),
        "Suggestions": signals_section(tracked, snaps),
        "Notable news & events": events_section(tracked, snaps, since),
        f"Coming up (next {horizon} days)": calendar_section(tracked, snaps, local.date(), horizon),
    }
    overview = _overview(sections, llm) or _template_overview(tracked, snaps)
    title = (f"Daily digest — {local.strftime('%a %d %b %Y')}" if kind == "daily"
             else f"Weekly digest — week {local.isocalendar()[1]}, {local.year}")
    md = [f"# {title}", "", overview, ""]
    for heading, lines in sections.items():
        md += [f"## {heading}", "", *lines, ""]
    md.append(DISCLAIMER)
    ident = f"{kind}-{local.date().isoformat() if kind == 'daily' else iso_week(local.date())}"
    return {"id": ident, "time": iso(now), "kind": kind, "title": title, "markdown": "\n".join(md)}


def _template_overview(tracked: Sequence[Tracked], snaps: dict[str, dict[str, Any]]) -> str:
    actions = [(snaps.get(t.id) or {}).get("signal", {}).get("action", "hold") for t in tracked]
    flagged = sum(1 for a in actions if a not in ("hold", "watch"))
    watching = sum(1 for a in actions if a == "watch")
    if flagged:
        return f"{flagged} instrument(s) have a suggestion worth reviewing; {watching} on watch."
    if watching:
        return f"No action suggested; {watching} instrument(s) on watch."
    return "A quiet period: no action suggested for any instrument."


def _overview(sections: dict[str, list[str]], llm: Ollama | None) -> str | None:
    if llm is None or not llm.available():
        return None
    facts = "\n".join(f"{h}:\n" + "\n".join(lines) for h, lines in sections.items())
    data = llm.chat_json(prompts.DIGEST_SYSTEM, prompts.DIGEST_USER.format(facts=truncate(facts, 3500)), 220)
    text = str((data or {}).get("overview") or "").strip()
    return truncate(text, 700) if len(text) > 20 else None


def merge_digests(new: Digest | None, previous: Sequence[dict[str, Any]]) -> list[Digest]:
    merged = [new] if new else []
    merged += [d for d in previous if isinstance(d, dict) and (not new or d.get("id") != new["id"])]  # type: ignore[misc]
    merged.sort(key=lambda d: d.get("time") or "", reverse=True)
    return merged[:MAX_DIGESTS]
