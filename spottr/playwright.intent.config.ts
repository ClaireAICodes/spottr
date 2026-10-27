import { defineConfig } from '@playwright/test'

// Real Chromium IndexedDB at the existing public repository/owner seams.
export default defineConfig({
  testDir: './e2e', testMatch: 'w44-native-intent.spec.ts',
  outputDir: './evidence/run537/native-results',
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174/spottr/', reuseExistingServer: false },
})
