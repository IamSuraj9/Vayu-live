"""US National Hurricane Center: official tracks and forecasts for the Atlantic, Eastern and Central Pacific.
Free US government data, no key."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

CURRENT = "https://www.nhc.noaa.gov/CurrentStorms.json"
BTK = "https://ftp.nhc.noaa.gov/atcf/btk/b{id}.dat"
FST = "https://ftp.nhc.noaa.gov/atcf/fst/{id}.fst"


def _ll(s: str) -> float:
    v = int(s[:-1]) / 10
    return -v if s[-1] in "SW" else v


def _t(s: str) -> datetime:
    return datetime.strptime(s.strip(), "%Y%m%d%H").replace(tzinfo=timezone.utc)


def parse_current(data: bytes) -> list[dict]:
    d = json.loads(data)
    return [{"id": s["id"], "name": s["name"], "classification": s.get("classification", ""),
             "kt": int(s["intensity"]) if str(s.get("intensity", "")).isdigit() else None}
            for s in d.get("activeStorms", [])]


def parse_track(text: str) -> list[dict]:
    """ATCF b-deck: one row per wind-radius band, so keep one point per time."""
    pts = {}
    for line in text.splitlines():
        c = [x.strip() for x in line.split(",")]
        if len(c) < 10 or c[4] != "BEST":
            continue
        t = _t(c[2])
        pts[t] = {"t": t, "lat": _ll(c[6]), "lon": _ll(c[7]), "kt": int(c[8]), "hpa": int(c[9]) or None}
    return [pts[k] for k in sorted(pts)]


def parse_forecast(text: str) -> tuple[datetime | None, list[dict]]:
    issued, pts = None, {}
    for line in text.splitlines():
        c = [x.strip() for x in line.split(",")]
        if len(c) < 9 or c[4] != "OFCL":
            continue
        issued = _t(c[2])
        h = int(c[5])
        pts[h] = {"h": h, "lat": _ll(c[6]), "lon": _ll(c[7]), "kt": int(c[8])}
    valid = [pts[h] for h in sorted(pts) if h > 0]
    # The fst file is issued at the synoptic time; the advisory itself goes out 3 hours later.
    return (issued + timedelta(hours=3) if issued else None), valid
