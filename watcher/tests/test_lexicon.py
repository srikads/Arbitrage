import pytest

from arbitrage_watcher.lexicon import score_text


@pytest.mark.parametrize("text", [
    "Siemens shares plunge after profit warning",
    "Company misses expectations and cuts guidance",
    "Aktie bricht nach Gewinnwarnung ein",
    "Kurssturz: Anleger in Panik",
])
def test_negative(text):
    assert score_text(text).sentiment < -0.4


@pytest.mark.parametrize("text", [
    "Earnings beat expectations, shares jump to record high",
    "Konzern hebt Prognose an – Prognose angehoben, Aktie springt",
    "Starkes Umsatzplus und Rekordgewinn",
])
def test_positive(text):
    assert score_text(text).sentiment > 0.4


def test_negation_en():
    assert score_text("Results are good").sentiment > 0
    assert score_text("Results are not good").sentiment < 0
    assert score_text("The outlook isn't bad").sentiment > 0


def test_negation_de():
    assert score_text("Die Zahlen sind gut").sentiment > 0
    assert score_text("Die Zahlen sind nicht gut").sentiment < 0
    assert score_text("Keine Gewinnwarnung").sentiment > 0
    assert score_text("Die Aktie steigt nicht").sentiment < 0


def test_negated_strong_word_is_damped():
    assert 0 < score_text("No profit warning this year").sentiment < 0.6


def test_impact_and_neutral():
    assert score_text("Übernahmeangebot für den Konzern").impact == "high"
    assert score_text("Quartalszahlen am Donnerstag").impact == "medium"
    neutral = score_text("The company publishes its annual report")
    assert neutral.sentiment == 0 and neutral.impact == "low"
