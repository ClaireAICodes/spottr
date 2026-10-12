import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'media-encode.spec.ts', timeout: 60000, workers: 1,
  outputDir: './evidence/playwright-results',
  use: { baseURL: 'http://127.0.0.1:4175/spottr/' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort', url: 'http://127.0.0.1:4175/spottr/', reuseExistingServer: false },
})
