import { useEffect } from 'react'
import { useStore } from '../stores'
import { on } from '../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { AutopilotStatus } from '@shared/domain.types'

export function useAutopilotEvents() {
  const setAutopilotStatus = useStore((s) => s.setAutopilotStatus)

  useEffect(() => {
    const unsub = on(IPC.AUTOPILOT_STATUS_UPDATE, (status) => {
      setAutopilotStatus(status as AutopilotStatus)
    })
    return unsub
  }, [setAutopilotStatus])
}
