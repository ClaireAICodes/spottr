import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'w44-gym-location.spec.ts',
  outputDir: './evidence/run569/native',
  use: { baseURL: 'http://127.0.0.1:4209/spottr/', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4209 --strictPort',
    url: 'http://127.0.0.1:4209/spottr/', reuseExistingServer: false, timeout: 120000,
  },
})
