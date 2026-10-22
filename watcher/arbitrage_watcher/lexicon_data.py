"""Compact EN + DE financial sentiment lexicon.

Keys are lower-case tokens. A trailing ``*`` marks a prefix (useful for German
compounds); prefixes are matched longest-first so e.g. ``gewinnwarn*`` wins over
shorter stems. Weights are roughly -3 (very negative) .. +3 (very positive).
"""

from __future__ import annotations

EN: dict[str, float] = {
    # strongly positive
    "soar": 2.5, "soars": 2.5, "soared": 2.5, "soaring": 2.5, "surge": 2.2, "surges": 2.2, "surged": 2.2,
    "skyrocket*": 2.8, "rally": 1.8, "rallies": 1.8, "rallied": 1.8, "jump": 1.8, "jumps": 1.8, "jumped": 1.8,
    "record": 1.2, "beat": 1.8, "beats": 1.8, "outperform*": 1.8, "upgrade": 2.0, "upgrades": 2.0, "upgraded": 2.0,
    "breakthrough": 2.0, "boom": 1.8, "booming": 1.8, "bullish": 2.0, "strong": 1.2, "stronger": 1.3,
    "robust": 1.2, "solid": 0.8, "gain": 1.2, "gains": 1.2, "gained": 1.2, "rise": 1.0, "rises": 1.0, "rose": 1.0,
    "rising": 0.9, "climb*": 1.1, "grow": 1.0, "grows": 1.0, "growth": 1.0, "profit": 0.3, "good": 1.2, "great": 1.5, "excellent": 1.8, "best": 1.2, "profitable": 1.2,
    "raise": 0.8, "raises": 1.0, "raised": 0.8, "buyback": 1.5, "buybacks": 1.5, "dividend": 0.5,
    "approval": 1.5, "approved": 1.5, "wins": 1.3, "win": 1.0, "won": 1.2, "contract": 0.5,
    "recover*": 1.2, "rebound*": 1.3, "optimis*": 1.3, "upbeat": 1.5, "exceed*": 1.6, "top": 0.6, "tops": 1.2,
    "expand*": 0.8, "partnership": 0.8, "boost": 1.3, "boosts": 1.3, "boosted": 1.3, "accelerat*": 0.9,
    "high": 0.4, "higher": 0.9, "highs": 1.0, "positive": 1.0, "improve*": 1.1, "upside": 1.2, "momentum": 0.6,
    "overweight": 1.2, "buy": 0.8, "outlook": 0.1, "confident": 1.0, "success*": 1.3, "innovative": 0.8,
    # negative
    "plunge": -2.5, "plunges": -2.5, "plunged": -2.5, "plummet*": -2.7, "crash": -2.8, "crashes": -2.8,
    "crashed": -2.8, "collapse*": -2.7, "tumble*": -2.2, "slump*": -2.0, "sink": -1.6, "sinks": -1.6, "sank": -1.6,
    "slide": -1.4, "slides": -1.4, "slid": -1.4, "drop": -1.3, "drops": -1.3, "dropped": -1.3, "fall": -1.2,
    "falls": -1.2, "fell": -1.2, "falling": -1.2, "decline*": -1.2, "lower": -0.8, "lowers": -1.4, "lowered": -1.4,
    "loss": -1.5, "losses": -1.5, "miss": -1.8, "misses": -1.8, "missed": -1.8, "downgrade": -2.0,
    "downgrades": -2.0, "downgraded": -2.0, "underperform*": -1.8, "weak": -1.4, "bad": -1.5, "poor": -1.5, "worse": -1.5, "worst": -1.8, "weaker": -1.5, "weakness": -1.4,
    "warn": -1.6, "warns": -1.8, "warning": -1.6, "cut": -1.2, "cuts": -1.3, "slash*": -1.8, "layoff*": -1.6,
    "bankrupt*": -3.0, "insolven*": -3.0, "default": -2.0, "fraud": -3.0, "scandal": -2.5, "probe": -1.5,
    "investigation": -1.6, "lawsuit": -1.5, "sued": -1.5, "fine": -0.8, "fined": -1.8, "penalty": -1.5,
    "recall": -1.8, "recalls": -1.8, "bearish": -2.0, "concern*": -1.0, "fear*": -1.3, "worr*": -1.2,
    "risk": -0.5, "risks": -0.6, "uncertain*": -1.0, "volatil*": -0.6, "selloff": -2.0, "sell-off": -2.0,
    "downturn": -1.8, "recession": -1.8, "slowdown": -1.4, "stagnat*": -1.2, "disappoint*": -1.8,
    "underweight": -1.2, "sell": -0.8, "halt*": -1.4, "delay*": -1.0, "shortfall": -1.6, "deficit": -1.0,
    "pressure": -0.8, "headwind*": -1.2, "lowest": -1.2, "low": -0.4, "negative": -1.0, "struggl*": -1.5,
    "tariff*": -0.8, "sanction*": -1.2, "strike": -1.0, "outage": -1.4, "breach": -1.8, "hack*": -1.6,
    "resign*": -1.2, "ousted": -1.5, "writedown*": -2.0, "write-down*": -2.0, "impairment*": -1.8,
    "dilut*": -1.4, "shortseller*": -2.0, "short-seller*": -2.0, "fail": -1.5, "failure": -1.8,
}

DE: dict[str, float] = {
    # positiv
    "steigt": 1.1, "steigen": 1.0, "gestiegen": 1.1, "anstieg": 1.0, "zulegen": 1.0, "legt": 0.6, "zugelegt": 1.0,
    "kletter*": 1.1, "springt": 1.8, "sprung": 1.5, "kurssprung": 2.2, "höhenflug": 2.0, "rekord*": 1.3,
    "rallye": 1.8, "hausse": 1.5, "gewinne": 1.0, "gewinnen": 1.0, "gewinnt": 1.1, "gewinnsprung": 2.2,
    "gewinnplus": 1.6, "gewinnanstieg": 1.6, "umsatzplus": 1.4, "umsatzsprung": 2.0, "wachstum": 1.0,
    "wächst": 1.1, "wachsen": 1.0, "stark": 1.1, "starke": 1.1, "starken": 1.1, "starker": 1.1, "stärker": 1.2,
    "robust*": 1.1, "solide": 0.8, "gut": 1.0, "gute": 1.0, "guten": 1.0, "besser": 1.2, "hervorragend": 1.8, "erholung": 1.2, "erholt": 1.2, "erholen": 1.1, "aufwärts": 1.0,
    "hochgestuft": 2.0, "hochstufung": 2.0, "kaufempfehlung": 1.8, "kaufen": 0.8, "übergewichten": 1.2,
    "angehoben": 1.3, "anheb*": 1.0, "erhöht": 0.9, "übertrifft": 1.8, "übertroffen": 1.8, "übertreffen": 1.8,
    "aktienrückkauf": 1.5, "rückkauf*": 1.3, "dividendenerhöhung": 1.8, "zuversicht*": 1.3, "optimis*": 1.3,
    "auftrag": 0.8, "großauftrag": 1.8, "milliardenauftrag": 2.0, "durchbruch": 2.0, "zulassung": 1.5,
    "positiv*": 1.0, "boom*": 1.6, "plus": 0.8, "aufschwung": 1.5, "verbessert": 1.1, "verbesserung": 1.0,
    "überzeug*": 1.0, "erfolg*": 1.3, "fusion": 0.4, "kursziel": 0.0, "bullisch": 2.0, "hoch": 0.4,
    # negativ
    "fällt": -1.2, "fallen": -1.1, "gefallen": -0.9, "sinkt": -1.2, "sinken": -1.1, "gesunken": -1.2,
    "verliert": -1.3, "verlieren": -1.2, "verloren": -1.2, "verlust*": -1.5, "einbruch": -2.2, "bricht": -2.0,
    "eingebrochen": -2.2, "absturz": -2.7, "stürzt": -2.5, "abgestürzt": -2.6, "kurssturz": -2.7, "talfahrt": -2.0,
    "rutscht": -1.4, "abgerutscht": -1.5, "rückgang": -1.2, "rückläufig": -1.2, "schwach": -1.4, "schlecht*": -1.5, "schwäche*": -1.4,
    "schwache": -1.4, "schwachen": -1.4, "schwächer": -1.4, "gewinnwarn*": -3.0, "gewinneinbruch": -2.5,
    "gewinnrückgang": -2.0, "umsatzrückgang": -1.8, "umsatzeinbruch": -2.3, "prognosesenkung": -2.2,
    "gesenkt": -1.3, "senkt": -1.3, "kürzt": -1.4, "gekürzt": -1.4, "kürzung*": -1.4, "dividendenkürzung": -2.2,
    "abgestuft": -2.0, "abstufung": -2.0, "herabgestuft": -2.0, "verkaufsempfehlung": -1.8, "verkaufen": -0.8,
    "untergewichten": -1.2, "insolven*": -3.0, "pleite": -3.0, "konkurs": -3.0, "betrug": -3.0,
    "bilanzskandal": -3.0, "skandal": -2.5, "razzia": -2.2, "ermittlung*": -1.6, "klage": -1.3, "strafe": -1.5,
    "bußgeld": -1.6, "rückruf*": -1.8, "stellenabbau": -1.6, "jobabbau": -1.6, "entlassung*": -1.6,
    "streik*": -1.0, "warnt": -1.6, "warnung": -1.5, "sorge*": -1.2, "angst": -1.3, "ängste": -1.3,
    "unsicher*": -1.0, "rezession": -1.8, "abschwung": -1.6, "krise": -1.8, "krisen*": -1.5, "flaute": -1.3,
    "enttäusch*": -1.8, "verfehlt": -1.8, "verfehlen": -1.7, "minus": -0.8, "belastet": -1.2, "belastung*": -1.1,
    "gegenwind": -1.2, "druck": -0.7, "zölle": -0.8, "zoll*": -0.6, "sanktion*": -1.2, "abschreibung*": -1.8,
    "kapitalerhöhung": -1.4, "rücktritt": -1.2, "tief": -0.6, "tiefer": -1.0, "tiefststand": -1.6,
    "bärisch": -2.0, "ausverkauf": -2.0, "panik": -2.2, "einbußen": -1.5, "defizit": -1.0, "negativ*": -1.0,
}

# Multi-word phrases (lower-case, matched on the raw lower-cased text before tokens).
PHRASES: dict[str, float] = {
    "profit warning": -3.0, "beats expectations": 2.0, "beat expectations": 2.0, "above expectations": 1.8,
    "below expectations": -1.8, "misses expectations": -2.0, "missed expectations": -2.0,
    "raises guidance": 2.0, "raised guidance": 2.0, "cuts guidance": -2.2, "cut guidance": -2.2,
    "lowers guidance": -2.2, "price target raised": 1.5, "price target cut": -1.5, "all-time high": 1.5,
    "record high": 1.6, "52-week low": -1.4, "dividend cut": -2.2, "share buyback": 1.5,
    "prognose angehoben": 2.0, "prognose erhöht": 2.0, "prognose gesenkt": -2.2, "ausblick gesenkt": -2.0,
    "ausblick angehoben": 2.0, "kursziel angehoben": 1.5, "kursziel erhöht": 1.5, "kursziel gesenkt": -1.5,
    "über den erwartungen": 1.8, "unter den erwartungen": -1.8, "erwartungen übertroffen": 2.0,
    "erwartungen verfehlt": -2.0, "auf rekordhoch": 1.6, "auf allzeithoch": 1.6,
}

NEGATORS: frozenset[str] = frozenset({
    "not", "no", "never", "without", "neither", "nor", "cannot", "fails", "failed", "failing", "barely",
    "nicht", "kein", "keine", "keinen", "keiner", "keinem", "keines", "ohne", "nie", "niemals", "weder", "kaum",
})

INTENSIFIERS: dict[str, float] = {
    "very": 1.4, "sharply": 1.5, "strongly": 1.4, "significantly": 1.3, "massive": 1.5, "massively": 1.5,
    "huge": 1.4, "deeply": 1.3, "steep": 1.4, "steeply": 1.4, "record": 1.2,
    "sehr": 1.4, "stark": 1.4, "deutlich": 1.3, "kräftig": 1.4, "massiv": 1.5, "drastisch": 1.5, "erheblich": 1.3,
}

HIGH_IMPACT: tuple[str, ...] = (
    "profit warning", "gewinnwarnung", "insolven", "bankrupt", "pleite", "konkurs", "fraud", "betrug",
    "bilanzskandal", "takeover", "übernahme", "übernahmeangebot", "acquisition", "acquire", "merger", "fusion",
    "guidance cut", "cuts guidance", "lowers guidance", "prognose gesenkt", "prognosesenkung", "ceo resign",
    "chef tritt zurück", "rücktritt", "kapitalerhöhung", "dividend cut", "dividendenkürzung", "razzia",
    "short seller", "short-seller", "leerverkäufer", "delisting", "recall", "rückruf", "scandal", "skandal",
)

MEDIUM_IMPACT: tuple[str, ...] = (
    "earnings", "quarter", "quartal", "results", "zahlen", "upgrade", "downgrade", "hochgestuft", "abgestuft",
    "kursziel", "price target", "guidance", "prognose", "ausblick", "dividend", "dividende", "buyback",
    "rückkauf", "contract", "auftrag", "layoff", "stellenabbau", "lawsuit", "klage", "investigation", "ermittlung",
    "rate", "zins", "inflation", "tariff", "zoll", "zölle",
)

LONG_HORIZON: tuple[str, ...] = (
    "strategy", "strategie", "merger", "fusion", "übernahme", "takeover", "acquisition", "restructur",
    "umbau", "regulation", "regulierung", "patent", "investment plan", "investitionsplan",
)
SHORT_HORIZON: tuple[str, ...] = ("intraday", "heute", "today", "opening", "eröffnung", "vorbörslich", "premarket")
