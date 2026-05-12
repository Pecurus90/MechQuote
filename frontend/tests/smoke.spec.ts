import { test, expect, Page } from '@playwright/test'

const ADMIN_USER = 'admin'
const ADMIN_PASS = 'admin'
const STORAGE_PATH = 'tests/.auth.json'

/** Login una volta sola in setup, salva storage state per i test successivi.
 *  Il backend rate-limita /auth/login a 5/min → non possiamo fare login 14 volte. */
test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  // Override storageState=undefined: serve un browser context PULITO per fare login.
  const context = await browser.newContext({ storageState: undefined })
  const page = await context.newPage()
  await page.goto('http://localhost:3001/login')
  await page.fill('input[type="text"]', ADMIN_USER)
  await page.fill('input[type="password"]', ADMIN_PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10_000 })
  await context.storageState({ path: STORAGE_PATH })
  await context.close()
})

/** Helper: assert no errori console visibili (filtra warning di dev). */
function attachConsoleSpy(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (text.includes('Download the React DevTools')) return
      if (text.includes('Failed to load resource')) return
      errors.push(`console.error: ${text}`)
    }
  })
  return errors
}

// Tutti i test usano lo stato auth salvato → niente login ripetuti.
test.use({ storageState: STORAGE_PATH })

test.describe('MechQuote smoke (auth shared)', () => {
  test('2 · Dashboard si apre con auth', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/02-dashboard.png', fullPage: true })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('3 · Sidebar voci principali visibili', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('link', { name: /dashboard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /clienti/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /utensili/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /attività/i })).toBeVisible()
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('4 · Clienti page', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/settings/customers')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/04-customers.png', fullPage: true })
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 5000 })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('5 · Utensili page', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/tools')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/05-tools.png', fullPage: true })
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 5000 })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('6 · Materials page', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/settings/materials')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/06-materials.png', fullPage: true })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('7 · Esc chiude modal CRUD utensile', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/tools')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /nuovo utensile/i }).click()
    await expect(page.getByRole('heading', { name: /nuovo utensile/i })).toBeVisible({ timeout: 2000 })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: /nuovo utensile/i })).toBeHidden({ timeout: 2000 })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('8 · ConfirmDialog appare su delete utensile', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/tools')
    await page.waitForLoadState('networkidle')
    const deleteBtn = page.locator('button:has(svg.lucide-trash-2)').first()
    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click()
      await expect(page.getByText(/eliminare questo utensile/i)).toBeVisible({ timeout: 2000 })
      await page.screenshot({ path: 'tests/screenshots/08-confirm-dialog.png' })
      await page.getByRole('button', { name: /annulla/i }).click()
      await expect(page.getByText(/eliminare questo utensile/i)).toBeHidden({ timeout: 2000 })
    }
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('9 · Esc chiude ConfirmDialog', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/tools')
    await page.waitForLoadState('networkidle')
    const deleteBtn = page.locator('button:has(svg.lucide-trash-2)').first()
    if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await deleteBtn.click()
      await expect(page.getByText(/eliminare questo utensile/i)).toBeVisible({ timeout: 2000 })
      await page.keyboard.press('Escape')
      await expect(page.getByText(/eliminare questo utensile/i)).toBeHidden({ timeout: 2000 })
    }
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('10 · Attività page', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/activity')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/10-activity.png', fullPage: true })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('11 · Archivio preventivi', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/quotes/archive')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/11-archive.png', fullPage: true })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('12 · Tool Attributi page', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/settings/tool-attributes')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/12-tool-attributes.png', fullPage: true })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('13 · Ordini utensili page', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/orders/tools')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/13-orders-tools.png', fullPage: true })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('14 · Filtro ricerca tools funziona', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/tools')
    await page.waitForLoadState('networkidle')
    const searchInput = page.getByPlaceholder(/cerca codice/i)
    await searchInput.fill('ZZ_NONEXISTENT_XYZ_999')
    await page.waitForTimeout(500)
    await expect(page.getByText(/nessun utensile/i)).toBeVisible()
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('15 · Operations page', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/settings/operations')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/15-operations.png', fullPage: true })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('16 · Treatments page', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/settings/treatments')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/16-treatments.png', fullPage: true })
    expect(errs, errs.join('\n')).toEqual([])
  })

  test('17 · Machines page', async ({ page }) => {
    const errs = attachConsoleSpy(page)
    await page.goto('/settings/machines')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'tests/screenshots/17-machines.png', fullPage: true })
    expect(errs, errs.join('\n')).toEqual([])
  })
})
