import { BrowserWindow } from 'electron'
import { registerApiHandlers } from './api.ipc'
import { registerLlmHandlers } from './llm.ipc'
import { registerDbHandlers } from './db.ipc'
import { registerCryptoHandlers, loadApiKeysFromDb } from './crypto.ipc'
import { registerAutopilotHandlers } from './autopilot.ipc'
import log from 'electron-log'

export function registerAllHandlers(mainWindow: BrowserWindow): void {
  log.info('Registering IPC handlers...')

  registerApiHandlers()
  registerLlmHandlers()
  registerDbHandlers()
  registerCryptoHandlers()
  registerAutopilotHandlers(mainWindow)

  // Load saved API keys
  loadApiKeysFromDb()

  log.info('All IPC handlers registered')
}
