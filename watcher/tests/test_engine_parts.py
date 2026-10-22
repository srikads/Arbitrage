"""Technicals, LLM result validation, scoring with a fake LLM, FX and digest."""

from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from arbitrage_watcher import digest, fx, technicals as ta
from arbitrage_watcher.news import NewsItem
from arbitrage_watcher.scoring import score_all, score_key, validate_llm_result
from arbitrage_watcher.state import new_state
from tests.conftest import tracked

NOW = datetime(2026, 10, 22, 12, tzinfo=timezone.utc)


def test_technicals():
    up = pd.Series(np.linspace(50, 150, 260), index=pd.bdate_range(end="2026-10-22", periods=260))
    assert ta.rsi(up) > 90
    assert ta.sma(up, 50) > ta.sma(up, 200)
    assert ta.drawdown_from_high(up, 120.0) < -15
    vol = pd.Series([100.0] * 20 + [400.0])
    assert ta.volume_z(pd.Series(list(np.random.default_rng(0).normal(100, 5, 20)) + [200.0])) > 5
    assert ta.volume_z(vol) is None  # zero variance
    idx = pd.date_range("2026-10-22 08:00", periods=8, freq="15min", tz="UTC")
    assert round(ta.move_over(pd.Series([100, 100, 100, 100, 100, 101, 102, 104.0], index=idx)), 2) == 4.0


def test_validate_llm_result():
    r = validate_llm_result({"sentiment": 3, "impact": "HUGE", "horizon": "years", "relevance": "0.5", "summary": "x"})
    assert r["s"] == 1 and r["imp"] == "low" and r["hz"] == "days" and r["rel"] == 0.5 and r["m"] == "llm"
    assert validate_llm_result({"sentiment": "abc"}) is None
    assert validate_llm_result(None) is None


class FakeLLM:
    def __init__(self):
        self.prompts = []

    def available(self):
        return True

    def chat_json(self, system, user, max_tokens=600):
        self.prompts.append(user)
        n = user.count("Instrument:")
        return {"results": [{"i": i, "sentiment": -0.8, "impact": "high", "horizon": "days", "relevance": 0.9,
                             "summary": "Negative."} for i in range(n)]}


def test_scoring_lexicon_then_llm_upgrade():
    t = tracked(role="holding")
    item = NewsItem("i1", NOW - timedelta(hours=1), "Siemens senkt Prognose", "", None, "x", instruments=[t.id])
    state = new_state()
    assert score_all([item], {t.id: t}, state, None) == 0
    assert state["scores"][score_key("i1", t.id)]["m"] == "lex"
    llm = FakeLLM()
    assert score_all([item], {t.id: t}, state, llm) == 1
    rec = state["scores"][score_key("i1", t.id)]
    assert rec["m"] == "llm" and rec["s"] == -0.8 and "Siemens" in llm.prompts[0]
    assert score_all([item], {t.id: t}, state, llm) == 0  # cached


def test_fx_pairs():
    assert fx.pair_for("EUR") is None
    assert fx.pair_for("GBp") == ("GBPEUR=X", 100.0)
    assert fx.pair_for("USD") == ("USDEUR=X", 1.0)
    assert fx.to_eur(1000, "GBp", {"GBp": 0.0115}) == 11.5
    assert fx.to_eur(10, "SEK", {}) is None


def test_digest_converts_to_eur_and_ends_with_disclaimer():
    eur = tracked(role="holding", quantity=10, buy_price=100.0)
    gbp = tracked(name="Brit", id="GB0001", symbol="BRT.L", isin="GB0001", currency="GBp", role="holding",
                  quantity=100, buy_price=500.0)
    sig = {"action": "hold", "confidence": 0.3, "risk": "low", "headline": "h"}
    snaps = {
        eur.id: {"price": 110.0, "currency": "EUR", "changePct1d": 1.0, "history": {"daily": []}, "signal": sig,
                 "events": [], "nextEarnings": None},
        gbp.id: {"price": 600.0, "currency": "GBp", "changePct1d": -1.0, "history": {"daily": []}, "signal": sig,
                 "events": [], "nextEarnings": "2026-10-27"},
    }
    d = digest.build("daily", [eur, gbp], snaps, NOW, None, {"EUR": 1.0, "GBp": 0.0115})
    md = d["markdown"]
    assert "**Value:** 1,790.00 EUR" in md  # 1100 + 600*100*0.0115 = 1790
    assert "Brit earnings" in md and "ECB monetary policy decision" in md
    assert md.rstrip().endswith(digest.DISCLAIMER)
    d2 = digest.build("daily", [eur, gbp], snaps, NOW, None, {"EUR": 1.0})
    assert "GBp" in d2["markdown"] and "could not be converted" in d2["markdown"]
