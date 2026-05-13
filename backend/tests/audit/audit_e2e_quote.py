"""Workflow E2E preventivo: crea Quote → Part → Phase → ricalcola → cambia status → cleanup."""
import json, sys, urllib.request, urllib.error

BASE = "http://localhost:8000"
TOKEN = sys.argv[1]
HEAD = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def call(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=HEAD)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read()) if r.length != 0 else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(body)
        except Exception:
            pass
        return e.code, body


def step(name, code, expected, payload=None):
    ok = code == expected if isinstance(expected, int) else code in expected
    mark = "✓" if ok else "✗"
    print(f"{mark} {name}: HTTP {code}")
    if not ok and payload:
        print(f"  payload: {json.dumps(payload)[:200]}")
    if not ok:
        print(f"  → atteso {expected}")
    return ok


# Step 0: get reference data
print("# Reference data")
sc, customers = call("/api/customers")
sc, materials = call("/api/materials")
sc, machines = call("/api/machines")
sc, operations = call("/api/operations")
print(f"  customers={len(customers)} materials={len(materials)} machines={len(machines)} operations={len(operations)}")
if not customers:
    print("✗ no customers — workflow E2E impossibile")
    sys.exit(1)
cid = customers[0]["id"]
mid = materials[0]["id"] if materials else None
mac = machines[0]["id"] if machines else None
op = operations[0]["id"] if operations else None

# Step 1: crea quote
print("\n# Create Quote")
import time
qnum = f"AUDIT-E2E-{int(time.time())}"
quote_payload = {
    "customer_id": cid,
    "category": "A",
    "quote_number": qnum,
    "description": "AUDIT_E2E_TEST — da cancellare",
    "num_components": 1,
}
sc, quote = call("/api/quotes", "POST", quote_payload)
ok = step("POST /api/quotes", sc, 200, quote_payload)
if not ok:
    print(quote)
    sys.exit(1)
qid = quote["id"]
print(f"  quote_id={qid} quote_number={quote.get('quote_number')}")

# Step 2: get quote (deve avere parts auto-create dal num_components)
sc, quote_full = call(f"/api/quotes/{qid}")
step(f"GET /api/quotes/{qid}", sc, 200)
parts = quote_full.get("parts", [])
print(f"  parts auto-create: {len(parts)}")
if not parts:
    print("✗ no parts auto-created")
    sys.exit(1)
pid = parts[0]["id"]

# Step 3: PUT part con dimensioni grezzo + materiale
part_update = {
    "part_code": "AUDIT-001",
    "description": "Test part audit",
    "quantity": 10,
    "raw_x_mm": 100,
    "raw_y_mm": 50,
    "raw_z_mm": 20,
    "raw_weight_kg": 0.785,
    "finished_weight_kg": 0.5,
    "margin_percent": 30,
}
if mid:
    part_update["material_id"] = mid
sc, part = call(f"/api/parts/{pid}", "PUT", part_update)
step(f"PUT /api/parts/{pid}", sc, 200, part_update)

# Step 4: aggiungi phase
if mac and op:
    phase_payload = {
        "sequence_number": 1,
        "phase_type": "internal_machine",
        "operation_id": op,
        "machine_id": mac,
        "setup_hours": 0.5,
        "cycle_hours_per_part": 0.1,
        "fixed_cost": 0,
        "variable_cost_per_part": 0,
    }
    sc, phase = call(f"/api/parts/{pid}/phases", "POST", phase_payload)
    step(f"POST /api/parts/{pid}/phases", sc, 200, phase_payload)
    phid = phase.get("id") if isinstance(phase, dict) else None

    # Step 5: PUT phase per modificare ore + verifica recalculate
    if phid:
        sc, _ = call(f"/api/phases/{phid}", "PUT", {"setup_hours": 1.0})
        step(f"PUT /api/phases/{phid}", sc, 200)
else:
    print("(skip phase: machine o operation mancanti)")
    phid = None

# Step 6: ricalcola quote
sc, recalc = call(f"/api/quotes/{qid}/recalculate", "POST")
step(f"POST /api/quotes/{qid}/recalculate", sc, 200)
if isinstance(recalc, dict) and "parts" in recalc:
    p0 = recalc["parts"][0]
    print(f"  unit_price={p0.get('unit_price')} total_cost={p0.get('total_cost')} material_cost={p0.get('material_cost')}")

# Step 7: cambia status bozza → inviato
sc, status_resp = call(f"/api/quotes/{qid}/status", "PATCH", {"status": "inviato"})
step(f"PATCH /api/quotes/{qid}/status (bozza→inviato)", sc, 200)
print(f"  status corrente: {status_resp.get('status') if isinstance(status_resp, dict) else status_resp}")

# Step 8: notifica creata?
sc, notifs = call("/api/notifications")
mine = [n for n in notifs if isinstance(n, dict) and n.get("type") == "quote_submitted" and str(qid) in json.dumps(n.get("data", {}))]
step(f"GET /api/notifications (cerca quote_submitted per quote {qid})", 200 if mine else 404, 200)
if mine:
    print(f"  notifica trovata: {mine[0].get('title')}")

# Step 9: cleanup — admin può eliminare anche quote inviato
sc, _ = call(f"/api/quotes/{qid}", "DELETE")
step(f"DELETE /api/quotes/{qid} (cleanup)", sc, [200, 204])

print("\n# Verifica finale: quote eliminato?")
sc, _ = call(f"/api/quotes/{qid}")
step(f"GET /api/quotes/{qid} (deve essere 404)", sc, 404)
