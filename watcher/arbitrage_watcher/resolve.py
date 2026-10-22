"""Resolve user-added ISINs that are not in the shared universe (Yahoo search).

Lookups are padded with decoy ISIN lookups from the universe and shuffled.
Results are cached in state so each ISIN is resolved once.
"""

from __future__ import annotations

import random
import time
from datetime import timedelta
from typing import Any, Sequence

import httpx

from arbitrage_watcher import http, log
from arbitrage_watcher.models import Tracked
from arbitrage_watcher.universe import DECOY_FACTOR, sample_decoys
from arbitrage_watcher.util import iso, parse_iso, utcnow

SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search"
RETRY_FAILED_AFTER = timedelta(days=1)

# Yahoo suffix -> trading currency (minor units like GBp are reported as-is).
SUFFIX_CURRENCY = {
    "DE": "EUR", "F": "EUR", "MU": "EUR", "SG": "EUR", "BE": "EUR", "DU": "EUR", "HM": "EUR", "HA": "EUR",
    "PA": "EUR", "AS": "EUR", "BR": "EUR", "MI": "EUR", "MC": "EUR", "LS": "EUR", "VI": "EUR",
    "HE": "EUR", "IR": "EUR", "L": "GBp", "SW": "CHF", "ST": "SEK", "CO": "DKK", "OL": "NOK",
    "WA": "PLN", "PR": "CZK", "TO": "CAD", "T": "JPY", "HK": "HKD", "AX": "AUD",
}
PREFERRED_SUFFIXES = ("DE", "F", "MU", "SG", "AS", "PA", "MI", "L", "SW")


def needs_resolution(t: Tracked, universe_ids: set[str]) -> bool:
    """A user instrument needs resolving when it has an ISIN but no usable symbol."""
    if not t.isin or t.id in universe_ids:
        return False
    return not t.symbol or t.symbol.upper() == t.isin.upper()


def currency_for(symbol: str) -> str:
    suffix = symbol.rsplit(".", 1)[1].upper() if "." in symbol else ""
    return SUFFIX_CURRENCY.get(suffix, "USD" if not suffix else "EUR")


def pick_quote(quotes: Sequence[dict[str, Any]]) -> dict[str, Any] | None:
    """Prefer XETRA/German listings, then other European venues, then the first hit."""
    usable = [q for q in quotes if q.get("symbol") and q.get("quoteType") in ("EQUITY", "ETF", "MUTUALFUND", None)]
    if not usable:
        return None
    for suffix in PREFERRED_SUFFIXES:
        for q in usable:
            if str(q["symbol"]).upper().endswith("." + suffix):
                return q
    return usable[0]


def _search(c: httpx.Client, query: str) -> list[dict[str, Any]]:
    resp = http.get(c, SEARCH_URL, params={"q": query, "quotesCount": 6, "newsCount": 0, "listsCount": 0})
    if resp is None:
        return []
    try:
        return list(resp.json().get("quotes") or [])
    except ValueError:
        return []


def resolve_isins(
    tracked: Sequence[Tracked],
    universe: Sequence[dict[str, Any]],
    state: dict[str, Any],
    rng: random.Random | None = None,
    client: httpx.Client | None = None,
) -> dict[str, dict[str, str]]:
    """Resolve unknown ISINs; returns {instrument id: {symbol, name, currency}}."""
    rng = rng or random.SystemRandom()
    universe_ids = {u["id"] for u in universe}
    cache: dict[str, dict[str, str]] = state["resolved"]
    failed: dict[str, str] = state["resolveFailed"]
    todo = []
    for t in tracked:
        if not needs_resolution(t, universe_ids) or t.isin in cache:
            continue
        last_fail = parse_iso(failed.get(t.isin or ""))
        if last_fail and utcnow() - last_fail < RETRY_FAILED_AFTER:
            continue
        todo.append(t.isin)
    if todo:
        _lookup(todo, universe, cache, failed, rng, client)
    out: dict[str, dict[str, str]] = {}
    for t in tracked:
        if t.isin and t.isin in cache and needs_resolution(t, universe_ids):
            out[t.id] = cache[t.isin]
    return out


def _lookup(todo: list[str], universe: Sequence[dict[str, Any]], cache: dict[str, dict[str, str]],
            failed: dict[str, str], rng: random.Random, client: httpx.Client | None) -> None:
    decoy_isins = [u["isin"] for u in universe if u.get("isin") and u["isin"] not in todo]
    queries = [(isin, True) for isin in todo] + [
        (d, False) for d in sample_decoys(decoy_isins, DECOY_FACTOR * len(todo), rng)
    ]
    rng.shuffle(queries)
    own = client is None
    c = client or http.client()
    ok = 0
    try:
        for query, real in queries:
            quotes = _search(c, query)
            if real:
                q = pick_quote(quotes)
                if q:
                    sym = str(q["symbol"])
                    cache[query] = {
                        "symbol": sym,
                        "name": str(q.get("longname") or q.get("shortname") or sym),
                        "currency": currency_for(sym),
                    }
                    ok += 1
                else:
                    failed[query] = iso(utcnow())
            time.sleep(rng.uniform(0.2, 0.6))
    finally:
        if own:
            c.close()
    log.info("resolve: %d/%d unknown ISINs resolved (%d lookups incl. decoys)", ok, len(todo), len(queries))


def apply_resolved(tracked: Sequence[Tracked], resolved: dict[str, dict[str, str]]) -> None:
    """Fill symbol/name/currency of tracked instruments from resolved data, in place."""
    for t in tracked:
        r = resolved.get(t.id)
        if r:
            t.symbol = r["symbol"]
            if not t.name or t.name == t.isin:
                t.name = r["name"]
            t.currency = r.get("currency") or t.currency
