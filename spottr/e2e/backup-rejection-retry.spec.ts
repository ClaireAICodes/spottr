import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { SpottrBackup } from '../src/backup'

// Observe every persisted domain through the public download, never IndexedDB.
async function download(page: Page): Promise<SpottrBackup> {
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup', exact: true }).click()
  const path = await (await downloading).path()
  if (!path) throw new Error('Public backup download missing')
  return JSON.parse(await readFile(path, 'utf8'))
}
function domains(backup: SpottrBackup) {
  // Export time is the only volatile envelope field; IDs/timestamps/media remain exact.
  const { exportedAt: _exportedAt, ...persisted } = backup
  return persisted
}
async function seed(page: Page, name: string, weight: string, rest: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  await page.getByRole('button', { name: 'Add gym', exact: true }).click()
  await page.getByLabel('Gym name').fill(`${name} Gym`)
  await page.getByLabel('Address').fill(`${name} Road`)
  await page.getByRole('button', { name: 'Save gym', exact: true }).click()
  await expect(page.getByRole('article', { name: `${name} Gym`, exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Train', exact: true }).click()
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
  await page.getByLabel('Exercise name').fill(`${name} Row`)
  await page.getByLabel('Notes', { exact: true }).fill(`${name} setup notes`)
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click()
  const exercise = page.getByRole('article', { name: `${name} Row`, exact: true })
  // Real decodable PNG, generated locally and selected through the existing picker.
  const png = await page.evaluate((color) => {
    const canvas = document.createElement('canvas')
    canvas.width = 160; canvas.height = 90
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = color; ctx.fillRect(0, 0, 160, 90)
    return canvas.toDataURL('image/png').split(',')[1]
  }, name === 'Incoming' ? '#236abb' : '#55a044')
  await exercise.getByLabel('Add image or video').setInputFiles({
    name: `${name}.png`, mimeType: 'image/png', buffer: Buffer.from(png, 'base64'),
  })
  await expect(exercise.getByText(`${name}.png`, { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Plan', exact: true }).click()
  await page.getByRole('button', { name: 'Add workout', exact: true }).click()
  await page.getByLabel('Workout name').fill(`${name} Strength`)
  await page.getByRole('button', { name: `Add ${name} Row`, exact: true }).click()
  await page.getByLabel('Set 1 weight').fill(weight)
  await page.getByLabel('Set 1 reps').fill('6')
  await page.getByRole('button', { name: 'Add set', exact: false }).click()
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await expect(page.getByRole('article', { name: `${name} Strength`, exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Progressive overload cues').uncheck()
  await page.getByLabel('PR celebrations').setChecked(name === 'Incoming')
  await page.getByLabel('Rest duration (seconds)').fill(rest)
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible()
  async function start() {
    await page.getByRole('tab', { name: 'Home', exact: true }).click()
    await page.getByRole('button', { name: `Start workout at ${name} Gym`, exact: true }).click()
    await page.getByRole('button', { name: `Start ${name} Strength`, exact: true }).click()
    await page.getByRole('button', { name: `Log ${name} Row set 1`, exact: true }).click()
    await expect(page.getByRole('button', { name: `Logged ${name} Row set 1`, exact: true })).toBeDisabled()
  }
  await start()
  await page.getByRole('button', { name: `Skip ${name} Row set 2`, exact: true }).click()
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await page.getByRole('button', { name: 'Finish and skip 1 set', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Workout saved', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to home', exact: true }).click()
  await start()
  await page.getByRole('button', { name: 'Exit workout', exact: true }).click()
  return download(page)
}

for (const width of [390, 834, 1440]) {
  test(`malformed then future rejection preserves every domain; valid retry replaces at ${width}`, async ({ page, browser }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 844 })
    const donor = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' })
    let incoming: SpottrBackup
    try {
      incoming = await seed(await donor.newPage(), 'Incoming', '42', '120')
    } finally {
      await donor.close()
    }
    const current = await seed(page, 'Current', '17', '75')
    for (const backup of [current, incoming]) {
      expect(backup.entities.gyms).toHaveLength(1)
      expect(backup.entities.selectedGymId).toBe(backup.entities.gyms[0].id)
      expect(backup.entities.exercises).toHaveLength(1)
      expect(backup.entities.exercises[0].media).toHaveLength(1)
      expect(backup.entities.exercises[0].media[0].content.data).not.toBe('')
      expect(backup.entities.workouts).toHaveLength(1)
      expect(backup.entities.activeSession).not.toBeNull()
      expect(backup.entities.activeSession!.exercises[0].sets[0].completedAt).not.toBeNull()
      expect(backup.entities.activeSession!.restTimer).toBeDefined()
      expect(backup.entities.completedSessions).toHaveLength(1)
      expect(backup.entities.completedSessions[0].summary.completedSets).toBe(1)
      expect(backup.entities.completedSessions[0].summary.skippedSets).toBe(1)
    }
    expect(domains(current)).not.toEqual(domains(incoming))
    const input = page.getByLabel('Choose backup file')
    const excess = structuredClone(incoming)
    const reference = excess.entities.exercises[0].media[0]
    excess.entities.exercises[0].media = Array.from({ length: 6 }, (_, index) => ({ ...reference, id: `owned-reference-${index}` }))
    for (const [filename, payload, message] of [
      ['malformed.json', '{"format":', 'not a valid Spottr backup'],
      ['future.json', JSON.stringify({ ...incoming, version: 2 }), 'backup version 2 is not supported'],
      ['six-media.json', JSON.stringify(excess), 'at most five media items'],
    ]) {
      await input.setInputFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(payload) })
      await expect(page.getByRole('alert')).toContainText(message)
      await expect(page.getByRole('alert')).toContainText('Your saved data has not been changed')
      await expect(page.getByRole('button', { name: 'Restore backup', exact: true })).toHaveCount(0)
      await expect(input).toBeEnabled()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await page.getByRole('alert').scrollIntoViewIfNeeded()
      await page.screenshot({ path: `evidence/screenshots/w41-backup-${filename.replace('.json', '')}-${width}.png` })
      expect(domains(await download(page))).toEqual(domains(current))
      await page.reload()
      expect(domains(await download(page))).toEqual(domains(current))
    }
    await input.setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)) })
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: 'compatible and ready' })).toContainText('replaces all data')
    const restore = page.getByRole('button', { name: 'Restore backup', exact: true })
    await restore.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toContainText('previous Spottr data was replaced')
    await expect(page.getByLabel('Rest duration (seconds)')).toHaveValue('120')
    await expect(page.getByLabel('PR celebrations')).toBeChecked()
    expect(domains(await download(page))).toEqual(domains(incoming))
    await page.reload()
    expect(domains(await download(page))).toEqual(domains(incoming))
    await page.getByRole('tab', { name: 'Home', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Resume Current Strength', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Resume Incoming Strength', exact: true }).click()
    await expect(page.getByLabel('Incoming Row set 1 weight')).toHaveValue('42')
    await expect(page.getByRole('button', { name: 'Logged Incoming Row set 1', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Show reference media for Incoming Row', exact: true }).click()
    await expect.poll(() => page.getByRole('img', { name: 'Incoming Row: Incoming.png', exact: true }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(160)
    await page.screenshot({ path: `evidence/screenshots/w41-backup-restored-${width}.png` })
    await page.getByRole('button', { name: 'Exit workout', exact: true }).click()
    await page.getByRole('tab', { name: 'History', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Incoming Strength at Incoming Gym', exact: true })).toHaveCount(1)
    await expect(page.getByRole('article', { name: 'Current Strength at Current Gym', exact: true })).toHaveCount(0)
  })
}
