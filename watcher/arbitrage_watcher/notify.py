"""Decide which alerts to push now (quiet hours, daily cap, batching) and send them."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Sequence

from arbitrage_watcher import log, push
from arbitrage_watcher.alerts import SEV_RANK
from arbitrage_watcher.models import Alert
from arbitrage_watcher.quiet import is_quiet, local_date
from arbitrage_watcher.util import truncate

MAX_PUSHES_PER_DAY = 6
BATCH_OVER = 2          # more than this many alerts in one go -> one summary push
PUSHABLE = ("important", "critical")


@dataclass
class PushPlan:
    messages: list[tuple[str, list[Alert]]] = field(default_factory=list)   # (payload, alerts covered)
    deferred: list[str] = field(default_factory=list)                     # alert ids kept for later


def _summary(alerts: Sequence[Alert]) -> str:
    top = max(alerts, key=lambda a: (SEV_RANK[a["severity"]], a["time"]))
    if len(alerts) == 1:
        a = alerts[0]
        return push.build_payload(a["title"], a["body"], a["id"], a["instrumentId"], a["severity"])
    ids = {a["instrumentId"] for a in alerts}
    body = truncate(" · ".join(a["title"] for a in sorted(alerts, key=lambda a: -SEV_RANK[a["severity"]])), 180)
    return push.build_payload(f"{len(alerts)} new alerts", body, top["id"],
                              ids.pop() if len(ids) == 1 else None, top["severity"])


def plan(new_alerts: Sequence[Alert], all_alerts: Sequence[Alert], state: dict[str, Any],
         settings: dict[str, Any], now: datetime, force_ids: Sequence[str] = ()) -> PushPlan:
    """Plan pushes. `force_ids` are info alerts the user asked for explicitly (digest ready)."""
    qh = settings.get("quietHours") or {}
    tz = settings.get("timezone")
    quiet = is_quiet(now, qh.get("start", "22:00"), qh.get("end", "07:30"), tz)
    today = local_date(now, tz)
    used = int(state["pushes"].get(today, 0))
    by_id = {a["id"]: a for a in all_alerts}
    pending = [by_id[i] for i in state["pendingPush"] if i in by_id and not by_id[i]["pushed"]]
    fresh = [a for a in new_alerts if a["severity"] in PUSHABLE or a["id"] in force_ids]
    result = PushPlan()
    if quiet:
        critical = [a for a in fresh if a["severity"] == "critical"]
        if critical:
            result.messages.append((_summary(critical), critical))
        result.deferred = [a["id"] for a in pending + fresh if a["severity"] != "critical"]
        return result
    queue = pending + [a for a in fresh if a not in pending]
    critical = [a for a in queue if a["severity"] == "critical"]
    others = [a for a in queue if a["severity"] != "critical"]
    if used >= MAX_PUSHES_PER_DAY:
        others = []  # cap reached: stay visible in the feed, no push
    if critical:
        result.messages.append((_summary(critical), critical))
    if others:
        if len(others) > BATCH_OVER or pending:
            result.messages.append((_summary(others), others))
        else:
            result.messages += [(_summary([a]), [a]) for a in others]
    return result


def execute(p: PushPlan, target: dict[str, Any] | None, state: dict[str, Any], settings: dict[str, Any],
            now: datetime, sender: Callable[[dict[str, Any] | None, str], str] = push.send) -> str | None:
    """Send planned pushes, mark alerts pushed, update counters. Returns "expired" if the subscription died."""
    today = local_date(now, settings.get("timezone"))
    state["pendingPush"] = p.deferred
    if target and state.get("pushExpired") == push.endpoint_id(target):
        return None  # known dead subscription; wait for the app to register a new one
    sent = 0
    for payload, covered in p.messages:
        status = sender(target, payload)
        if status == "expired":
            state["pushExpired"] = push.endpoint_id(target or {})
            return "expired"
        if status == "ok":
            sent += 1
            for a in covered:
                a["pushed"] = True
    state["pushes"][today] = int(state["pushes"].get(today, 0)) + sent
    if p.messages:
        log.info("push: %d/%d messages sent, %d deferred", sent, len(p.messages), len(p.deferred))
    return None
