import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { autopilotService } from '../services/autopilot.service'
import { getQueuedActions } from '../db/queries/queue.queries'
import { getActivityLog } from '../db/queries/analytics.queries'
import { getEngagementHistory, getAllReplies, getUnreadReplyCount, markRepliesRead } from '../db/queries/engagement.queries'
import log from 'electron-log'

export function registerAutopilotHandlers(mainWindow: BrowserWindow): void {
  // Forward autopilot events to renderer
  autopilotService.on('mode:changed', () => {
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

  autopilotService.on('action:executed', (data: any) => {
    mainWindow.webContents.send(IPC.AUTOPILOT_STATUS_UPDATE, autopilotService.getStatus())
    mainWindow.webContents.send(IPC.AUTOPILOT_LIVE_EVENT, {
      type: 'action',
      timestamp: new Date().toISOString(),
      action_type: data?.payload?.type ?? 'unknown',
      submolt: data?.payload?.submolt_name ?? null,
      post_id: data?.payload?.post_id ?? null,
      content: data?.payload?.content?.slice(0, 100) ?? null,
      title: data?.payload?.title ?? null
    })
  })

  autopilotService.on('scan:progress', (data: any) => {
    mainWindow.webContents.send(IPC.AUTOPILOT_LIVE_EVENT, {
      type: 'scan',
      timestamp: new Date().toISOString(),
      ...data
    })
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

  // --- New Handlers ---

  ipcMain.handle(IPC.AUTOPILOT_SET_PERSONA, async (_e, payload) => {
    autopilotService.setActivePersona(payload.persona_id)
    return { success: true, persona_id: payload.persona_id }
  })

  ipcMain.handle(IPC.AUTOPILOT_GET_PERSONA, async () => {
    return { persona_id: autopilotService.getActivePersonaId() }
  })

  ipcMain.handle(IPC.AUTOPILOT_GET_ACTIVITY, async (_e, payload) => {
    const entries = getEngagementHistory({
      limit: payload?.limit,
      offset: payload?.offset,
      actionType: payload?.action_type
    })
    return { entries }
  })

  ipcMain.handle(IPC.AUTOPILOT_GET_REPLIES, async (_e, payload) => {
    const replies = getAllReplies({ limit: payload?.limit, offset: payload?.offset })
    const unread_count = getUnreadReplyCount()
    return { replies, unread_count }
  })

  ipcMain.handle(IPC.AUTOPILOT_MARK_REPLIES_READ, async (_e, payload) => {
    markRepliesRead(payload.ids)
    return { success: true }
  })
}
