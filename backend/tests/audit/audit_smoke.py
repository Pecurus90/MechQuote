"""Smoke test READ MechQuote — chiama tutti i GET non-parametrici e riassume."""
import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
TOKEN = sys.argv[1] if len(sys.argv) > 1 else ""
HEAD = {"Authorization": f"Bearer {TOKEN}"}


def call(path: str, method: str = "GET", body=None, head_extra=None):
    headers = dict(HEAD)
    if head_extra:
        headers.update(head_extra)
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    else:
        data = None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            content = r.read()
            return r.status, len(content), None
    except urllib.error.HTTPError as e:
        body_excerpt = e.read()[:200].decode("utf-8", errors="replace")
        return e.code, 0, body_excerpt
    except Exception as e:
        return -1, 0, str(e)


# Discovery: estrai tutti i GET path senza placeholder {} dall'OpenAPI
with urllib.request.urlopen(BASE + "/openapi.json") as r:
    spec = json.load(r)

get_paths = []
for p, ops in spec["paths"].items():
    if "get" in ops and "{" not in p:
        get_paths.append((p, ops["get"].get("tags", ["?"])[0]))

# Aggiungo alcuni GET parametrici "safe" se IDs noti esistono
extra_gets = [
    ("/api/quote-categories", "catalog"),
    ("/api/dashboard/kpi", "dashboard"),
    ("/api/dashboard/monthly", "dashboard"),
    ("/api/dashboard/workflow-stats", "dashboard"),
    ("/api/dashboard/my-quotes", "dashboard"),
    ("/api/dashboard/to-review", "dashboard"),
    ("/api/dashboard/activity", "dashboard"),
]

# Dedup
seen = set()
all_gets = []
for p, t in get_paths + extra_gets:
    if p not in seen:
        seen.add(p)
        all_gets.append((p, t))

print(f"# Smoke test {len(all_gets)} GET endpoint\n")
print(f"{'STATUS':<8}{'BYTES':<10}{'TAG':<22}PATH")
print("-" * 100)
results = {"ok": 0, "auth_err": 0, "client_err": 0, "server_err": 0, "other": 0}
errors = []
for p, t in sorted(all_gets):
    status, size, err = call(p)
    marker = "✓" if 200 <= status < 300 else "✗"
    if 200 <= status < 300:
        results["ok"] += 1
    elif status == 401 or status == 403:
        results["auth_err"] += 1
        errors.append((p, status, err))
    elif 400 <= status < 500:
        results["client_err"] += 1
        errors.append((p, status, err))
    elif 500 <= status < 600:
        results["server_err"] += 1
        errors.append((p, status, err))
    else:
        results["other"] += 1
        errors.append((p, status, err))
    print(f"{marker}{status:<7}{size:<10}{t:<22}{p}")

print()
print("# Sintesi")
for k, v in results.items():
    print(f"  {k}: {v}")
print()
if errors:
    print("# Errori dettagli")
    for p, s, e in errors:
        print(f"  {s}  {p}")
        if e:
            print(f"       {e[:150]}")
