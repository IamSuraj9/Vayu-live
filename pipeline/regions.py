"""Plain-language region names, the local word for a storm, and the official warning agency per region."""
from __future__ import annotations

OFFICIAL = {
    "Arabian Sea": ("IMD (India Meteorological Department)", "https://mausam.imd.gov.in/"),
    "Bay of Bengal": ("IMD (India Meteorological Department)", "https://mausam.imd.gov.in/"),
    "Andaman Sea": ("IMD (India Meteorological Department)", "https://mausam.imd.gov.in/"),
    "Western Pacific": ("JMA (Japan Meteorological Agency)", "https://www.jma.go.jp/bosai/map.html#contents=typhoon&lang=en"),
    "Central Pacific": ("CPHC (Central Pacific Hurricane Center)", "https://www.nhc.noaa.gov/?cpac"),
    "Eastern Pacific": ("NHC (US National Hurricane Center)", "https://www.nhc.noaa.gov/"),
    "Atlantic": ("NHC (US National Hurricane Center)", "https://www.nhc.noaa.gov/"),
    "South-West Indian Ocean": ("Météo-France La Réunion", "https://meteofrance.re/fr/cyclone"),
    "Australian region": ("Bureau of Meteorology (Australia)", "https://www.bom.gov.au/cyclone/"),
    "South Pacific": ("Fiji Meteorological Service", "https://www.met.gov.fj/"),
    "South Atlantic": ("Brazilian Navy Hydrographic Center", "https://www.marinha.mil.br/chm/"),
}

# ATCF basin from the storm number's letter (as used by JTWC and NHC in tcvitals)
LETTER_BASIN = {"L": "al", "E": "ep", "C": "cp", "W": "wp", "A": "io", "B": "io", "S": "sh", "P": "sh", "Q": "sl"}


def region(lat: float, lon: float, atcf_basin: str | None = None, letter: str | None = None) -> str:
    lon = ((lon + 180) % 360) - 180
    fixed = {"al": "Atlantic", "ep": "Eastern Pacific", "cp": "Central Pacific", "wp": "Western Pacific", "sl": "South Atlantic"}
    if atcf_basin in fixed:
        return fixed[atcf_basin]
    if lat >= 0:
        if letter == "A" or (30 <= lon < 78 and atcf_basin in (None, "io")):
            return "Arabian Sea"
        if letter == "B" or 78 <= lon < 100:
            return "Andaman Sea" if lon >= 93.5 and lat < 17 else "Bay of Bengal"
        if 100 <= lon <= 180:
            return "Western Pacific"
        if -180 <= lon < -140:
            return "Central Pacific"
        pacific_side = lon < -100 or (lat < 16 and lon < -85) or (lat < 9 and lon < -78)
        return "Eastern Pacific" if pacific_side else "Atlantic"
    if 20 <= lon < 90:
        return "South-West Indian Ocean"
    if 90 <= lon < 160:
        return "Australian region"
    if lon >= 160 or lon < -120:
        return "South Pacific"
    return "South Atlantic"


def kind(region_name: str, invest: bool) -> str:
    if invest:
        return "disturbance"
    if region_name == "Western Pacific":
        return "typhoon"
    if region_name in ("Atlantic", "Eastern Pacific", "Central Pacific"):
        return "hurricane"
    return "cyclone"


def official(region_name: str) -> list[str]:
    name, url = OFFICIAL.get(region_name, ("WMO Severe Weather Information Centre", "https://severeweather.wmo.int/"))
    return [name, url]
