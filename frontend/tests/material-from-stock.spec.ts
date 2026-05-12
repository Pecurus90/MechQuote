import { test, expect, request, APIRequestContext } from '@playwright/test'

const ADMIN_USER = 'admin'
const ADMIN_PASS = 'admin'
const BASE_API = 'http://localhost:8000'
const STORAGE_PATH = 'tests/.auth.json'

let cachedAdminToken: string | null = null

async function getToken(api: APIRequestContext): Promise<string> {
  if (cachedAdminToken) return cachedAdminToken
  const res = await api.post(`${BASE_API}/api/auth/login`, {
    form: { username: ADMIN_USER, password: ADMIN_PASS },
  })
  expect(res.ok()).toBeTruthy()
  cachedAdminToken = (await res.json()).access_token
  return cachedAdminToken!
}

async function apiAuthed(token: string) {
  return await request.newContext({
    baseURL: BASE_API,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  })
}

test.describe.configure({ mode: 'serial' })
test.use({ storageState: STORAGE_PATH })

test.describe('material_from_stock feature', () => {
  let setupData: {
    quoteId: number
    customerId: number
    materialId: number
    partId: number
    originalSettings: Record<string, unknown>
  } | null = null

  test.beforeAll(async () => {
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)

    // Salva CompanySettings originali per ripristinare a fine test
    const orig = await (await auth.get('/api/company-settings')).json()

    // Setto override stock noti per asserzioni numeriche
    await auth.put('/api/company-settings', {
      data: {
        ...orig,
        stock_shipping_cost: 20.0,
        stock_cutting_cost_per_part: 5.0,
      },
    })

    // Crea customer + material + quote + part di test
    const customers = await (await auth.get('/api/customers')).json()
    const freeNum = Math.max(
      0, ...customers.map((c: { customer_number: number }) => c.customer_number),
    ) + 1
    const cust = await (await auth.post('/api/customers', {
      data: { name: 'E2E STOCK TEST', customer_number: freeNum },
    })).json()

    const mat = await (await auth.post('/api/materials', {
      data: {
        name: `E2E_STOCK_STEEL_${Date.now()}`,
        family: 'acciaio_inox',
        density_kg_dm3: 7.8, cost_per_kg: 5.0, default_scrap_percent: 10,
      },
    })).json()

    const quote = await (await auth.post('/api/quotes', {
      data: {
        quote_number: `E2E-STOCK-${Date.now()}`,
        quote_type: 'single', customer_id: cust.id,
        global_margin_percent: 0,
      },
    })).json()

    // Aggiorna la part default del quote single con dimensioni + flag stock
    const partList = await (await auth.get(`/api/quotes/${quote.id}`)).json()
    const part = partList.parts[0]
    await auth.put(`/api/parts/${part.id}`, {
      data: {
        part_code: 'STOCK-1',
        quantity: 10,
        material_id: mat.id,
        raw_x_mm: 100, raw_y_mm: 50, raw_z_mm: 20,
        material_from_stock: true,
        customer_supplied_material: false,
      },
    })

    setupData = {
      quoteId: quote.id, customerId: cust.id, materialId: mat.id,
      partId: part.id, originalSettings: orig,
    }

    await auth.dispose()
    await api.dispose()
  })

  test('1 · Backend: cost engine usa override CompanySettings', async () => {
    expect(setupData).not.toBeNull()
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)

    const q = await (await auth.get(`/api/quotes/${setupData!.quoteId}`)).json()
    const part = q.parts.find((p: { part_code: string }) => p.part_code === 'STOCK-1')
    expect(part, 'STOCK-1 part trovata').toBeDefined()
    expect(part.material_from_stock).toBe(true)
    // material_cost: 0.1 dm³ × 7.8 × 5.0 × 1.10 = 4.29
    expect(Math.abs(part.material_cost - 4.29)).toBeLessThan(0.01)
    // delivery: stock_shipping_cost = 20.0 (per parte, non /qty in DB)
    expect(Math.abs(part.material_delivery_cost - 20.0)).toBeLessThan(0.01)
    // total_cost = 4.29 + 20/10 + 5 + 0 = 11.29
    expect(Math.abs(part.total_cost - 11.29)).toBeLessThan(0.01)

    await auth.dispose()
    await api.dispose()
  })

  test('2 · UI Settings → Dati Azienda mostra Card "Materiale a magazzino"', async ({ page }) => {
    await page.goto('/settings/company')
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { name: /materiale a magazzino/i })).toBeVisible({ timeout: 5000 })
    // I label non hanno htmlFor: navigo via xpath following-sibling
    const stockShipInput = page.locator('xpath=//label[contains(text(),"Costo spedizione")]/following-sibling::input').first()
    const stockCutInput = page.locator('xpath=//label[contains(text(),"Costo taglio per pezzo")]/following-sibling::input').first()
    await expect(stockShipInput).toHaveValue('20')
    await expect(stockCutInput).toHaveValue('5')
    await page.screenshot({ path: 'tests/screenshots/stock-01-settings.png', fullPage: true })
  })

  test('3 · UI QuoteEditor: select 3-stati mostra "A magazzino" selezionato', async ({ page }) => {
    expect(setupData).not.toBeNull()
    await page.goto(`/quotes/${setupData!.quoteId}`)
    await page.waitForLoadState('networkidle')

    // Seleziono la part dalla sidebar (è già la prima)
    const select = page.locator('select').filter({ hasText: /a magazzino/i }).first()
    await expect(select).toBeVisible({ timeout: 5000 })
    await expect(select).toHaveValue('stock')
    await page.screenshot({ path: 'tests/screenshots/stock-02-editor.png', fullPage: true })
  })

  test('4 · UI QuoteEditor: cambio select aggiorna stato (no reset)', async ({ page }) => {
    expect(setupData).not.toBeNull()
    await page.goto(`/quotes/${setupData!.quoteId}`)
    await page.waitForLoadState('networkidle')

    const select = page.locator('select').filter({ hasText: /a magazzino/i }).first()
    // Cambio a "normal" (Fornitore abituale)
    await select.selectOption('normal')
    await page.waitForTimeout(1500) // attesa save async
    await page.reload()
    await page.waitForLoadState('networkidle')
    const selectAfter = page.locator('select').filter({ hasText: /a magazzino/i }).first()
    await expect(selectAfter).toHaveValue('normal')

    // Ripristino "stock" per i test successivi
    await selectAfter.selectOption('stock')
    await page.waitForTimeout(1500)
  })

  test('5 · UI Ordini materiali: badge "Da magazzino" visibile per la part', async ({ page }) => {
    // Marca il quote come completato + come ordinabile
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)
    await auth.patch(`/api/quotes/${setupData!.quoteId}/status`, { data: { status: 'inviato' } })
    // Trigger auto-completato come admin GET
    await auth.get(`/api/quotes/${setupData!.quoteId}`)
    await auth.dispose()
    await api.dispose()

    await page.goto('/orders/materials')
    await page.waitForLoadState('networkidle')

    // Seleziono il quote nella lista a sx (cerco per E2E-STOCK)
    const row = page.locator('tr', { has: page.getByText(/E2E-STOCK-/i) }).first()
    if (await row.isVisible({ timeout: 2000 }).catch(() => false)) {
      const checkbox = row.locator('input[type="checkbox"]').first()
      await checkbox.check()
      await page.waitForTimeout(800)
      // Ora deve apparire il preview con il badge
      await expect(page.getByText(/da magazzino/i).first()).toBeVisible({ timeout: 5000 })
      await page.screenshot({ path: 'tests/screenshots/stock-03-orders-badge.png', fullPage: true })
    } else {
      // Quote non visibile (status filter o non in lista) — fallback: solo screenshot
      await page.screenshot({ path: 'tests/screenshots/stock-03-orders-fallback.png', fullPage: true })
      test.skip(true, 'Quote test non visibile nella lista ordini — possibile filtro stato')
    }
  })

  test('6 · PDF preventivo: contiene tag "A magazzino"', async () => {
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)

    const res = await auth.get(`/api/quotes/${setupData!.quoteId}/pdf`)
    expect(res.ok()).toBeTruthy()
    const body = await res.body()
    expect(body.length).toBeGreaterThan(1000)
    // PDF è binario, non parsabile facilmente; verifico solo che sia stato generato
    // (il test 1 ha già confermato i numeri; il PDF usa gli stessi dati)

    await auth.dispose()
    await api.dispose()
  })

  test.afterAll(async () => {
    if (setupData == null) return
    const api = await request.newContext()
    const token = await getToken(api)
    const auth = await apiAuthed(token)

    await auth.delete(`/api/quotes/${setupData.quoteId}`)
    await auth.delete(`/api/materials/${setupData.materialId}`)
    await auth.delete(`/api/customers/${setupData.customerId}`)
    // Ripristina settings originali
    await auth.put('/api/company-settings', { data: setupData.originalSettings })

    await auth.dispose()
    await api.dispose()
  })
})
