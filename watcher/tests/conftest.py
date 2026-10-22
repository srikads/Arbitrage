"""Shared fixtures. No test touches the network."""

from __future__ import annotations

import json
import socket
from pathlib import Path

import pytest

from arbitrage_watcher.models import Tracked

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def _no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def guard(*args, **kwargs):  # pragma: no cover - only hit on a test bug
        raise RuntimeError("network access in tests")

    monkeypatch.setattr(socket.socket, "connect", guard)


def _inst(i: int, kind: str = "stock") -> dict:
    return {
        "id": f"DE000000{i:04d}", "isin": f"DE000000{i:04d}", "symbol": f"DCY{i}.DE", "name": f"Decoy{i} Corp",
        "type": kind, "currency": "EUR", "aliases": [], "wikipedia": f"Decoy{i}",
    }


UNIVERSE = [
    {"id": "DE0007236101", "isin": "DE0007236101", "symbol": "SIE.DE", "name": "Siemens", "type": "stock",
     "currency": "EUR", "aliases": ["Siemens AG"], "wikipedia": "Siemens"},
    {"id": "IE00B4L5Y983", "isin": "IE00B4L5Y983", "symbol": "EUNL.DE", "name": "iShares Core MSCI World UCITS ETF",
     "type": "etf", "currency": "EUR", "aliases": [], "wikipedia": None},
    {"id": "IE000BI8OT95", "isin": "IE000BI8OT95", "symbol": "LIN.DE", "name": "Linde", "type": "stock",
     "currency": "EUR", "aliases": ["Linde plc"], "wikipedia": "Linde plc"},
] + [_inst(i) for i in range(1, 25)] + [_inst(i, "etf") for i in range(25, 35)]


@pytest.fixture
def universe() -> list[dict]:
    return [dict(u) for u in UNIVERSE]


@pytest.fixture
def vector() -> dict:
    return json.loads((ROOT / "shared" / "testvectors" / "envelope.json").read_text())


def tracked(name: str = "Siemens", **kw) -> Tracked:
    base = dict(id="DE0007236101", symbol="SIE.DE", name=name, type="stock", currency="EUR",
                isin="DE0007236101", aliases=["Siemens AG"], wikipedia="Siemens")
    base.update(kw)
    return Tracked(**base)
