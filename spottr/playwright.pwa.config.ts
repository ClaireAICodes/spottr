import { defineConfig } from '@playwright/test'
import config from './playwright.config'

export default defineConfig({
  ...config,
  workers: 1,
  testMatch: ['pwa.spec.ts', 'project-path.spec.ts'],
  webServer: {
    command: 'npm run build && node e2e/strict-server.mjs',
    url: 'http://127.0.0.1:4173/spottr/',
    reuseExistingServer: false,
  },
})
