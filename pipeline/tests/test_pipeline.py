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


class DamagedSourcesTest(unittest.TestCase):
    """Found by fuzzing: valid but surprising responses used to crash a whole run."""

    def build_with(self, replace: dict):
        class Damaged(FixtureFetcher):
            def get(self, url):
                for key, body in replace.items():
                    if key in url:
                        return body
                return super().get(url)
        return storms.build(Damaged(fixture_routes(FIX)), NOW)

    def test_json_of_the_wrong_shape(self):
        for body in (b"[]", b"null", b"123", b'"text"', b"{}", b"[null, null]"):
            r = self.build_with({"CurrentStorms.json": body, "getepisodedata": body, "gettimeline": body})
            self.assertEqual(len(r["storms"]), 3, body)  # NOAA tcvitals still delivers every storm

    def test_xml_with_a_corrupted_header(self):
        r = self.build_with({"rss.xml": b'<?xml version="1.0" encoding="utf-Z"?><rss/>'})
        self.assertFalse(r["sources"]["gdacs"]["ok"])
        self.assertEqual(len(r["storms"]), 3)

    def test_pages_and_garbage_instead_of_data(self):
        for body in (b"<html><h1>502 Bad Gateway</h1></html>", b"", b"\x00\xff\xfe" * 50):
            r = self.build_with({"CurrentStorms.json": body, "rss.xml": body, "syndata.tcvitals": body})
            self.assertIsInstance(r["storms"], list)  # may be empty, must not raise

    def test_a_damaged_previous_file_is_ignored_not_fatal(self):
        base = storms.build(FixtureFetcher(fixture_routes(FIX)), NOW)
        for previous in ([], None, "text", {"storms": "x"}, {"storms": [1, "a", None, {"id": 3}]},
                         {"storms": [{"id": "x", "name": "A", "track": None}]}, {"storms": [{"id": "x", "name": "A", "track": [{"t": "bad"}]}]}):
            r = storms.build(FixtureFetcher(fixture_routes(FIX), fail=("gdacs.org", "nomads", "nhc.noaa.gov")), NOW, previous=previous)
            self.assertIsInstance(r["storms"], list, previous)
        self.assertEqual(len(base["storms"]), 3)

    def test_nan_and_impossible_numbers_never_reach_the_file(self):
        import copy
        first = storms.build(FixtureFetcher(fixture_routes(FIX)), NOW)
        prev = copy.deepcopy(first)
        prev["storms"][0]["track"][-1].update(lat=1e99, kt=float("nan"))
        prev["storms"][1]["track"][0].update(lon=float("inf"), hpa="x")
        prev["storms"][1]["people"] = {"count": float("nan"), "alert": 1, "modified": None}
        prev["storms"][2]["authority"] = float("nan")
        r = storms.build(FixtureFetcher(fixture_routes(FIX), fail=("gdacs.org", "nomads", "nhc.noaa.gov")), NOW, previous=prev)
        json.dumps(r, allow_nan=False)  # raises if a NaN or infinity slipped through
        for s in r["storms"]:
            for p in s["track"] + s["forecast"]:
                self.assertTrue(-90 <= p["lat"] <= 90 and -180 <= p["lon"] <= 360, p)
                self.assertTrue(p["kt"] is None or 0 <= p["kt"] <= 250, p)

    def test_nan_and_inf_in_an_agency_response_are_dropped(self):
        raw = read("gdacs", "timeline_816793_in-fa.json")
        for damaged in (raw.replace(b'"latitude": "12"', b'"latitude": "nan"', 1), raw.replace(b'"longitude": "165"', b'"longitude": "inf"', 1),
                        raw.replace(b'"wind_speed": "30.864"', b'"wind_speed": "inf"', 1), raw.replace(b'"wind_speed": "30.864"', b'"wind_speed": "nan"', 1)):
            self.assertNotEqual(damaged, raw)
            r = self.build_with({"gettimeline?id=816793": damaged})
            json.dumps(r, allow_nan=False)  # raises if a NaN or infinity slipped through
            self.assertEqual(len(r["storms"]), 3)
            for s in r["storms"]:
                for p in s["track"] + s["forecast"]:
                    self.assertTrue(-90 <= p["lat"] <= 90 and -180 <= p["lon"] <= 360, p)

    def test_an_unforeseen_error_in_one_source_does_not_stop_the_run(self):
        from unittest import mock
        with mock.patch.object(storms, "_gdacs", side_effect=RuntimeError("boom")):
            r = storms.build(FixtureFetcher(fixture_routes(FIX)), NOW)
        self.assertFalse(r["sources"]["gdacs"]["ok"])
        self.assertIn("boom", r["sources"]["gdacs"]["error"])
        self.assertTrue(r["sources"]["nhc"]["ok"] and r["sources"]["tcvitals"]["ok"])
        self.assertEqual(len(r["storms"]), 3)


class BudgetTest(unittest.TestCase):
    def test_a_spent_budget_fails_at_once_without_touching_the_network(self):
        from unittest import mock

        from pipeline.fetch import FetchError, HttpFetcher
        f = HttpFetcher(timeout=30, retries=3, backoff=1)
        with mock.patch("urllib.request.urlopen", side_effect=AssertionError("must not be called")) as urlopen:
            with f.budget(0):
                with self.assertRaises(FetchError) as ctx:
                    f.get("https://example.invalid/slow")
            urlopen.assert_not_called()
        self.assertIn("time budget", str(ctx.exception))

    def test_each_attempt_is_cut_to_the_time_left(self):
        import urllib.error
        from unittest import mock

        from pipeline.fetch import FetchError, HttpFetcher
        f = HttpFetcher(timeout=30, retries=2, backoff=0)
        seen = []

        def slow(req, timeout):
            seen.append(timeout)
            raise urllib.error.URLError("slow")
        with mock.patch("urllib.request.urlopen", side_effect=slow):
            with f.budget(5):
                with self.assertRaises(FetchError):
                    f.get("https://example.invalid/slow")
        self.assertTrue(all(t <= 5 for t in seen), seen)  # never the full 30 s

    def test_a_slow_source_does_not_stop_the_others(self):
        # GDACS takes too long, so it fails by itself; NHC and NOAA still deliver every storm
        r = storms.build(FixtureFetcher(fixture_routes(FIX), fail=("gdacs.org",)), NOW)
        self.assertFalse(r["sources"]["gdacs"]["ok"])
        self.assertTrue(r["sources"]["tcvitals"]["ok"] and r["sources"]["nhc"]["ok"])
        self.assertEqual(len(r["storms"]), 3)


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
