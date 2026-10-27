import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'

// A new test owns a fresh entry URL. Remounts within a journey retain routing.
beforeEach(() => {
  window.history.replaceState(null, '', '/')
})
