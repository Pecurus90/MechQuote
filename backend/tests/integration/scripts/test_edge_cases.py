"""Edge cases / abuse / sequenze impreviste."""
import requests, sys
API = 'http://localhost:8000/api'
TOKEN = requests.post(f'{API}/auth/login', data={'username':'admin','password':'admin'}).json()['access_token']
H = {'Authorization': f'Bearer {TOKEN}'}
PASS, FAIL = '✓', '✗'
checks = []
def chk(n, ok, d=''):
    checks.append(ok); print(f'  {PASS if ok else FAIL} {n}{("  — " + d) if d else ""}')

# Cleanup
for q in requests.get(f'{API}/quotes', headers=H).json() or []:
    if q.get('quote_number','').startswith('EDGE-'):
        requests.delete(f"{API}/quotes/{q['id']}", headers=H)

print('Auth')
# Login wrong password
r = requests.post(f'{API}/auth/login', data={'username':'admin','password':'wrong'})
chk('Login con password errata → 401', r.status_code == 401, f'got {r.status_code}')
# Token invalido
r = requests.get(f'{API}/quotes', headers={'Authorization': 'Bearer broken'})
chk('Token invalid → 401', r.status_code == 401)
# No token
r = requests.get(f'{API}/quotes')
chk('No auth → 401', r.status_code == 401)

print('\nValidazione input')
# Quote senza quote_number
r = requests.post(f'{API}/quotes', headers=H, json={'customer_name':'X'})
chk('Quote senza quote_number → 422', r.status_code == 422)
# Quote con quote_number vuoto
r = requests.post(f'{API}/quotes', headers=H, json={'quote_number':'', 'customer_name':'X'})
chk('Quote con quote_number vuoto → 422', r.status_code == 422)
# Operation senza name
r = requests.post(f'{API}/operations', headers=H, json={'active': True})
chk('Operation senza name → 422', r.status_code == 422)
# Operation con name vuoto
r = requests.post(f'{API}/operations', headers=H, json={'name':'', 'active': True})
chk('Operation con name vuoto → 422', r.status_code == 422)
# Operation duplicato
op = requests.post(f'{API}/operations', headers=H, json={'name':'EDGE-Dup', 'active':True})
chk('Operation create OK', op.status_code == 200)
op2 = requests.post(f'{API}/operations', headers=H, json={'name':'EDGE-Dup', 'active':True})
chk('Operation duplicato → 400 (UNIQUE)', op2.status_code == 400)
requests.delete(f'{API}/operations/{op.json()["id"]}', headers=H)

print('\nNot found')
r = requests.get(f'{API}/quotes/999999', headers=H)
chk('GET /quotes/<inesistente> → 404', r.status_code == 404)
r = requests.put(f'{API}/parts/999999', headers=H, json={'description':'x'})
chk('PUT /parts/<inesistente> → 404', r.status_code == 404)
r = requests.delete(f'{API}/operations/999999', headers=H)
chk('DELETE /operations/<inesistente> → 404', r.status_code == 404)

print('\nRecovery dopo errori')
# Crea quote, prova a creare duplicato → 400, poi crea con nome diverso → 200
q1 = requests.post(f'{API}/quotes', headers=H, json={'quote_number':'EDGE-DUP_001', 'customer_name':'X', 'global_margin_percent':20}).json()
qid1 = q1['id']
r = requests.post(f'{API}/quotes', headers=H, json={'quote_number':'EDGE-DUP_001', 'customer_name':'Y'})
chk('POST quote duplicato → 400', r.status_code == 400)
q2 = requests.post(f'{API}/quotes', headers=H, json={'quote_number':'EDGE-DUP_002', 'customer_name':'Y', 'global_margin_percent':20})
chk('POST quote nuovo dopo errore → 200 (DB recovery)', q2.status_code == 200)
requests.delete(f'{API}/quotes/{qid1}', headers=H)
requests.delete(f'{API}/quotes/{q2.json()["id"]}', headers=H)

print('\nQuote.quote_number con caratteri speciali (path traversal?)')
# Crea quote con quote_number suspicious
r = requests.post(f'{API}/quotes', headers=H, json={
    'quote_number': '../../../etc/passwd', 'customer_name':'EVIL'})
chk('quote_number con path traversal → accettato come stringa (no exec)',
    r.status_code in (200, 400, 422))
if r.status_code == 200:
    requests.delete(f'{API}/quotes/{r.json()["id"]}', headers=H)

print('\nApply workflow su parte/workflow inesistente')
# Crea quote+workflow
ops_seed = requests.get(f'{API}/operations', headers=H).json()
op_id = ops_seed[0]['id']
wf = requests.post(f'{API}/workflow-templates', headers=H, json={
    'name':'EDGE-WF', 'active':True,
    'steps':[{'sequence_number':1, 'machine_id':None, 'operation_id':op_id}]}).json()
q = requests.post(f'{API}/quotes', headers=H, json={'quote_number':'EDGE-WF_001', 'customer_name':'X', 'global_margin_percent':20}).json()
qid = q['id']
pid = q['parts'][0]['id']

# Apply workflow inesistente
r = requests.post(f'{API}/parts/{pid}/apply-workflow/999999', headers=H)
chk('Apply workflow inesistente → 404', r.status_code == 404)
# Apply su parte inesistente
r = requests.post(f'{API}/parts/999999/apply-workflow/{wf["id"]}', headers=H)
chk('Apply su parte inesistente → 404', r.status_code == 404)
# Apply legittimo, poi delete workflow → fasi createsi/preservate?
r = requests.post(f'{API}/parts/{pid}/apply-workflow/{wf["id"]}', headers=H)
chk('Apply legittimo → 200', r.status_code == 200)
requests.delete(f'{API}/workflow-templates/{wf["id"]}', headers=H)
p = requests.get(f'{API}/parts/{pid}', headers=H).json()
chk('Fasi sopravvivono delete workflow', len(p['phases']) == 1)
requests.delete(f'{API}/quotes/{qid}', headers=H)

print('\nQty edge cases')
q = requests.post(f'{API}/quotes', headers=H, json={'quote_number':'EDGE-Q_001', 'customer_name':'X', 'global_margin_percent':20}).json()
qid, pid = q['id'], q['parts'][0]['id']
# qty 0 (vietato)
r = requests.put(f'{API}/parts/{pid}', headers=H, json={'quantity': 0})
chk('Part quantity=0 → 422 (Field ge=1)', r.status_code == 422)
# qty negativa
r = requests.put(f'{API}/parts/{pid}', headers=H, json={'quantity': -5})
chk('Part quantity negativa → 422', r.status_code == 422)
# qty enorme (overflow?)
r = requests.put(f'{API}/parts/{pid}', headers=H, json={'quantity': 999999})
chk('Part quantity enorme → 200 (no limite hard)', r.status_code == 200)
requests.delete(f'{API}/quotes/{qid}', headers=H)

print('\nDXF analyze su file invalid')
r = requests.post(f'{API}/dxf/analyze', headers=H,
                  files={'file': ('test.txt', b'not a dxf', 'text/plain')})
chk('DXF analyze con .txt → rifiutato (extension)', r.status_code in (400, 422))

print(f'\n{sum(checks)}/{len(checks)} {PASS if all(checks) else FAIL}')
sys.exit(0 if all(checks) else 1)
