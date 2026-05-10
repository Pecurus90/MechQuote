"""Test approfondito Workflow + Operation (refactor finale).

Scenari:
 1. Operation CRUD: create, update, delete, name UNIQUE
 2. Workflow CRUD: create, list con joinedload operation+machine
 3. Apply workflow: clean slate, fasi pre-popolate da Operation
 4. setup_hours = Machine.setup_minimum_hours
 5. description = Operation.name (visibile in UI fase)
 6. phase_type = Operation.phase_type (per cost engine)
 7. Step con machine_id null (fase manuale)
"""
import requests
import sys

API = 'http://localhost:8000/api'

TOKEN = requests.post(f'{API}/auth/login',
                      data={'username': 'admin', 'password': 'admin'}).json()['access_token']
H = {'Authorization': f'Bearer {TOKEN}'}
PASS, FAIL = '✓', '✗'
checks = []
def chk(n, ok, d=''):
    checks.append(ok); print(f'  {PASS if ok else FAIL} {n}{("  — " + d) if d else ""}')

# Cleanup
for q in requests.get(f'{API}/quotes', headers=H).json() or []:
    if q.get('quote_number','').startswith(('WFFINAL-',)):
        requests.delete(f"{API}/quotes/{q['id']}", headers=H)
for w in requests.get(f'{API}/workflow-templates', headers=H).json() or []:
    if w['name'].startswith('WFFINAL'):
        requests.delete(f"{API}/workflow-templates/{w['id']}", headers=H)
for o in requests.get(f'{API}/operations', headers=H).json() or []:
    if o['name'].startswith('WFOp-'):
        requests.delete(f"{API}/operations/{o['id']}", headers=H)

# ─── Scenario 1: Operation CRUD ──────────────────────────────────────────
print('Scenario 1: Operation CRUD + UNIQUE')
op1 = requests.post(f'{API}/operations', headers=H,
                    json={'name': 'WFOp-Sgrossatura', 'phase_type': 'cnc_milling', 'active': True}).json()
chk('Create operation', op1.get('id') is not None, f'id={op1.get("id")}')

# Duplicate name → 400
dup = requests.post(f'{API}/operations', headers=H,
                    json={'name': 'WFOp-Sgrossatura', 'phase_type': 'cnc_turning', 'active': True})
chk('UNIQUE name violato → 400', dup.status_code == 400, f'status={dup.status_code}')

# Update
upd = requests.put(f'{API}/operations/{op1["id"]}', headers=H,
                   json={'name': 'WFOp-Sgrossatura V2', 'phase_type': 'cnc_milling', 'active': True})
chk('Update name', upd.status_code == 200 and upd.json()['name'] == 'WFOp-Sgrossatura V2')

# ─── Scenario 2-7: Workflow + apply ──────────────────────────────────────
print('\nScenari 2-7: Workflow apply con Operation')

# Setup macchine
machines = requests.get(f'{API}/machines', headers=H).json()
mc_cnc = next(m for m in machines if m['machine_type'] == 'cnc_3_axis')
mc_edm = next(m for m in machines if m['machine_type'] == 'wire_edm')
# Setto setup_minimum_hours
requests.put(f'{API}/machines/{mc_cnc["id"]}', headers=H, json={**mc_cnc, 'setup_minimum_hours': 0.5})
requests.put(f'{API}/machines/{mc_edm["id"]}', headers=H, json={**mc_edm, 'setup_minimum_hours': 0.3})
machines = requests.get(f'{API}/machines', headers=H).json()
mc_cnc = next(m for m in machines if m['id'] == mc_cnc['id'])
mc_edm = next(m for m in machines if m['id'] == mc_edm['id'])

# Crea 3 Operations: CAD manuale, Fresatura, Taglio EDM (solo name, niente phase_type)
op_cad = requests.post(f'{API}/operations', headers=H,
                       json={'name': 'WFOp-CAD', 'active': True}).json()
op_mill = requests.post(f'{API}/operations', headers=H,
                        json={'name': 'WFOp-Fresatura', 'active': True}).json()
op_edm = requests.post(f'{API}/operations', headers=H,
                       json={'name': 'WFOp-Taglio EDM', 'active': True}).json()

# Workflow con 3 step
wf = requests.post(f'{API}/workflow-templates', headers=H, json={
    'name': 'WFFINAL Componente std', 'description': 'Test', 'active': True,
    'steps': [
        {'sequence_number': 1, 'machine_id': None, 'operation_id': op_cad['id']},
        {'sequence_number': 2, 'machine_id': mc_cnc['id'], 'operation_id': op_mill['id']},
        {'sequence_number': 3, 'machine_id': mc_edm['id'], 'operation_id': op_edm['id']},
    ]}).json()
chk('Workflow created 3 step', len(wf['steps']) == 3)
chk('Step 1: machine null', wf['steps'][0]['machine_id'] is None)
chk('Step 2: include operation joinedload', wf['steps'][1].get('operation') is not None)
chk('Step 3: operation_id corretto', wf['steps'][2]['operation_id'] == op_edm['id'])

# Apply su parte
q = requests.post(f'{API}/quotes', headers=H,
                  json={'quote_number': 'WFFINAL-T_001', 'customer_name': 'T', 'global_margin_percent': 20}).json()
qid, pid = q['id'], q['parts'][0]['id']

# Fase pre-esistente per testare clean-slate
requests.post(f'{API}/parts/{pid}/phases', headers=H, json={
    'sequence_number': 99, 'phase_type': 'manual_operation',
    'description': 'NUKED', 'setup_hours': 99, 'cycle_hours_per_part': 99,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'is_shared': False})

r = requests.post(f'{API}/parts/{pid}/apply-workflow/{wf["id"]}', headers=H)
chk('Apply 200', r.status_code == 200)

p = requests.get(f'{API}/parts/{pid}', headers=H).json()
phs = sorted(p['phases'], key=lambda x: x['sequence_number'])
chk('Clean slate (3 fasi nuove, NUKED rimossa)', len(phs) == 3)
chk('seq 10/20/30', [p['sequence_number'] for p in phs] == [10, 20, 30])

# Fase 1: CAD manuale, no machine, setup=0
chk('Fase 1: operation_id = CAD', phs[0]['operation_id'] == op_cad['id'])
chk('Fase 1: description = operation.name', phs[0]['description'] == op_cad['name'])
chk('Fase 1: machine null, setup=0', phs[0]['machine_id'] is None and phs[0]['setup_hours'] == 0)

# Fase 2: Fresatura, CNC, setup=0.5
chk('Fase 2: machine = CNC', phs[1]['machine_id'] == mc_cnc['id'])
chk('Fase 2: setup_hours = 0.5 (da Machine.setup_minimum_hours)',
    phs[1]['setup_hours'] == 0.5)
chk('Fase 2: operation_id = Fresatura', phs[1]['operation_id'] == op_mill['id'])
chk('Fase 2: description = "WFOp-Fresatura"', phs[1]['description'] == op_mill['name'])

# Fase 3: Taglio EDM, EDM, setup=0.3
chk('Fase 3: operation_id = Taglio EDM', phs[2]['operation_id'] == op_edm['id'])
chk('Fase 3: machine = EDM (machine_type=wire_edm trigger autocalc)',
    phs[2]['machine_id'] == mc_edm['id'])
chk('Fase 3: setup = 0.3', phs[2]['setup_hours'] == 0.3)

# Cleanup
requests.delete(f'{API}/quotes/{qid}', headers=H)
requests.delete(f'{API}/workflow-templates/{wf["id"]}', headers=H)
for o in (op1, op_cad, op_mill, op_edm):
    requests.delete(f'{API}/operations/{o["id"]}', headers=H)

print(f'\n{sum(checks)}/{len(checks)} {PASS if all(checks) else FAIL}')
sys.exit(0 if all(checks) else 1)
