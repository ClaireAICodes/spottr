import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsView } from './SettingsView'
import { DEFAULT_SETTINGS, type AppSettings, type SettingsService } from './settings'
import { createExerciseService, createMemoryExerciseRepository } from './exercises'

function deferred() {
  let resolve!: (value: AppSettings) => void
  let reject!: (error: Error) => void
  const promise = new Promise<AppSettings>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function setup() {
  const pending = deferred()
  const service: SettingsService = { get: vi.fn().mockResolvedValue(DEFAULT_SETTINGS), update: vi.fn(() => pending.promise) }
  const props = {
    settingsService: service,
    exerciseService: createExerciseService(createMemoryExerciseRepository()),
    backupOperations: { exportBackup: vi.fn(), restoreBackup: vi.fn() },
    onSettingsChange: vi.fn(), onBackupRestored: vi.fn(), onBackupRestoreStateChange: vi.fn(),
    installPrompt: { canInstall: false, install: async () => {}, status: 'idle' } satisfies React.ComponentProps<typeof SettingsView>['installPrompt'],
  }
  const view = render(<><SettingsView {...props} /><button>Outside</button></>)
  const user = userEvent.setup()
  const save = await screen.findByRole('button', { name: 'Save settings' })
  for (let i = 0; i < 25 && document.activeElement !== save; i++) await user.tab()
  expect(save).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(save).toBeDisabled()
  return { pending, service, props, view, user, save }
}

for (const outcome of ['success', 'failure'] as const) {
  it(`restores contextual keyboard ${outcome} after held save, allowing retry without duplicate submit`, async () => {
    const { pending, service, props, user, save } = await setup()
    await user.keyboard('{Enter}{Enter}')
    expect(service.update).toHaveBeenCalledTimes(1)
    await act(async () => { if (outcome === 'success') pending.resolve({ ...DEFAULT_SETTINGS, restSeconds: 120 }); else pending.reject(new Error('Save failed; retry.')) })
    await waitFor(() => expect(save).toBeEnabled())
    expect(save).toHaveFocus()
    if (outcome === 'success') {
      expect(screen.getByRole('status')).toHaveTextContent('Settings saved.')
      expect(props.onSettingsChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, restSeconds: 120 })
    } else {
      expect(screen.getByRole('alert')).toHaveTextContent('Save failed; retry.')
      vi.mocked(service.update).mockResolvedValueOnce(DEFAULT_SETTINGS)
      await user.keyboard('{Enter}')
      await screen.findByText('Settings saved.')
      expect(save).toHaveFocus()
      expect(service.update).toHaveBeenCalledTimes(2)
    }
  })

  for (const departure of ['tab', 'pointer', 'replacement', 'unmount'] as const) {
    it(`does not reclaim focus after ${departure} and late ${outcome}`, async () => {
      const { pending, props, view, user } = await setup()
      if (departure === 'replacement') {
        view.rerender(<><SettingsView {...props} settingsService={{ get: async () => DEFAULT_SETTINGS, update: async s => s }} /><button>Outside</button></>)
      } else if (departure === 'unmount') {
        view.rerender(<button>Outside</button>)
      }
      if (departure === 'tab') await user.tab()
      else await user.click(screen.getByRole('button', { name: 'Outside' }))
      const destination = document.activeElement
      await act(async () => { if (outcome === 'success') pending.resolve(DEFAULT_SETTINGS); else pending.reject(new Error('Late failure')) })
      expect(document.activeElement).toBe(destination)
      if (departure === 'replacement' || departure === 'unmount') expect(props.onSettingsChange).not.toHaveBeenCalled()
    })
  }
}
