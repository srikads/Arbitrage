"""Signal headline/reasoning: LLM-written when available, template otherwise."""

from __future__ import annotations

from typing import Any, Sequence

from arbitrage_watcher import prompts
from arbitrage_watcher.llm import Ollama
from arbitrage_watcher.models import Event, Factor, Tracked
from arbitrage_watcher.util import stable_hash, truncate

ACTION_TEXT = {
    "hold": "Hold — nothing that calls for action",
    "watch": "Watch — worth keeping an eye on",
    "consider_trim": "Consider trimming",
    "consider_sell": "Consider selling",
    "consider_buy": "Consider buying",
    "consider_add": "Consider adding",
}

ACTION_ADVICE = {
    "hold": "No action is suggested; the long-term case is unchanged by current data.",
    "watch": "No action yet, but check back if the picture firms up.",
    "consider_trim": "Taking some risk off the table could make sense; this is not a forced sale.",
    "consider_sell": "The evidence leans clearly against this position; review whether it still fits your plan.",
    "consider_buy": "Conditions look favourable for an entry; consider position size and timing carefully.",
    "consider_add": "Conditions look favourable for adding; keep position size within your plan.",
}


def _drivers(factors: Sequence[Factor], n: int = 2) -> list[Factor]:
    active = [f for f in factors if f["weight"] > 0 and abs(f["value"]) > 0.05]
    return sorted(active, key=lambda f: -f["weight"] * abs(f["value"]))[:n]


def template(signal: dict[str, Any]) -> tuple[str, str]:
    """Deterministic headline and 2–4 sentence reasoning from the computed factors."""
    factors: list[Factor] = signal["factors"]
    drivers = _drivers(factors)
    score = signal["score"]
    tone = "positive" if score > 0.15 else "negative" if score < -0.15 else "mixed or neutral"
    head_note = drivers[0]["note"] if drivers else "no strong signals"
    headline = truncate(f"{ACTION_TEXT[signal['action']].split(' —')[0]}: {head_note}", 110)
    parts = [f"Overall the evidence is {tone} (score {score:+.2f}, confidence {signal['confidence']:.0%})."]
    if drivers:
        parts.append("Main drivers: " + "; ".join(f["note"] for f in drivers) + ".")
    else:
        parts.append("There is little fresh news or price action to go on.")
    extra = [f["note"] for f in factors if f["name"] == "earnings"]
    risk = f"Risk is {signal['risk']}" + (f" ({extra[0]})." if extra else ".")
    parts.append(risk)
    parts.append(ACTION_ADVICE[signal["action"]])
    return headline, " ".join(parts)


def narrative_key(signal: dict[str, Any]) -> str:
    names = ",".join(sorted(f["name"] for f in _drivers(signal["factors"], 3)))
    return stable_hash(signal["action"], f"{round(signal['score'], 1):+.1f}", signal["risk"], names)


def llm_narrative(t: Tracked, signal: dict[str, Any], events: Sequence[Event], llm: Ollama) -> tuple[str, str] | None:
    factors = "\n".join(f"- {f['name']}: {f['value']:+.2f} (w {f['weight']:.2f}) — {f['note']}" for f in signal["factors"])
    recent = "\n".join(f"- {e['title']}" for e in events[:5]) or "- none"
    user = prompts.NARRATIVE_USER.format(
        name=t.name, role="held position" if t.is_holding else "watchlist candidate",
        action=signal["action"], confidence=signal["confidence"], risk=signal["risk"], score=signal["score"],
        horizon=signal["horizon"], factors=factors or "- none", events=recent,
    )
    data = llm.chat_json(prompts.NARRATIVE_SYSTEM, user, max_tokens=220)
    if not data:
        return None
    headline, reasoning = str(data.get("headline") or "").strip(), str(data.get("reasoning") or "").strip()
    if not headline or len(reasoning) < 20:
        return None
    return truncate(headline, 120), truncate(reasoning, 700)


def fill(t: Tracked, signal: dict[str, Any], events: Sequence[Event], state: dict[str, Any],
         llm: Ollama | None) -> None:
    """Set signal headline/reasoning in place, reusing a cached LLM text when the picture is unchanged."""
    key = narrative_key(signal)
    cached = state["narratives"].get(t.id)
    if cached and cached.get("key") == key:
        signal["headline"], signal["reasoning"] = cached["headline"], cached["reasoning"]
        return
    text = llm_narrative(t, signal, events, llm) if llm is not None and llm.available() else None
    if text:
        state["narratives"][t.id] = {"key": key, "headline": text[0], "reasoning": text[1]}
    else:
        state["narratives"].pop(t.id, None)
        text = template(signal)
    signal["headline"], signal["reasoning"] = text
