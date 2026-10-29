"""NOAA/NCEP tcvitals: the current position, motion, pressure and peak wind of every storm JTWC and NHC are
tracking, all basins, every 6 hours. Free US government data on NOMADS, no key."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

URL = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/gfs.{d}/{h}/atmos/gfs.t{h}z.syndata.tcvitals.tm00"
MS_TO_KT = 1.943844

LINE = re.compile(
    r"^(?P<center>\S+)\s+(?P<code>\d\d[A-Z])\s+(?P<name>.{1,9}?)\s+(?P<date>\d{8})\s+(?P<time>\d{4})\s+"
    r"(?P<lat>\d{1,4}[NS])\s+(?P<lon>\d{1,5}[EW])\s+(?P<dir>-?\d+)\s+(?P<spd>-?\d+)\s+(?P<pc>-?\d+)\s+"
    r"(?P<penv>-?\d+)\s+(?P<renv>-?\d+)\s+(?P<vmax>-?\d+)\s+(?P<rmw>-?\d+)"
)


def cycles(now: datetime, count: int = 4) -> list[datetime]:
    """The most recent 6-hourly cycles, newest first. A cycle's file appears a little after its nominal time."""
    base = now.replace(minute=0, second=0, microsecond=0)
    base -= timedelta(hours=base.hour % 6)
    return [base - timedelta(hours=6 * i) for i in range(count)]


def url_for(cycle: datetime) -> str:
    return URL.format(d=cycle.strftime("%Y%m%d"), h=cycle.strftime("%H"))


def _coord(s: str) -> float:
    v = int(s[:-1]) / 10
    return -v if s[-1] in "SW" else v


def _missing(v: int) -> bool:
    return v <= -99


def parse(text: str) -> list[dict]:
    out = []
    for raw in text.splitlines():
        m = LINE.match(raw.strip())
        if not m:
            continue
        g = m.groupdict()
        code = g["code"]
        number = int(code[:2])
        t = datetime.strptime(g["date"] + g["time"], "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
        vmax = int(g["vmax"])
        kt = None if _missing(vmax) else int(5 * round(vmax * MS_TO_KT / 5))  # agencies report in 5-kt steps
        pc, spd, dr = int(g["pc"]), int(g["spd"]), int(g["dir"])
        out.append({
            "center": g["center"],
            "code": code,
            "letter": code[2],
            "number": number,
            "invest": number >= 90,
            "name": g["name"].strip(),
            "t": t,
            "lat": _coord(g["lat"]),
            "lon": _coord(g["lon"]),
            "kt": kt,
            "hpa": None if _missing(pc) else pc,
            "heading": None if _missing(dr) else dr,
            "speed_ms": None if _missing(spd) else spd / 10,
        })
    return out


def fetch(fetcher, now: datetime) -> tuple[datetime, list[dict], str]:
    """Return (cycle, storms, url) for the newest cycle that is available."""
    from ..fetch import FetchError

    errors = []
    for cycle in cycles(now):
        url = url_for(cycle)
        try:
            return cycle, parse(fetcher.get(url).decode("ascii", "replace")), url
        except FetchError as e:
            errors.append(str(e))
    raise FetchError("no tcvitals cycle available: " + "; ".join(errors))
