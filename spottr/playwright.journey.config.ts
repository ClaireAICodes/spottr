import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: 'basic-journey.spec.ts', timeout: 60000, workers: 1,
  outputDir: './evidence/basic-journey-results',
  use: { baseURL: 'http://127.0.0.1:4198/spottr/', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4198 --strictPort',
    url: 'http://127.0.0.1:4198/spottr/', reuseExistingServer: false, timeout: 120000,
  },
})
