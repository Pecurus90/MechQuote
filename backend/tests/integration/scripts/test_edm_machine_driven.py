"""Test: autocalc EDM si attiva quando machine.machine_type=='wire_edm',
indipendentemente dal nome dell'Operation/dal phase_type.

Verifica:
 - Macchina wire_edm + 3 campi popolati → autocalc attivo
 - Macchina cnc + 3 campi popolati → autocalc NON attivo
 - Nessuna macchina + 3 campi popolati → autocalc NON attivo
 - Macchina wire_edm ma 0 dei campi → autocalc NON attivo
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
    if q.get('quote_number','').startswith('EDMTEST-'):
        requests.delete(f"{API}/quotes/{q['id']}", headers=H)

# Setup
machines = requests.get(f'{API}/machines', headers=H).json()
mc_edm = next(m for m in machines if m['machine_type'] == 'wire_edm')
mc_cnc = next(m for m in machines if m['machine_type'] == 'cnc_3_axis')
mat = next(m for m in requests.get(f'{API}/materials', headers=H).json() if m.get('family'))
cycle = next(c for c in requests.get(f'{API}/cutting-cycles', headers=H).json() if c['active'])

# Quote + part
q = requests.post(f'{API}/quotes', headers=H, json={
    'quote_number': 'EDMTEST-T_001', 'customer_name': 'T',
    'global_margin_percent': 20}).json()
qid, pid = q['id'], q['parts'][0]['id']
requests.put(f'{API}/parts/{pid}', headers=H, json={'material_id': mat['id'], 'raw_z_mm': 8})

# ─── Scenario A: macchina wire_edm + 3 campi → autocalc ON ────────────
phA = requests.post(f'{API}/parts/{pid}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': '',  # vuoto, non più richiesto
    'machine_id': mc_edm['id'],
    'cut_length_mm': 250, 'cut_height_mm': 8,
    'cutting_cycle_id': cycle['id'], 'n_pierce': 0,
    'setup_hours': 0, 'cycle_hours_per_part': 0,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'customer_visible': True, 'is_shared': False}).json()
chk('Macchina wire_edm + 3 campi → cycle_h > 0',
    (phA.get('cycle_hours_per_part') or 0) > 0,
    f'cycle_h={phA.get("cycle_hours_per_part")}')

# ─── Scenario B: macchina CNC + 3 campi → autocalc OFF ────────────────
phB = requests.post(f'{API}/parts/{pid}/phases', headers=H, json={
    'sequence_number': 20, 'phase_type': '',
    'machine_id': mc_cnc['id'],   # ← non wire_edm!
    'cut_length_mm': 250, 'cut_height_mm': 8,
    'cutting_cycle_id': cycle['id'], 'n_pierce': 0,
    'setup_hours': 0, 'cycle_hours_per_part': 0,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'customer_visible': True, 'is_shared': False}).json()
chk('Macchina CNC (non wire_edm) → cycle_h = 0 (autocalc skip)',
    (phB.get('cycle_hours_per_part') or 0) == 0,
    f'cycle_h={phB.get("cycle_hours_per_part")}')

# ─── Scenario C: nessuna macchina → autocalc OFF ──────────────────────
phC = requests.post(f'{API}/parts/{pid}/phases', headers=H, json={
    'sequence_number': 30, 'phase_type': '',
    'machine_id': None,
    'cut_length_mm': 250, 'cut_height_mm': 8,
    'cutting_cycle_id': cycle['id'], 'n_pierce': 0,
    'setup_hours': 0, 'cycle_hours_per_part': 0,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'customer_visible': True, 'is_shared': False}).json()
chk('Nessuna macchina → cycle_h = 0',
    (phC.get('cycle_hours_per_part') or 0) == 0)

# ─── Scenario D: wire_edm ma campi 0 → autocalc OFF ───────────────────
phD = requests.post(f'{API}/parts/{pid}/phases', headers=H, json={
    'sequence_number': 40, 'phase_type': '',
    'machine_id': mc_edm['id'],
    # cut_length/height/cycle non passati
    'setup_hours': 0, 'cycle_hours_per_part': 0,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'customer_visible': True, 'is_shared': False}).json()
chk('Macchina wire_edm ma campi mancanti → cycle_h = 0',
    (phD.get('cycle_hours_per_part') or 0) == 0)

requests.delete(f'{API}/quotes/{qid}', headers=H)
print(f'\n{sum(checks)}/{len(checks)} {PASS if all(checks) else FAIL}')
sys.exit(0 if all(checks) else 1)
