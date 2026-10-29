"""Tests for the wind field builder on the saved GFS file (data/fixtures/2026-10-29/gfs). Run: python -m unittest -v"""
from __future__ import annotations

import base64
import importlib.util
import os
import unittest
from datetime import datetime, timezone

from pipeline import wind
from pipeline.fetch import FixtureFetcher

FIX = os.path.join(os.path.dirname(__file__), "..", "..", "data", "fixtures", "2026-10-29")
GRIB = os.path.join(FIX, "gfs", "gfs_2026102900.grb2")
NOW = datetime(2026, 10, 29, 8, 30, tzinfo=timezone.utc)
HAS_ECCODES = all(importlib.util.find_spec(m) for m in ("eccodes", "numpy"))


class FetchTest(unittest.TestCase):
    def test_falls_back_to_an_older_cycle(self):
        routes = {"gfs.20261029%2F06%2F": os.path.join(FIX, "gdacs", "rss.xml"),  # NOMADS answers 200 with an error page
                  "gfs.20261029%2F00%2F": GRIB}
        fetcher = FixtureFetcher(routes)
        data, url = wind.fetch(fetcher, NOW)
        self.assertEqual(data[:4], b"GRIB")
        self.assertIn("gfs.t00z.pgrb2full.0p50.f000", url)
        self.assertEqual(len(fetcher.requested), 2)


@unittest.skipUnless(HAS_ECCODES, "needs eccodes and numpy (pip install eccodes numpy)")
class EncodeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(GRIB, "rb") as fh:
            cls.fields, grid = wind.decode_grib(fh.read())
        cls.doc = wind.encode(cls.fields, dict(grid))

    def value(self, key, lat, lon):
        g = self.doc["grid"]
        j, i = round((g["la1"] - lat) / g["dy"]), round(((lon - g["lo1"]) % 360) / g["dx"])
        b = base64.b64decode(self.doc[key])[j * g["ni"] + i]
        q = b - 256 if b > 127 else b
        scale, offset = self.doc["scale"][key]
        return q / scale + offset, float(self.fields[key][j, i])

    def test_grid_and_time(self):
        g = self.doc["grid"]
        self.assertEqual((g["ni"], g["nj"], g["dx"]), (360, 181, 1.0))
        self.assertEqual(self.doc["time"], "2026-10-29T00:00:00Z")
        self.assertEqual(self.doc["dtype"], "int8")
        for key in "uvtp":
            self.assertEqual(len(base64.b64decode(self.doc[key])), 360 * 181)

    def test_values_survive_the_byte_encoding(self):
        for lat, lon in [(16, 155), (19, 82), (21, -108), (-40, 10)]:
            u, raw_u = self.value("u", lat, lon)
            self.assertAlmostEqual(u, raw_u, delta=0.26)
            t, raw_t = self.value("t", lat, lon)
            self.assertAlmostEqual(t, raw_t, delta=0.51)
            p, raw_p = self.value("p", lat, lon)
            self.assertAlmostEqual(p, raw_p, delta=51)

    def test_coarse_file_is_every_other_point(self):
        import numpy as np
        fine = {k: np.arange(8 * 6, dtype=float).reshape(6, 8) for k in "uvtp"}
        sub, g = wind.coarsen(fine, {"lo1": 0, "la1": 90, "dx": 0.5, "dy": 0.5, "ni": 8, "nj": 6})
        self.assertEqual((g["ni"], g["nj"], g["dx"], g["dy"]), (4, 3, 1.0, 1.0))
        self.assertEqual(sub["u"][1, 1], fine["u"][2, 2])

    def test_main_writes_the_file(self):
        import json
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            out, coarse = os.path.join(d, "wind.json"), os.path.join(d, "wind-1.json")
            self.assertEqual(wind.main(["--out", out, "--coarse-out", coarse, "--grib", GRIB]), 0)
            with open(out) as fh:
                self.assertEqual(json.load(fh)["source"], wind.SOURCE)
            with open(coarse) as fh:
                self.assertEqual(json.load(fh)["grid"]["ni"], 360)  # the fixture is already 1°


if __name__ == "__main__":
    unittest.main()
