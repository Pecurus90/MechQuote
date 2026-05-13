"""Verifica se utente non-admin con permesso 'users' (anomalia) può creare/modificare/eliminare utenti."""
import json, urllib.request, urllib.error, sys, time

BASE = "http://localhost:8000"


def login(username, password):
    data = f"username={username}&password={password}".encode()
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    req = urllib.request.Request(BASE + "/api/auth/login", data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())["access_token"]
    except urllib.error.HTTPError:
        return None


def call(token, path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read()) if r.length else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try: body = json.loads(body)
        except: pass
        return e.code, body


ADMIN = login("admin", "admin")
ts = int(time.time())

# Crea utente officina test
sc, off_user = call(ADMIN, "/api/auth/register", "POST", {
    "username": f"officina_test_{ts}", "password": "OffPass123!",
    "full_name": "Officina Test", "role": "officina", "is_active": True
})
print(f"Create officina test user: {sc}")

OFF = login(f"officina_test_{ts}", "OffPass123!")
if not OFF:
    print("✗ login officina fallito")
    sys.exit(1)

# Crea utente vittima
sc, victim = call(ADMIN, "/api/auth/register", "POST", {
    "username": f"victim_{ts}", "password": "Victim123!",
    "full_name": "Victim", "role": "officina", "is_active": True
})
victim_id = victim.get("id")
print(f"Create victim user: {sc} (id={victim_id})")

# CRITICO: utente officina prova a vedere lista utenti
sc, users = call(OFF, "/api/users")
print(f"\n[OFFICINA] GET /api/users → {sc} ({'BREACH: vede ' + str(len(users)) + ' utenti' if sc == 200 else 'OK gated'})")

# CRITICO: utente officina prova a CREARE un nuovo utente
sc, _ = call(OFF, "/api/auth/register", "POST", {
    "username": f"hacked_{ts}", "password": "Hack123!",
    "full_name": "Hacker", "role": "admin", "is_active": True
})
print(f"[OFFICINA] POST /api/auth/register (role=admin!) → {sc} ({'⚠️ BREACH: utente officina può creare admin' if sc == 200 else 'OK gated'})")

# CRITICO: utente officina prova a modificare un altro utente (es. reset password)
if victim_id:
    sc, _ = call(OFF, f"/api/users/{victim_id}", "PUT", {"role": "admin"})
    print(f"[OFFICINA] PUT /api/users/{victim_id} (cambia role=admin) → {sc} ({'⚠️ BREACH: escalation di privilegi' if sc in (200, 204) else 'OK gated'})")

# CRITICO: utente officina prova a ELIMINARE un altro utente
if victim_id:
    sc, _ = call(OFF, f"/api/users/{victim_id}", "DELETE")
    print(f"[OFFICINA] DELETE /api/users/{victim_id} → {sc} ({'⚠️ BREACH: può cancellare utenti' if sc in (200, 204) else 'OK gated'})")

# Cleanup
sc, users_now = call(ADMIN, "/api/users")
to_clean = [u["id"] for u in users_now if u.get("username", "").startswith(("officina_test_", "victim_", "hacked_"))]
print(f"\nCleanup utenti test: {to_clean}")
for uid in to_clean:
    call(ADMIN, f"/api/users/{uid}", "DELETE")
print("Done.")
