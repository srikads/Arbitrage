#!/usr/bin/env python3
"""Build shared/instruments.json from the curated data in instrument_data.py.

Usage:
    python3 scripts/build_instruments.py                 # validate + write JSON (offline)
    python3 scripts/build_instruments.py --crosscheck    # also compare every ISIN/symbol
                                                         # pair against the public
                                                         # FinanceDatabase CSVs on GitHub
    python3 scripts/build_instruments.py --verify-yahoo  # also check that every symbol
                                                         # resolves on Yahoo Finance
    python3 scripts/build_instruments.py --verify-yahoo --drop-unresolved

Only the standard library is required. `requests` is used when installed.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = ROOT / "shared" / "instruments.json"

sys.path.insert(0, str(HERE))
import instrument_data  # noqa: E402

ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")
SYMBOL_RE = re.compile(r"^[A-Z0-9][A-Z0-9.\-]{0,15}$")
CURRENCIES = {"EUR", "USD", "GBp", "CHF", "SEK", "DKK", "NOK", "HKD"}
FIELDS = ("id", "isin", "symbol", "name", "type", "currency", "aliases", "wikipedia")

# Yahoo suffix -> currency the listing is quoted in.
SUFFIX_CURRENCY = {
    ".DE": "EUR", ".F": "EUR", ".PA": "EUR", ".AS": "EUR", ".BR": "EUR", ".MI": "EUR",
    ".MC": "EUR", ".HE": "EUR", ".LS": "EUR", ".IR": "EUR", ".VI": "EUR",
    ".L": "GBp", ".SW": "CHF", ".ST": "SEK", ".CO": "DKK", ".OL": "NOK", ".HK": "HKD",
    "": "USD",
}


def isin_check_digit_ok(isin: str) -> bool:
    """ISIN check digit: letters -> numbers (A=10..Z=35), then Luhn over the digits."""
    if not ISIN_RE.match(isin):
        return False
    digits = "".join(str(int(c, 36)) for c in isin[:-1])
    total = 0
    # Walk from the right; the rightmost payload digit is doubled (check digit sits after it).
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return (10 - total % 10) % 10 == int(isin[-1])


def symbol_suffix(symbol: str) -> str:
    m = re.search(r"\.[A-Z]+$", symbol)
    return m.group(0) if m else ""


def make_record(row: tuple, kind: str) -> dict:
    isin, symbol, currency, name, aliases, wikipedia = row
    return {
        "id": isin,
        "isin": isin,
        "symbol": symbol,
        "name": name,
        "type": kind,
        "currency": currency,
        "aliases": list(aliases),
        "wikipedia": wikipedia,
    }


def validate(rec: dict) -> list[str]:
    errs = []
    isin = rec["isin"]
    if not isin_check_digit_ok(isin):
        errs.append(f"bad ISIN/check digit: {isin}")
    if rec["id"] != isin:
        errs.append(f"id != isin for {isin}")
    if not SYMBOL_RE.match(rec["symbol"]):
        errs.append(f"bad symbol {rec['symbol']!r} ({isin})")
    sfx = symbol_suffix(rec["symbol"])
    if sfx not in SUFFIX_CURRENCY:
        errs.append(f"unknown exchange suffix {sfx!r} ({isin})")
    elif SUFFIX_CURRENCY[sfx] != rec["currency"]:
        errs.append(f"currency {rec['currency']} does not match {rec['symbol']} ({isin})")
    if rec["currency"] not in CURRENCIES:
        errs.append(f"bad currency {rec['currency']!r} ({isin})")
    if rec["type"] not in ("stock", "etf"):
        errs.append(f"bad type ({isin})")
    if not rec["name"] or rec["name"] != rec["name"].strip():
        errs.append(f"bad name ({isin})")
    if not all(isinstance(a, str) and a.strip() for a in rec["aliases"]):
        errs.append(f"bad alias ({isin})")
    if rec["wikipedia"] is not None and not (isinstance(rec["wikipedia"], str) and rec["wikipedia"].strip()):
        errs.append(f"bad wikipedia ({isin})")
    return errs


def build() -> tuple[list[dict], list[str]]:
    rows = [make_record(r, "stock") for r in instrument_data.STOCKS]
    rows += [make_record(r, "etf") for r in instrument_data.ETFS]
    errors: list[str] = []
    seen: dict[str, dict] = {}
    for rec in rows:
        errs = validate(rec)
        if errs:
            errors.extend(errs)
            continue
        if rec["isin"] in seen:
            print(f"warning: duplicate ISIN {rec['isin']} ({rec['name']}); keeping first", file=sys.stderr)
            continue
        seen[rec["isin"]] = rec
    out = sorted(seen.values(), key=lambda r: (r["name"].casefold(), r["isin"]))
    return out, errors


# --------------------------------------------------------------------------- network helpers

def http_get(url: str, timeout: float = 30.0) -> tuple[int, bytes]:
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) instrument-list-builder"}
    try:
        import requests  # type: ignore

        r = requests.get(url, headers=headers, timeout=timeout)
        return r.status_code, r.content
    except ImportError:
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:  # type: ignore[attr-defined]
            return e.code, b""


FD_BASE = "https://raw.githubusercontent.com/JerBouma/FinanceDatabase/main/database"
FD_FILES = {
    ".DE": ["GER"], ".F": ["FRA"], ".PA": ["PAR"], ".AS": ["AMS"], ".BR": ["BRU"], ".MI": ["MIL"],
    ".MC": ["MCE"], ".HE": ["HEL"], ".LS": ["LIS"], ".IR": ["ISE"], ".VI": ["VIE"], ".L": ["LSE"],
    ".SW": ["EBS"], ".ST": ["STO"], ".CO": ["CPH"], ".OL": ["OSL"], ".HK": ["HKG"],
    "": ["NMS", "NYQ", "NGM", "NCM", "ASE", "PCX"],
}


def crosscheck_financedatabase(records: list[dict]) -> list[str]:
    """Compare each (symbol, ISIN) pair with the FinanceDatabase listing data."""
    csv.field_size_limit(10**9)
    needed = {(("etfs" if r["type"] == "etf" else "equities"), f)
              for r in records for f in FD_FILES[symbol_suffix(r["symbol"])]}
    table: dict[str, list[dict]] = {}
    for kind, exch in sorted(needed):
        url = f"{FD_BASE}/{kind}/{exch}.csv"
        status, body = http_get(url, timeout=120)
        if status != 200:
            print(f"warning: could not fetch {url} ({status})", file=sys.stderr)
            continue
        for row in csv.DictReader(io.StringIO(body.decode("utf-8"))):
            table.setdefault(row["symbol"], []).append(row)
    problems = []
    for r in records:
        rows = table.get(r["symbol"], [])
        if not rows:
            problems.append(f"{r['symbol']}: not in FinanceDatabase ({r['name']})")
            continue
        isins = {x.get("isin", "") for x in rows}
        if r["isin"] not in isins:
            problems.append(f"{r['symbol']}: ISIN mismatch, ours {r['isin']} vs {sorted(isins)} ({r['name']})")
        elif all(x.get("delisted") == "True" for x in rows if x.get("isin") == r["isin"]):
            problems.append(f"{r['symbol']}: flagged delisted ({r['name']})")
    return problems


def verify_yahoo(records: list[dict], rate: float = 3.0) -> list[dict]:
    """Return records whose symbol does not return a chart on Yahoo Finance."""
    bad = []
    delay = 1.0 / rate
    for i, r in enumerate(records):
        url = f"https://query2.finance.yahoo.com/v8/finance/chart/{r['symbol']}?range=5d&interval=1d"
        ok = False
        for _attempt in range(3):
            try:
                status, body = http_get(url)
            except Exception as e:  # network error
                print(f"  {r['symbol']}: {e}", file=sys.stderr)
                status, body = 0, b""
            if status == 429:
                time.sleep(5)
                continue
            if status == 200:
                try:
                    meta = json.loads(body)["chart"]["result"][0]["meta"]
                    ok = bool(meta.get("symbol"))
                    if ok and meta.get("currency") and meta["currency"] != r["currency"]:
                        print(f"  note: {r['symbol']} currency {meta['currency']} != {r['currency']}", file=sys.stderr)
                except (KeyError, IndexError, TypeError, ValueError):
                    ok = False
            break
        if not ok:
            bad.append(r)
            print(f"  unresolved: {r['symbol']} {r['isin']} {r['name']}", file=sys.stderr)
        if (i + 1) % 50 == 0:
            print(f"  ... {i + 1}/{len(records)} checked", file=sys.stderr)
        time.sleep(delay)
    return bad


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--crosscheck", action="store_true", help="compare against FinanceDatabase (GitHub)")
    ap.add_argument("--verify-yahoo", action="store_true", help="check every symbol on Yahoo Finance")
    ap.add_argument("--drop-unresolved", action="store_true", help="with --verify-yahoo: drop failing rows")
    args = ap.parse_args(argv)

    records, errors = build()
    if errors:
        for e in errors:
            print("error:", e, file=sys.stderr)
        return 1

    if args.crosscheck:
        problems = crosscheck_financedatabase(records)
        for p in problems:
            print("crosscheck:", p, file=sys.stderr)
        print(f"crosscheck: {len(problems)} issue(s)", file=sys.stderr)

    if args.verify_yahoo:
        bad = verify_yahoo(records)
        print(f"yahoo: {len(bad)} unresolved symbol(s)", file=sys.stderr)
        if args.drop_unresolved:
            drop = {r["isin"] for r in bad}
            records = [r for r in records if r["isin"] not in drop]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as fh:
        json.dump([{k: r[k] for k in FIELDS} for r in records], fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    n_stock = sum(r["type"] == "stock" for r in records)
    print(f"wrote {args.out} ({len(records)} instruments: {n_stock} stocks, {len(records) - n_stock} ETFs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
