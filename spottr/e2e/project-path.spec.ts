import { test, expect } from '@playwright/test'

// Deployment contract: built project assets, origin-isolated caching, offline reload.
test('project path has install assets and an isolated offline-ready shell', async ({ page, context, request }) => {
  for (const path of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/icons/spottr-192.png']) {
    expect((await request.get(path)).status()).toBe(404)
  }
  const worker = await (await request.get('/spottr/sw.js')).text()
  expect(worker).toMatch(/const RELEASE_ID = '[a-f0-9]{64}'/)
  await page.goto('/spottr/')
  await expect(page).toHaveTitle('Spottr')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  const manifestResponse = await request.get('/spottr/manifest.webmanifest')
  expect(manifestResponse.ok()).toBe(true)
  const manifest = await manifestResponse.json()
  expect(manifest.start_url).toBe('/spottr/')
  expect(manifest.scope).toBe('/spottr/')
  for (const icon of manifest.icons) {
    expect(icon.src.startsWith('/spottr/icons/')).toBe(true)
    const response = await request.get(icon.src)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/png')
  }
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    const names = await caches.keys()
    const urls = (await Promise.all(names.filter(name => name.startsWith('spottr-shell-')).map(async name =>
      (await (await caches.open(name)).keys()).map(request => request.url),
    ))).flat()
    return { scope: registration.scope, worker: registration.active?.scriptURL, urls }
  })
  expect(new URL(state.scope).pathname).toBe('/spottr/')
  expect(new URL(state.worker!).pathname).toBe('/spottr/sw.js')
  expect(state.urls.length).toBeGreaterThan(3)
  expect(state.urls.every(url => new URL(url).pathname.startsWith('/spottr/'))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page).toHaveTitle('Spottr')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
})
