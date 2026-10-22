"""FX rates to EUR for portfolio aggregation (digests only).

Prices in the feed always stay in the instrument's own currency (GBp stays
pence). FX pairs are generic market symbols, so they reveal nothing about the
portfolio beyond which currencies are involved.
"""

from __future__ import annotations

from typing import Iterable

from arbitrage_watcher import log
from arbitrage_watcher.util import finite

MINOR_UNITS = {"GBp": ("GBP", 100.0), "GBX": ("GBP", 100.0), "ZAc": ("ZAR", 100.0), "ILA": ("ILS", 100.0)}


def pair_for(currency: str) -> tuple[str, float] | None:
    """Yahoo FX symbol giving EUR per unit of the major currency, and the minor-unit divisor."""
    if currency == "EUR":
        return None
    major, divisor = MINOR_UNITS.get(currency, (currency.upper(), 1.0))
    return f"{major}EUR=X", divisor


def fetch_rates(currencies: Iterable[str]) -> dict[str, float]:
    """EUR value of one unit of each currency. Missing rates are simply absent."""
    from arbitrage_watcher.prices import download

    rates: dict[str, float] = {"EUR": 1.0}
    pairs = {c: pair_for(c) for c in set(currencies) if c != "EUR"}
    pairs = {c: p for c, p in pairs.items() if p}
    if not pairs:
        return rates
    data = download(sorted({p[0] for p in pairs.values()}), "5d", "1d", retries=1)
    for cur, (symbol, divisor) in pairs.items():
        df = data.get(symbol)
        if df is None or df.empty or "Close" not in df.columns:
            continue
        closes = df["Close"].dropna()
        rate = finite(closes.iloc[-1]) if not closes.empty else None
        if rate:
            rates[cur] = rate / divisor
    log.info("fx: %d/%d rates", len(rates) - 1, len(pairs))
    return rates


def to_eur(amount: float, currency: str, rates: dict[str, float]) -> float | None:
    rate = rates.get(currency)
    return None if rate is None else amount * rate
