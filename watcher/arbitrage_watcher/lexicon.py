"""Lexicon-based EN+DE financial sentiment scorer (fallback when no LLM)."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from functools import lru_cache

from arbitrage_watcher.lexicon_data import (
    DE, EN, HIGH_IMPACT, INTENSIFIERS, LONG_HORIZON, MEDIUM_IMPACT, NEGATORS, PHRASES, SHORT_HORIZON,
)

_TOKEN_RE = re.compile(r"[^\W\d_][\w'’-]*", re.UNICODE)
NEGATION_WINDOW = 3
NEGATION_FACTOR = -0.7
NEGATION_CAP = 1.0
SCALE = 2.5


@dataclass(frozen=True)
class LexScore:
    sentiment: float   # -1..1
    impact: str        # low|medium|high
    horizon: str       # hours|days|weeks|months
    hits: int          # number of sentiment-bearing terms found


@lru_cache(maxsize=1)
def _tables() -> tuple[dict[str, float], list[tuple[str, float]]]:
    exact: dict[str, float] = {}
    prefixes: list[tuple[str, float]] = []
    for table in (EN, DE):
        for key, weight in table.items():
            if key.endswith("*"):
                prefixes.append((key[:-1], weight))
            else:
                exact[key] = weight
    prefixes.sort(key=lambda kv: -len(kv[0]))
    return exact, prefixes


def word_weight(token: str) -> float:
    exact, prefixes = _tables()
    if token in exact:
        return exact[token]
    for prefix, weight in prefixes:
        if token.startswith(prefix):
            return weight
    return 0.0


def _is_negator(token: str) -> bool:
    return token in NEGATORS or token.endswith("n't") or token.endswith("n’t")


def tokenize(text: str) -> list[str]:
    return [t.strip("'’-") for t in _TOKEN_RE.findall(text.lower())]


def _negate(weight: float) -> float:
    """Flip and damp: "no profit warning" is only mildly positive."""
    return max(-NEGATION_CAP, min(NEGATION_CAP, weight * NEGATION_FACTOR))


def _phrase_pass(lower: str) -> tuple[float, int, str]:
    total, hits = 0.0, 0
    for phrase, weight in PHRASES.items():
        start = lower.find(phrase)
        while start != -1:
            before = tokenize(lower[:start])[-NEGATION_WINDOW:]
            total += _negate(weight) if any(_is_negator(b) for b in before) else weight
            hits += 1
            lower = lower[:start] + " " * len(phrase) + lower[start + len(phrase):]
            start = lower.find(phrase)
    return total, hits, lower


def _token_pass(tokens: list[str]) -> tuple[float, int]:
    total, hits = 0.0, 0
    for i, tok in enumerate(tokens):
        if tok in INTENSIFIERS and any(word_weight(t) for t in tokens[i + 1 : i + 3]):
            continue  # applied to the following word instead
        weight = word_weight(tok)
        if not weight:
            continue
        before = tokens[max(0, i - NEGATION_WINDOW) : i]
        if any(tok_b in INTENSIFIERS for tok_b in before[-2:]):
            weight *= max(INTENSIFIERS[t] for t in before[-2:] if t in INTENSIFIERS)
        negated = any(_is_negator(b) for b in before)
        # German verb-final negation: "steigt nicht"
        if not negated and i + 1 < len(tokens) and tokens[i + 1] == "nicht":
            negated = True
        if negated:
            weight = _negate(weight)
        total += weight
        hits += 1
    return total, hits


def _impact(lower: str, sentiment: float) -> str:
    if any(k in lower for k in HIGH_IMPACT):
        return "high"
    if abs(sentiment) >= 0.6 or any(k in lower for k in MEDIUM_IMPACT):
        return "medium"
    return "low"


def _horizon(lower: str) -> str:
    if any(k in lower for k in SHORT_HORIZON):
        return "hours"
    if any(k in lower for k in LONG_HORIZON):
        return "months"
    return "days"


def score_text(text: str) -> LexScore:
    """Score a headline/snippet. Deterministic, language-agnostic across EN/DE."""
    lower = text.lower()
    phrase_total, phrase_hits, rest = _phrase_pass(lower)
    tok_total, tok_hits = _token_pass(tokenize(rest))
    sentiment = math.tanh((phrase_total + tok_total) / SCALE)
    return LexScore(
        sentiment=round(sentiment, 3),
        impact=_impact(lower, sentiment),
        horizon=_horizon(lower),
        hits=phrase_hits + tok_hits,
    )
