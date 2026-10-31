// Owned Spottr two-loop plate/spotter geometry, drawn here; no external asset.
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
const svg = await readFile('public/brand/spottr-mark.svg', 'utf8')
const browser = await chromium.launch()
try {
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#B8EF58}svg{width:80%;height:80%;position:absolute;inset:10%}</style>${svg}`)
    await page.screenshot({ path: `public/icons/spottr-${size}.png` })
    await page.close()
  }
} finally { await browser.close() }
