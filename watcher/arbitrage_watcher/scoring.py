"""Per-(item, instrument) scoring: LLM when available, lexicon otherwise.

Scores are cached in state under "<itemId>:<instrumentId>" ("*" for macro), so
each item is scored once by the lexicon and at most once by the LLM.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Iterator, Sequence

from arbitrage_watcher import log, prompts
from arbitrage_watcher.lexicon import score_text
from arbitrage_watcher.llm import Ollama
from arbitrage_watcher.models import HORIZONS, IMPACTS, Tracked
from arbitrage_watcher.news import NewsItem
from arbitrage_watcher.util import clamp, iso, truncate, utcnow

BATCH = 6
LLM_MAX_AGE = timedelta(hours=36)
MACRO = "*"


def score_key(item_id: str, target: str) -> str:
    return f"{item_id}:{target}"


def pairs(items: Sequence[NewsItem]) -> Iterator[tuple[NewsItem, str]]:
    """(item, target) pairs: one per matched instrument, or MACRO for macro items."""
    for item in items:
        if item.instruments:
            for iid in item.instruments:
                yield item, iid
        elif item.macro:
            yield item, MACRO


def lexicon_record(item: NewsItem) -> dict[str, Any]:
    lex = score_text(item.text)
    crowd = item.kind in ("bluesky", "forum")
    impact = "low" if crowd and lex.impact != "high" else lex.impact
    return {"s": lex.sentiment, "imp": impact, "hz": lex.horizon, "rel": 0.6 if crowd else 0.8,
            "sum": "", "m": "lex", "t": iso(utcnow())}


def llm_pending(items: Sequence[NewsItem], state: dict[str, Any]) -> list[tuple[NewsItem, str]]:
    """Recent news pairs that have not been scored by the LLM yet (crowd posts use the lexicon only)."""
    cutoff = utcnow() - LLM_MAX_AGE
    out = []
    for item, target in pairs(items):
        if item.kind != "news" or item.time < cutoff:
            continue
        rec = state["scores"].get(score_key(item.id, target))
        if rec is None or rec.get("m") != "llm":
            out.append((item, target))
    return out


def score_all(items: Sequence[NewsItem], tracked: dict[str, Tracked], state: dict[str, Any],
              llm: Ollama | None) -> int:
    """Ensure every pair has a score; upgrade recent news with the LLM if given. Returns LLM-scored count."""
    scores: dict[str, dict[str, Any]] = state["scores"]
    for item, target in pairs(items):
        scores.setdefault(score_key(item.id, target), lexicon_record(item))
    if llm is None or not llm.available():
        return 0
    pending = llm_pending(items, state)
    # Holdings first, then candidates, then macro; newest first within each.
    rank = {iid: (0 if t.is_holding else 1) for iid, t in tracked.items()}
    pending.sort(key=lambda p: (rank.get(p[1], 2), -p[0].time.timestamp()))
    done = 0
    for start in range(0, len(pending), BATCH):
        batch = pending[start : start + BATCH]
        results = _llm_batch(batch, tracked, llm)
        if results is None:
            break
        for (item, target), rec in zip(batch, results):
            if rec is not None:
                scores[score_key(item.id, target)] = rec
                done += 1
    log.info("scoring: %d pairs, %d pending for LLM, %d scored by LLM", len(scores), len(pending), done)
    return done


def _instrument_label(target: str, tracked: dict[str, Tracked]) -> str:
    if target == MACRO:
        return prompts.MACRO_INSTRUMENT
    t = tracked[target]
    return f"{t.name} ({'ETF' if t.type == 'etf' else 'stock'})"


def _llm_batch(batch: list[tuple[NewsItem, str]], tracked: dict[str, Tracked],
               llm: Ollama) -> list[dict[str, Any] | None] | None:
    blocks = "\n".join(
        prompts.ITEM_BLOCK.format(i=i, instrument=_instrument_label(target, tracked), source=item.source,
                                  title=item.title, snippet=truncate(item.summary, 400) or "-")
        for i, (item, target) in enumerate(batch)
    )
    data = llm.chat_json(prompts.ITEM_SYSTEM, prompts.ITEM_USER.format(items=blocks), max_tokens=90 * len(batch))
    if data is None:
        return None
    by_index: dict[int, dict[str, Any]] = {}
    for r in data.get("results") or []:
        if isinstance(r, dict):
            try:
                by_index[int(r.get("i"))] = r
            except (TypeError, ValueError):
                continue
    return [validate_llm_result(by_index.get(i)) for i in range(len(batch))]


def validate_llm_result(r: dict[str, Any] | None) -> dict[str, Any] | None:
    """Clamp and sanitise one model answer; None if unusable."""
    if not r:
        return None
    try:
        sentiment = clamp(float(r.get("sentiment", 0)))
        relevance = clamp(float(r.get("relevance", 0.5)), 0.0, 1.0)
    except (TypeError, ValueError):
        return None
    impact = str(r.get("impact", "low")).lower()
    horizon = str(r.get("horizon", "days")).lower()
    return {
        "s": round(sentiment, 3),
        "imp": impact if impact in IMPACTS else "low",
        "hz": horizon if horizon in HORIZONS else "days",
        "rel": round(relevance, 2),
        "sum": truncate(str(r.get("summary") or ""), 240),
        "m": "llm",
        "t": iso(utcnow()),
    }
