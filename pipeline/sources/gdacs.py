"""GDACS (EU Joint Research Centre and UN OCHA): global cyclone alerts with each storm's past track, forecast
track, winds and people affected. Free, no key; reuse allowed with acknowledgement of the source."""
from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

RSS = "https://www.gdacs.org/xml/rss.xml"
EPISODE = "https://www.gdacs.org/gdacsapi/api/events/getepisodedata?eventtype=TC&eventid={e}&episodeid={p}"
REPORT = "https://www.gdacs.org/report.aspx?eventtype=TC&eventid={e}"
MS_TO_KT = 1.943844
NS = {"gdacs": "http://www.gdacs.org", "geo": "http://www.w3.org/2003/01/geo/wgs84_pos#"}


def parse_rss(xml_bytes: bytes) -> list[dict]:
    root = ET.fromstring(xml_bytes)
    out = []
    for it in root.iter("item"):
        if it.findtext("gdacs:eventtype", namespaces=NS) != "TC":
            continue
        g = lambda k: (it.findtext(f"gdacs:{k}", namespaces=NS) or "").strip()  # noqa: E731
        pop = it.find("gdacs:population", NS)
        full = g("eventname")
        out.append({
            "eventid": int(g("eventid")),
            "episodeid": int(g("episodeid")),
            "eventname": full,
            "name": full.rsplit("-", 1)[0] if full[-3:-2] == "-" else full,
            "todate": parsedate_to_datetime(g("todate")).astimezone(timezone.utc) if g("todate") else None,
            "modified": g("datemodified"),
            "alert": g("alertlevel"),
            "people": int(float(pop.attrib.get("value", 0))) if pop is not None else 0,
            "country": g("country"),
        })
    return out


def timeline_url(episode_json: bytes) -> tuple[str, str] | None:
    d = json.loads(episode_json)
    props = d.get("properties", d)
    for imp in props.get("impacts", []) or []:
        url = (imp.get("resource") or {}).get("timeline")
        if url:
            return imp.get("source", ""), url
    return None


def parse_timeline(timeline_json: bytes) -> dict:
    """Past track (actual) and forecast, with the analysis point that separates them."""
    items = json.loads(timeline_json)["channel"]["item"]
    if isinstance(items, dict):
        items = [items]
    past, future = {}, {}
    analysis = None
    for it in items:
        t = datetime.strptime(it["advisory_datetime"], "%d %b %Y %H:%M").replace(tzinfo=timezone.utc)
        ms = float(it.get("wind_speed") or 0)
        pt = {"t": t, "lat": float(it["latitude"]), "lon": float(it["longitude"]),
              "kt": int(5 * round(ms * MS_TO_KT / 5)), "hpa": int(float(it.get("pressure") or 0)) or None,
              "status": (it.get("storm_status") or [""])[0]}
        if str(it.get("actual")).lower() == "true":
            past[t] = pt
            if str(it.get("current")).lower() == "true":
                analysis = t
        else:
            future[t] = pt
    track = [past[k] for k in sorted(past)]
    if analysis is None and track:
        analysis = track[-1]["t"]
    forecast = []
    for k in sorted(future):
        if analysis and k > analysis:
            p = future[k]
            forecast.append({"h": int((k - analysis).total_seconds() // 3600), "lat": p["lat"], "lon": p["lon"], "kt": p["kt"]})
    return {"track": track, "forecast": forecast, "analysis": analysis}
