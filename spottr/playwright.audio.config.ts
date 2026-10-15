import { defineConfig } from '@playwright/test'
import media from './playwright.media.config'

export default defineConfig({
  ...media,
  testMatch: 'media-audio.spec.ts',
  timeout: 60000,
})
