"""Test E2E approfondito MechQuote — copre i flussi critici post-sprint.

Avvia con: cd backend && venv/bin/python /tmp/e2e_test.py

Pre-req: backend su :8000, frontend dev su :3000, admin/admin in DB.
"""
import requests
import sys
from playwright.sync_api import sync_playwright

# ─── Helpers ─────────────────────────────────────────────────────────────

PASS, FAIL, WARN = '✓', '✗', '⚠'
results = []

def step(name, ok, detail=''):
    icon = PASS if ok else FAIL
    results.append((ok, name, detail))
    print(f'{icon} {name}{("  — " + detail) if detail else ""}')

def warn(name, detail=''):
    results.append((None, name, detail))
    print(f'{WARN} {name}{("  — " + detail) if detail else ""}')

# ─── Setup ───────────────────────────────────────────────────────────────

print('=' * 70)
print('TEST E2E MechQuote')
print('=' * 70)

r = requests.post('http://localhost:8000/api/auth/login',
                  data={'username': 'admin', 'password': 'admin'})
if r.status_code != 200:
    print(f'{FAIL} Login API fallito: {r.status_code}')
    sys.exit(1)
token = r.json()['access_token']
print(f'{PASS} Login API   token len={len(token)}')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 1400, 'height': 900})
    page = ctx.new_page()

    # Cattura tutti gli errori per riportare alla fine
    console_errors = []
    page_errors = []
    page.on('console', lambda msg:
            console_errors.append((msg.type, msg.text))
            if msg.type == 'error' and 'Future Flag' not in msg.text else None)
    page.on('pageerror', lambda exc: page_errors.append(str(exc)))

    page.goto('http://localhost:3000/login')
    page.evaluate(f"localStorage.setItem('token', '{token}')")

    # ─── 1. Dashboard ──────────────────────────────────────────────────
    page.goto('http://localhost:3000/dashboard')
    page.wait_for_timeout(2000)
    body = page.locator('body').inner_text()
    step('Dashboard si carica',
         'Dashboard' in body and 'MechQuote' in body,
         f'body={len(body)}ch')

    # ─── 2. Nuovo Preventivo Manuale ───────────────────────────────────
    page.goto('http://localhost:3000/quotes/new')
    page.wait_for_timeout(2000)
    body = page.locator('body').inner_text()
    step('Pagina "Nuovo Preventivo" si carica',
         'Nuovo' in body or 'Preventivo' in body,
         f'body={len(body)}ch')

    # ─── 3. Quotes archive ─────────────────────────────────────────────
    page.goto('http://localhost:3000/quotes/archive')
    page.wait_for_timeout(2000)
    body = page.locator('body').inner_text()
    step('Archivio Preventivi si carica',
         'Archivio' in body or 'Preventiv' in body,
         f'body={len(body)}ch')

    # ─── 4. Wizard 2D DXF ──────────────────────────────────────────────
    page.goto('http://localhost:3000/quotes/2d/new')
    page.wait_for_timeout(2500)
    body = page.locator('body').inner_text()
    step('Wizard 2D si carica',
         'Trascina' in body and 'DXF' in body,
         f'body={len(body)}ch')

    # ─── 5. Settings principali ────────────────────────────────────────
    settings_pages = [
        ('/settings/materials', 'Materiali'),
        ('/settings/machines', 'Macchine'),
        ('/settings/treatments', 'Trattamenti'),
        ('/settings/operations', 'Lavorazioni'),
        ('/settings/workflows', 'Template flusso'),
        ('/settings/categories', 'Categorie'),
        ('/settings/customers', 'Clienti'),
        ('/settings/edm/speeds', 'Velocità'),
        ('/settings/edm/cycles', 'Cicli'),
        ('/settings/edm/drilling', 'foratura'),
        ('/settings/edm/config', 'Parametri'),
        ('/settings/company', 'Azienda'),
        ('/settings/users', 'Utenti'),
        ('/settings/roles', 'Ruoli'),
        ('/settings/backup', 'Backup'),
    ]
    for path, expected_text in settings_pages:
        page.goto(f'http://localhost:3000{path}')
        page.wait_for_timeout(1200)
        body = page.locator('body').inner_text()
        ok = expected_text.lower() in body.lower()
        step(f'Settings {path}', ok, f'body={len(body)}ch')

    # ─── 6. Crea preventivo via API + apri editor ──────────────────────
    headers = {'Authorization': f'Bearer {token}'}
    qn = 'E2E-99Z_999'
    # Cleanup eventuale precedente
    list_q = requests.get('http://localhost:8000/api/quotes', headers=headers).json()
    if isinstance(list_q, list):
        for q in list_q:
            if q.get('quote_number') == qn:
                requests.delete(f"http://localhost:8000/api/quotes/{q['id']}", headers=headers)

    r = requests.post('http://localhost:8000/api/quotes',
                      headers=headers,
                      json={'quote_number': qn, 'quote_type': 'single',
                            'customer_name': 'TEST E2E',
                            'global_margin_percent': 25, 'default_quantity': 1})
    if r.status_code != 200:
        step('Crea preventivo via API', False, f'HTTP {r.status_code}: {r.text[:200]}')
    else:
        quote = r.json()
        quote_id = quote['id']
        part_id = quote['parts'][0]['id']
        step('Crea preventivo via API', True, f'id={quote_id}, part_id={part_id}')

        # Apri editor
        page.goto(f'http://localhost:3000/quotes/{quote_id}')
        page.wait_for_timeout(2500)
        body = page.locator('body').inner_text()
        step(f'QuoteEditor si carica (id={quote_id})',
             qn in body, f'body={len(body)}ch')

        # ─── 7. Aggiungi fase manuale via API + check costo ────────────
        # Trova una macchina cnc
        machines = requests.get('http://localhost:8000/api/machines', headers=headers).json()
        cnc_machine = next((m for m in machines if m['machine_type'] == 'cnc_3_axis'), None)
        if cnc_machine:
            r = requests.post(f'http://localhost:8000/api/parts/{part_id}/phases',
                              headers=headers,
                              json={'sequence_number': 10, 'phase_type': 'cnc_milling',
                                    'machine_id': cnc_machine['id'],
                                    'setup_hours': 1, 'cycle_hours_per_part': 0.5,
                                    'fixed_cost': 0, 'variable_cost_per_part': 0,
                                    'customer_visible': True, 'is_shared': False})
            if r.status_code == 200:
                phase = r.json()
                # Setup 1h × setup_rate + ciclo 0.5h × work_rate, qty 1
                expected_min = 0.5 * cnc_machine['hourly_rate']
                ok = phase['calculated_cost'] > expected_min - 1
                step('Fase manuale: cost > 0',
                     ok, f"calc={phase['calculated_cost']}€, expected>~{expected_min}€")
            else:
                step('Aggiungi fase manuale', False, f'HTTP {r.status_code}')

        # ─── 8. Aggiungi fase wire_edm con campi DXF popolati ──────────
        wire_edm = next((m for m in machines if m['machine_type'] == 'wire_edm'), None)
        cycles = requests.get('http://localhost:8000/api/cutting-cycles', headers=headers).json()
        material = next((m for m in
                         requests.get('http://localhost:8000/api/materials', headers=headers).json()
                         if m['family']), None)
        if wire_edm and cycles and material:
            # Setup part con materiale + altezza compatibile
            requests.put(f'http://localhost:8000/api/parts/{part_id}',
                         headers=headers,
                         json={'material_id': material['id'], 'raw_z_mm': 8})

            r = requests.post(f'http://localhost:8000/api/parts/{part_id}/phases',
                              headers=headers,
                              json={'sequence_number': 20, 'phase_type': 'wire_edm',
                                    'machine_id': wire_edm['id'],
                                    'cut_length_mm': 250, 'cut_height_mm': 8,
                                    'cutting_cycle_id': cycles[0]['id'], 'n_pierce': 2,
                                    'dxf_profile_ids': [1, 2],
                                    'setup_hours': 0, 'cycle_hours_per_part': 0,
                                    'fixed_cost': 0, 'variable_cost_per_part': 0,
                                    'customer_visible': True, 'is_shared': False})
            if r.status_code == 200:
                phase = r.json()
                ok = (phase['cycle_hours_per_part'] is not None and
                      phase['cycle_hours_per_part'] > 0 and
                      phase['cut_length_mm'] == 250)
                step('Fase wire_edm: autocalc + campi DXF persistiti',
                     ok, f"cut_length={phase['cut_length_mm']}, "
                         f"cycle_h={phase['cycle_hours_per_part']}")
            else:
                step('Aggiungi fase wire_edm', False, f'HTTP {r.status_code}: {r.text[:200]}')

        # ─── 9. PDF export ─────────────────────────────────────────────
        r = requests.get(f'http://localhost:8000/api/quotes/{quote_id}/pdf',
                         headers=headers)
        ok = r.status_code == 200 and r.content[:4] == b'%PDF'
        step('PDF generato', ok,
             f'HTTP {r.status_code}, size={len(r.content)}B')

        # ─── 10. Cleanup ────────────────────────────────────────────────
        r = requests.delete(f'http://localhost:8000/api/quotes/{quote_id}',
                            headers=headers)
        step('Cleanup preventivo test', r.status_code in (200, 204),
             f'HTTP {r.status_code}')

    # ─── 11. Backup ───────────────────────────────────────────────────
    r = requests.get('http://localhost:8000/api/backup/export', headers=headers)
    ok = r.status_code == 200 and r.headers.get('content-type', '').startswith('application/json')
    step('Backup export funzionante', ok,
         f'HTTP {r.status_code}, size={len(r.content)}B')

    # ─── Summary errori console ────────────────────────────────────────
    print()
    print('=' * 70)
    print('Console errors raccolti durante tutti gli step:')
    print('=' * 70)
    if not console_errors:
        print(f'{PASS} Nessun errore console')
    else:
        for typ, txt in console_errors[:20]:
            print(f'  [{typ}] {txt[:300]}')

    print()
    print('Page errors:')
    if not page_errors:
        print(f'{PASS} Nessun page error')
    else:
        for e in page_errors[:10]:
            print(f'  - {e[:500]}')

    browser.close()

# ─── Final summary ─────────────────────────────────────────────────────
print()
print('=' * 70)
ok_count = sum(1 for r in results if r[0] is True)
fail_count = sum(1 for r in results if r[0] is False)
warn_count = sum(1 for r in results if r[0] is None)
print(f'TOTALE: {ok_count} {PASS}   {fail_count} {FAIL}   {warn_count} {WARN}')
print('=' * 70)
sys.exit(0 if fail_count == 0 else 1)
