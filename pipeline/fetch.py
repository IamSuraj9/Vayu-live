"""HTTP fetching with retries, plus a fixture-backed fetcher for tests and offline runs."""
from __future__ import annotations

import contextlib
import os
import time
import urllib.error
import urllib.request

USER_AGENT = "vayu-educational/0.1 (+https://github.com/IamSuraj9/Vayu-live)"


class FetchError(Exception):
    pass


class HttpFetcher:
    def __init__(self, timeout: float = 30, retries: int = 2, backoff: float = 3.0):
        self.timeout, self.retries, self.backoff = timeout, retries, backoff
        self._deadline: float | None = None

    @contextlib.contextmanager
    def budget(self, seconds: float):
        """Everything fetched inside the block shares `seconds`. When they run out, requests fail at once instead of waiting.

        A slow server (GDACS is the usual one) can no longer hold up the whole refresh: the stage fails, the previous
        run's data stands in for it, and the other sources are unaffected. Pass `following` to `get` so one slow URL
        only spends its share and the fetches still queued in this budget still run.
        """
        self._deadline = time.monotonic() + seconds
        try:
            yield
        finally:
            self._deadline = None

    def _left(self) -> float | None:
        return None if self._deadline is None else self._deadline - time.monotonic()

    def _call_deadline(self, following: int) -> float | None:
        """This call's deadline. With later fetches queued, it may use only its share of the budget."""
        if self._deadline is None:
            return None
        if following <= 0:
            return self._deadline
        left = self._deadline - time.monotonic()
        if left <= 0:
            return self._deadline
        return time.monotonic() + left / (following + 1)

    def get(self, url: str, *, following: int = 0) -> bytes:
        last: Exception | None = None
        deadline = self._call_deadline(following)
        # A shared call must not stretch a short share up to the 1s floor and borrow the next storm's time.
        share = following > 0 and deadline is not None
        for attempt in range(self.retries):
            left = None if deadline is None else deadline - time.monotonic()
            if left is not None and left <= 0:
                raise FetchError(f"time budget used up before {url}" + (f" ({last})" if last else ""))
            if left is None:
                timeout = self.timeout
            elif share:
                timeout = min(self.timeout, left)
            else:
                timeout = max(1.0, min(self.timeout, left))
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return resp.read()
            except urllib.error.HTTPError as e:
                if e.code in (403, 404):  # missing or refused: retrying will not help
                    raise FetchError(f"HTTP {e.code} for {url}") from e
                last = e
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                last = e
            if attempt < self.retries - 1:
                left = None if deadline is None else deadline - time.monotonic()
                pause = self.backoff * (attempt + 1) if left is None else max(0.0, min(self.backoff * (attempt + 1), left))
                if pause:
                    time.sleep(pause)
        raise FetchError(f"{url}: {last}")


class FixtureFetcher:
    """Serves saved responses. `routes` maps a URL substring to a file path; unknown URLs fail like a 404."""

    def __init__(self, routes: dict[str, str], fail: tuple[str, ...] = ()):
        self.routes, self.fail = routes, fail
        self.requested: list[str] = []

    @contextlib.contextmanager
    def budget(self, seconds: float):
        yield  # saved responses are instant

    def get(self, url: str, *, following: int = 0) -> bytes:
        del following  # saved responses are instant; only the network fetcher spends the budget
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
