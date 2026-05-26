/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

/** Vitest gira solo i test unit (cost engine) in `tests/unit/`.
 *  I test E2E Playwright in `tests/*.spec.ts` continuano a girare con
 *  `npx playwright test`, non vanno raccolti da Vitest.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['node_modules', 'tests/*.spec.ts', 'tests/**/*.spec.ts'],
  },
})
