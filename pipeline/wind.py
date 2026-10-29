"""Build wind.json, the wind, temperature and pressure field behind the globe, from the NOAA GFS model.

Downloads the newest GFS analysis (f000) at 0.5 degrees through the NOMADS grib filter, which cuts the file down to
four fields: 10 m wind (u, v), 2 m temperature and sea-level pressure. Values are stored as signed bytes in base64:

  value = byte / scale + offset     u, v: m/s (scale 2, so 0.5 m/s steps)    t: K (scale 1, offset 260)
                                    p: Pa (scale 0.01, offset 100000, so 1 hPa steps)

Needs eccodes and numpy (pip install eccodes numpy). The file is about 1.4 MB and is built at deploy time, not committed.

Usage:
  python -m pipeline.wind --out app/public/data/wind.json --coarse-out app/public/data/wind-1.json
  python -m pipeline.wind --out /tmp/wind.json --grib data/fixtures/2026-10-29/gfs/gfs_2026102900.grb2
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from datetime import datetime, timezone

from .fetch import FetchError, HttpFetcher
from .sources.tcvitals import cycles

FILTER = ("https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p50.pl?dir=%2Fgfs.{ymd}%2F{hh}%2Fatmos"
          "&file=gfs.t{hh}z.pgrb2full.0p50.f000&var_UGRD=on&var_VGRD=on&var_TMP=on&var_PRMSL=on"
          "&lev_10_m_above_ground=on&lev_2_m_above_ground=on&lev_mean_sea_level=on")
SCALE = {"u": (2, 0), "v": (2, 0), "t": (1, 260), "p": (0.01, 100000)}
FIELDS = {"10u": "u", "10v": "v", "2t": "t", "prmsl": "p"}
SOURCE = "GFS model, NOAA/NCEP"


def url_for(cycle: datetime) -> str:
    return FILTER.format(ymd=cycle.strftime("%Y%m%d"), hh=cycle.strftime("%H"))


def decode_grib(data: bytes) -> tuple[dict, dict]:
    """Return ({u, v, t, p: 2-D arrays, north row first}, grid) from a GRIB2 file holding the four fields."""
    import eccodes  # imported here so the storm pipeline never needs it

    fields, grid = {}, None
    offset = 0
    while True:
        start = data.find(b"GRIB", offset)
        if start < 0:
            break
        length = int.from_bytes(data[start + 8:start + 16], "big")  # GRIB2 section 0 total length
        h = eccodes.codes_new_from_message(data[start:start + length])
        offset = start + length
        try:
            key = FIELDS.get(eccodes.codes_get(h, "shortName"))
            if not key:
                continue
            ni, nj = eccodes.codes_get(h, "Ni"), eccodes.codes_get(h, "Nj")
            g = {"lo1": eccodes.codes_get(h, "longitudeOfFirstGridPointInDegrees"),
                 "la1": eccodes.codes_get(h, "latitudeOfFirstGridPointInDegrees"),
                 "dx": eccodes.codes_get(h, "iDirectionIncrementInDegrees"),
                 "dy": eccodes.codes_get(h, "jDirectionIncrementInDegrees"), "ni": ni, "nj": nj}
            t = datetime.strptime(f"{eccodes.codes_get(h, 'dataDate')}{eccodes.codes_get(h, 'dataTime'):04d}", "%Y%m%d%H%M")
            g["time"] = t.replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            if grid and g != grid:
                raise ValueError(f"{key} is on a different grid or time")
            grid = g
            fields[key] = eccodes.codes_get_values(h).reshape(nj, ni)
        finally:
            eccodes.codes_release(h)
    missing = set(SCALE) - set(fields)
    if missing:
        raise ValueError(f"GRIB file is missing {', '.join(sorted(missing))}")
    return fields, grid


def encode(fields: dict, grid: dict) -> dict:
    import numpy as np

    out = {"schema": 1, "source": SOURCE, "time": grid.pop("time"), "grid": grid, "dtype": "int8",
           "scale": {k: list(v) for k, v in SCALE.items()}}
    for key, (scale, offset) in SCALE.items():
        q = np.clip(np.round((fields[key] - offset) * scale), -128, 127).astype("i1")
        out[key] = base64.b64encode(q.tobytes()).decode()
    return out


def coarsen(fields: dict, grid: dict, degrees: float = 1.0) -> tuple[dict, dict]:
    """Every n-th point, for a smaller file that loads fast on phones (0.5° -> 1° is a quarter of the size)."""
    n = max(1, round(degrees / grid["dx"]))
    sub = {k: v[::n, ::n] for k, v in fields.items()}
    nj, ni = sub["u"].shape
    return sub, {**grid, "dx": grid["dx"] * n, "dy": grid["dy"] * n, "ni": ni, "nj": nj}


def write(doc: dict, path: str, url: str) -> None:
    tmp = path + ".tmp"
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(tmp, "w") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    os.replace(tmp, path)
    g = doc["grid"]
    print(f"wind: {doc['time']} {g['ni']}x{g['nj']} from {url} -> {path} ({os.path.getsize(path) // 1024} KB)")


def fetch(fetcher, now: datetime) -> tuple[bytes, str]:
    errors = []
    for cycle in cycles(now):
        url = url_for(cycle)
        try:
            data = fetcher.get(url)
        except FetchError as e:
            errors.append(str(e))
            continue
        if data[:4] == b"GRIB":
            return data, url
        errors.append(f"{url}: not a GRIB file (cycle not published yet?)")
    raise FetchError("; ".join(errors) or "no GFS cycle found")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--coarse-out", help="also write a 1° version here (loads first on phones)")
    ap.add_argument("--grib", help="read this GRIB2 file instead of downloading")
    ap.add_argument("--now", help="override the current time, e.g. 2026-10-29T08:30:00Z")
    args = ap.parse_args(argv)
    now = datetime.strptime(args.now, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) if args.now else datetime.now(timezone.utc)
    try:
        if args.grib:
            with open(args.grib, "rb") as fh:
                data, url = fh.read(), args.grib
        else:
            data, url = fetch(HttpFetcher(timeout=90), now)
        fields, grid = decode_grib(data)
        docs = [(encode(fields, dict(grid)), args.out)]
        if args.coarse_out:
            docs.append((encode(*coarsen(fields, grid)), args.coarse_out))
    except (FetchError, ValueError, OSError) as e:
        print(f"wind: failed, keeping any existing file: {e}", file=sys.stderr)
        return 1
    for doc, path in docs:
        write(doc, path, url)
    return 0


if __name__ == "__main__":
    sys.exit(main())
