import { useEffect } from 'react'
import { useStore } from '../stores'
import { on } from '../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { AutopilotStatus } from '@shared/domain.types'

export interface LiveEvent {
  type: 'scan' | 'action'
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

export function useAutopilotEvents() {
  const setAutopilotStatus = useStore((s) => s.setAutopilotStatus)
  const addLiveEvent = useStore((s) => s.addLiveEvent)

  useEffect(() => {
    const unsubStatus = on(IPC.AUTOPILOT_STATUS_UPDATE, (status) => {
      setAutopilotStatus(status as AutopilotStatus)
    })

    const unsubLive = on(IPC.AUTOPILOT_LIVE_EVENT, (event) => {
      addLiveEvent(event as LiveEvent)
    })

    return () => {
      unsubStatus()
      unsubLive()
    }
  }, [setAutopilotStatus, addLiveEvent])
}
