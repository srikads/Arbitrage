"""Local matching of text to instruments (word-boundary aware) and macro tagging."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from arbitrage_watcher.models import Tracked

# Legal-form suffixes stripped from company names to build a short match term.
_LEGAL_SUFFIX = re.compile(
    r"[\s,]+(AG|SE|KGaA|& Co\.? KGaA|plc|PLC|N\.V\.|NV|S\.A\.|SA|S\.p\.A\.|SpA|Inc\.?|Corp\.?|Corporation|"
    r"Ltd\.?|Holding|Holdings|Group|ASA|AB|Oyj|A/S|GmbH|Co\.)$"
)
# Ticker roots that collide with ordinary words/abbreviations in news text.
_SYMBOL_STOPLIST = frozenset({
    "ADS", "ALL", "AND", "ARE", "BIG", "CAR", "CEO", "CFO", "DAX", "ECB", "EUR", "EZB", "ETF", "FED", "FOR",
    "GDP", "IPO", "ONE", "THE", "USA", "USD", "NEW", "NOW", "OIL", "TWO", "BIP", "CPI", "GMT", "CET", "EU",
    "AI", "KI", "UK", "US", "PM", "AM", "HOT", "LOW", "KEY", "NET", "TOP", "WIN", "BUY", "MAN", "DIE", "DAS",
    "DER", "UND", "MIT", "VON", "AUS", "BEI", "EIN", "ZUM", "ZUR", "WAS", "WIE", "SIE", "ARD", "ZDF", "SPD",
    "CDU", "CSU", "FDP", "AFD",
})
_BOUNDARY_L = r"(?<![\w])"
_BOUNDARY_R = r"(?![\w])"


def strip_legal(name: str) -> str:
    prev = None
    while prev != name:
        prev, name = name, _LEGAL_SUFFIX.sub("", name).strip()
    return name


def match_terms(t: Tracked) -> list[str]:
    """Case-sensitive terms that identify an instrument in text."""
    terms: list[str] = []
    if t.name:
        terms.append(t.name)
        if t.type != "etf":
            short = strip_legal(t.name)
            if len(short) >= 3 and short != t.name:
                terms.append(short)
    terms.extend(a for a in t.aliases if len(a.strip()) >= 2)
    if t.isin:
        terms.append(t.isin)
    if t.symbol:
        terms.append(t.symbol)
        root = t.symbol.split(".")[0]
        if len(root) >= 3 and root.isalpha() and root.upper() == root and root not in _SYMBOL_STOPLIST:
            terms.append(root)
    # Upper-case variants of names catch ALL-CAPS headlines.
    terms += [x.upper() for x in list(terms) if x.upper() != x and len(x) >= 4]
    return sorted({x.strip() for x in terms if x.strip()}, key=len, reverse=True)


def _compile(terms: Iterable[str]) -> re.Pattern[str] | None:
    alts = [re.escape(x) for x in terms]
    if not alts:
        return None
    return re.compile(_BOUNDARY_L + "(?:" + "|".join(alts) + ")" + _BOUNDARY_R)


@dataclass
class Matcher:
    patterns: dict[str, re.Pattern[str]] = field(default_factory=dict)

    def match(self, text: str) -> list[str]:
        """Ids of instruments mentioned in `text`."""
        return [iid for iid, pat in self.patterns.items() if pat.search(text)]


def build_matcher(tracked: Sequence[Tracked]) -> Matcher:
    m = Matcher()
    for t in tracked:
        pat = _compile(match_terms(t))
        if pat is not None:
            m.patterns[t.id] = pat
    return m


# Macro topics that move the whole portfolio. (pattern, case_sensitive)
_MACRO: list[tuple[str, bool]] = [
    (r"ECB|EZB|Fed|FOMC|CPI|GDP|BIP|IWF|IMF|OPEC", True),
    (r"Federal Reserve|Lagarde|Powell|Bundesbank|Nagel|Schnabel", True),
    (r"central bank\w*|interest rates?|rate (?:cut|hike|decision)s?|monetary policy|bond yields?", False),
    (r"inflation\w*|deflation\w*|teuerung\w*|verbraucherpreis\w*|consumer prices", False),
    (r"tariffs?|trade war|zölle|zoll\w*|handelskrieg\w*|handelsstreit\w*|sanktion\w*|sanctions", False),
    (r"recession\w*|rezession\w*|konjunktur\w*|stagflation|slowdown|wirtschaftswachstum|economic growth", False),
    (r"leitzins\w*|zinssenkung\w*|zinserhöhung\w*|zinsentscheid\w*|zinswende|geldpolitik", False),
    (r"arbeitsmarkt\w*|arbeitslos\w*|unemployment|payrolls|jobs report|ifo-index|ifo index|ifo-geschäftsklima", False),
    (r"ölpreis\w*|oil prices?|energy prices|energiepreis\w*|gaspreis\w*", False),
]
_MACRO_RE = [re.compile(_BOUNDARY_L + "(?:" + p + ")" + _BOUNDARY_R, 0 if cs else re.IGNORECASE) for p, cs in _MACRO]


def is_macro(text: str) -> bool:
    """True if the text is about portfolio-wide macro topics (rates, inflation, tariffs, …)."""
    return any(p.search(text) for p in _MACRO_RE)
