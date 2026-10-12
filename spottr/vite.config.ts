import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Content identity includes the shell, assets and worker logic; no timestamp churn.
const releaseWorker = {
  name: 'release-worker',
  apply: 'build' as const,
  async closeBundle() {
    const root = resolve('dist')
    const hash = createHash('sha256')
    async function visit(directory: string) {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = resolve(directory, entry.name)
        if (entry.isDirectory()) await visit(path)
        else { hash.update(path.slice(root.length).replaceAll('\\', '/')); hash.update(await readFile(path)) }
      }
    }
    await visit(root)
    const path = resolve(root, 'sw.js')
    await writeFile(path, (await readFile(path, 'utf8')).replace('__SPOTTR_RELEASE__', hash.digest('hex')))
  },
}

export default defineConfig({
  base: '/spottr/',
  plugins: [react(), releaseWorker],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    css: true,
  },
})
