"""Static macro calendar. Update yearly from the ECB website (monetary policy meetings)."""

from __future__ import annotations

from datetime import date

# Days the ECB Governing Council announces monetary policy decisions.
ECB_DECISIONS: tuple[date, ...] = (
    date(2026, 2, 5), date(2026, 3, 19), date(2026, 4, 30), date(2026, 6, 11),
    date(2026, 7, 23), date(2026, 9, 10), date(2026, 10, 29), date(2026, 12, 17),
)


def upcoming_ecb(today: date, within_days: int) -> list[date]:
    return [d for d in ECB_DECISIONS if 0 <= (d - today).days <= within_days]
