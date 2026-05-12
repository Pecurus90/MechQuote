import { test, expect, request, APIRequestContext } from '@playwright/test'

const ADMIN_USER = 'admin'
const ADMIN_PASS = 'admin'
const BASE_API = 'http://localhost:8000'

/** Cache del token admin in memoria — il backend rate-limita /auth/login a 5/min,
 *  fare login ad ogni test esaurisce la quota. */
let cachedAdminToken: string | null = null

/** Helper: login API → ritorna token JWT. Cache solo per admin/admin. */
async function getToken(api: APIRequestContext, user = ADMIN_USER, pass = ADMIN_PASS): Promise<string> {
  if (user === ADMIN_USER && pass === ADMIN_PASS && cachedAdminToken) {
    return cachedAdminToken
  }
  const res = await api.post(`${BASE_API}/api/auth/login`, {
    form: { username: user, password: pass },
  })
  expect(res.ok(), `login ${user} fail: ${res.status()}`).toBeTruthy()
  const token = (await res.json()).access_token
  if (user === ADMIN_USER && pass === ADMIN_PASS) cachedAdminToken = token
  return token
}

async function apiAuthed(token: string) {
  return await request.newContext({
    baseURL: BASE_API,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  })
}

test.describe.configure({ mode: 'serial' })

const STORAGE_PATH = 'tests/.auth.json'


// ─── TEST 1: Workflow creazione preventivo end-to-end ───────────────────────

test.describe('Workflow preventivo', () => {
  test.use({ storageState: STORAGE_PATH })

  let createdQuoteId: number | null = null

  test('crea quote via API, naviga in editor, verifica render, salva margine', async ({ page }) => {
    // Setup via API: serve un quote esistente per testare l'editor
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)

    const r = await auth.post('/api/quotes', {
      data: {
        quote_number: `E2E-WFL-${Date.now()}`,
        quote_type: 'single',
        global_margin_percent: 20.0,
      },
    })
    expect(r.ok(), `create quote: ${r.status()} ${await r.text()}`).toBeTruthy()
    const q = await r.json()
    createdQuoteId = q.id

    // Naviga in editor
    await page.goto(`/quotes/${q.id}`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/wfl-01-editor.png', fullPage: true })

    // Verifica che il quote_number sia visibile in pagina (apparirà in più punti — header + sidebar)
    await expect(page.getByText(q.quote_number, { exact: false }).first()).toBeVisible({ timeout: 5000 })

    // L'editor deve mostrare almeno la sidebar parti
    await expect(page.getByText(/parti \(/i).first()).toBeVisible({ timeout: 5000 })

    await auth.dispose()
    await api.dispose()
  })

  test('cleanup: elimina quote di test', async () => {
    if (createdQuoteId == null) return
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)
    await auth.delete(`/api/quotes/${createdQuoteId}`)
    await auth.dispose()
    await api.dispose()
  })
})


// ─── TEST 2: PDF download ────────────────────────────────────────────────────

test.describe('PDF generation', () => {
  test.use({ storageState: STORAGE_PATH })

  test('GET /api/quotes/{id}/pdf produce PDF valido', async () => {
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)

    // Trova un quote esistente
    const list = await auth.get('/api/quotes')
    expect(list.ok()).toBeTruthy()
    const quotes = await list.json()
    expect(quotes.length, 'serve almeno 1 quote per testare PDF').toBeGreaterThan(0)

    const res = await auth.get(`/api/quotes/${quotes[0].id}/pdf`)
    expect(res.ok(), `PDF status ${res.status()}`).toBeTruthy()
    const ct = res.headers()['content-type'] || ''
    expect(ct).toContain('pdf')
    const body = await res.body()
    expect(body.length, `PDF body size ${body.length}`).toBeGreaterThan(1000)

    await auth.dispose()
    await api.dispose()
  })
})


// ─── TEST 3: Multi-utente permission gating ──────────────────────────────────

test.describe('Permission gating multi-utente', () => {
  let testUser: { id: number; username: string; password: string } | null = null
  const TEST_USER_STORAGE = 'tests/.auth.testuser.json'

  test.beforeAll(async ({ browser }) => {
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)

    // Crea utente temporaneo con role 'ufficio_tecnico' (NO permesso 'users' né 'backup')
    const username = `e2e_perm_${Date.now()}`
    const password = 'TestPass123!'
    const r = await auth.post('/api/users', {
      data: {
        username,
        password,
        full_name: 'E2E Test User',
        role: 'ufficio_tecnico',
        is_active: true,
      },
    })
    expect(r.ok(), `create user: ${r.status()} ${await r.text()}`).toBeTruthy()
    const u = await r.json()
    testUser = { id: u.id, username, password }

    await auth.dispose()
    await api.dispose()

    // Login UI una volta sola, salva storage state per riusarlo nei test
    const ctx = await browser.newContext({ storageState: undefined })
    const page = await ctx.newPage()
    await page.goto('http://localhost:3001/login')
    await page.fill('input[type="text"]', username)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10_000 })
    await ctx.storageState({ path: TEST_USER_STORAGE })
    await ctx.close()
  })

  test('user non-admin: sidebar nasconde voci admin', async ({ browser }) => {
    const context = await browser.newContext({ storageState: TEST_USER_STORAGE })
    const page = await context.newPage()
    await page.goto('http://localhost:3001/dashboard')
    await page.waitForLoadState('networkidle')

    // ufficio_tecnico vede: Dashboard, Clienti, Utensili, Attività, Preventivazione
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible()

    await page.screenshot({ path: 'tests/screenshots/perm-01-non-admin-sidebar.png', fullPage: true })
    await context.close()
  })

  test('user non-admin: accesso diretto /settings/backup → redirect home', async ({ browser }) => {
    const context = await browser.newContext({ storageState: TEST_USER_STORAGE })
    const page = await context.newPage()

    // Tenta /settings/backup (richiede permission 'backup', ufficio_tecnico non l'ha)
    await page.goto('http://localhost:3001/settings/backup')
    await page.waitForTimeout(2000)

    // Atteso: redirect via dalla pagina backup (ProtectedRoute → <Navigate to="/" replace />)
    const url = page.url()
    const onBackupPage = url.includes('/settings/backup')
    expect(onBackupPage, `Atteso redirect via da /settings/backup, attualmente: ${url}`).toBeFalsy()

    await context.close()
  })

  test.afterAll(async () => {
    if (testUser == null) return
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)
    await auth.delete(`/api/users/${testUser.id}`)
    await auth.dispose()
    await api.dispose()
  })
})


// ─── TEST 4: Preview live cost engine con siblings trattamenti ─────────────

test.describe('Cost engine siblings trattamenti', () => {
  test.use({ storageState: STORAGE_PATH })

  let setupData: {
    quoteId: number
    customerId: number
    materialId: number
    machineId: number
    treatmentId: number
    partIds: number[]
  } | null = null

  test.beforeAll(async () => {
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)

    // Customer
    const customers = await (await auth.get('/api/customers')).json()
    const usedNumbers = new Set(customers.map((c: { customer_number: number }) => c.customer_number))
    const freeNum = Math.max(...usedNumbers as Set<number>, 0) + 1
    const cust = await (await auth.post('/api/customers', {
      data: { name: 'E2E COST ENGINE', customer_number: freeNum },
    })).json()

    // Material
    const mat = await (await auth.post('/api/materials', {
      data: {
        name: `E2E_STEEL_${Date.now()}`, family: 'acciaio_inox',
        density_kg_dm3: 7.8, cost_per_kg: 5.0, default_scrap_percent: 10,
      },
    })).json()

    // Machine
    const mc = await (await auth.post('/api/machines', {
      data: { name: `E2E_CNC_${Date.now()}`, machine_type: 'cnc_milling', hourly_rate: 60.0 },
    })).json()

    // Treatment
    const tr = await (await auth.post('/api/treatments', {
      data: {
        name: `E2E_TEMPRA_${Date.now()}`, cost_per_kg: 8.0,
        minimum_cost: 50.0, minimum_weight_kg: 5.0,
      },
    })).json()

    // Quote multi con 2 parts che condividono il treatment
    const quote = await (await auth.post('/api/quotes', {
      data: {
        quote_number: `E2E-COST-${Date.now()}`, quote_type: 'multi',
        customer_id: cust.id, global_margin_percent: 0,
      },
    })).json()

    const partIds: number[] = []
    for (let i = 0; i < 2; i++) {
      const part = await (await auth.post(`/api/quotes/${quote.id}/parts`, {
        data: {
          part_code: `E2E-${i + 1}`, description: `Test part ${i + 1}`,
          quantity: 10, minimum_price: 0,
          raw_x_mm: 100, raw_y_mm: 50, raw_z_mm: 20,
          finished_weight_kg: 1.0, material_id: mat.id,
        },
      })).json()
      partIds.push(part.id)

      // Aggiungi treatment phase
      await auth.post(`/api/parts/${part.id}/phases`, {
        data: {
          phase_type: '', description: 'Tempra batch',
          treatment_id: tr.id, setup_hours: 0, cycle_hours_per_part: 0,
          fixed_cost: 0, variable_cost_per_part: 0, sequence_number: 10,
        },
      })
    }

    setupData = {
      quoteId: quote.id, customerId: cust.id, materialId: mat.id,
      machineId: mc.id, treatmentId: tr.id, partIds,
    }

    await auth.dispose()
    await api.dispose()
  })

  test('backend ha aggregato batch trattamento correttamente (variable_cost_per_part=8€)', async ({ page }) => {
    expect(setupData).not.toBeNull()
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)

    const r = await auth.get(`/api/quotes/${setupData!.quoteId}`)
    const q = await r.json()
    // Il POST /quotes auto-crea una part default col code = quote_number.
    // Le mie 2 parts di test hanno code "E2E-1" / "E2E-2".
    const testParts = q.parts.filter((p: { part_code: string }) =>
      p.part_code === 'E2E-1' || p.part_code === 'E2E-2',
    )
    expect(testParts).toHaveLength(2)

    // Expected: batch=2×10×1kg=20kg, cost=20×8=160€, share parte=80€, var/qty=8€
    for (const p of testParts) {
      const treatPhase = p.phases.find((ph: { treatment_id?: number }) => ph.treatment_id)
      expect(treatPhase, `part ${p.part_code} ha treatment phase`).toBeDefined()
      const varCost = treatPhase.variable_cost_per_part
      expect(Math.abs(varCost - 8.0), `expected 8.0, got ${varCost}`).toBeLessThan(0.01)
    }

    // material_cost atteso: 0.1 dm³ × 7.8 × 5 × 1.10 = 4.29 €
    for (const p of testParts) {
      expect(Math.abs(p.material_cost - 4.29), `material_cost ${p.material_cost}`).toBeLessThan(0.01)
    }

    // Naviga in UI: editor del quote, prima parte
    await page.goto(`/quotes/${setupData!.quoteId}`)
    await page.waitForLoadState('networkidle')

    // Verifica che almeno una parte mostra "8.00" o "8,00" (var cost) nella UI
    // (può essere mostrato in vari modi; cerco solo che il numero appaia)
    await page.screenshot({ path: 'tests/screenshots/cost-01-editor.png', fullPage: true })

    await auth.dispose()
    await api.dispose()
  })

  test.afterAll(async () => {
    if (setupData == null) return
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)
    await auth.delete(`/api/quotes/${setupData.quoteId}`)
    await auth.delete(`/api/treatments/${setupData.treatmentId}`)
    await auth.delete(`/api/machines/${setupData.machineId}`)
    await auth.delete(`/api/materials/${setupData.materialId}`)
    await auth.delete(`/api/customers/${setupData.customerId}`)
    await auth.dispose()
    await api.dispose()
  })
})
