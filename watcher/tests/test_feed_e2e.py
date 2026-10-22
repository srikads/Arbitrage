"""End-to-end run with every network source mocked; checks the Feed shape and log hygiene."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pytest

from arbitrage_watcher import cli, runner
from arbitrage_watcher.crowd import bluesky, forums, wikipedia
from arbitrage_watcher.crypto import encrypt_json, read_encrypted
from arbitrage_watcher.feed import validate
from arbitrage_watcher.news import NewsItem
from tests.conftest import UNIVERSE

PASS = "test passphrase"
NOW = datetime.now(timezone.utc)

CONFIG = {
    "version": 1,
    "updatedAt": "2026-10-20T10:00:00Z",
    "holdings": [
        {**UNIVERSE[0], "quantity": 10, "buyPrice": 150.0, "buyDate": None, "stopLossPct": None, "takeProfitPct": None},
        {"id": "DE000A0Z2ZZ5", "isin": "DE000A0Z2ZZ5", "symbol": "", "name": "DE000A0Z2ZZ5", "type": "stock",
         "currency": "EUR", "aliases": [], "wikipedia": None, "quantity": 3, "buyPrice": 20.0, "buyDate": None,
         "stopLossPct": 10, "takeProfitPct": None},
    ],
    "candidates": [{**UNIVERSE[2], "targetPrice": 1000.0, "note": "wait for dip"}],
    "settings": {"risk": 0.4, "quietHours": {"start": "22:00", "end": "07:30"}, "timezone": "Europe/Berlin",
                 "defaultStopLossPct": 15, "defaultTakeProfitPct": 30,
                 "sources": {"news": True, "bluesky": True, "forums": True, "wikipedia": True},
                 "digest": {"daily": True, "weekly": True}},
    "push": None,
}


def fake_download(symbols, period, interval, retries=2):
    out = {}
    rng = np.random.default_rng(0)
    for sym in symbols:
        if interval == "1d":
            idx = pd.bdate_range(end=NOW.date(), periods=300)
            close = 100 + np.cumsum(rng.normal(0, 1, len(idx)))
            out[sym] = pd.DataFrame({"Close": close, "Volume": rng.integers(1e5, 2e5, len(idx))}, index=idx)
        else:
            idx = pd.date_range(end=NOW, periods=60, freq="15min", tz="UTC").tz_convert("Europe/Berlin")
            out[sym] = pd.DataFrame({"Close": 100 + np.cumsum(rng.normal(0, 0.1, len(idx)))}, index=idx)
    return out


@pytest.fixture
def repo(tmp_path, monkeypatch):
    (tmp_path / "shared").mkdir()
    (tmp_path / "shared" / "instruments.json").write_text(json.dumps(UNIVERSE))
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "config.enc").write_text(json.dumps(encrypt_json(CONFIG, PASS, iterations=1000)))
    monkeypatch.setenv("ARB_PASSPHRASE", PASS)
    calls = {"symbols": [], "bluesky": [], "resolve": []}

    def dl(symbols, period, interval, retries=2):
        calls["symbols"].append(list(symbols))
        return fake_download(symbols, period, interval)

    news = [
        NewsItem("n1", NOW - timedelta(hours=1), "Siemens hebt Prognose an, Aktie springt", "Starke Zahlen.",
                 "https://example.com/1", "tagesschau.de"),
        NewsItem("n2", NOW - timedelta(hours=2), "Unfall in der Lindenstraße", "", None, "n-tv.de"),
        NewsItem("n3", NOW - timedelta(hours=3), "EZB senkt überraschend den Leitzins", "Zinswende", None, "faz.net"),
    ]
    monkeypatch.setattr("arbitrage_watcher.prices.download", dl)
    monkeypatch.setattr("arbitrage_watcher.prices._calendar_date", lambda s: (NOW + timedelta(days=1)).date().isoformat())
    monkeypatch.setattr(runner, "fetch_news", lambda: [NewsItem(**{k: getattr(n, k) for k in
                        ("id", "time", "title", "summary", "url", "source")}) for n in news])
    monkeypatch.setattr(bluesky, "search", lambda qs, rng=None: calls["bluesky"].extend(qs) or [])
    monkeypatch.setattr(forums, "fetch_forums", lambda: [])
    monkeypatch.setattr(wikipedia, "fetch_pageviews", lambda titles, rng=None: {t: [100] * 30 + [900] for t in titles})
    monkeypatch.setattr("arbitrage_watcher.resolve._search", lambda c, q: calls["resolve"].append(q) or
                        ([{"symbol": "ABC.DE", "quoteType": "EQUITY", "shortname": "Abc"}] if q == "DE000A0Z2ZZ5" else []))
    monkeypatch.setattr("arbitrage_watcher.resolve.time.sleep", lambda s: None)
    monkeypatch.setattr("arbitrage_watcher.crowd.collect.wikipedia.fetch_pageviews",
                        lambda titles, rng=None: {t: [100] * 30 + [900] for t in titles})
    monkeypatch.setattr("arbitrage_watcher.llm.Ollama._check", lambda self: False)
    return tmp_path, calls


def test_full_run_writes_valid_feed(repo, caplog, capsys):
    path, calls = repo
    assert cli.main(["run", "--repo-dir", str(path), "--mode", "digest", "--ollama-url", "http://127.0.0.1:9"]) == 0
    feed = read_encrypted(path / "data" / "feed.enc", PASS)
    assert validate(feed) == []
    assert set(feed["instruments"]) == {"DE0007236101", "DE000A0Z2ZZ5", "IE000BI8OT95"}
    assert feed["resolved"]["DE000A0Z2ZZ5"]["symbol"] == "ABC.DE"
    sie = feed["instruments"]["DE0007236101"]
    assert sie["price"] is not None and len(sie["history"]["daily"]) >= 250 and sie["history"]["intraday"]
    titles = [e["title"] for e in sie["events"]]
    assert any("Siemens" in t for t in titles)
    assert not any("Lindenstraße" in e["title"] for i in feed["instruments"].values() for e in i["events"])
    assert any(e["kind"] == "earnings" for e in sie["events"])
    assert feed["digests"] and feed["digests"][0]["markdown"].rstrip().endswith("_")
    assert "Not financial advice" in feed["digests"][0]["markdown"]
    # privacy: every per-ticker batch contains >= 3x decoys
    for batch in calls["symbols"]:
        if any(s in batch for s in ("SIE.DE", "LIN.DE", "ABC.DE")):
            assert len(batch) >= 4 * 3
    assert len(calls["resolve"]) == 4
    assert len(calls["bluesky"]) >= 12
    # log hygiene: no names, symbols or ISINs in logs / stdout
    captured = capsys.readouterr()
    out = caplog.text + captured.out + captured.err
    assert "prices" in captured.err  # logging did happen
    for secret in ("Siemens", "SIE.DE", "DE0007236101", "Linde", "ABC.DE", "150"):
        assert secret not in out
    state = read_encrypted(path / "data" / "state.enc", PASS)
    assert state["last"]["digestDaily"] or state["last"]["digestWeekly"]


def test_second_run_reuses_history_and_dedupes(repo):
    path, _ = repo
    args = ["run", "--repo-dir", str(path), "--mode", "light"]
    assert cli.main(args) == 0
    first = read_encrypted(path / "data" / "feed.enc", PASS)
    assert cli.main(args) == 0
    second = read_encrypted(path / "data" / "feed.enc", PASS)
    assert validate(second) == []
    ids = [e["id"] for e in second["instruments"]["DE0007236101"]["events"]]
    assert len(ids) == len(set(ids))
    assert len(second["alerts"]) >= len(first["alerts"])


def test_missing_config_exits_zero(tmp_path, capsys):
    assert cli.main(["run", "--repo-dir", str(tmp_path)]) == 0
    assert "config" in capsys.readouterr().out


def test_plan_outputs(repo, tmp_path, monkeypatch):
    path, _ = repo
    out = tmp_path / "gh_out"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out))
    assert cli.main(["plan", "--repo-dir", str(path)]) == 0
    text = out.read_text()
    assert "needs_llm=" in text and "mode=" in text
