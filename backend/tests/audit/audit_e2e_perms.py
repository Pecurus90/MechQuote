"""Workflow E2E permessi + edge case."""
import json, sys, urllib.request, urllib.error, time

BASE = "http://localhost:8000"
ADMIN_TOKEN = sys.argv[1]


def call(token, path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            content = r.read()
            return r.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try: body = json.loads(body)
        except: pass
        return e.code, body


def login(username, password):
    data = f"username={username}&password={password}".encode()
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    req = urllib.request.Request(BASE + "/api/auth/login", data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())["access_token"]
    except urllib.error.HTTPError as e:
        return None


def step(name, code, expected):
    ok = code == expected if isinstance(expected, int) else code in expected
    print(f"{'✓' if ok else '✗'} {name}: HTTP {code}{'' if ok else f' (atteso {expected})'}")
    return ok


# 1. Crea utente non-admin con permessi limitati
ts = int(time.time())
print("# Setup utente test")
sc, roles = call(ADMIN_TOKEN, "/api/roles")
# Trova un ruolo "officina" se esiste, altrimenti il primo non-admin
test_role_id = None
for r in roles:
    if r.get("name") == "officina":
        test_role_id = r["id"]
        break
if test_role_id is None and roles:
    for r in roles:
        if r.get("name") != "admin":
            test_role_id = r["id"]
            break
print(f"  ruolo test scelto: {test_role_id}")

new_user_payload = {
    "username": f"audit_user_{ts}",
    "password": "AuditPass123!",
    "full_name": "Audit Test User",
    "role": "officina" if test_role_id else "user",
    "is_active": True,
}
sc, new_user = call(ADMIN_TOKEN, "/api/auth/register", "POST", new_user_payload)
step("POST /api/auth/register", sc, 200)
if sc != 200:
    print(f"  body: {new_user}")
    sys.exit(0)
test_uid = new_user.get("id")

# 2. Login come nuovo utente
test_token = login(new_user_payload["username"], new_user_payload["password"])
if not test_token:
    print("✗ login utente test fallito")
    sys.exit(0)
print(f"  login utente test: ✓")

# 3. Test gating: utente officina deve essere bloccato su endpoint admin-only
print("\n# Gating: endpoint che richiedono permessi che officina NON ha")
sc, _ = call(test_token, "/api/users")  # users
step("GET /api/users (no permesso 'users')", sc, 403)

sc, _ = call(test_token, "/api/customers", "POST", {"name": "X", "customer_number": 99999})  # customers write
step("POST /api/customers (no permesso 'customers')", sc, 403)

sc, _ = call(test_token, "/api/backup/export")  # backup
step("GET /api/backup/export (no permesso 'backup')", sc, 403)

sc, _ = call(test_token, "/api/quotes", "POST", {
    "customer_id": 1, "category": "A", "quote_number": f"X-{ts}", "num_components": 1
})  # quotes.create
step("POST /api/quotes (no permesso 'quotes.create')", sc, 403)

# 4. Endpoint che officina HA: officina + tools (ma quotes.archive sì)
sc, _ = call(test_token, "/api/officina/documents")
step("GET /api/officina/documents (ha 'officina')", sc, 200)
sc, _ = call(test_token, "/api/tools")
step("GET /api/tools (ha 'tools')", sc, 200)
sc, _ = call(test_token, "/api/quotes/archive")
step("GET /api/quotes/archive (ha 'quotes.archive')", sc, 200)

# 5. Edge case: payload invalidi
print("\n# Edge case: payload invalidi")
sc, _ = call(ADMIN_TOKEN, "/api/quotes", "POST", {})  # body vuoto
step("POST /api/quotes con body {} (atteso 422)", sc, 422)

sc, _ = call(ADMIN_TOKEN, "/api/quotes", "POST", {"customer_id": "string-not-int", "category": "A", "quote_number": "X"})
step("POST /api/quotes con customer_id stringa (atteso 422)", sc, 422)

sc, _ = call(ADMIN_TOKEN, "/api/materials", "POST", {"code": "", "name": "X"})  # name short
step("POST /api/materials con code vuoto (atteso 422)", sc, 422)

# 6. Edge case: anti-lockout — admin senza permessi nel DB?
sc, me = call(ADMIN_TOKEN, "/api/auth/me")
admin_perms = me.get("permissions", []) if isinstance(me, dict) else []
print(f"\n# Admin permissions count: {len(admin_perms)} (dovrebbe essere ≥16)")
print(f"  permessi: {admin_perms}")

# Cleanup utente test
print("\n# Cleanup")
if test_uid:
    sc, _ = call(ADMIN_TOKEN, f"/api/users/{test_uid}", "DELETE")
    step(f"DELETE /api/users/{test_uid} (cleanup)", sc, [200, 204])
