import { useEffect } from 'react'
import { useStore } from '../stores'
import { on } from '../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { AutopilotStatus } from '@shared/domain.types'

export interface LiveEvent {
  type: 'scan' | 'action' | 'queue_updated'
  timestamp: string
  // scan events
  phase?: string
  message?: string
  // action events
  action_type?: string
  submolt?: string
  post_id?: string
  content?: string
  title?: string
}

/** Ensure a value is a safe React-renderable primitive, never an object */
function safePrimitive(val: unknown): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    // Extract .name or .display_name from nested objects (e.g. raw submolt/author)
    const obj = val as Record<string, unknown>
    return String(obj.display_name ?? obj.name ?? obj.username ?? JSON.stringify(val))
  }
  return String(val)
}

/** Sanitize an event so no object values can reach React rendering */
function sanitizeEvent(raw: unknown): LiveEvent {
  const e = raw as Record<string, unknown>
  return {
    type: (e.type as LiveEvent['type']) ?? 'scan',
    timestamp: typeof e.timestamp === 'string' ? e.timestamp : new Date().toISOString(),
    phase: safePrimitive(e.phase),
    message: safePrimitive(e.message),
    action_type: safePrimitive(e.action_type),
    submolt: safePrimitive(e.submolt),
    post_id: safePrimitive(e.post_id),
    content: safePrimitive(e.content),
    title: safePrimitive(e.title)
  }
}

export function useAutopilotEvents() {
  const setAutopilotStatus = useStore((s) => s.setAutopilotStatus)
  const addLiveEvent = useStore((s) => s.addLiveEvent)

  useEffect(() => {
    const unsubStatus = on(IPC.AUTOPILOT_STATUS_UPDATE, (status) => {
      setAutopilotStatus(status as AutopilotStatus)
    })

    const unsubLive = on(IPC.AUTOPILOT_LIVE_EVENT, (event) => {
      addLiveEvent(sanitizeEvent(event))
    })

    return () => {
      unsubStatus()
      unsubLive()
    }
  }, [setAutopilotStatus, addLiveEvent])
}
