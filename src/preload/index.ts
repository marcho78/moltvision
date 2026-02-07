import { contextBridge, ipcRenderer } from 'electron'
import type { MoltApi } from './types'

const ALLOWED_CHANNELS = new Set([
  'feed:list', 'feed:personalized', 'feed:get-post', 'feed:create-post', 'feed:delete-post',
  'feed:upvote', 'feed:downvote',
  'comments:get-tree', 'comments:create', 'comments:upvote',
  'agents:list', 'agents:get-profile', 'agents:get-my-profile', 'agents:get-network',
  'agents:follow', 'agents:unfollow', 'agents:register', 'agents:update-profile',
  'submolts:list', 'submolts:get-detail', 'submolts:get-feed', 'submolts:get-galaxy',
  'submolts:create', 'submolts:subscribe', 'submolts:unsubscribe', 'submolts:update-settings',
  'moderation:pin', 'moderation:unpin', 'moderation:add-mod', 'moderation:remove-mod', 'moderation:get-mods',
  'llm:generate', 'llm:generate-stream', 'llm:embed',
  'autopilot:set-mode', 'autopilot:get-queue', 'autopilot:approve', 'autopilot:reject',
  'autopilot:emergency-stop', 'autopilot:get-log',
  'search:execute', 'search:get-clusters',
  'analytics:karma-history', 'analytics:activity', 'analytics:stats',
  'persona:save', 'persona:list', 'persona:delete', 'persona:generate-preview',
  'settings:save-api-key', 'settings:test-connection', 'settings:get-all',
  'settings:export', 'settings:clear-cache',
  'bonus:mood', 'bonus:trends', 'bonus:rivalries', 'bonus:forecast', 'bonus:ideas'
])

const ALLOWED_EVENTS = new Set([
  'autopilot:status-update',
  'api:rate-limit-update',
  'llm:stream-chunk'
])

const api: MoltApi = {
  invoke: (channel, payload) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, payload)
  },
  on: (channel, callback) => {
    if (!ALLOWED_EVENTS.has(channel)) {
      console.warn(`Event channel not allowed: ${channel}`)
      return () => {}
    }
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close')
}

contextBridge.exposeInMainWorld('molt', api)
