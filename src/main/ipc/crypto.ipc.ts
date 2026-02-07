import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { cryptoService } from '../services/crypto.service'
import { saveApiKey, getApiKey } from '../db/queries/settings.queries'
import { savePreferences } from '../db/queries/settings.queries'
import { llmManager } from '../services/llm.service'
import { moltbookClient } from '../services/moltbook-api.service'
import log from 'electron-log'

export function registerCryptoHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_SAVE_API_KEY, async (_e, payload) => {
    const { provider, key } = payload
    const encrypted = cryptoService.encrypt(key)
    saveApiKey(provider, encrypted)

    // Update the service with the new key
    if (provider === 'moltbook') {
      moltbookClient.setApiKey(key)
    } else {
      llmManager.setApiKey(provider as any, key)
    }

    log.info(`API key saved for: ${provider}`)
    return { success: true }
  })

  ipcMain.handle(IPC.SETTINGS_TEST_CONNECTION, async (_e, payload) => {
    const { provider } = payload
    log.info(`Testing connection for: ${provider}`)
    try {
      if (provider === 'moltbook') {
        const encrypted = getApiKey('moltbook')
        if (!encrypted) {
          log.warn('No moltbook API key found in DB')
          return { result: { valid: false, provider, error: 'No API key configured' } }
        }
        const key = cryptoService.decrypt(encrypted)
        log.info(`Moltbook key decrypted (length: ${key.length}, prefix: ${key.slice(0, 12)}...)`)
        moltbookClient.setApiKey(key)
        const valid = await moltbookClient.testConnection()
        log.info(`Moltbook connection test result: ${valid}`)
        return { result: { valid, provider } }
      } else {
        const result = await llmManager.validateKey(provider as any)
        return { result }
      }
    } catch (err: any) {
      log.error(`Connection test error for ${provider}:`, err.message)
      return { result: { valid: false, provider, error: err.message } }
    }
  })
}

// Initialize API keys from DB on startup
export function loadApiKeysFromDb(): void {
  try {
    const moltbookKey = getApiKey('moltbook')
    if (moltbookKey) moltbookClient.setApiKey(cryptoService.decrypt(moltbookKey))

    for (const provider of ['claude', 'openai', 'gemini', 'grok'] as const) {
      const key = getApiKey(provider)
      if (key) llmManager.setApiKey(provider, cryptoService.decrypt(key))
    }
    log.info('API keys loaded from database')
  } catch (err) {
    log.error('Failed to load API keys:', err)
  }
}
