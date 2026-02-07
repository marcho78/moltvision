import { safeStorage } from 'electron'
import log from 'electron-log'

export class CryptoService {
  encrypt(plaintext: string): Buffer {
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('Safe storage encryption not available, falling back to basic encoding')
      return Buffer.from(plaintext, 'utf-8')
    }
    return safeStorage.encryptString(plaintext)
  }

  decrypt(encrypted: Buffer): string {
    if (!safeStorage.isEncryptionAvailable()) {
      return encrypted.toString('utf-8')
    }
    return safeStorage.decryptString(encrypted)
  }

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }
}

export const cryptoService = new CryptoService()
