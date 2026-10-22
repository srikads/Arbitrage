"""Instrument universe (shared/instruments.json) and decoy selection (contract §6)."""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any, Sequence, TypeVar

from arbitrage_watcher.models import Tracked

DECOY_FACTOR = 3
T = TypeVar("T")


def load_universe(repo_dir: Path) -> list[dict[str, Any]]:
    """Load the shared instrument universe; [] if missing or malformed."""
    path = repo_dir / "shared" / "instruments.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [d for d in data if isinstance(d, dict) and d.get("id") and d.get("symbol")]


def ensure_decoys(
    state_decoys: list[str],
    real: Sequence[Tracked],
    universe: Sequence[dict[str, Any]],
    rng: random.Random | None = None,
    factor: int = DECOY_FACTOR,
) -> list[str]:
    """Return a stable decoy id list with at least `factor` × len(real) entries.

    Decoys are persisted in state and only ever grow, so repeated requests do
    not reveal the real set by intersection. Real instruments are never used as
    decoys, but an instrument the user removed stays in the decoy set, so its
    removal is not observable either. New decoys prefer the same type
    (stock/ETF) mix as the real instruments.
    """
    rng = rng or random.SystemRandom()
    real_ids = {t.id for t in real} | {t.symbol for t in real}
    by_id = {u["id"]: u for u in universe}
    current = [d for d in state_decoys if d in by_id and d not in real_ids]
    needed = factor * len(real) - len(current)
    if needed <= 0:
        return current
    taken = set(current)
    pool = [u for u in universe if u["id"] not in real_ids and u["symbol"] not in real_ids and u["id"] not in taken]
    etf_share = sum(1 for t in real if t.type == "etf") / max(1, len(real))
    etfs = [u for u in pool if u.get("type") == "etf"]
    stocks = [u for u in pool if u.get("type") != "etf"]
    rng.shuffle(etfs)
    rng.shuffle(stocks)
    n_etf = min(len(etfs), round(needed * etf_share))
    picked = etfs[:n_etf] + stocks[: needed - n_etf]
    if len(picked) < needed:  # top up from whatever is left
        rest = [u for u in pool if u not in picked]
        rng.shuffle(rest)
        picked += rest[: needed - len(picked)]
    return current + [u["id"] for u in picked]


def decoy_instruments(decoy_ids: Sequence[str], universe: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {u["id"]: u for u in universe}
    return [by_id[d] for d in decoy_ids if d in by_id]


def padded(real: Sequence[T], decoys: Sequence[T], rng: random.Random | None = None) -> list[T]:
    """Mix real items with decoys and shuffle the request order."""
    rng = rng or random.SystemRandom()
    items = list(real) + list(decoys)
    rng.shuffle(items)
    return items


def sample_decoys(decoys: Sequence[T], n: int, rng: random.Random | None = None) -> list[T]:
    """Pick n decoys (with repetition only if the pool is too small)."""
    rng = rng or random.SystemRandom()
    if not decoys:
        return []
    if n <= len(decoys):
        return rng.sample(list(decoys), n)
    return [rng.choice(list(decoys)) for _ in range(n)]
