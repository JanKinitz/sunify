"""Tests der Tagesauswertung (python -m unittest discover -s pipeline/tests -t .)."""

from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta

import numpy as np

from pipeline.daily import Daily, aggregate_gfs, extend_back

# GFS: stündlich bis 120 h, danach 3-stündlich bis 384 h
LEAD = np.concatenate([np.arange(0, 121), np.arange(123, 385, 3)]).astype(float)


def run(init: datetime, offsets: list[int]):
    L, P = len(LEAD), len(offsets)
    one = np.ones((L, P), dtype=np.float32)
    return aggregate_gfs(init, LEAD, np.array(offsets), one * 10, one * 5, one * 0, one, one, one * 50, one * 100, None)


class StartDateTest(unittest.TestCase):
    """Erster Tag = erster lokaler Kalendertag mit mindestens 18 Std. Daten – in jeder Zeitzone."""

    CASES = [
        # (Init UTC, Offset, erwarteter erster Tag)
        (datetime(2026, 11, 13, 12), 13, date(2026, 11, 14)),  # Neuseeland: 01:00 am 14. -> 23 h
        (datetime(2026, 11, 13, 18), 13, date(2026, 11, 15)),  # Neuseeland: 07:00 am 14. -> 17 h, also der 15.
        (datetime(2026, 11, 13, 0), 13, date(2026, 11, 14)),   # Neuseeland: 13:00 am 13. -> 11 h, also der 14.
        (datetime(2026, 11, 13, 12), 1, date(2026, 11, 14)),   # Berlin: 13:00 am 13. -> 11 h
        (datetime(2026, 11, 13, 0), 1, date(2026, 11, 13)),    # Berlin: 01:00 am 13. -> 23 h
        (datetime(2026, 11, 13, 0), -5, date(2026, 11, 13)),   # New York: 19:00 am 12. -> 5 h, also der 13.
        (datetime(2026, 11, 13, 0), -10, date(2026, 11, 13)),  # Hawaii: 14:00 am 12. -> 10 h, also der 13.
        (datetime(2026, 11, 13, 12), -10, date(2026, 11, 13)), # Hawaii: 02:00 am 13. -> 22 h
        (datetime(2026, 11, 13, 18), 9, date(2026, 11, 14)),   # Tokio: 03:00 am 14. -> 21 h
    ]

    def test_start_dates(self):
        for init, offset, expected in self.CASES:
            with self.subTest(init=init, offset=offset):
                (daily,) = run(init, [offset])
                self.assertIsNotNone(daily)
                self.assertEqual(daily.start_date, expected)

    def test_sixteen_days_max(self):
        (daily,) = run(datetime(2026, 11, 13, 0), [1])
        self.assertLessEqual(len(daily.temp_max), 16)
        self.assertGreaterEqual(len(daily.temp_max), 14)


class AllZonesTest(unittest.TestCase):
    """Jeder Tageswert gehört zum richtigen lokalen Kalendertag – alle Zeitzonen UTC−12 … UTC+14, alle vier Läufe."""

    def test_every_value_on_its_local_day(self):
        offsets = np.arange(-12, 15)
        ref = date(2026, 11, 1)
        for hour in (0, 6, 12, 18):
            init = datetime(2026, 11, 13, hour)
            # Wert je Zeitschritt = Nummer des lokalen Kalendertags in der Intervallmitte
            values = np.zeros((len(LEAD), len(offsets)), dtype=np.float32)
            for i in range(1, len(LEAD)):
                mid = (LEAD[i - 1] + LEAD[i]) / 2
                for j, off in enumerate(offsets):
                    values[i, j] = ((init + timedelta(hours=float(mid) + int(off))).date() - ref).days
            one = np.ones_like(values)
            out = aggregate_gfs(init, LEAD, offsets, values, values, one * 0, one, one, one * 50, one * 100, None)
            for off, daily in zip(offsets, out):
                for k, v in enumerate(daily.temp_max):
                    expected = (daily.start_date + timedelta(days=k) - ref).days
                    self.assertEqual(v, expected, f"{hour:02d}Z, UTC{int(off):+d}, Tag {k}")


def _daily(start: date, temps: list[float]) -> Daily:
    n = len(temps)
    return Daily(start, temps, [0.0] * n, [0.0] * n, [0.0] * n, [0.0] * n, [0] * n, [None] * n)


class ExtendBackTest(unittest.TestCase):
    def test_keeps_today_from_previous_run(self):
        old = _daily(date(2026, 11, 13), [1, 2, 3, 4])
        new = _daily(date(2026, 11, 14), [20, 30, 40])
        out = extend_back(old, new)
        self.assertEqual(out.start_date, date(2026, 11, 13))
        self.assertEqual(out.temp_max, [1, 20, 30, 40])  # nur der 13. aus dem alten Lauf

    def test_no_gap_allowed(self):
        old = _daily(date(2026, 11, 10), [1, 2])  # endet am 11., neuer Lauf beginnt am 14.
        new = _daily(date(2026, 11, 14), [20])
        self.assertEqual(extend_back(old, new).start_date, date(2026, 11, 14))

    def test_newer_starts_earlier(self):
        old = _daily(date(2026, 11, 14), [1])
        new = _daily(date(2026, 11, 13), [20, 30])
        self.assertEqual(extend_back(old, new).temp_max, [20, 30])


if __name__ == "__main__":
    unittest.main()
