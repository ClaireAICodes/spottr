import { spawn } from 'node:child_process'
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4192', '--strictPort'], { stdio: 'inherit' })
try {
  let ready = false
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:4192/spottr/')).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  if (!ready) throw new Error('Owned server did not become ready')
  const test = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.visual.config.ts'], { stdio: 'inherit' })
  process.exitCode = await new Promise(resolve => test.on('exit', resolve))
} finally { server.kill() }
