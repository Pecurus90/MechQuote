"""Test approfonditi delle aggregazioni recalculate_quote.

Scenari:
 1. Regressione single quote: 1 parte, output identico al pre-refactor
 2. Commessa SOTTO soglia: aggregazione min_cost distribuita per peso
 3. Commessa SOPRA soglia: cost_per_kg × peso_totale, distribuito
 4. Trattamenti DIVERSI nello stesso preventivo: niente cross-aggregazione
 5. Materiale: 2 parti stesso supplier, 1 parte altro supplier
 6. Modifica qty di una parte: aggregazioni si aggiornano correttamente
 7. Edge case: parte con peso=0 → distribuzione in parti uguali
 8. Total cost coerente: somma di tutti i componenti
"""
import requests
import sys

API = 'http://localhost:8000/api'

r = requests.post(f'{API}/auth/login', data={'username': 'admin', 'password': 'admin'})
TOKEN = r.json()['access_token']
H = {'Authorization': f'Bearer {TOKEN}'}

# ─── Helpers ─────────────────────────────────────────────────────────────

PASS, FAIL = '✓', '✗'
results = []

def check(name, ok, detail=''):
    results.append(ok)
    icon = PASS if ok else FAIL
    print(f'  {icon} {name}{("  — " + detail) if detail else ""}')

def almost_eq(a, b, tol=0.01):
    return abs((a or 0) - (b or 0)) < tol

def cleanup(prefix):
    for q in requests.get(f'{API}/quotes', headers=H).json() or []:
        if q.get('quote_number', '').startswith(prefix):
            requests.delete(f'{API}/quotes/{q["id"]}', headers=H)

def get_setup():
    """Materiali, trattamenti e supplier già configurati nel DB."""
    mats = requests.get(f'{API}/materials', headers=H).json()
    treats = requests.get(f'{API}/treatments', headers=H).json()
    msups = requests.get(f'{API}/material-suppliers', headers=H).json()
    sups = requests.get(f'{API}/suppliers', headers=H).json()
    m = next(m for m in mats if m.get('supplier_id'))
    msup = next(s for s in msups if s['id'] == m['supplier_id'])
    t = next(t for t in treats if t.get('supplier_id'))
    tsup = next(s for s in sups if s['id'] == t['supplier_id'])
    return m, msup, t, tsup

m, msup, t, tsup = get_setup()
SHIP_M = msup['shipping_cost'] or 0
SHIP_T = tsup['shipping_cost'] or 0
COST_KG = t['cost_per_kg'] or 0
MIN_W = t['minimum_weight_kg'] or 0
MIN_C = t['minimum_cost'] or 0

print(f'Setup DB:')
print(f'  Material supplier ship={SHIP_M}€, Treatment supplier ship={SHIP_T}€')
print(f'  Treatment cost/kg={COST_KG}, min_weight={MIN_W}, min_cost={MIN_C}')
print()

cleanup('AGG-')

# ─── Test 1: Regressione single quote ────────────────────────────────────
print('Test 1: Single quote (regressione)')
q = requests.post(f'{API}/quotes', headers=H, json={
    'quote_number': 'AGG-T1_001', 'customer_name': 'T1',
    'global_margin_percent': 20}).json()
qid, pid = q['id'], q['parts'][0]['id']
requests.put(f'{API}/parts/{pid}', headers=H, json={
    'material_id': m['id'], 'finished_weight_kg': 5, 'quantity': 1})
requests.post(f'{API}/parts/{pid}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': 'heat_treatment',
    'treatment_id': t['id'], 'supplier_id': tsup['id'],
    'setup_hours': 0, 'cycle_hours_per_part': 0,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'customer_visible': True, 'is_shared': False})

q2 = requests.get(f'{API}/quotes/{qid}', headers=H).json()
p2 = q2['parts'][0]
ph = p2['phases'][0]

# 5 kg < min_weight 10 → batch_cost = MIN_C, share = MIN_C × 5/5 = MIN_C
expected_var = MIN_C / 1  # qty=1
check('material_delivery_cost = supplier ship full',
      almost_eq(p2['material_delivery_cost'], SHIP_M),
      f'got={p2["material_delivery_cost"]}, exp={SHIP_M}')
check('treatment fixed_cost = treatment supplier ship full',
      almost_eq(ph['fixed_cost'], SHIP_T),
      f'got={ph["fixed_cost"]}, exp={SHIP_T}')
check('variable_cost_per_part = MIN_C (sotto soglia)',
      almost_eq(ph['variable_cost_per_part'], expected_var),
      f'got={ph["variable_cost_per_part"]}, exp={expected_var}')

requests.delete(f'{API}/quotes/{qid}', headers=H)

# ─── Test 2: Commessa SOTTO soglia ───────────────────────────────────────
print('\nTest 2: Commessa 2 parti, peso totale < soglia')
q = requests.post(f'{API}/quotes', headers=H, json={
    'quote_number': 'AGG-T2_001', 'quote_type': 'commessa',
    'num_components': 2, 'default_quantity': 1,
    'customer_name': 'T2', 'global_margin_percent': 20}).json()
qid, A_id, B_id = q['id'], q['parts'][0]['id'], q['parts'][1]['id']

# A: 5kg × 1, B: 1kg × 2 → totale 7kg < 10
requests.put(f'{API}/parts/{A_id}', headers=H,
             json={'material_id': m['id'], 'finished_weight_kg': 5, 'quantity': 1})
requests.post(f'{API}/parts/{A_id}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': 'heat_treatment',
    'treatment_id': t['id'], 'supplier_id': tsup['id'],
    'setup_hours': 0, 'cycle_hours_per_part': 0,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'customer_visible': True, 'is_shared': False})

requests.put(f'{API}/parts/{B_id}', headers=H,
             json={'material_id': m['id'], 'finished_weight_kg': 1, 'quantity': 2})
requests.post(f'{API}/parts/{B_id}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': 'heat_treatment',
    'treatment_id': t['id'], 'supplier_id': tsup['id'],
    'setup_hours': 0, 'cycle_hours_per_part': 0,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'customer_visible': True, 'is_shared': False})

q2 = requests.get(f'{API}/quotes/{qid}', headers=H).json()
A, B = q2['parts'][0], q2['parts'][1]
fA, fB = A['phases'][0], B['phases'][0]

# WT = 5+2 = 7kg, batch_cost = MIN_C (sotto soglia)
WA, WB, WT = 5, 2, 7
check('A delivery = SHIP_M × 5/7',
      almost_eq(A['material_delivery_cost'], SHIP_M * WA / WT))
check('B delivery = SHIP_M × 2/7',
      almost_eq(B['material_delivery_cost'], SHIP_M * WB / WT))
check('A treatment fixed = SHIP_T × 5/7',
      almost_eq(fA['fixed_cost'], SHIP_T * WA / WT))
check('B treatment fixed = SHIP_T × 2/7',
      almost_eq(fB['fixed_cost'], SHIP_T * WB / WT))
check('A variable = (MIN_C × 5/7) / 1',
      almost_eq(fA['variable_cost_per_part'], MIN_C * WA / WT / 1))
check('B variable = (MIN_C × 2/7) / 2',
      almost_eq(fB['variable_cost_per_part'], MIN_C * WB / WT / 2))

requests.delete(f'{API}/quotes/{qid}', headers=H)

# ─── Test 3: Commessa SOPRA soglia ───────────────────────────────────────
print('\nTest 3: Commessa SOPRA soglia (cost_per_kg attivo)')
# Servono pesi totali > MIN_W. Con MIN_W=10, faccio 2 parti × 6kg = 12kg.
q = requests.post(f'{API}/quotes', headers=H, json={
    'quote_number': 'AGG-T3_001', 'quote_type': 'commessa',
    'num_components': 2, 'default_quantity': 1,
    'customer_name': 'T3', 'global_margin_percent': 20}).json()
qid, A_id, B_id = q['id'], q['parts'][0]['id'], q['parts'][1]['id']

# A: 8kg × 1, B: 2kg × 2 → totale 12kg > 10
requests.put(f'{API}/parts/{A_id}', headers=H,
             json={'material_id': m['id'], 'finished_weight_kg': 8, 'quantity': 1})
requests.post(f'{API}/parts/{A_id}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': 'heat_treatment',
    'treatment_id': t['id'], 'supplier_id': tsup['id'],
    'setup_hours': 0, 'cycle_hours_per_part': 0,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'customer_visible': True, 'is_shared': False})
requests.put(f'{API}/parts/{B_id}', headers=H,
             json={'material_id': m['id'], 'finished_weight_kg': 2, 'quantity': 2})
requests.post(f'{API}/parts/{B_id}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': 'heat_treatment',
    'treatment_id': t['id'], 'supplier_id': tsup['id'],
    'setup_hours': 0, 'cycle_hours_per_part': 0,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'customer_visible': True, 'is_shared': False})

q3 = requests.get(f'{API}/quotes/{qid}', headers=H).json()
A, B = q3['parts'][0], q3['parts'][1]
fA, fB = A['phases'][0], B['phases'][0]

WA, WB, WT = 8, 4, 12
batch_cost = COST_KG * WT  # sopra soglia
# Math nota: A_share = batch_cost × WA/WT = COST_KG × WA = COST_KG × peso_A
# Quindi sopra soglia variable_cost_per_part = COST_KG × finished_weight (lineare)
check('A variable = COST_KG × finished_weight (sopra soglia)',
      almost_eq(fA['variable_cost_per_part'], COST_KG * 8),
      f'got={fA["variable_cost_per_part"]}, exp={COST_KG * 8}')
check('B variable = COST_KG × finished_weight (sopra soglia)',
      almost_eq(fB['variable_cost_per_part'], COST_KG * 2),
      f'got={fB["variable_cost_per_part"]}, exp={COST_KG * 2}')
check('A delivery = SHIP_M × 8/12',
      almost_eq(A['material_delivery_cost'], SHIP_M * WA / WT))
check('B delivery = SHIP_M × 4/12',
      almost_eq(B['material_delivery_cost'], SHIP_M * WB / WT))

requests.delete(f'{API}/quotes/{qid}', headers=H)

# ─── Test 4: Trattamenti DIVERSI nello stesso preventivo ─────────────────
print('\nTest 4: 2 parti con trattamenti DIVERSI (no cross-aggregazione)')
# Creo un secondo trattamento dallo stesso supplier
t2 = requests.post(f'{API}/treatments', headers=H, json={
    'name': 'AGG-T4 brunitura', 'cost_per_kg': 8,
    'minimum_cost': 50, 'minimum_weight_kg': 5,
    'supplier_id': tsup['id']}).json()

q = requests.post(f'{API}/quotes', headers=H, json={
    'quote_number': 'AGG-T4_001', 'quote_type': 'commessa',
    'num_components': 2, 'default_quantity': 1,
    'customer_name': 'T4', 'global_margin_percent': 20}).json()
qid, A_id, B_id = q['id'], q['parts'][0]['id'], q['parts'][1]['id']

# A: 3kg×1 trattamento t (cementazione), B: 2kg×1 trattamento t2 (brunitura)
requests.put(f'{API}/parts/{A_id}', headers=H,
             json={'material_id': m['id'], 'finished_weight_kg': 3, 'quantity': 1})
requests.post(f'{API}/parts/{A_id}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': 'heat_treatment',
    'treatment_id': t['id'], 'supplier_id': tsup['id'],
    'setup_hours': 0, 'cycle_hours_per_part': 0, 'fixed_cost': 0,
    'variable_cost_per_part': 0, 'customer_visible': True, 'is_shared': False})

requests.put(f'{API}/parts/{B_id}', headers=H,
             json={'material_id': m['id'], 'finished_weight_kg': 2, 'quantity': 1})
requests.post(f'{API}/parts/{B_id}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': 'heat_treatment',
    'treatment_id': t2['id'], 'supplier_id': tsup['id'],
    'setup_hours': 0, 'cycle_hours_per_part': 0, 'fixed_cost': 0,
    'variable_cost_per_part': 0, 'customer_visible': True, 'is_shared': False})

q4 = requests.get(f'{API}/quotes/{qid}', headers=H).json()
A, B = q4['parts'][0], q4['parts'][1]
fA, fB = A['phases'][0], B['phases'][0]

# Trattamento t (peso 3kg < 10): MIN_C distribuito = full su A (sola con t)
# A: variable = MIN_C × 3/3 / 1 = MIN_C
# Trattamento t2 (peso 2kg < 5): MIN_C2=50, full su B
# B: variable = 50 × 2/2 / 1 = 50
check('A variable = MIN_C (trattamento t da solo)',
      almost_eq(fA['variable_cost_per_part'], MIN_C))
check('B variable = 50 (trattamento t2 da solo)',
      almost_eq(fB['variable_cost_per_part'], 50))
# Spedizione: stesso supplier tsup → CONDIVISA
# Peso totale ship = 3 + 2 = 5kg
check('A treatment fixed = SHIP_T × 3/5 (stesso supplier)',
      almost_eq(fA['fixed_cost'], SHIP_T * 3 / 5))
check('B treatment fixed = SHIP_T × 2/5 (stesso supplier)',
      almost_eq(fB['fixed_cost'], SHIP_T * 2 / 5))

requests.delete(f'{API}/quotes/{qid}', headers=H)
requests.delete(f'{API}/treatments/{t2["id"]}', headers=H)

# ─── Test 5: Modifica qty + reload ───────────────────────────────────────
print('\nTest 5: Modifica qty di una parte, aggregazione si aggiorna')
q = requests.post(f'{API}/quotes', headers=H, json={
    'quote_number': 'AGG-T5_001', 'quote_type': 'commessa',
    'num_components': 2, 'default_quantity': 1,
    'customer_name': 'T5', 'global_margin_percent': 20}).json()
qid, A_id, B_id = q['id'], q['parts'][0]['id'], q['parts'][1]['id']

requests.put(f'{API}/parts/{A_id}', headers=H,
             json={'material_id': m['id'], 'finished_weight_kg': 5, 'quantity': 1})
requests.post(f'{API}/parts/{A_id}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': 'heat_treatment',
    'treatment_id': t['id'], 'supplier_id': tsup['id'],
    'setup_hours': 0, 'cycle_hours_per_part': 0, 'fixed_cost': 0,
    'variable_cost_per_part': 0, 'customer_visible': True, 'is_shared': False})
requests.put(f'{API}/parts/{B_id}', headers=H,
             json={'material_id': m['id'], 'finished_weight_kg': 1, 'quantity': 1})  # qty=1 inizialmente
requests.post(f'{API}/parts/{B_id}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': 'heat_treatment',
    'treatment_id': t['id'], 'supplier_id': tsup['id'],
    'setup_hours': 0, 'cycle_hours_per_part': 0, 'fixed_cost': 0,
    'variable_cost_per_part': 0, 'customer_visible': True, 'is_shared': False})

# Stato iniziale: WA=5, WB=1, WT=6
q5a = requests.get(f'{API}/quotes/{qid}', headers=H).json()
A_initial = q5a['parts'][0]['material_delivery_cost']
check('A delivery iniziale = SHIP_M × 5/6',
      almost_eq(A_initial, SHIP_M * 5 / 6),
      f'got={A_initial}')

# Modifica qty di B da 1 a 5: nuovo WB = 5, WT = 10
requests.put(f'{API}/parts/{B_id}', headers=H, json={'quantity': 5})

q5b = requests.get(f'{API}/quotes/{qid}', headers=H).json()
A_after = q5b['parts'][0]['material_delivery_cost']
B_after = q5b['parts'][1]['material_delivery_cost']
check('A delivery dopo qty=5 su B: SHIP_M × 5/10',
      almost_eq(A_after, SHIP_M * 5 / 10),
      f'got={A_after}, exp={SHIP_M * 5 / 10}')
check('B delivery dopo qty=5 su B: SHIP_M × 5/10',
      almost_eq(B_after, SHIP_M * 5 / 10),
      f'got={B_after}, exp={SHIP_M * 5 / 10}')

requests.delete(f'{API}/quotes/{qid}', headers=H)

# ─── Test 6: Total cost coerente ─────────────────────────────────────────
print('\nTest 6: Coerenza somma totale parte')
q = requests.post(f'{API}/quotes', headers=H, json={
    'quote_number': 'AGG-T6_001', 'customer_name': 'T6',
    'global_margin_percent': 0}).json()  # margine 0 per non confondere
qid, pid = q['id'], q['parts'][0]['id']
requests.put(f'{API}/parts/{pid}', headers=H, json={
    'material_id': m['id'], 'finished_weight_kg': 4, 'quantity': 2,
    'raw_x_mm': 100, 'raw_y_mm': 50, 'raw_z_mm': 20})
# Aggiungo 1 fase non-treatment con setup
machines = requests.get(f'{API}/machines', headers=H).json()
mc = next(mc for mc in machines if mc['machine_type'] == 'cnc_3_axis')
requests.post(f'{API}/parts/{pid}/phases', headers=H, json={
    'sequence_number': 10, 'phase_type': 'cnc_milling',
    'machine_id': mc['id'],
    'setup_hours': 0.5, 'cycle_hours_per_part': 0.25,
    'fixed_cost': 0, 'variable_cost_per_part': 0,
    'customer_visible': True, 'is_shared': False})

q6 = requests.get(f'{API}/quotes/{qid}', headers=H).json()
p = q6['parts'][0]
ph = p['phases'][0]
material_per_pz = p['material_cost'] or 0
delivery_per_pz = (p['material_delivery_cost'] or 0) / p['quantity']
cutting_per_pz = (m.get('material_supplier', {}) or {}).get('cutting_cost_per_part', 0) or 0
phase_per_pz = ph['calculated_cost']
total_check = material_per_pz + delivery_per_pz + cutting_per_pz + phase_per_pz
check('total_cost = material + delivery/qty + cutting + phases',
      almost_eq(p['total_cost'], total_check),
      f'got={p["total_cost"]}, exp={total_check:.4f}')
check('total_price = unit_price × qty',
      almost_eq(p['total_price'], p['unit_price'] * p['quantity']))

requests.delete(f'{API}/quotes/{qid}', headers=H)

# ─── Summary ─────────────────────────────────────────────────────────────
cleanup('AGG-')
print()
print('=' * 60)
ok_count = sum(1 for r in results if r)
fail_count = sum(1 for r in results if not r)
print(f'TOTALE: {ok_count} {PASS}   {fail_count} {FAIL}')
print('=' * 60)
sys.exit(0 if fail_count == 0 else 1)
