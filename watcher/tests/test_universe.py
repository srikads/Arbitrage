import random

from arbitrage_watcher.universe import decoy_instruments, ensure_decoys, load_universe, padded
from tests.conftest import ROOT, tracked


def test_decoys_three_times_stable_and_exclude_real(universe):
    real = [tracked(), tracked(name="Linde", id="IE000BI8OT95", symbol="LIN.DE", isin="IE000BI8OT95")]
    d1 = ensure_decoys([], real, universe, random.Random(1))
    assert len(d1) == 6 and not {"DE0007236101", "IE000BI8OT95"} & set(d1)
    assert ensure_decoys(d1, real, universe, random.Random(2)) == d1  # stable across runs
    more = real + [tracked(name="Decoy1 Corp", id="DE0000000001", symbol="DCY1.DE", isin="DE0000000001")]
    d2 = ensure_decoys(d1, more, universe, random.Random(3))
    assert len(d2) >= 9 and "DE0000000001" not in d2 and set(d1) - {"DE0000000001"} <= set(d2)
    assert len(decoy_instruments(d2, universe)) == len(d2)


def test_padded_shuffles():
    items = padded(["r1", "r2"], [f"d{i}" for i in range(6)], random.Random(0))
    assert sorted(items) == sorted(["r1", "r2"] + [f"d{i}" for i in range(6)])
    assert items[:2] != ["r1", "r2"]


def test_shared_universe_loads_if_present():
    u = load_universe(ROOT)
    assert isinstance(u, list)
    for inst in u[:50]:
        assert inst["id"] and inst["symbol"]
