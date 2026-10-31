import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: process.env.VISUAL_REGRESSION === '1' ? ['w44-focused-session.spec.ts', 'w44-shell.spec.ts', 'w44-planned-weight.spec.ts', 'settings-save-focus.spec.ts'] : 'saturday-visual.spec.ts',
  outputDir: `./evidence/saturday/${process.env.VISUAL_PHASE || 'before'}/results`,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4192', video: 'on', trace: 'retain-on-failure' },
})
