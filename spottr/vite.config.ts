import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/spottr/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    css: true,
  },
})
