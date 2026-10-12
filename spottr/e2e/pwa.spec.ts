import { expect, test } from '@playwright/test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const evidenceDir = resolve('evidence/screenshots')

test.beforeAll(async () => {
  await mkdir(evidenceDir, { recursive: true })
})

test('caches the loaded app shell and restores it without a network connection', async ({ context, page }) => {
  await page.goto('/spottr/')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')

  const shellResourcesAreCached = await page.evaluate(async () => {
    const shellCache = await caches.open((await caches.keys()).find(name => name.startsWith('spottr-shell-/spottr/-'))!)
    const resources = [
      window.location.href,
      ...[...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"]')]
        .map((element) => element instanceof HTMLScriptElement ? element.src : element.href),
      '/spottr/index.html',
      '/spottr/manifest.webmanifest',
      '/spottr/icons/spottr-192.png',
    ]
    return (await Promise.all(resources.map((resource) => shellCache.match(resource)))).every(Boolean)
  })
  expect(shellResourcesAreCached).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible()
})

test('keeps accurate readiness after cached offline reload and completes a saved workout', async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/spottr/')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')

  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill('Offline Gym')
  await page.getByRole('button', { name: 'Save gym' }).click()
  await page.getByRole('button', { name: 'Back to home' }).click()
  await page.getByRole('tab', { name: 'Exercises' }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill('Offline Press')
  await page.getByRole('button', { name: 'Save exercise' }).click()
  await page.getByRole('tab', { name: 'Workouts' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('Offline Strength')
  await page.getByRole('button', { name: 'Add Offline Press' }).click()
  await page.getByRole('article', { name: 'Offline Press sets' }).getByLabel('Set 1 weight').fill('40')
  await page.getByRole('article', { name: 'Offline Press sets' }).getByLabel('Set 1 reps').fill('6')
  await page.getByRole('button', { name: 'Save workout' }).click()
  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start workout at Offline Gym' }).click()
  await page.getByRole('button', { name: 'Start Offline Strength' }).click()
  await expect(page.getByRole('heading', { name: 'Offline Strength' })).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await page.getByRole('tab', { name: 'Settings' }).click()
  const installPanel = page.getByRole('region', { name: 'Install Spottr' })
  await expect(installPanel).toContainText('Offline ready: you can resume, log, and review saved workouts without a connection.')
  await expect(installPanel).not.toContainText('Load Spottr online once')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-cached-offline-readiness-390x844.png'), fullPage: true })
  await page.getByRole('tab', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Resume Offline Strength' }).click()
  await page.getByLabel('Offline Press set 1 weight').fill('42.5')
  await page.getByRole('button', { name: 'Log Offline Press set 1' }).click()
  await expect(page.getByText('1 of 1 sets logged')).toBeVisible()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByRole('heading', { name: 'Workout saved' })).toBeVisible()

  await page.reload()
  await page.getByRole('tab', { name: 'History' }).click()
  const savedSession = page.getByRole('article', { name: 'Offline Strength at Offline Gym' })
  await expect(savedSession).toContainText('255 kg')
  await savedSession.getByRole('button', { name: 'View details' }).click()
  await expect(savedSession).toContainText('42.5 kg × 6 reps')
  await expect(savedSession).toContainText('Completed')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-offline-journey-390x844.png'), fullPage: true })
})

test('reports a first-install failure instead of waiting indefinitely', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  const originalWorker = await readFile(resolve('dist/sw.js'), 'utf8')
  const failingWorker = originalWorker.replace(
    'async function cacheAppShell() {',
    "async function cacheAppShell() { throw new Error('simulated install failure')",
  )
  expect(failingWorker).not.toBe(originalWorker)
  const failingWorkerPath = resolve('dist/sw-failing-test.js')
  await writeFile(failingWorkerPath, failingWorker)
  await page.addInitScript(() => {
    const serviceWorkerPrototype = Object.getPrototypeOf(navigator.serviceWorker) as ServiceWorkerContainer
    const nativeRegister = serviceWorkerPrototype.register
    serviceWorkerPrototype.register = function register(scriptURL, options) {
      return nativeRegister.call(this, String(scriptURL) === '/spottr/sw.js' ? '/spottr/sw-failing-test.js' : scriptURL, options)
    }
  })

  try {
    await page.goto('/spottr/')

    await expect(page.locator('html')).toHaveAttribute('data-offline-state', 'error', { timeout: 11_000 })
    await page.getByRole('tab', { name: 'Settings' }).click()
    const installPanel = page.getByRole('region', { name: 'Install Spottr' })
    await expect(installPanel).toContainText('Load Spottr online once before relying on it for an offline workout.')
    await expect(installPanel).not.toContainText('Offline ready:')
    expect(pageErrors).toEqual([])
  } finally {
    await rm(failingWorkerPath, { force: true })
  }
})

test('activates a complete replacement shell and removes only superseded Spottr caches', async ({ page, context }) => {
  await page.goto('/spottr/')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  const originalWorker = await readFile(resolve('dist/sw.js'), 'utf8')
  const replacementWorker = originalWorker.replace(/const RELEASE_ID = [^\n]+/, "const RELEASE_ID = 'replacement-test'") + '\n// next release\n'
  expect(replacementWorker).not.toBe(originalWorker)
  const replacementWorkerPath = resolve('dist/sw-update-test.js')

  try {
    const activeCacheName = await page.evaluate(async () => (await caches.keys()).find(name => name.startsWith('spottr-shell-/spottr/-'))!)
    await page.evaluate(async (name) => {
      await (await caches.open(name)).put('/spottr/index.html', new Response('active-shell-sentinel'))
      await (await caches.open('spottr-shell-/sibling/-keep')).put('/sibling/', new Response('sibling'))
      await (await caches.open('spottr-shell-/spottr/-superseded')).put('/spottr/superseded', new Response('old shell'))
      await (await caches.open('unrelated-origin-data')).put('/spottr/preserve-me', new Response('unrelated'))
    }, activeCacheName)
    await writeFile(replacementWorkerPath, replacementWorker)
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/spottr/sw-update-test.js', { scope: '/spottr/' })
    })

    await expect.poll(() => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return registration?.waiting?.state
    })).toBe('installed')

    expect(await page.evaluate(async name => (await (await caches.open(name)).match('/spottr/index.html'))?.text(), activeCacheName)).toBe('active-shell-sentinel')
    const replacementShellIsComplete = await page.evaluate(async () => {
      const replacementCache = await caches.open('spottr-shell-/spottr/-replacement-test')
      const resources = [
        '/spottr/',
        '/spottr/index.html',
        ...[...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[href]')]
          .map((element) => element instanceof HTMLScriptElement ? element.src : element.href),
      ]
      return (await Promise.all(resources.map((resource) => replacementCache.match(resource)))).every(Boolean)
    })
    expect(replacementShellIsComplete).toBe(true)

    const activationResult = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      const waitingWorker = registration?.waiting
      if (!waitingWorker) throw new Error('No waiting replacement service worker')
      return new Promise<string>((resolveResult, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Replacement worker did not take control')), 2_000)
        navigator.serviceWorker.addEventListener('controllerchange', async function onControllerChange() {
          window.clearTimeout(timeout)
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
          resolveResult('controller-changed')
        })
        waitingWorker.postMessage({ type: 'ACTIVATE_UPDATE' })
      })
    })
    expect(activationResult).toBe('controller-changed')
    await expect.poll(() => page.evaluate(async () => (
      await navigator.serviceWorker.getRegistration()
    )?.active?.state)).toBe('activated')
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).sort())).toEqual([
      'unrelated-origin-data',
      'spottr-shell-/sibling/-keep',
      'spottr-shell-/spottr/-replacement-test',
    ].sort())
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Ready when you are.' })).toBeVisible()
  } finally {
    await rm(replacementWorkerPath, { force: true })
  }
})

test('reports app-shell cache failures without committing a partial batch', async ({ page }) => {
  await page.goto('/spottr/')
  const cacheResult = await page.evaluate(async () => {
    const availableUrl = `${window.location.origin}/spottr/manifest.webmanifest?atomic-cache-test`
    const unavailableUrl = 'http://127.0.0.1:1/missing-app-shell-resource.js'
    const registration = await navigator.serviceWorker.ready
    const worker = registration.active
    if (!worker) throw new Error('No active service worker')
    const shellCache = await caches.open((await caches.keys()).find(name => name.startsWith('spottr-shell-/spottr/-'))!)
    await shellCache.delete(availableUrl)
    const message = await new Promise<{ type: string; failedUrls: string[] }>((resolveResult, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Cache failure was not reported')), 2_000)
      navigator.serviceWorker.addEventListener('message', function onMessage(event) {
        if (event.data?.type !== 'CACHE_ERROR') return
        window.clearTimeout(timeout)
        navigator.serviceWorker.removeEventListener('message', onMessage)
        resolveResult(event.data)
      })
      worker.postMessage({ type: 'CACHE_URLS', urls: [availableUrl, unavailableUrl] })
    })
    return { message, partialEntryExists: Boolean(await shellCache.match(availableUrl)) }
  })
  expect(cacheResult).toEqual({
    message: { type: 'CACHE_ERROR', failedUrls: ['http://127.0.0.1:1/missing-app-shell-resource.js'] },
    partialEntryExists: false,
  })
})

test('publishes an installable manifest and offers the browser install prompt', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const manifestResponse = await request.get('/spottr/manifest.webmanifest')
  expect(manifestResponse.ok()).toBe(true)
  expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json')
  expect(await manifestResponse.json()).toEqual(expect.objectContaining({
    name: 'Spottr',
    short_name: 'Spottr',
    start_url: '/spottr/',
    scope: '/spottr/',
    display: 'standalone',
    background_color: '#f4f0e8',
    theme_color: '#f4f0e8',
    icons: expect.arrayContaining([
      expect.objectContaining({ src: '/spottr/icons/spottr-192.png', sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ src: '/spottr/icons/spottr-512.png', sizes: '512x512', type: 'image/png' }),
    ]),
  }))

  await page.goto('/spottr/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/spottr/manifest.webmanifest')
  await page.evaluate(() => navigator.serviceWorker.ready)
  const devtools = await page.context().newCDPSession(page)
  const { installabilityErrors } = await devtools.send('Page.getInstallabilityErrors')
  expect(installabilityErrors).toEqual([])
  const iconSizes = await page.evaluate(async () => Promise.all(
    ['/spottr/icons/spottr-192.png', '/spottr/icons/spottr-512.png'].map((src) => new Promise<string>((resolveSize, reject) => {
      const image = new Image()
      image.onload = () => resolveSize(`${image.naturalWidth}x${image.naturalHeight}`)
      image.onerror = () => reject(new Error(`Could not load ${src}`))
      image.src = src
    })),
  ))
  expect(iconSizes).toEqual(['192x192', '512x512'])

  await page.evaluate(() => {
    const installEvent = new Event('beforeinstallprompt', { cancelable: true })
    Object.defineProperties(installEvent, {
      prompt: {
        value: () => {
          ;(window as Window & { __spottrInstallPrompted?: boolean }).__spottrInstallPrompted = true
          return Promise.resolve()
        },
      },
      userChoice: {
        value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      },
    })
    window.dispatchEvent(installEvent)
  })

  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Install Spottr' })).toBeVisible()
  const installButton = page.getByRole('button', { name: 'Install Spottr' })
  await expect(installButton).toBeVisible()
  await installButton.click()
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __spottrInstallPrompted?: boolean }).__spottrInstallPrompted))).toBe(true)
  await expect(page.getByRole('status')).toContainText('installation started')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-install-390x844.png'), fullPage: true })
})

test('explains install failures without leaving an unhandled prompt rejection', async ({ page }) => {
  await page.goto('/spottr/')
  await page.evaluate(() => {
    const installEvent = new Event('beforeinstallprompt', { cancelable: true })
    Object.defineProperties(installEvent, {
      prompt: { value: () => Promise.reject(new Error('prompt unavailable')) },
      userChoice: { value: Promise.resolve({ outcome: 'dismissed', platform: 'web' }) },
    })
    window.dispatchEvent(installEvent)
  })

  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Install Spottr' }).click()
  await expect(page.getByRole('alert')).toContainText('could not be started. Try again from your browser menu')
})

test('recognizes Spottr when it is already running as an installed app', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window)
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => query === '(display-mode: standalone)'
        ? {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => true,
          }
        : nativeMatchMedia(query),
    })
  })
  await page.goto('/spottr/')
  await page.getByRole('tab', { name: 'Settings' }).click()

  await expect(page.getByText('Spottr is installed on this device.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Install Spottr' })).toHaveCount(0)
  await expect(page.getByText(/browser menu/i)).toHaveCount(0)
})

test('gives iPhone users platform-aware installation and offline guidance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    })
  })
  await page.goto('/spottr/')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  await page.getByRole('tab', { name: 'Settings' }).click()

  const installPanel = page.getByRole('region', { name: 'Install Spottr' })
  await expect(installPanel).toContainText('On iPhone or iPad, open Share, then choose Add to Home Screen.')
  await expect(installPanel).toContainText('Offline ready: you can resume, log, and review saved workouts without a connection.')
  await page.screenshot({ path: resolve(evidenceDir, 'spottr-ios-install-guidance-390x844.png'), fullPage: true })
})

test('updates offline guidance when delayed shell preparation finishes', async ({ page }) => {
  await page.addInitScript(() => {
    const serviceWorkerPrototype = Object.getPrototypeOf(navigator.serviceWorker) as ServiceWorkerContainer
    const nativeRegister = serviceWorkerPrototype.register
    serviceWorkerPrototype.register = async function register(scriptURL, options) {
      await new Promise((resolveDelay) => window.setTimeout(resolveDelay, 1_000))
      return nativeRegister.call(this, scriptURL, options)
    }
  })
  await page.goto('/spottr/')
  await page.getByRole('tab', { name: 'Settings' }).click()

  const installPanel = page.getByRole('region', { name: 'Install Spottr' })
  await expect(installPanel).toContainText('Load Spottr online once before relying on it for an offline workout.')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  await expect(installPanel).toContainText('Offline ready: you can resume, log, and review saved workouts without a connection.')
})

test('gives Android users browser-specific installation guidance', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
    })
  })
  await page.goto('/spottr/')
  await page.getByRole('tab', { name: 'Settings' }).click()

  await expect(page.getByRole('region', { name: 'Install Spottr' }))
    .toContainText('On Android, open your browser menu, then choose Install app or Add to Home screen.')
})

test('gives desktop users address-bar installation guidance', async ({ page }) => {
  await page.goto('/spottr/')
  await page.getByRole('tab', { name: 'Settings' }).click()

  await expect(page.getByRole('region', { name: 'Install Spottr' }))
    .toContainText('On a computer, use the install icon in the address bar or choose Install Spottr from your browser menu.')
})
