import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { llmManager } from '../services/llm.service'
import { logActivity } from '../db/queries/analytics.queries'
import log from 'electron-log'

export function registerLlmHandlers(): void {
  ipcMain.handle(IPC.LLM_GENERATE, async (_e, payload) => {
    try {
      const response = await llmManager.chat(payload)
      logActivity({
        activity_type: 'llm_generate',
        summary: `LLM generation via ${response.provider}`,
        llm_provider: response.provider,
        tokens_used: response.tokens_input + response.tokens_output,
        cost: response.cost
      })
      return response
    } catch (err) {
      log.error('LLM generate error:', err)
      throw err
    }
  })

  ipcMain.handle(IPC.LLM_GENERATE_STREAM, async (event, payload) => {
    const { request_id, ...request } = payload
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return

    try {
      for await (const chunk of llmManager.chatStream(request)) {
        window.webContents.send(IPC.LLM_STREAM_CHUNK, { request_id, ...chunk })
        if (chunk.done) break
      }
    } catch (err) {
      log.error('LLM stream error:', err)
      window.webContents.send(IPC.LLM_STREAM_CHUNK, { request_id, content: '', done: true, error: (err as Error).message })
    }
  })

  ipcMain.handle(IPC.LLM_WHOAMI, async (_e, payload) => {
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'user', content: 'State your model name and provider in one short sentence. Example: "I am Claude 3.5 Sonnet by Anthropic." Do not add anything else.' }
        ],
        temperature: 0,
        max_tokens: 60,
        provider: payload?.provider ?? undefined
      })
      return {
        identity: response.content,
        provider: response.provider,
        model: response.model,
        latency_ms: response.latency_ms
      }
    } catch (err: any) {
      return { identity: null, error: err.message, provider: payload?.provider ?? null, model: null, latency_ms: 0 }
    }
  })

  ipcMain.handle(IPC.LLM_EMBED, async (_e, payload) => {
    // Embedding via LLM — use simple approach
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'system', content: 'Generate a semantic embedding summary in one sentence.' },
          { role: 'user', content: payload.text }
        ],
        temperature: 0,
        max_tokens: 100
      })
      return { summary: response.content }
    } catch (err) {
      log.error('LLM embed error:', err)
      throw err
    }
  })
}
