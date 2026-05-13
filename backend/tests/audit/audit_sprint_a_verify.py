"""Verifica Sprint A: anche con permesso 'users', un non-admin non può creare admin."""
import json, urllib.request, urllib.error, time

BASE = "http://localhost:8000"


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
    except urllib.error.HTTPError:
        return None


ADMIN = login("admin", "admin")
ts = int(time.time())

# 1. Trova ruolo 'officina'
sc, roles = call(ADMIN, "/api/roles")
officina_role = next((r for r in roles if r["name"] == "officina"), None)
if not officina_role:
    print("✗ ruolo officina non trovato")
    exit(1)
print(f"Ruolo officina id={officina_role['id']}, perms ATTUALI: {officina_role.get('permissions', [])}")

# 2. Dai a officina il permesso 'users' (simula configurazione anomala via UI)
sc, _ = call(ADMIN, f"/api/roles/{officina_role['id']}/permissions", "PUT", {"permissions": list(set(officina_role.get('permissions', []) + ['users']))})
print(f"Assegna 'users' a officina: HTTP {sc}")

# 3. Crea utente officina (come admin)
sc, off_user = call(ADMIN, "/api/auth/register", "POST", {
    "username": f"sprintA_test_{ts}", "password": "Pass123!",
    "full_name": "Sprint A Test", "role": "officina", "is_active": True
})
print(f"Create officina test user: HTTP {sc}")

# 4. Login come officina con permesso 'users'
OFF = login(f"sprintA_test_{ts}", "Pass123!")
if not OFF:
    print("✗ login officina fallito")
    exit(1)

# 5. Test: ora officina ha 'users' permission. Prova a creare admin.
sc, _ = call(OFF, "/api/users")
print(f"[OFFICINA con users] GET /api/users → {sc}", "(deve essere 200, ha permesso)" if sc == 200 else "")

sc, resp = call(OFF, "/api/auth/register", "POST", {
    "username": f"sprintA_hacked_{ts}", "password": "X",
    "full_name": "Hack", "role": "admin", "is_active": True
})
ok = sc == 403
print(f"[OFFICINA con users] POST /register role=admin → {sc}", "✓ Sprint A funziona" if ok else "✗ BREACH RESIDUA")
if not ok:
    print(f"  body: {resp}")

sc, resp = call(OFF, "/api/users", "POST", {
    "username": f"sprintA_hacked2_{ts}", "password": "X",
    "full_name": "Hack2", "role": "admin", "is_active": True
})
ok2 = sc == 403
print(f"[OFFICINA con users] POST /api/users role=admin → {sc}", "✓ Sprint A funziona" if ok2 else "✗ BREACH RESIDUA")

# 6. Verifica anche update_user: officina prova a promuovere un altro user a admin
sc, victim = call(ADMIN, "/api/users", "POST", {
    "username": f"victim_{ts}", "password": "X",
    "full_name": "Victim", "role": "officina", "is_active": True
})
victim_id = victim.get("id") if isinstance(victim, dict) else None
if victim_id:
    sc, resp = call(OFF, f"/api/users/{victim_id}", "PUT", {"role": "admin"})
    ok3 = sc == 403
    print(f"[OFFICINA con users] PUT /users/{victim_id} role=admin → {sc}", "✓ Sprint A funziona" if ok3 else "✗ BREACH RESIDUA")

# 7. Officina prova a modificare/resettare password di un admin esistente
admin_user = next((u for u in (call(ADMIN, "/api/users")[1]) if u.get("role") == "admin"), None)
if admin_user:
    sc, resp = call(OFF, f"/api/users/{admin_user['id']}", "PUT", {"password": "hacked-password"})
    ok4 = sc == 403
    print(f"[OFFICINA con users] PUT /users/{admin_user['id']} (target=admin, reset pwd) → {sc}", "✓ guard funziona" if ok4 else "✗ BREACH RESIDUA")

    sc, resp = call(OFF, f"/api/users/{admin_user['id']}", "DELETE")
    ok5 = sc == 403
    print(f"[OFFICINA con users] DELETE /users/{admin_user['id']} (target=admin) → {sc}", "✓ guard funziona" if ok5 else "✗ BREACH RESIDUA")

# Cleanup
sc, users_now = call(ADMIN, "/api/users")
to_clean = [u["id"] for u in users_now if u.get("username", "").startswith(("sprintA_test_", "sprintA_hacked_", "sprintA_hacked2_", "victim_"))]
print(f"\nCleanup: {to_clean}")
for uid in to_clean:
    call(ADMIN, f"/api/users/{uid}", "DELETE")

# Restore: rimuovi 'users' da officina (riporta lo stato post-Sprint B)
sc, _ = call(ADMIN, f"/api/roles/{officina_role['id']}/permissions", "PUT", {"permissions": [p for p in officina_role.get('permissions', []) if p != 'users']})
print(f"Restore officina (rimossi users): HTTP {sc}")
