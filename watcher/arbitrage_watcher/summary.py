"""Human-readable feed summary for --dry-run (local use only; prints names and prices)."""

from __future__ import annotations

from typing import Any, Sequence

from arbitrage_watcher.models import Tracked


def print_summary(feed: dict[str, Any], tracked: Sequence[Tracked]) -> None:
    names = {t.id: t.name for t in tracked}
    run = feed["run"]
    print(f"== Feed {feed['generatedAt']} | mode {run['mode']} | llm {run['llm']} | {run['durationSec']}s")
    print(f"   {feed['market']['note']}")
    for iid, snap in feed["instruments"].items():
        sig = snap["signal"]
        price = "n/a" if snap["price"] is None else f"{snap['price']:.2f} {snap['currency']}"
        chg = "" if snap["changePct1d"] is None else f" ({snap['changePct1d']:+.2f}%)"
        print(f"-- {names.get(iid, iid)}: {price}{chg}")
        print(f"   {sig['action']} | conf {sig['confidence']:.0%} | risk {sig['risk']} | score {sig['score']:+.2f} | {sig['horizon']}")
        print(f"   {sig['headline']}")
        print(f"   {sig['reasoning']}")
        for e in snap["events"][:3]:
            print(f"   * [{e['kind']}/{e['impact']}/{e['sentiment']:+.2f}] {e['title'][:100]}")
    new = [a for a in feed["alerts"] if a["time"] == feed["generatedAt"]]
    print(f"== Alerts this run: {len(new)}")
    for a in new:
        print(f"   [{a['severity']}] {a['title']} — {a['body']}")
    for d in feed["digests"][:1]:
        if d["time"] == feed["generatedAt"]:
            print(f"== Digest: {d['title']}\n{d['markdown']}")
