import type { IPCChannel } from '../shared/ipc-channels'

export interface MoltApi {
  invoke: (channel: IPCChannel, payload?: unknown) => Promise<unknown>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  // Window controls for frameless window
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
}

declare global {
  interface Window {
    molt: MoltApi
  }
}
