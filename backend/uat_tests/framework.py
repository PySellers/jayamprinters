"""
Tiny test framework for the Sri Jayam ERP UAT suite (standard library only).

Each test is a function that performs real API calls and asserts. `run()` records the module, the
scenario, what was expected, what actually happened and PASS/FAIL, so the results can be turned
into the client-facing test report. A failing assertion never stops the run.
"""

import json
import os
import time
import traceback
import urllib.error
import urllib.request

BASE = os.environ.get("UAT_BASE", "http://127.0.0.1:8000/api/v1")
RESULTS = []
_counters = {}

ADMIN = ("admin@srijayam.com", os.environ.get("UAT_ADMIN_PASSWORD", "Admin@123"))
STAFF_PASSWORD = os.environ.get("UAT_STAFF_PASSWORD", "Uat@12345")
ROLE_LOGINS = {
    "counter": "counter@srijayam.com",
    "production": "designer@srijayam.com",
    "accounts": "accounts@srijayam.com",
}


class Resp:
    def __init__(self, status, raw, headers):
        self.status, self.raw, self.headers = status, raw, headers
        try:
            self.data = json.loads(raw) if raw else None
        except Exception:
            self.data = None

    @property
    def ctype(self):
        return (self.headers.get("Content-Type") or "").split(";")[0]


def api(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return Resp(r.status, r.read(), r.headers)
    except urllib.error.HTTPError as e:
        return Resp(e.code, e.read(), e.headers)


_tokens = {}


def token_for(email, password):
    key = (email, password)
    if key not in _tokens:
        r = api("POST", "/auth/login", {"email": email, "password": password})
        _tokens[key] = (r.data or {}).get("access_token")
    return _tokens[key]


def admin():
    return token_for(*ADMIN)


def as_role(role):
    if role == "admin":
        return admin()
    return token_for(ROLE_LOGINS[role], STAFF_PASSWORD)


def expect(cond, msg):
    if not cond:
        raise AssertionError(msg)


def expect_status(resp, *codes):
    expect(resp.status in codes, f"HTTP {resp.status} (expected {'/'.join(map(str, codes))}): {resp.raw[:200]!r}")


def run(prefix, module, scenario, expected, fn):
    _counters[prefix] = _counters.get(prefix, 0) + 1
    tid = f"{prefix}-{_counters[prefix]:03d}"
    t0 = time.time()
    try:
        actual = fn()
        status = "PASS"
        actual = actual if isinstance(actual, str) else (actual and str(actual)) or "As expected"
    except AssertionError as e:
        status, actual = "FAIL", str(e)
    except Exception as e:  # unexpected crash is also a failure
        status, actual = "FAIL", f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=3)}"
    RESULTS.append(dict(id=tid, module=module, scenario=scenario, expected=expected, actual=actual, status=status,
                        ms=int((time.time() - t0) * 1000)))
    print(f"[{status}] {tid} {module} :: {scenario}" + ("" if status == "PASS" else f"\n       -> {actual[:300]}"))
    return status == "PASS"


def save(path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(RESULTS, f, indent=1)
    p = sum(r["status"] == "PASS" for r in RESULTS)
    print(f"\n{p}/{len(RESULTS)} passed, {len(RESULTS) - p} failed -> {path}")
