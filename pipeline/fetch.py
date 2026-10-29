"""HTTP fetching with retries, plus a fixture-backed fetcher for tests and offline runs."""
from __future__ import annotations

import os
import time
import urllib.error
import urllib.request

USER_AGENT = "storm-globe-educational/0.1 (+https://github.com/IamSuraj9/Qellon-Visualizer)"


class FetchError(Exception):
    pass


class HttpFetcher:
    def __init__(self, timeout: float = 40, retries: int = 3, backoff: float = 4.0):
        self.timeout, self.retries, self.backoff = timeout, retries, backoff

    def get(self, url: str) -> bytes:
        last: Exception | None = None
        for attempt in range(self.retries):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return resp.read()
            except urllib.error.HTTPError as e:
                if e.code in (403, 404):  # missing or refused: retrying will not help
                    raise FetchError(f"HTTP {e.code} for {url}") from e
                last = e
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                last = e
            if attempt < self.retries - 1:
                time.sleep(self.backoff * (attempt + 1))
        raise FetchError(f"{url}: {last}")


class FixtureFetcher:
    """Serves saved responses. `routes` maps a URL substring to a file path; unknown URLs fail like a 404."""

    def __init__(self, routes: dict[str, str], fail: tuple[str, ...] = ()):
        self.routes, self.fail = routes, fail
        self.requested: list[str] = []

    def get(self, url: str) -> bytes:
        self.requested.append(url)
        if any(f in url for f in self.fail):
            raise FetchError(f"simulated failure for {url}")
        for key, path in self.routes.items():
            if key in url and os.path.exists(path):
                with open(path, "rb") as fh:
                    return fh.read()
        raise FetchError(f"HTTP 404 for {url}")


def fixture_routes(folder: str) -> dict[str, str]:
    """Routes for the saved fixtures in data/fixtures/<date>/."""
    j = lambda *p: os.path.join(folder, *p)  # noqa: E731
    routes = {
        "/00/atmos/gfs.t00z.syndata.tcvitals.tm00": j("tcvitals", "gfs.t00z.syndata.tcvitals.tm00"),
        "/06/atmos/gfs.t06z.syndata.tcvitals.tm00": j("tcvitals", "gfs.t06z.syndata.tcvitals.tm00"),
        "gdacs.org/xml/rss.xml": j("gdacs", "rss.xml"),
        "CurrentStorms.json": j("nhc", "CurrentStorms.json"),
        "atcf/btk/bep222026.dat": j("nhc", "vance.btk"),
        "atcf/fst/ep222026.fst": j("nhc", "vance.fst"),
    }
    gd = j("gdacs")
    for name in os.listdir(gd):
        parts = name.split("_")
        if name.startswith("episode_"):
            routes[f"eventid={parts[1]}&episodeid={parts[2]}"] = j("gdacs", name)
        elif name.startswith("timeline_"):
            routes[f"gettimeline?id={parts[1]}"] = j("gdacs", name)
    return routes
