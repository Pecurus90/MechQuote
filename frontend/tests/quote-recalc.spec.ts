import { test, expect, type Page } from '@playwright/test'

/**
 * Regressione del bug "le ore del cnc5 non vengono ricalcolate": rientrando in
 * un preventivo, se il catalogo macchine arriva DOPO il preventivo, l'effect di
 * ricalcolo fasi azzerava il costo delle fasi macchina (ore scritte ma € a 0).
 *
 * Il test forza la race ritardando /machines e verifica che il TOTALE del
 * preventivo non cambi rispetto al caricamento normale. Portabile: non usa
 * numeri hardcoded, confronta baseline vs reload-con-ritardo.
 *
 * ⚠️ VA ESEGUITO SU UNA BUILD DI PRODUZIONE, non sul dev server: in dev React
 * StrictMode doppia gli effect e MASCHERA l'azzeramento (il bug non si vede).
 * Su build di produzione la race è deterministica. Come far girare:
 *   1) backend attivo su :8000
 *   2) cd frontend && npx vite build && npx vite preview   (serve :3001, proxy /api)
 *   3) npx playwright test tests/quote-recalc.spec.ts
 * `QUOTE_ID` = un preventivo con una fase MACCHINA (override via env QUOTE_ID).
 */

const ADMIN_USER = 'admin'
const ADMIN_PASS = 'admin'
const QUOTE_ID = Number(process.env.QUOTE_ID) || 10 // preventivo con fase macchina (CNC5 / Mazak)

test.describe.configure({ mode: 'serial' })

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="text"]', ADMIN_USER)
  await page.fill('input[type="password"]', ADMIN_PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 10_000 })
}

/** Legge il "Totale Preventivo" dalla bottom bar dell'editor. */
async function readQuoteTotal(page: Page): Promise<string> {
  const label = page.getByText('Totale Preventivo', { exact: true })
  await expect(label).toBeVisible({ timeout: 15_000 })
  const value = label.locator('xpath=following-sibling::div[1]')
  return (await value.innerText()).trim()
}

test('fase macchina non azzerata se /machines arriva in ritardo (race di caricamento)', async ({ page }) => {
  await login(page)

  // 1) Baseline: apertura normale → totale corretto.
  await page.goto(`/quotes/${QUOTE_ID}`)
  const totalBaseline = await readQuoteTotal(page)
  expect(totalBaseline).not.toMatch(/€\s*0(,00)?$/) // sanity: il preventivo ha un costo

  // 2) Forza la race: ritarda /machines così il preventivo si carica prima del
  //    catalogo macchine; poi ricarica la pagina (rimonta l'editor).
  await page.route('**/api/machines*', async (route) => {
    await new Promise((r) => setTimeout(r, 2500))
    await route.continue()
  })
  await page.reload()
  const totalDelayed = await readQuoteTotal(page)

  // 3) Col fix il totale resta identico; col bug le fasi macchina si azzerano
  //    (costo lavoro → 0) e il totale crolla.
  expect(totalDelayed, 'il totale non deve cambiare quando /machines è lento').toBe(totalBaseline)
})
