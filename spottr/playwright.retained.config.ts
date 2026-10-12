import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'retained-video.spec.ts', timeout: 90000, workers: 1,
  outputDir: './evidence/retained-video-results',
  use: { baseURL: 'http://127.0.0.1:4197/spottr/', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4197 --strictPort', url: 'http://127.0.0.1:4197/spottr/', reuseExistingServer: false, timeout: 120000 },
})
