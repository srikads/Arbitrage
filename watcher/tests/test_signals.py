from datetime import datetime, timedelta, timezone

from arbitrage_watcher.factors import Evidence, Inputs
from arbitrage_watcher.signals import combine, compute_signal, thresholds

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)


def base(**kw) -> Inputs:
    d = dict(now=NOW, is_holding=True, price=100.0, change1d=0.3, rsi14=55.0, sma50=99.0, sma200=97.0,
             volatility=0.2, buy_price=90.0)
    d.update(kw)
    return Inputs(**d)


def news(s: float, impact: str = "high", hours: float = 2, n: int = 1) -> list[Evidence]:
    return [Evidence(s, impact, 0.9, NOW - timedelta(hours=hours + i)) for i in range(n)]


def test_quiet_market_is_hold():
    sig = compute_signal(base(), 0.3)
    assert sig["action"] == "hold"
    assert -0.2 < sig["score"] < 0.2


def test_stop_loss_forces_sell():
    sig = compute_signal(base(price=75.0, buy_price=90.0, stop_loss_pct=15, sma50=80, sma200=85), 0.0)
    assert sig["action"] == "consider_sell"
    assert sig["confidence"] >= 0.7
    assert any(f["name"] == "position" and f["value"] == -1 for f in sig["factors"])


def test_take_profit_suggests_trim():
    sig = compute_signal(base(price=130.0, buy_price=95.0, take_profit_pct=30), 0.3)
    assert sig["action"] == "consider_trim"


def test_strong_negative_news_trim_or_sell():
    inp = base(news=news(-0.9, n=3), change1d=-6.0, sma50=96, sma200=104, price=94, volume_z=3.5)
    sig = compute_signal(inp, 0.5)
    assert sig["action"] in ("consider_sell", "consider_trim")
    assert sig["score"] < -0.4
    assert sig["confidence"] > 0.5
    assert sig["horizon"] == "hours"  # sharp move


def test_mixed_evidence_low_confidence_hold():
    # positive news vs falling long-term trend and overbought RSI
    inp = base(news=news(0.7, "medium", n=2), sma50=95, sma200=103, price=96, rsi14=78)
    sig = compute_signal(inp, 0.5)
    assert sig["action"] in ("hold", "watch")
    assert sig["confidence"] < 0.4


def test_risk_slider_changes_threshold():
    inp = base(news=news(-0.6, "medium", n=2), sma50=98, sma200=101, price=97)
    conservative = compute_signal(inp, 0.0)
    balanced = compute_signal(inp, 1.0)
    assert conservative["score"] == balanced["score"]
    assert conservative["action"] in ("watch", "hold")
    assert balanced["action"] in ("consider_trim", "consider_sell")
    t0, t1 = thresholds(0.0), thresholds(1.0)
    assert t0.strong > t1.strong and t0.conf_strong > t1.conf_strong


def test_candidate_buy_on_target_hit_and_never_sell():
    cand = base(is_holding=False, buy_price=None, target_price=101.0, price=100.0)
    assert compute_signal(cand, 0.3)["action"] == "consider_buy"
    bad = base(is_holding=False, buy_price=None, news=news(-0.9, n=3), sma50=90, sma200=100, price=88)
    assert compute_signal(bad, 1.0)["action"] in ("watch", "hold")


def test_earnings_tomorrow_raises_risk():
    inp = base(next_earnings=(NOW + timedelta(days=1)).date(), volatility=0.3)
    sig = compute_signal(inp, 0.3)
    assert sig["risk"] in ("medium", "high")
    assert any(f["name"] == "earnings" for f in sig["factors"])


def test_confidence_reflects_agreement():
    agree = [{"name": "a", "value": 0.8, "weight": 0.3, "note": ""}, {"name": "b", "value": 0.7, "weight": 0.3, "note": ""}]
    disagree = [{"name": "a", "value": 0.8, "weight": 0.3, "note": ""}, {"name": "b", "value": -0.7, "weight": 0.3, "note": ""}]
    assert combine(agree)[1] > combine(disagree)[1] + 0.3
    thin = [{"name": "a", "value": 0.8, "weight": 0.05, "note": ""}]
    assert combine(thin)[1] < combine(agree)[1]
    assert abs(combine(thin)[0]) < 0.2  # thin evidence shrinks the score


def test_deterministic():
    inp = base(news=news(-0.5, n=2))
    assert compute_signal(inp, 0.4) == compute_signal(inp, 0.4)


def test_attention_amplifies_direction():
    plain = compute_signal(base(news=news(-0.6, n=2)), 0.5)
    amplified = compute_signal(base(news=news(-0.6, n=2), attention_z=5.0), 0.5)
    assert amplified["score"] < plain["score"]
