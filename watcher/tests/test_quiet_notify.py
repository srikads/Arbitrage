from datetime import datetime, timezone

from arbitrage_watcher.notify import MAX_PUSHES_PER_DAY, execute, plan
from arbitrage_watcher.quiet import is_quiet
from arbitrage_watcher.state import new_state

SETTINGS = {"quietHours": {"start": "22:00", "end": "07:30"}, "timezone": "Europe/Berlin"}


def utc(h, m=0, day=21):
    return datetime(2026, 10, day, h, m, tzinfo=timezone.utc)  # CEST: UTC+2


def test_quiet_hours_across_midnight():
    assert is_quiet(utc(20, 30), "22:00", "07:30", "Europe/Berlin")      # 22:30 local
    assert is_quiet(utc(3), "22:00", "07:30", "Europe/Berlin")           # 05:00 local
    assert not is_quiet(utc(5, 30), "22:00", "07:30", "Europe/Berlin")   # 07:30 local -> ends
    assert not is_quiet(utc(12), "22:00", "07:30", "Europe/Berlin")
    assert not is_quiet(utc(12), "08:00", "08:00", "Europe/Berlin")      # disabled
    assert is_quiet(utc(11), "12:00", "14:00", "Europe/Berlin")          # same-day window, 13:00 local


def alert(i, severity="important"):
    return {"id": f"a{i}", "time": "2026-10-21T20:00:00Z", "instrumentId": "X", "severity": severity,
            "title": f"T{i}", "body": "b", "action": None, "confidence": None, "eventIds": [], "pushed": False}


def test_quiet_defers_important_but_pushes_critical():
    state = new_state()
    a1, a2 = alert(1), alert(2, "critical")
    p = plan([a1, a2], [a1, a2], state, SETTINGS, utc(21))
    assert [x["id"] for _, covered in p.messages for x in covered] == ["a2"]
    assert p.deferred == ["a1"]
    sent = []
    execute(p, {"subscription": {"endpoint": "e"}, "vapidPrivateKey": "k"}, state, SETTINGS, utc(21),
            sender=lambda t, payload: sent.append(payload) or "ok")
    assert len(sent) == 1 and a2["pushed"] and not a1["pushed"]
    assert state["pendingPush"] == ["a1"]


def test_deferred_flushed_as_one_summary_after_quiet_hours():
    state = new_state()
    old = [alert(1), alert(2)]
    state["pendingPush"] = ["a1", "a2"]
    p = plan([], old, state, SETTINGS, utc(6))  # 08:00 local
    assert len(p.messages) == 1 and len(p.messages[0][1]) == 2
    assert '"2 new alerts"' in p.messages[0][0]
    execute(p, {"subscription": {"endpoint": "e"}, "vapidPrivateKey": "k"}, state, SETTINGS, utc(6),
            sender=lambda t, payload: "ok")
    assert all(a["pushed"] for a in old) and state["pendingPush"] == []


def test_info_not_pushed_and_daily_cap():
    state = new_state()
    info = alert(1, "info")
    assert plan([info], [info], state, SETTINGS, utc(10)).messages == []
    state["pushes"]["2026-10-21"] = MAX_PUSHES_PER_DAY
    imp, crit = alert(2), alert(3, "critical")
    p = plan([imp, crit], [imp, crit], state, SETTINGS, utc(10))
    assert [x["id"] for _, c in p.messages for x in c] == ["a3"]


def test_expired_subscription_marked():
    state = new_state()
    a = alert(1)
    p = plan([a], [a], state, SETTINGS, utc(10))
    target = {"subscription": {"endpoint": "https://push.example/x"}, "vapidPrivateKey": "k"}
    assert execute(p, target, state, SETTINGS, utc(10), sender=lambda t, payload: "expired") == "expired"
    assert state["pushExpired"]
    sent = []
    execute(p, target, state, SETTINGS, utc(10), sender=lambda t, payload: sent.append(1) or "ok")
    assert sent == []
