"""Workflow E2E misc: officina upload, orders aggregate, PDF."""
import json, sys, urllib.request, urllib.error, time, os

BASE = "http://localhost:8000"
TOKEN = sys.argv[1]
HEAD = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def call(path, method="GET", body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=HEAD)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            content = r.read()
            if raw:
                return r.status, content
            return r.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try: body = json.loads(body)
        except: pass
        return e.code, body


def step(name, code, expected):
    ok = code == expected if isinstance(expected, int) else code in expected
    print(f"{'✓' if ok else '✗'} {name}: HTTP {code}{'' if ok else f' (atteso {expected})'}")
    return ok


print("# Officina: list categorie + documenti")
sc, cats = call("/api/officina/categories-full")
step("GET /api/officina/categories-full", sc, 200)
print(f"  categorie totali: {len(cats)}")

sc, docs = call("/api/officina/documents")
step("GET /api/officina/documents", sc, 200)
print(f"  documenti totali: {len(docs)}")

# Officina category create
ts = int(time.time())
sc, cat = call("/api/officina/categories", "POST", {"name": f"Audit Cat {ts}", "icon": "Folder"})
step("POST /api/officina/categories", sc, 200)
if sc == 200:
    cat_id = cat["id"]
    sc, _ = call(f"/api/officina/categories/{cat_id}", "DELETE")
    step(f"DELETE /api/officina/categories/{cat_id}", sc, [200, 204])

print("\n# Orders aggregate")
sc, mat_ord = call("/api/orders/materials")
step("GET /api/orders/materials", sc, 200)
sc, mat_stats = call("/api/orders/materials/stats")
step("GET /api/orders/materials/stats", sc, 200)
print(f"  stats materials: {mat_stats}")

sc, tool_preview = call("/api/orders/tools/preview")
step("GET /api/orders/tools/preview", sc, 200)
print(f"  tools preview: {len(tool_preview) if isinstance(tool_preview, list) else 'dict'} items")
sc, tool_stats = call("/api/orders/tools/stats")
step("GET /api/orders/tools/stats", sc, 200)
print(f"  stats tools: {tool_stats}")

print("\n# PDF generation: cerca un quote esistente e genera PDF")
sc, quotes = call("/api/quotes")
if quotes:
    qid = quotes[0]["id"]
    sc, pdf_data = call(f"/api/quotes/{qid}/pdf?internal=false", raw=True)
    if sc == 200 and isinstance(pdf_data, bytes):
        is_pdf = pdf_data[:4] == b"%PDF"
        step(f"GET /api/quotes/{qid}/pdf (cliente)", sc, 200)
        print(f"  size: {len(pdf_data)} bytes — PDF magic header: {is_pdf}")
    else:
        step(f"GET /api/quotes/{qid}/pdf (cliente)", sc, 200)
        print(f"  body: {str(pdf_data)[:200]}")

    sc, pdf_int = call(f"/api/quotes/{qid}/pdf?internal=true", raw=True)
    if sc == 200 and isinstance(pdf_int, bytes):
        step(f"GET /api/quotes/{qid}/pdf (interno)", sc, 200)
        print(f"  size: {len(pdf_int)} bytes")
    else:
        step(f"GET /api/quotes/{qid}/pdf (interno)", sc, 200)

print("\n# Backup export (READ only, no import)")
sc, backup_data = call("/api/backup/export", raw=True)
if sc == 200 and isinstance(backup_data, bytes):
    try:
        obj = json.loads(backup_data)
        keys = list(obj.keys()) if isinstance(obj, dict) else []
        step("GET /api/backup/export", sc, 200)
        print(f"  size: {len(backup_data)} bytes — top keys: {keys[:8]}{'...' if len(keys)>8 else ''}")
    except Exception:
        step("GET /api/backup/export", sc, 200)
        print(f"  size: {len(backup_data)} bytes (non-JSON?)")
