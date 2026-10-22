# scripts

## `build_instruments.py`

Generates `shared/instruments.json`, the offline instrument universe (stocks and
ETFs) used for search in the PWA and as the pool of decoy instruments for the
watcher.

The data lives in `instrument_data.py` as plain Python tuples:

```
(isin, yahoo_symbol, currency, display_name, aliases, wikipedia_title)
```

To add, fix or remove an instrument, edit that file, then regenerate:

```sh
python3 scripts/build_instruments.py
```

The build is offline. It checks every ISIN check digit, the symbol format and
the currency of each listing, drops duplicate ISINs, sorts by name and writes
the JSON (`indent=1`, UTF-8).

Optional checks that need network access:

```sh
# Compare every ISIN/symbol pair against the FinanceDatabase listing CSVs on GitHub
python3 scripts/build_instruments.py --crosscheck

# Check that every symbol returns a chart on Yahoo Finance (about 3 requests/s)
python3 scripts/build_instruments.py --verify-yahoo
python3 scripts/build_instruments.py --verify-yahoo --drop-unresolved
```

### Conventions

- `id` is the ISIN.
- Symbol choice: the XETRA listing (`.DE`, EUR) when there is one. Otherwise the
  home listing: `.PA`, `.AS`, `.MI`, `.MC`, `.BR`, `.HE`, `.LS`, `.IR`, `.VI`
  (EUR), `.L` (GBp, pence), `.SW` (CHF), `.ST` (SEK), `.CO` (DKK), `.OL` (NOK),
  `.HK` (HKD), or the plain US ticker (USD).
- `aliases` are extra strings for matching headlines: legal names, former
  names and well-known brands. Avoid single common words.
- `wikipedia` is the English article title, or `null` when unsure. ETFs use `null`.

## Tests

```sh
python3 scripts/test_instruments.py      # or: python3 -m pytest scripts
```
