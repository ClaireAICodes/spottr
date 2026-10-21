import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsView } from './SettingsView'
import { composeDataset } from './datasetCoordinator'
import { createMemorySettingsRepository, createSettingsService } from './settings'

it('a later file selection owns validation even when the earlier read completes last', async () => {
  const roots = composeDataset({ settingsService: createSettingsService(createMemorySettingsRepository()) })
  const backup = await roots.exportBackup()
  const readers: FileReader[] = []
  const original = FileReader.prototype.readAsText
  vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function(this: FileReader) { readers.push(this) })
  try {
    render(<SettingsView settingsService={roots.settingsService} exerciseService={roots.exerciseService} backupOperations={roots}
      onSettingsChange={vi.fn()} onBackupRestored={vi.fn()} onBackupRestoreStateChange={vi.fn()}
      installPrompt={{ canInstall: false, install: async () => {}, status: 'idle' }} />)
    const input = await screen.findByLabelText('Choose backup file')
    const choose = (name: string) => fireEvent.change(input, { target: { files: [new File(['{}'], name)] } })
    choose('old.json')
    expect(input).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel checking backup' })).toBeEnabled()
    choose('new.json')
    Object.defineProperty(readers[1], 'result', { value: JSON.stringify(backup) })
    readers[1].dispatchEvent(new ProgressEvent('load'))
    await screen.findByRole('button', { name: 'Restore backup' })
    Object.defineProperty(readers[0], 'result', { value: '{}' })
    readers[0].dispatchEvent(new ProgressEvent('load'))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Restore backup' })).toBeEnabled()
  } finally { FileReader.prototype.readAsText = original }
})
