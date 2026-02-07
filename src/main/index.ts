import { app, BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'
import { initDb, closeDb } from './db/index'
import { createMainWindow } from './window'
import { registerAllHandlers } from './ipc/index'

// Configure logging
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    log.info('MoltVision starting...')

    // Initialize database
    initDb()

    // Create main window
    mainWindow = createMainWindow()

    // Register IPC handlers
    registerAllHandlers(mainWindow)

    // Window control handlers (for frameless window)
    ipcMain.on('window:minimize', () => mainWindow?.minimize())
    ipcMain.on('window:maximize', () => {
      if (mainWindow?.isMaximized()) mainWindow.unmaximize()
      else mainWindow?.maximize()
    })
    ipcMain.on('window:close', () => mainWindow?.close())

    // CSP headers
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://moltbook.com https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com https://api.x.ai; img-src 'self' data: https:"
          ]
        }
      })
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
        registerAllHandlers(mainWindow)
      }
    })

    log.info('MoltVision ready')
  })

  app.on('window-all-closed', () => {
    closeDb()
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    closeDb()
  })
}
