import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { autopilotService } from '../services/autopilot.service'
import { getQueuedActions } from '../db/queries/queue.queries'
import { getActivityLog } from '../db/queries/analytics.queries'
import log from 'electron-log'

export function registerAutopilotHandlers(mainWindow: BrowserWindow): void {
  // Forward autopilot events to renderer
  autopilotService.on('mode:changed', (mode) => {
    mainWindow.webContents.send(IPC.AUTOPILOT_STATUS_UPDATE, autopilotService.getStatus())
  })

  autopilotService.on('cycle:start', () => {
    mainWindow.webContents.send(IPC.AUTOPILOT_STATUS_UPDATE, autopilotService.getStatus())
  })

  autopilotService.on('cycle:end', () => {
    mainWindow.webContents.send(IPC.AUTOPILOT_STATUS_UPDATE, autopilotService.getStatus())
  })

  autopilotService.on('emergency:stop', () => {
    mainWindow.webContents.send(IPC.AUTOPILOT_STATUS_UPDATE, autopilotService.getStatus())
  })

  ipcMain.handle(IPC.AUTOPILOT_SET_MODE, async (_e, payload) => {
    autopilotService.setMode(payload.mode)
    return autopilotService.getStatus()
  })

  ipcMain.handle(IPC.AUTOPILOT_GET_QUEUE, async (_e, payload) => {
    const actions = getQueuedActions(payload?.status)
    return {
      actions: actions.map((a: any) => ({
        ...a,
        payload: JSON.parse(a.payload)
      }))
    }
  })

  ipcMain.handle(IPC.AUTOPILOT_APPROVE, async (_e, payload) => {
    await autopilotService.approveAction(payload.action_id, payload.edited_content)
    return { success: true }
  })

  ipcMain.handle(IPC.AUTOPILOT_REJECT, async (_e, payload) => {
    autopilotService.rejectAction(payload.action_id)
    return { success: true }
  })

  ipcMain.handle(IPC.AUTOPILOT_EMERGENCY_STOP, async () => {
    autopilotService.emergencyStop()
    return autopilotService.getStatus()
  })

  ipcMain.handle(IPC.AUTOPILOT_GET_LOG, async (_e, payload) => {
    const entries = getActivityLog({ limit: payload?.limit, offset: payload?.offset })
    return { entries, total: entries.length }
  })
}
