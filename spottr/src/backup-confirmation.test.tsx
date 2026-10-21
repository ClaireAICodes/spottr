import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsView } from './SettingsView'
import { composeDataset } from './datasetCoordinator'
import { createMemorySettingsRepository, createSettingsService } from './settings'

it('requires named Replace confirmation and Cancel discards the selected backup without writes', async () => {
  const roots = composeDataset({ settingsService: createSettingsService(createMemorySettingsRepository()) })
  const backup = await roots.exportBackup()
  const restoreBackup = vi.fn()
  render(<SettingsView settingsService={roots.settingsService} exerciseService={roots.exerciseService}
    backupOperations={{ exportBackup: roots.exportBackup, restoreBackup }}
    onSettingsChange={vi.fn()} onBackupRestored={vi.fn()} onBackupRestoreStateChange={vi.fn()}
    installPrompt={{ canInstall: false, install: async () => {}, status: 'idle' }} />)
  await screen.findByRole('button', { name: 'Save settings' })
  const input = screen.getByLabelText('Choose backup file')
  fireEvent.change(input, { target: { files: [new File([JSON.stringify(backup)], 'owned-backup.json', { type: 'application/json' })] } })
  await userEvent.click(await screen.findByRole('button', { name: 'Restore backup' }))
  expect(restoreBackup).not.toHaveBeenCalled()
  expect(screen.getByRole('group', { name: 'Replace saved Spottr data?' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(restoreBackup).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Replace all saved data' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Restore backup' })).not.toBeInTheDocument()
  fireEvent.change(input, { target: { files: [new File([JSON.stringify(backup)], 'owned-backup.json', { type: 'application/json' })] } })
  await userEvent.click(await screen.findByRole('button', { name: 'Restore backup' }))
  fireEvent.keyDown(screen.getByRole('button', { name: 'Replace all saved data' }), { key: 'Escape' })
  expect(screen.queryByRole('button', { name: 'Replace all saved data' })).not.toBeInTheDocument()
  expect(input).toHaveFocus()
  expect(restoreBackup).not.toHaveBeenCalled()
})
