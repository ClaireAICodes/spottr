import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const evidence = process.env.SPOTTR_CONNECTED_EVIDENCE
if (!evidence) throw new Error('Set SPOTTR_CONNECTED_EVIDENCE to a private evidence directory')
const workout = 'Connected strength — deliberately long workout name for a calm athletic training session'
const renamed = 'Current shared row — deliberately long equipment setup and exercise name'

async function activate(page: Page, target: Locator) {
  await expect(target).toBeEnabled()
  for (let step = 0; step < 180; step += 1) {
    if (await target.evaluate(element => element === document.activeElement)) { await page.keyboard.press('Enter'); return }
    const backwards = await target.evaluate(element => Boolean(document.activeElement && document.activeElement !== document.body && (document.activeElement.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING)))
    await page.keyboard.press(backwards ? 'Shift+Tab' : 'Tab')
  }
  throw new Error(`Natural Tab traversal did not reach ${await target.textContent()}`)
}
async function backup(page: Page) {
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await activate(page, page.getByRole('button', { name: 'Download backup', exact: true }))
  return JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
}
async function capture(page: Page, name: string) {
  await mkdir(evidence!, { recursive: true })
  const geometry: unknown[] = []
  for (const size of [{ width: 390, height: 844 }, { width: 390, height: 667 }, { width: 834, height: 844 }, { width: 1440, height: 844 }]) {
    await page.setViewportSize(size)
    await page.screenshot({ path: resolve(evidence!, `${name}-${size.width}x${size.height}.png`), fullPage: true })
    const measurement = await page.evaluate(() => ({
      width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
      actions: Array.from(document.querySelectorAll<HTMLButtonElement>('main button')).filter(button => button.getClientRects().length > 0 && !button.disabled).map(button => {
        const r = button.getBoundingClientRect()
        return { text: button.textContent, label: button.getAttribute('aria-label'), width: r.width, height: r.height }
      }),
    }))
    expect(measurement.overflow).toBe(false)
    for (const action of measurement.actions) { expect(action.width, String(action.text)).toBeGreaterThanOrEqual(44); expect(action.height, String(action.text)).toBeGreaterThanOrEqual(44) }
    geometry.push(measurement)
  }
  await writeFile(resolve(evidence!, `${name}-geometry.json`), JSON.stringify(geometry, null, 2))
  await page.setViewportSize({ width: 390, height: 844 })
}
async function create(page: Page) {
  await page.goto('./')
  await expect(page.locator('html')).toHaveAttribute('data-offline-ready', 'true')
  await expect(page.getByText('No completed workouts yet')).toBeVisible()
  await activate(page, page.getByRole('button', { name: 'Manage gyms', exact: true }))
  await activate(page, page.getByRole('button', { name: 'Add gym', exact: true }))
  await page.getByLabel('Gym name').fill('Connected Gym')
  await activate(page, page.getByRole('button', { name: 'Save gym', exact: true }))
  await activate(page, page.getByRole('button', { name: 'Back to Home', exact: true }))
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  await activate(page, page.getByRole('button', { name: 'Add exercise', exact: true }))
  await page.getByLabel('Exercise name').fill('Original Row')
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Original seat position')
  await activate(page, page.getByRole('button', { name: 'Save exercise', exact: true }))
  await page.getByRole('tab', { name: 'Workouts', exact: true }).click()
  await activate(page, page.getByRole('button', { name: 'Add workout', exact: true }))
  await page.getByLabel('Workout name').fill(workout)
  await activate(page, page.getByRole('button', { name: 'Add Original Row', exact: true }))
  await activate(page, page.getByRole('button', { name: 'Save workout', exact: true }))
  await page.getByRole('tab', { name: 'Home', exact: true }).click()
  await activate(page, page.getByRole('button', { name: 'Start workout at Connected Gym', exact: true }))
  await activate(page, page.getByRole('button', { name: `Start ${workout}`, exact: true }))
  await expect(page.getByRole('heading', { name: workout, exact: true })).toBeFocused()
}

test('natural edit, reload, Resume, durable Finish, summary and contextual history on production /spottr/', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await create(page)
  await activate(page, page.getByRole('button', { name: 'Exit workout', exact: true }))
  const before = await backup(page)
  await page.getByRole('tab', { name: 'Exercises', exact: true }).click()
  await activate(page, page.getByRole('button', { name: 'Edit Original Row', exact: true }))
  await page.getByLabel('Exercise name').fill(renamed)
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Current setup: seat 7, brace torso, keep wrists straight.')
  await activate(page, page.getByRole('button', { name: 'Save changes', exact: true }))
  await page.getByLabel(`Add image or video — ${renamed}`, { exact: true }).setInputFiles(resolve('e2e/fixtures/owned-setup.png'))
  await expect(page.getByText('owned-setup.png', { exact: true })).toBeVisible()
  await page.reload()
  const resume = page.getByRole('button', { name: `Resume ${workout}`, exact: true })
  await expect(resume).toBeVisible()
  expect(await page.locator('.home-grid > .panel').first().getAttribute('class')).toContain('resume-panel')
  await activate(page, resume)
  await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible()
  await expect(page.getByText('Current setup: seat 7, brace torso, keep wrists straight.', { exact: true })).toBeVisible()
  await activate(page, page.getByRole('button', { name: `Show reference media for ${renamed}`, exact: true }))
  const image = page.getByRole('img', { name: `${renamed}: owned-setup.png`, exact: true })
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(160)
  await capture(page, 'active-renamed')
  await activate(page, page.getByRole('button', { name: 'Exit workout', exact: true }))
  const after = await backup(page)
  expect(after.entities.activeSession).toEqual(before.entities.activeSession)
  expect(after.entities.workouts).toEqual(before.entities.workouts)
  await page.getByRole('tab', { name: 'Home', exact: true }).click()
  await activate(page, resume)
  await page.getByLabel(`${renamed} set 1 weight (kg)`, { exact: true }).fill('42.5')
  await page.getByLabel(`${renamed} set 1 reps`, { exact: true }).fill('7')
  await activate(page, page.getByRole('button', { name: `Log ${renamed} set 1`, exact: true }))
  await expect(page.getByRole('status')).toContainText(`Logged ${renamed} set 1`)
  await activate(page, page.getByRole('button', { name: 'Stop rest', exact: true }))
  await activate(page, page.getByRole('button', { name: 'Finish workout', exact: true }))
  // These assertions precede any focus helper or traversal after the durable Finish.
  await expect(page.getByRole('heading', { name: 'Workout saved', exact: true })).toBeFocused()
  await expect(page.getByRole('status', { name: 'Saved workout status' })).toContainText('1 set completed')
  await capture(page, 'summary')
  await activate(page, page.getByRole('button', { name: 'View history', exact: true }))
  await expect(page.getByRole('heading', { name: workout, exact: true })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Original Row', exact: true })).toBeVisible()
  await expect(page.getByText('42.5 kg × 7 reps', { exact: true })).toBeVisible()
  await capture(page, 'history')
  await activate(page, page.getByRole('button', { name: 'Back to workout summary', exact: true }))
  await expect(page.getByRole('button', { name: 'View history', exact: true })).toBeFocused()
  await activate(page, page.getByRole('button', { name: 'Back to home', exact: true }))
  await expect(page.getByRole('region', { name: 'Recent activity' })).toContainText(workout)
  await capture(page, 'home-recent')
  await activate(page, page.getByRole('button', { name: /^View session / }))
  await expect(page.getByRole('heading', { name: workout, exact: true })).toBeFocused()
  await activate(page, page.getByRole('button', { name: 'Back to recent activity', exact: true }))
  await expect(page.getByRole('button', { name: /^View session / })).toBeFocused()
  const completed = await backup(page)
  expect(completed.entities.completedSessions).toHaveLength(1)
  expect(completed.entities.completedSessions[0].exercises[0].name).toBe('Original Row')
  expect(completed.entities.completedSessions[0].exercises[0].sets[0]).toMatchObject({ targetWeight: 0, weight: 42.5, reps: 7 })
  await writeFile(resolve(evidence!, 'connected-export.json'), JSON.stringify(completed, null, 2))
  expect(errors).toEqual([])
})

test('imported equal local IDs: contextual decisions, genuine failed retry and held departure cannot steal focus', async ({ page }) => {
  await create(page)
  await activate(page, page.getByRole('button', { name: 'Exit workout', exact: true }))
  const incoming = await backup(page)
  // Equal names/local set IDs are legal across distinct shared exercises; repeating
  // the same shared exercise in a workout is intentionally rejected by import.
  const secondShared = structuredClone(incoming.entities.exercises[0])
  secondShared.id = 'second-shared-exercise'
  incoming.entities.exercises.push(secondShared)
  const template = incoming.entities.workouts[0]
  const secondTemplate = structuredClone(template.exercises[0])
  secondTemplate.id = 'second-template-occurrence'
  secondTemplate.exerciseId = secondShared.id
  template.exercises.push(secondTemplate)
  const active = incoming.entities.activeSession
  const second = structuredClone(active.exercises[0])
  second.id = 'second-session-occurrence'
  second.exerciseId = secondShared.id
  second.templateExerciseId = secondTemplate.id
  active.exercises.push(second)
  await page.getByLabel('Choose backup file').setInputFiles({ name: 'equal-local-ids.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) })
  await activate(page, page.getByRole('button', { name: 'Restore backup', exact: true }))
  await activate(page, page.getByRole('button', { name: 'Replace all saved data', exact: true }))
  await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible()
  await page.getByRole('tab', { name: 'Home', exact: true }).click()
  await activate(page, page.getByRole('button', { name: `Resume ${workout}`, exact: true }))
  for (const position of [1, 2]) {
    await page.getByLabel(`Original Row exercise ${position} set 1 weight (kg)`, { exact: true }).fill(String(40 + position))
    await activate(page, page.getByRole('button', { name: `Log Original Row exercise ${position} set 1`, exact: true }))
    await activate(page, page.getByRole('button', { name: 'Stop rest', exact: true }))
  }
  await activate(page, page.getByRole('button', { name: 'Finish workout', exact: true }))
  await expect(page.getByRole('heading', { name: 'Workout saved', exact: true })).toBeFocused()
  const first = page.getByRole('group', { name: 'Future target for Original Row exercise 1 set 1', exact: true })
  const secondOffer = page.getByRole('group', { name: 'Future target for Original Row exercise 2 set 1', exact: true })
  await expect(first).toBeVisible()
  await expect(secondOffer).toBeVisible()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'sessions') { IDBObjectStore.prototype.put = original; throw new Error('Connected injected decision write failure') }
      return original.apply(this, args as Parameters<typeof original>)
    }
  })
  await activate(page, first.getByRole('button', { name: 'Keep current target', exact: true }))
  await expect(page.getByRole('alert')).toBeFocused()
  await expect(first.getByRole('button', { name: 'Keep current target', exact: true })).toBeEnabled()
  await activate(page, first.getByRole('button', { name: 'Keep current target', exact: true }))
  await expect(first.getByText('Current target kept', { exact: true })).toBeFocused()
  await expect(secondOffer.getByRole('button', { name: 'Keep current target', exact: true })).toBeEnabled()
  await page.evaluate(() => {
    const original = navigator.locks.request.bind(navigator.locks)
    const state = window as unknown as { releaseConnected?: () => void; connectedHeld?: boolean }
    const gate = new Promise<void>(resolve => { state.releaseConnected = resolve })
    navigator.locks.request = ((...args: unknown[]) => {
      if (args[0] === 'spottr-future-target-decision') {
        state.connectedHeld = true
        return gate.then(() => Reflect.apply(original, navigator.locks, args))
      }
      return Reflect.apply(original, navigator.locks, args)
    }) as typeof navigator.locks.request
  })
  await activate(page, secondOffer.getByRole('button', { name: 'Keep current target', exact: true }))
  await expect.poll(() => page.evaluate(() => (window as unknown as { connectedHeld?: boolean }).connectedHeld)).toBe(true)
  await activate(page, page.getByRole('button', { name: 'View history', exact: true }))
  await expect(page.getByRole('heading', { name: workout, exact: true })).toBeFocused()
  await page.evaluate(() => (window as unknown as { releaseConnected: () => void }).releaseConnected())
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open('spottr-v1-sessions')
    const db = await new Promise<IDBDatabase>((yes, no) => { request.onsuccess = () => yes(request.result); request.onerror = () => no(request.error) })
    try {
      const get = db.transaction('sessions').objectStore('sessions').getAll()
      const rows = await new Promise<any[]>((yes, no) => { get.onsuccess = () => yes(get.result); get.onerror = () => no(get.error) })
      return rows.find(row => row?.endedAt)?.exercises[1].sets[0].targetDecision
    } finally { db.close() }
  })).toBe('declined')
  await expect(page.getByRole('heading', { name: workout, exact: true })).toBeFocused()
  await capture(page, 'history-local-ids')
})
