import { expect, test, type Locator, type Page } from '@playwright/test'

async function foundations(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Manage gyms' }).click()
  for (const name of ['Audit North', 'Audit South']) {
    await page.getByRole('button', { name: 'Add gym', exact: true }).click()
    await page.getByLabel('Gym name').fill(name)
    await page.getByRole('button', { name: 'Save gym' }).click()
    await expect(page.getByRole('button', { name: `Delete ${name}`, exact: true })).toBeVisible()
  }
}

async function editor(page: Page) {
  await page.getByRole('tab', { name: 'Exercises' }).click()
  for (const name of ['Audit Row', 'Audit Press']) {
    await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
    await page.getByLabel('Exercise name').fill(name)
    await page.getByRole('button', { name: 'Save exercise' }).click()
    await expect(page.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeVisible()
  }
  await page.getByRole('tab', { name: 'Workouts' }).click()
  await page.getByRole('button', { name: 'Add workout' }).click()
  await page.getByLabel('Workout name').fill('Audit Strength')
  await page.getByRole('combobox', { name: 'Gym', exact: true }).selectOption({ label: 'Audit North' })
  for (const name of ['Audit Row', 'Audit Press']) await page.getByRole('button', { name: `Add ${name}`, exact: true }).click()
}

async function clearTarget(control: Locator) {
  await control.scrollIntoViewIfNeeded()
  const geometry = await control.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const points = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + r.height / 2], [r.right - 2, r.top + r.height / 2], [r.left + r.width / 2, r.top + 2], [r.left + r.width / 2, r.bottom - 2]]
    return { width: r.width, height: r.height, hits: points.map(([x, y]) => el.contains(document.elementFromPoint(x, y))) }
  })
  expect(geometry.width).toBeGreaterThanOrEqual(44)
  expect(geometry.height).toBeGreaterThanOrEqual(44)
  expect(geometry.hits).toEqual([true, true, true, true, true])
}

test('planner repeated controls expose exercise and set context and retain saved associations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await foundations(page)
  await editor(page)
  for (const [index, name] of ['Audit Row', 'Audit Press'].entries()) {
    const suffix = `${name}, exercise ${index + 1}`
    for (const action of ['Move exercise up', 'Move exercise down', `Remove ${name}`, 'Duplicate for variation', 'Add set', 'Move set 1 up', 'Move set 1 down', 'Remove set 1']) {
      await expect(page.getByRole('button', { name: `${action} — ${suffix}`, exact: true })).toHaveCount(1)
    }
    await expect(page.getByRole('combobox', { name: `Set 1 type — ${suffix}`, exact: true })).toHaveValue('working')
    await page.getByRole('spinbutton', { name: `Set 1 weight (kg) — ${suffix}`, exact: true }).fill(index === 0 ? '42' : '17')
    await page.getByRole('spinbutton', { name: `Set 1 reps — ${suffix}`, exact: true }).fill(index === 0 ? '6' : '9')
  }
  await expect(page.getByRole('button', { name: 'Move exercise up — Audit Row, exercise 1', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Add set — Audit Row, exercise 1', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Set 2 reps — Audit Row, exercise 1', exact: true }).fill('12')
  await page.getByRole('button', { name: 'Move set 2 up — Audit Row, exercise 1', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Set 1 reps — Audit Row, exercise 1', exact: true })).toHaveValue('12')
  await page.getByRole('button', { name: 'Remove set 1 — Audit Row, exercise 1', exact: true }).click()
  await page.getByRole('button', { name: 'Move exercise up — Audit Press, exercise 2', exact: true }).click()
  await page.getByRole('button', { name: 'Save workout' }).click()
  await expect(page.getByRole('button', { name: 'Edit Audit Strength', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: 'Workouts' }).click()
  await page.getByRole('button', { name: 'Edit Audit Strength', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Audit Press, exercise 1', exact: true })).toHaveValue('17')
  await expect(page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Audit Row, exercise 2', exact: true })).toHaveValue('42')
  await page.getByRole('button', { name: 'Duplicate for variation — Audit Row, exercise 2', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add set — Audit Row variation, exercise 2', exact: true })).toBeEnabled()
  await expect(page.getByRole('spinbutton', { name: 'Set 1 weight (kg) — Audit Row variation, exercise 2', exact: true })).toHaveValue('42')
})

test('mobile minimal reveal leaves gym deletion and planner add-set targets unobscured and actionable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await foundations(page)
  const deletion = page.getByRole('button', { name: 'Delete Audit South', exact: true })
  await clearTarget(deletion)
  const bounds = await deletion.boundingBox()
  if (!bounds) throw new Error('Delete target missing')
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect(page.getByRole('dialog', { name: 'Delete Audit South?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep gym' }).click()
  await editor(page)
  for (const name of ['Audit Row', 'Audit Press']) {
    const article = page.getByRole('article', { name: `${name} sets`, exact: true })
    const add = article.getByRole('button', { name: 'Add set' })
    await clearTarget(add)
    const target = await add.boundingBox()
    if (!target) throw new Error('Add-set target missing')
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2)
    await expect(article.getByRole('spinbutton', { name: 'Set 2 reps' })).toBeVisible()
  }
  await page.screenshot({ path: 'evidence/screenshots/friday-mobile-clear-target-390.png' })
})
