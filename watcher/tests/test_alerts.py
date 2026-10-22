from datetime import datetime, timedelta, timezone

from arbitrage_watcher.alerts import AlertContext, apply_cooldown, instrument_alerts, make_alert
from arbitrage_watcher.factors import Evidence, Inputs
from arbitrage_watcher.signals import compute_signal
from arbitrage_watcher.state import new_state
from tests.conftest import tracked

NOW = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)


def test_cooldown_and_escalation():
    state = new_state()
    first = apply_cooldown([make_alert("move", NOW, "X", "important", "t", "b")], state, NOW)
    assert len(first) == 1
    later = NOW + timedelta(hours=2)
    assert apply_cooldown([make_alert("move", later, "X", "important", "t", "b")], state, later) == []
    assert len(apply_cooldown([make_alert("move", later, "X", "critical", "t", "b")], state, later)) == 1
    much_later = NOW + timedelta(hours=9)  # 7h after the escalated one
    assert len(apply_cooldown([make_alert("move", much_later, "X", "important", "t", "b")], state, much_later)) == 1


def test_stop_loss_alert_is_critical_and_body_short():
    t = tracked(role="holding", quantity=10, buy_price=100.0)
    inp = Inputs(now=NOW, is_holding=True, price=80.0, buy_price=100.0, stop_loss_pct=15)
    sig = compute_signal(inp, 0.3)
    sig["headline"] = "x" * 300
    out = instrument_alerts(AlertContext(t, sig, "hold", inp, []), NOW, 0.3)
    kinds = [k.split("|")[1] for k, _ in out]
    assert "stop_loss" in kinds and "signal" not in kinds
    a = dict(out)[f"{t.id}|stop_loss"]
    assert a["severity"] == "critical" and len(a["body"]) <= 180


def test_signal_change_alert_only_on_change():
    t = tracked(role="holding", quantity=1)
    bad_news = [Evidence(-0.9, "high", 0.9, NOW - timedelta(hours=h)) for h in (1, 2, 3)]
    inp = Inputs(now=NOW, is_holding=True, price=90.0, sma50=95.0, sma200=100.0, news=bad_news)
    sig = compute_signal(inp, 1.0)
    assert sig["action"] in ("consider_trim", "consider_sell")
    changed = instrument_alerts(AlertContext(t, sig, "hold", inp, []), NOW, 1.0)
    same = instrument_alerts(AlertContext(t, sig, sig["action"], inp, []), NOW, 1.0)
    assert any(k.endswith("|signal") for k, _ in changed)
    assert not any(k.endswith("|signal") for k, _ in same)


def test_earnings_tomorrow_alert():
    t = tracked(role="holding", quantity=1, buy_price=50.0)
    inp = Inputs(now=NOW, is_holding=True, price=50.0)
    sig = compute_signal(inp, 0.3)
    ev = {"id": "e1", "time": "2026-10-21T12:00:00Z", "kind": "earnings", "title": "Earnings report tomorrow (2026-10-22)",
          "summary": "", "url": None, "source": "Earnings calendar", "sentiment": 0.0, "impact": "medium"}
    out = instrument_alerts(AlertContext(t, sig, "hold", inp, [ev]), NOW, 0.3)
    assert any(k.endswith("|earnings") for k, _ in out)


def test_position_alert_replaces_signal_alert():
    t = tracked(role="holding", quantity=1, buy_price=50.0)
    inp = Inputs(now=NOW, is_holding=True, price=70.0, buy_price=50.0, take_profit_pct=30)
    sig = compute_signal(inp, 0.3)
    assert sig["action"] == "consider_trim"
    kinds = [k.split("|")[1] for k, _ in instrument_alerts(AlertContext(t, sig, "hold", inp, []), NOW, 0.3)]
    assert kinds == ["take_profit"]
