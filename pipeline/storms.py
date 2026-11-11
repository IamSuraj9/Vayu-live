"""Build storms.json from free public sources.

Sources, in order of authority:
  1. NHC (US National Hurricane Center): official track and forecast for the Atlantic, Eastern and Central Pacific.
  2. GDACS (EU JRC and UN OCHA): past track, forecast and people affected, worldwide (JTWC data for most oceans).
  3. NOAA/NCEP tcvitals: the newest position, pressure and wind for every storm JTWC and NHC are tracking.
The previous run's file fills in history and stands in, marked as stale, when a source fails or a storm
this run could not be read. A storm stays until its newest report is older than 36 hours.

Usage:
  python -m pipeline.storms --out app/public/data/storms.json
  python -m pipeline.storms --out /tmp/storms.json --fixtures data/fixtures/2026-10-29 --now 2026-10-29T08:30:00Z
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

from . import regions
from .fetch import FetchError, FixtureFetcher, HttpFetcher, fixture_routes
from .sources import gdacs, nhc, tcvitals

KEEP_HOURS = 36  # drop storms whose newest report is older than this
ACTIVE_HOURS = 12  # newer than this is "active", older is "ended"
GDACS_LOOKBACK_HOURS = 48  # only open GDACS events updated this recently
MATCH_KM = 1500  # the same name within this distance is the same storm
FORECAST_MAX_AGE_HOURS = 24  # a forecast older than this (versus the newest position) is not shown
# Seconds each source may take in total. A slow source fails on its own and the previous run fills in for it,
# so a whole refresh stays under about 3 minutes (it used to wait on GDACS for up to 5).
BUDGET_SECONDS = {"nhc": 40, "gdacs": 80, "tcvitals": 50}

# What a damaged or surprising response can raise while it is being read. LookupError covers KeyError and IndexError
# and also "unknown encoding" from a corrupted XML header; AttributeError covers valid JSON of the wrong shape;
# ArithmeticError covers OverflowError from a number written as "inf".
SOURCE_ERRORS = (FetchError, ET.ParseError, ValueError, LookupError, TypeError, AttributeError, ArithmeticError, json.JSONDecodeError)


def iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def from_iso(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(a)))


def norm(name: str) -> str:
    return "".join(ch for ch in name.upper() if ch.isalnum())


def display_name(name: str, code: str | None, invest: bool) -> str:
    if invest or norm(name) in ("INVEST", ""):
        return f"Invest {code}" if code else "Disturbance"
    return name.strip().capitalize()  # IN-FA -> In-fa


class Merge:
    def __init__(self) -> None:
        self.storms: list[dict] = []

    def find(self, *, atcf: str | None = None, gdacs_event: int | None = None, name: str | None = None,
             lat: float | None = None, lon: float | None = None) -> dict | None:
        for s in self.storms:
            if atcf and s["atcf"] == atcf:
                return s
            if gdacs_event and s["gdacs"] == gdacs_event:
                return s
        if name and norm(name) not in ("INVEST", ""):
            for s in self.storms:
                if s["norm"] == norm(name):
                    last = s["track"][max(s["track"])]
                    if lat is None or km(last["lat"], last["lon"], lat, lon) < MATCH_KM:
                        return s
        return None

    def add(self, **kw) -> dict:
        s = {"atcf": None, "gdacs": None, "code": None, "invest": False, "forecast": [], "issued": None, "fc_base": None,
             "people": None, "sources": [], "source_url": None, "region": None, "letter": None, "stale": False, **kw}
        s["norm"] = norm(s["name"])
        s["track"] = {p["t"]: p for p in kw.get("track", [])}
        self.storms.append(s)
        return s


def _nhc(merge: Merge, fetcher, status: dict) -> None:
    try:
        current = nhc.parse_current(fetcher.get(nhc.CURRENT))
    except SOURCE_ERRORS as e:
        status["nhc"] = {"ok": False, "error": str(e)[:300]}
        return
    errors = []
    for s in current:
        sid = s["id"].lower()
        try:
            track = nhc.parse_track(fetcher.get(nhc.BTK.format(id=sid)).decode("ascii", "replace"))
        except SOURCE_ERRORS as e:
            errors.append(f"{sid} track: {e}")
            continue
        try:
            issued, fc = nhc.parse_forecast(fetcher.get(nhc.FST.format(id=sid)).decode("ascii", "replace"))
        except SOURCE_ERRORS as e:
            errors.append(f"{sid} forecast: {e}")
            issued, fc = None, []
        if not track:
            errors.append(f"{sid} track: empty")
            continue
        last = track[-1]
        merge.add(id=sid, atcf=sid, name=s["name"], invest=int(sid[2:4]) >= 90, track=track, forecast=fc, issued=issued,
                  fc_base=issued - timedelta(hours=3) if issued else None,
                  region=regions.region(last["lat"], last["lon"], sid[:2]), sources=["NHC"],
                  source_url="https://www.nhc.noaa.gov/", authority="NHC")
    # Parsing the storm list is not a success when a listed storm's track or forecast failed.
    status["nhc"] = {"ok": not errors, "storms": len(current), "errors": errors}


def _gdacs(merge: Merge, fetcher, now: datetime, status: dict) -> None:
    try:
        events = gdacs.parse_rss(fetcher.get(gdacs.RSS))
    except SOURCE_ERRORS as e:
        status["gdacs"] = {"ok": False, "error": str(e)[:300]}
        return
    recent = [e for e in events if e["todate"] and now - e["todate"] <= timedelta(hours=GDACS_LOOKBACK_HOURS)]
    errors, used = [], 0
    for ev in recent:
        try:
            tl = gdacs.timeline_url(fetcher.get(gdacs.EPISODE.format(e=ev["eventid"], p=ev["episodeid"])))
            if not tl:
                raise FetchError("episode has no timeline")
            agency, url = tl
            parsed = gdacs.parse_timeline(fetcher.get(url))
        except SOURCE_ERRORS as e:
            errors.append(f"{ev['eventname']}: {str(e)[:200]}")
            continue
        if not parsed["track"]:
            errors.append(f"{ev['eventname']}: empty track")
            continue
        used += 1
        last = parsed["track"][-1]
        people = {"count": ev["people"], "alert": ev["alert"], "modified": ev["modified"]}
        existing = merge.find(gdacs_event=ev["eventid"], name=ev["name"], lat=last["lat"], lon=last["lon"])
        if existing:  # an NHC storm: NHC stays the authority, GDACS adds the people estimate
            existing.update(gdacs=ev["eventid"], people=people)
            continue
        agency_name = "JTWC" if agency.upper() == "JTWC" else ("NHC" if agency.upper() in ("NOAA", "NHC") else agency)
        merge.add(id=f"gdacs-{ev['eventid']}", gdacs=ev["eventid"], name=ev["name"], track=parsed["track"],
                  forecast=parsed["forecast"], issued=parsed["analysis"], fc_base=parsed["analysis"], people=people,
                  region=regions.region(last["lat"], last["lon"]), sources=[f"{agency_name} via GDACS"],
                  source_url=gdacs.REPORT.format(e=ev["eventid"]), authority=agency_name)
    # One working event, or fewer errors than events, still left the failed storms out.
    # The source is ok only when every recent event was read.
    status["gdacs"] = {"ok": not errors and used == len(recent), "events": len(recent), "used": used, "errors": errors}


def _tcvitals(merge: Merge, fetcher, now: datetime, status: dict) -> None:
    try:
        cycle, vitals, url = tcvitals.fetch(fetcher, now)
    except SOURCE_ERRORS as e:
        status["tcvitals"] = {"ok": False, "error": str(e)[:300]}
        return
    for v in vitals:
        basin = regions.LETTER_BASIN.get(v["letter"], "xx")
        atcf = f"{basin}{v['number']:02d}{v['t'].year}"
        point = {"t": v["t"], "lat": v["lat"], "lon": v["lon"], "kt": v["kt"], "hpa": v["hpa"]}
        s = merge.find(atcf=atcf, name=None if v["invest"] else v["name"], lat=v["lat"], lon=v["lon"])
        if s is None:
            s = merge.add(id=atcf, atcf=atcf, name=v["name"], code=v["code"], invest=v["invest"], track=[],
                          region=regions.region(v["lat"], v["lon"], basin, v["letter"]), letter=v["letter"],
                          sources=[], source_url=url, authority=v["center"])
        else:
            if s["id"].startswith("gdacs-"):
                s["id"] = atcf
            s["atcf"] = s["atcf"] or atcf
            if v["letter"] in ("A", "B"):  # the storm number says which side of India it is on
                s["region"] = regions.region(v["lat"], v["lon"], basin, v["letter"])
        s["code"] = v["code"]
        s["invest"] = s["invest"] or v["invest"]
        if v["kt"] is not None and (v["t"] not in s["track"] or s["track"][v["t"]].get("hpa") is None):
            merged = {**s["track"].get(v["t"], {}), **{k: val for k, val in point.items() if val is not None}}
            s["track"][v["t"]] = merged
            if "NOAA tcvitals" not in s["sources"]:
                s["sources"].append("NOAA tcvitals")
    status["tcvitals"] = {"ok": True, "cycle": iso(cycle), "storms": len(vitals), "url": url}


def _carry_previous(merge: Merge, previous: dict | None, now: datetime) -> None:
    """Adds history from the last run, and keeps a storm this run failed to read or no longer returned.

    The file is our own, but it may be damaged, so anything unusable is skipped. A storm is copied
    forward until its newest report is older than KEEP_HOURS, whether or not a whole source failed.
    """
    if not isinstance(previous, dict) or not isinstance(previous.get("storms"), list):
        return
    for p in previous["storms"]:
        try:
            _carry_one(merge, p, now)
        except SOURCE_ERRORS:
            continue


def _carry_one(merge: Merge, p: dict, now: datetime) -> None:
    track = [{**pt, "t": from_iso(pt["t"])} for pt in p.get("track") or []]
    if not track:
        return
    codes = p.get("codes") or {}
    last = track[-1]
    s = merge.find(atcf=codes.get("atcf"), gdacs_event=codes.get("gdacs"), name=None if p.get("kind") == "disturbance" else p["name"],
                   lat=last["lat"], lon=last["lon"])
    if s:  # keep history the sources no longer show
        for pt in track:
            s["track"].setdefault(pt["t"], pt)
        if s["id"].startswith("gdacs-") and codes.get("atcf"):
            s["id"] = s["atcf"] = codes["atcf"]
        if s["people"] is None and _people(p.get("people")):
            s["people"] = p["people"]
    elif now - last["t"] <= timedelta(hours=KEEP_HOURS):
        fc_issued = from_iso(p["forecastIssued"]) if p.get("forecastIssued") else None
        fc_base = from_iso(p["forecastBase"]) if p.get("forecastBase") else None
        merge.add(id=p["id"], atcf=codes.get("atcf"), gdacs=codes.get("gdacs"), name=p.get("rawName") or p["name"],
                  code=codes.get("code"), invest=p.get("kind") == "disturbance", track=track, forecast=p.get("forecast", []),
                  issued=fc_issued, fc_base=fc_base, people=_people(p.get("people")), region=p.get("basin"), sources=[str(p.get("source", ""))],
                  source_url=p.get("sourceUrl"), authority=p.get("authority") if isinstance(p.get("authority"), str) else "", stale=True)


def _finish(s: dict, now: datetime) -> dict:
    pts = [s["track"][k] for k in sorted(s["track"])]
    last = pts[-1]
    age = now - last["t"]
    region = s["region"] or regions.region(last["lat"], last["lon"])
    # Forecast hours count from the newest position; points already in the past and stale forecasts are dropped
    forecast, base = [], last["t"]
    if s["fc_base"] and last["t"] - s["fc_base"] <= timedelta(hours=FORECAST_MAX_AGE_HOURS):
        shift = int((last["t"] - s["fc_base"]).total_seconds() // 3600)
        forecast = [{**f, "h": f["h"] - shift} for f in s["forecast"] if f["h"] - shift > 0]
    track_out = []
    for p in pts:
        q = {"t": iso(p["t"]), "lat": round(p["lat"], 2), "lon": round(p["lon"], 2), "kt": p["kt"]}
        if p.get("hpa"):
            q["hpa"] = p["hpa"]
        track_out.append(q)
    return {
        "id": s["id"],
        "name": display_name(s["name"], s["code"], s["invest"]),
        "rawName": s["name"],
        "kind": regions.kind(region, s["invest"]),
        "basin": region,
        "status": "active" if age <= timedelta(hours=ACTIVE_HOURS) else "ended",
        "stale": s["stale"],
        "updated": iso(last["t"]),
        "track": track_out,
        "forecast": forecast,
        "forecastIssued": (iso(s["issued"]) if isinstance(s["issued"], datetime) else s["issued"]) if forecast else None,
        "forecastBase": iso(base) if forecast else None,
        "source": " + ".join(s["sources"]) or "NOAA tcvitals",
        "sourceUrl": s["source_url"],
        "authority": s.get("authority", ""),
        "official": regions.official(region),
        "windAvg": "1-minute",
        "people": s["people"],
        "codes": {"atcf": s["atcf"], "gdacs": s["gdacs"], "code": s["code"]},
    }


def _num(v, lo: float, hi: float) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and lo <= v <= hi


def _sane(p: object, forecast: bool = False) -> bool:
    """Is this track or forecast point something the app can draw? Rejects NaN, text, and impossible positions or winds."""
    if not isinstance(p, dict) or not (_num(p.get("lat"), -90, 90) and _num(p.get("lon"), -180, 360)):
        return False
    if p.get("kt") is not None and not _num(p["kt"], 0, 250):
        return False
    return _num(p.get("h"), 0, 400) if forecast else True


def _sanitize(s: dict) -> None:
    """Drops unusable points before a storm is written, whichever source (or the previous file) they came from."""
    s["track"] = {t: p for t, p in s["track"].items() if _sane(p)}
    for p in s["track"].values():
        if p.get("hpa") is not None and not _num(p["hpa"], 800, 1100):
            p.pop("hpa")
    s["forecast"] = [f for f in (s["forecast"] if isinstance(s["forecast"], list) else []) if _sane(f, forecast=True)]


def _people(v: object) -> dict | None:
    ok = isinstance(v, dict) and _num(v.get("count"), 0, 1e10) and isinstance(v.get("alert"), str) and isinstance(v.get("modified"), str)
    return v if ok else None


def _json_safe(o):
    """NaN and infinity are not valid JSON, and the app could not read a file that contains one."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: _json_safe(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_json_safe(v) for v in o]
    return o


def _stage(name: str, status: dict, fetcher, fn, *args) -> None:
    """Runs one source. Whatever goes wrong inside it, the other sources and the previous data still carry the run."""
    try:
        with fetcher.budget(BUDGET_SECONDS[name]):
            fn(*args)
    except Exception as e:  # noqa: BLE001 - a source we cannot read must never stop the refresh
        status[name] = {"ok": False, "error": f"unexpected {type(e).__name__}: {e}"[:300]}


def build(fetcher, now: datetime, previous: dict | None = None) -> dict:
    status: dict[str, dict] = {}
    merge = Merge()
    _stage("nhc", status, fetcher, _nhc, merge, fetcher, status)
    _stage("gdacs", status, fetcher, _gdacs, merge, fetcher, now, status)
    _stage("tcvitals", status, fetcher, _tcvitals, merge, fetcher, now, status)
    _carry_previous(merge, previous, now)
    out = []
    for s in merge.storms:
        _sanitize(s)
        if not s["track"]:
            continue
        newest = max(s["track"])
        if now - newest > timedelta(hours=KEEP_HOURS) or newest > now + timedelta(hours=1):
            continue
        try:
            out.append(_finish(s, now))
        except SOURCE_ERRORS:
            continue  # one storm we cannot make sense of must not cost the others
    out.sort(key=lambda s: (s["status"] != "active", -(s["track"][-1]["kt"] or 0)))
    newest = max((from_iso(s["updated"]) for s in out), default=now)
    return _json_safe({
        "schema": 1,
        "snapshot": iso(newest),
        "fetchedAt": iso(now),
        "sources": status,
        "credits": "Storm data: NOAA/NCEP tcvitals, US National Hurricane Center, GDACS (European Commission JRC, UN OCHA).",
        "storms": out,
    })


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--previous", help="previous storms.json (defaults to --out if it exists)")
    ap.add_argument("--now", help="override the current time, e.g. 2026-10-29T08:30:00Z")
    ap.add_argument("--fixtures", help="serve saved responses from this folder instead of the network")
    args = ap.parse_args(argv)

    now = from_iso(args.now) if args.now else datetime.now(timezone.utc).replace(microsecond=0)
    fetcher = FixtureFetcher(fixture_routes(args.fixtures)) if args.fixtures else HttpFetcher()
    prev_path = args.previous or (args.out if os.path.exists(args.out) else None)
    previous = None
    if prev_path and os.path.exists(prev_path):
        try:
            with open(prev_path) as fh:
                previous = json.load(fh)
        except (OSError, json.JSONDecodeError):
            previous = None

    result = build(fetcher, now, previous)
    ok = [k for k, v in result["sources"].items() if v.get("ok")]
    for k, v in result["sources"].items():
        print(f"{k:9} {'ok    ' if v.get('ok') else 'FAILED'} {json.dumps({x: y for x, y in v.items() if x != 'ok'})[:240]}", file=sys.stderr)
    for s in result["storms"]:
        last = s["track"][-1]
        print(f"  {s['name']:12} {s['basin']:18} {s['status']:6} {last['kt']} kt at {last['lat']},{last['lon']} "
              f"({len(s['track'])} past, {len(s['forecast'])} forecast) {s['source']}", file=sys.stderr)
    if not ok:
        print("Every source failed; keeping the existing file.", file=sys.stderr)
        return 1
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    tmp = args.out + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(result, fh, indent=1, ensure_ascii=False, allow_nan=False)  # a NaN would make the file unreadable for the app
        fh.write("\n")
    os.replace(tmp, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
