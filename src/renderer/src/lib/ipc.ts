import type { IPCChannel } from '@shared/ipc-channels'

export async function invoke<T = unknown>(channel: IPCChannel, payload?: unknown): Promise<T> {
  return window.molt.invoke(channel, payload) as Promise<T>
}

export function on(channel: string, callback: (...args: unknown[]) => void): () => void {
  return window.molt.on(channel, callback)
}
