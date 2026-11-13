"""Sommer-/Winterzeit: Versatz je Zeitzone zum Zeitpunkt des Wetterlaufs."""

from __future__ import annotations

import unittest
from datetime import datetime

import numpy as np

from pipeline.geonames import utc_offset_hours
from pipeline.gfs import offsets_at


class OffsetTest(unittest.TestCase):
    def test_daylight_saving(self):
        cases = [
            ("Europe/Berlin", datetime(2026, 1, 15, 12), 1),
            ("Europe/Berlin", datetime(2026, 7, 15, 12), 2),
            ("America/New_York", datetime(2026, 1, 15, 12), -5),
            ("America/New_York", datetime(2026, 7, 15, 12), -4),
            ("Pacific/Auckland", datetime(2026, 1, 15, 12), 13),
            ("Pacific/Auckland", datetime(2026, 7, 15, 12), 12),
            ("Asia/Tokyo", datetime(2026, 7, 15, 12), 9),
            ("Asia/Kolkata", datetime(2026, 7, 15, 12), 6),  # +5:30 gerundet
        ]
        for zone, when, expected in cases:
            with self.subTest(zone=zone, when=when):
                self.assertEqual(utc_offset_hours(zone, when), expected)

    def test_offsets_at_uses_fallback_without_zone(self):
        out = offsets_at(datetime(2026, 7, 15, 0), ["Europe/Berlin", None, "Unbekannt/Zone"], np.array([1, 5, 3]))
        self.assertEqual(out.tolist(), [2, 5, 3])


if __name__ == "__main__":
    unittest.main()
