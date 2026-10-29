"""Tests run on real responses saved on 29 Oct 2026 (data/fixtures/2026-10-29). Run: python -m unittest -v"""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime, timezone

from pipeline import storms
from pipeline.fetch import FixtureFetcher, fixture_routes
from pipeline.sources import gdacs, nhc, tcvitals

FIX = os.path.join(os.path.dirname(__file__), "..", "..", "data", "fixtures", "2026-10-29")
NOW = datetime(2026, 10, 29, 8, 30, tzinfo=timezone.utc)


def read(*p: str) -> bytes:
    with open(os.path.join(FIX, *p), "rb") as fh:
        return fh.read()


def by_id(result: dict) -> dict:
    return {s["id"]: s for s in result["storms"]}


class TcvitalsTest(unittest.TestCase):
    def test_parse_all_basins(self):
        v = {s["name"]: s for s in tcvitals.parse(read("tcvitals", "gfs.t06z.syndata.tcvitals.tm00").decode())}
        self.assertEqual(set(v), {"VANCE", "IN-FA", "ARNAB"})
        infa = v["IN-FA"]
        self.assertEqual((infa["lat"], infa["lon"], infa["kt"], infa["hpa"]), (16.3, 152.9, 120, 945))
        self.assertEqual(infa["t"], datetime(2026, 10, 29, 6, tzinfo=timezone.utc))
        self.assertEqual((v["ARNAB"]["code"], v["ARNAB"]["letter"], v["ARNAB"]["kt"]), ("02B", "B", 25))
        self.assertEqual(v["VANCE"]["lon"], -108.5)
        self.assertFalse(any(s["invest"] for s in v.values()))

    def test_cycles_newest_first(self):
        hours = [c.hour for c in tcvitals.cycles(NOW)]
        self.assertEqual(hours, [6, 0, 18, 12])


class GdacsTest(unittest.TestCase):
    def test_rss_lists_cyclones(self):
        ev = {e["name"]: e for e in gdacs.parse_rss(read("gdacs", "rss.xml"))}
        self.assertIn("IN-FA", ev)
        self.assertEqual((ev["IN-FA"]["eventid"], ev["IN-FA"]["episodeid"]), (1001343, 23))
        self.assertEqual(ev["ARNAB"]["people"], 4007943)

    def test_timeline_track_and_forecast(self):
        tl = gdacs.parse_timeline(read("gdacs", "timeline_816793_in-fa.json"))
        self.assertEqual(len(tl["track"]), 16)
        self.assertEqual(len(tl["forecast"]), 8)
        self.assertEqual(tl["analysis"], datetime(2026, 10, 29, 0, tzinfo=timezone.utc))
        self.assertEqual(tl["track"][0]["kt"], 60)
        self.assertEqual(tl["track"][-1]["kt"], 115)
        last = tl["forecast"][-1]
        self.assertEqual((last["h"], last["lat"], last["lon"], last["kt"]), (120, 22.2, 137.8, 100))

    def test_episode_links_timeline(self):
        agency, url = gdacs.timeline_url(read("gdacs", "episode_1001343_23_in-fa.json"))
        self.assertEqual(agency, "JTWC")
        self.assertIn("gettimeline?id=816793", url)


class NhcTest(unittest.TestCase):
    def test_track_and_forecast(self):
        track = nhc.parse_track(read("nhc", "vance.btk").decode())
        self.assertEqual((track[-1]["lat"], track[-1]["lon"], track[-1]["kt"]), (20.7, -108.4, 30))
        issued, fc = nhc.parse_forecast(read("nhc", "vance.fst").decode())
        self.assertEqual(issued, datetime(2026, 10, 29, 3, tzinfo=timezone.utc))
        self.assertEqual([f["h"] for f in fc], [3, 12, 24, 36])


class BuildTest(unittest.TestCase):
    def fetcher(self, fail=()):
        return FixtureFetcher(fixture_routes(FIX), fail=fail)

    def test_merges_all_sources(self):
        r = storms.build(self.fetcher(), NOW)
        self.assertTrue(all(s["ok"] for s in r["sources"].values()))
        s = by_id(r)
        self.assertEqual(set(s), {"wp302026", "ep222026", "io022026"})  # old events (Champi, Three-C) are left out
        infa, vance, arnab = s["wp302026"], s["ep222026"], s["io022026"]
        self.assertEqual(infa["name"], "In-fa")
        self.assertEqual(infa["track"][-1], {"t": "2026-10-29T06:00:00Z", "lat": 16.3, "lon": 152.9, "kt": 120, "hpa": 945})
        self.assertEqual(infa["kind"], "typhoon")
        self.assertEqual(infa["forecast"][-1]["h"], 114)  # 120 h from 00Z, counted from the 06Z position
        self.assertEqual(arnab["basin"], "Bay of Bengal")
        self.assertEqual(arnab["official"][0], "IMD (India Meteorological Department)")
        self.assertEqual(arnab["people"]["count"], 4007943)
        self.assertEqual(vance["authority"], "NHC")
        self.assertIn("NHC", vance["source"])
        self.assertIsNotNone(vance["people"])  # GDACS adds the people estimate to an NHC storm
        self.assertEqual(r["snapshot"], "2026-10-29T06:00:00Z")

    def test_gdacs_down_still_lists_every_storm(self):
        r = storms.build(self.fetcher(fail=("gdacs.org",)), NOW)
        self.assertFalse(r["sources"]["gdacs"]["ok"])
        s = by_id(r)
        self.assertEqual(set(s), {"wp302026", "ep222026", "io022026"})
        self.assertEqual(len(s["wp302026"]["track"]), 1)  # only the newest position, from NOAA

    def test_previous_run_fills_in_when_sources_fail(self):
        first = storms.build(self.fetcher(), NOW)
        r = storms.build(self.fetcher(fail=("gdacs.org", "nomads.ncep.noaa.gov")), NOW, previous=first)
        s = by_id(r)
        self.assertTrue(s["wp302026"]["stale"])
        self.assertEqual(len(s["wp302026"]["track"]), len(by_id(first)["wp302026"]["track"]))
        self.assertFalse(s["ep222026"]["stale"])  # NHC still answered

    def test_history_is_kept_between_runs(self):
        first = storms.build(self.fetcher(), NOW)
        prev = json.loads(json.dumps(first))
        prev["storms"][0]["track"].insert(0, {"t": "2026-10-24T18:00:00Z", "lat": 11.0, "lon": 166.0, "kt": 45})
        r = storms.build(self.fetcher(), NOW, previous=prev)
        self.assertEqual(by_id(r)[prev["storms"][0]["id"]]["track"][0]["t"], "2026-10-24T18:00:00Z")

    def test_everything_down_keeps_existing_file(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "gdacs"))
            out = os.path.join(d, "storms.json")
            code = storms.main(["--out", out, "--fixtures", d, "--now", "2026-10-29T08:30:00Z"])
            self.assertEqual(code, 1)
            self.assertFalse(os.path.exists(out))

    def test_storms_drop_after_36_hours(self):
        later = datetime(2026, 10, 31, 0, tzinfo=timezone.utc)
        r = storms.build(self.fetcher(fail=("nomads.ncep.noaa.gov",)), later)
        self.assertNotIn("io022026", by_id(r))


if __name__ == "__main__":
    unittest.main()
