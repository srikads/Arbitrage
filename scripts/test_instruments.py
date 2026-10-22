"""Checks for shared/instruments.json.

Run with `python3 -m pytest scripts` or `python3 scripts/test_instruments.py`.
"""

import json
import re
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from build_instruments import FIELDS, SUFFIX_CURRENCY, isin_check_digit_ok, symbol_suffix  # noqa: E402

DATA = HERE.parent / "shared" / "instruments.json"


def load():
    with DATA.open(encoding="utf-8") as fh:
        return json.load(fh)


class InstrumentsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.items = load()

    def test_check_digit_function(self):
        for good in ("US0378331005", "DE0007236101", "IE00B4L5Y983", "GB0002634946", "NL0010273215"):
            self.assertTrue(isin_check_digit_ok(good), good)
        for bad in ("US0378331006", "DE0007236100", "XX", "us0378331005", "IE00B4L5Y98"):
            self.assertFalse(isin_check_digit_ok(bad), bad)

    def test_is_list_of_reasonable_size(self):
        self.assertIsInstance(self.items, list)
        self.assertGreaterEqual(len(self.items), 500)

    def test_schema(self):
        for it in self.items:
            self.assertEqual(tuple(it.keys()), FIELDS, it.get("id"))
            self.assertEqual(it["id"], it["isin"])
            self.assertIn(it["type"], ("stock", "etf"))
            self.assertIsInstance(it["symbol"], str)
            self.assertRegex(it["symbol"], r"^[A-Z0-9][A-Z0-9.\-]*$")
            self.assertIsInstance(it["name"], str)
            self.assertTrue(it["name"].strip())
            self.assertIsInstance(it["currency"], str)
            self.assertEqual(SUFFIX_CURRENCY[symbol_suffix(it["symbol"])], it["currency"], it["symbol"])
            self.assertIsInstance(it["aliases"], list)
            for a in it["aliases"]:
                self.assertIsInstance(a, str)
                self.assertTrue(a.strip())
                self.assertNotEqual(a.casefold(), it["name"].casefold())
            self.assertTrue(it["wikipedia"] is None or (isinstance(it["wikipedia"], str) and it["wikipedia"]))
            if it["type"] == "etf":
                self.assertTrue(it["symbol"].endswith(".DE"), it["symbol"])

    def test_isin_check_digits(self):
        bad = [it["isin"] for it in self.items if not isin_check_digit_ok(it["isin"])]
        self.assertEqual(bad, [])

    def test_unique(self):
        for key in ("id", "isin", "symbol"):
            values = [it[key] for it in self.items]
            dupes = sorted({v for v in values if values.count(v) > 1})
            self.assertEqual(dupes, [], key)

    def test_sorted_by_name(self):
        keys = [(it["name"].casefold(), it["isin"]) for it in self.items]
        self.assertEqual(keys, sorted(keys))

    def test_core_coverage(self):
        ids = {it["isin"] for it in self.items}
        for isin in ("DE0007236101", "DE0007164600", "US0378331005", "US5949181045", "IE00B4L5Y983", "IE00B5BMR087"):
            self.assertIn(isin, ids)
        types = {t: sum(it["type"] == t for it in self.items) for t in ("stock", "etf")}
        self.assertGreaterEqual(types["etf"], 100)
        self.assertGreaterEqual(types["stock"], 400)

    def test_no_single_short_word_aliases(self):
        for it in self.items:
            for a in it["aliases"]:
                if " " not in a and not re.search(r"[A-Z&].*[A-Z&]", a):
                    self.assertGreaterEqual(len(a), 4, (it["name"], a))


if __name__ == "__main__":
    unittest.main()
