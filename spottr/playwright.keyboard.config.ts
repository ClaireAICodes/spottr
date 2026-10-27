import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: 'planner-keyboard-qualified.spec.ts',
  outputDir: './evidence/run547/native',
  use: { baseURL: 'http://127.0.0.1:4199/spottr/', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4199 --strictPort',
    url: 'http://127.0.0.1:4199/spottr/', reuseExistingServer: false, timeout: 120000,
  },
})
