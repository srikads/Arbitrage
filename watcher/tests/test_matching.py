from arbitrage_watcher.matching import build_matcher, is_macro, match_terms
from tests.conftest import tracked


def linde():
    return tracked(name="Linde plc", id="IE000BI8OT95", symbol="LIN.DE", isin="IE000BI8OT95", aliases=[],
                   wikipedia="Linde plc")


def test_word_boundaries_and_no_false_positive():
    m = build_matcher([linde()])
    assert m.match("Linde hebt Prognose an") == ["IE000BI8OT95"]
    assert m.match("Linde-Aktie legt zu") == ["IE000BI8OT95"]
    assert m.match("Linde's margins improve") == ["IE000BI8OT95"]
    assert m.match("Unfall in der Lindenstraße") == []
    assert m.match("Lindemann neuer Chef") == []
    assert m.match("unter der linde") == []  # case-sensitive name matching


def test_aliases_isin_symbol():
    sie = tracked()
    m = build_matcher([sie])
    assert m.match("Siemens AG reports orders") == [sie.id]
    assert m.match("ISIN DE0007236101 im Fokus") == [sie.id]
    assert m.match("SIE.DE gains") == [sie.id]
    assert m.match("SIEMENS SHARES SOAR") == [sie.id]
    assert m.match("Siemensstadt wird erweitert") == []
    # "SIE" ticker root is a German word and must not match on its own
    assert m.match("Sie kaufen ein") == []
    assert "SIE" not in match_terms(sie)


def test_legal_suffix_stripped():
    t = tracked(name="Deutsche Telekom AG", id="DE0005557508", symbol="DTE.DE", isin="DE0005557508", aliases=[])
    terms = match_terms(t)
    assert "Deutsche Telekom" in terms and "DTE" in terms


def test_etf_name_not_shortened():
    t = tracked(name="iShares Core MSCI World UCITS ETF", type="etf", id="IE00B4L5Y983", symbol="EUNL.DE",
                isin="IE00B4L5Y983", aliases=[])
    m = build_matcher([t])
    assert m.match("iShares launches new product") == []


def test_macro():
    assert is_macro("EZB senkt den Leitzins")
    assert is_macro("Fed signals rate cut as inflation cools")
    assert is_macro("Neue Zölle belasten Exporteure")
    assert not is_macro("Company fed up with delays")  # lower-case "fed" is not the Fed
    assert not is_macro("Neues Smartphone vorgestellt")
