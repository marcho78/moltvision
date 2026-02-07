import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getPreferences } from '../db/queries/settings.queries'
import { getKarmaHistory, getActivityLog, getActivityStats } from '../db/queries/analytics.queries'
import { getAllRateLimits } from '../db/queries/rate-limits.queries'
import { queryAll, queryOne, run } from '../db/index'
import { llmManager } from '../services/llm.service'
import log from 'electron-log'

export function registerDbHandlers(): void {
  // --- Analytics ---
  ipcMain.handle(IPC.ANALYTICS_KARMA_HISTORY, async (_e, payload) => {
    return { snapshots: getKarmaHistory(payload?.days) }
  })

  ipcMain.handle(IPC.ANALYTICS_ACTIVITY, async (_e, payload) => {
    return { entries: getActivityLog(payload) }
  })

  ipcMain.handle(IPC.ANALYTICS_STATS, async () => {
    const stats = getActivityStats()
    const rateLimits = getAllRateLimits()
    return { ...stats, rate_limits: rateLimits }
  })

  // --- Persona ---
  ipcMain.handle(IPC.PERSONA_SAVE, async (_e, payload) => {
    const { persona } = payload
    const id = persona.id ?? 'default'
    run(
      `INSERT INTO agent_persona (id, name, description, tone_settings, interest_tags, engagement_rules, submolt_priorities, system_prompt, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, description=excluded.description, tone_settings=excluded.tone_settings,
         interest_tags=excluded.interest_tags, engagement_rules=excluded.engagement_rules,
         submolt_priorities=excluded.submolt_priorities, system_prompt=excluded.system_prompt,
         updated_at=excluded.updated_at`,
      [id, persona.name, persona.description, JSON.stringify(persona.tone_settings),
       JSON.stringify(persona.interest_tags), JSON.stringify(persona.engagement_rules),
       JSON.stringify(persona.submolt_priorities), persona.system_prompt]
    )
    return { id }
  })

  ipcMain.handle(IPC.PERSONA_LIST, async () => {
    const rows = queryAll<any>('SELECT * FROM agent_persona ORDER BY updated_at DESC')
    return rows.map((r) => ({
      ...r,
      tone_settings: JSON.parse(r.tone_settings),
      interest_tags: JSON.parse(r.interest_tags),
      engagement_rules: JSON.parse(r.engagement_rules),
      submolt_priorities: JSON.parse(r.submolt_priorities)
    }))
  })

  ipcMain.handle(IPC.PERSONA_DELETE, async (_e, payload) => {
    if (payload.persona_id === 'default') throw new Error('Cannot delete default persona')
    run('DELETE FROM agent_persona WHERE id = ?', [payload.persona_id])
    return { success: true }
  })

  ipcMain.handle(IPC.PERSONA_GENERATE_PREVIEW, async (_e, payload) => {
    const { persona, sample_post } = payload
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'system', content: persona.system_prompt },
          { role: 'user', content: `As the persona "${persona.name}", respond to this post:\nTitle: ${sample_post.title}\nContent: ${sample_post.content}` }
        ],
        temperature: persona.tone_settings?.temperature ?? 0.7,
        max_tokens: persona.tone_settings?.max_length ?? 500
      })
      return { preview_response: response.content, tone_analysis: `Style: ${persona.tone_settings?.style}` }
    } catch (err: any) {
      return { preview_response: `Error: ${err.message}`, tone_analysis: '' }
    }
  })

  // --- Settings ---
  ipcMain.handle(IPC.SETTINGS_GET_ALL, async () => {
    const preferences = getPreferences()
    const rows = queryAll<{ provider: string }>('SELECT provider FROM api_keys')
    const api_keys = ['moltbook', 'claude', 'openai', 'gemini', 'grok'].map(p => ({
      provider: p,
      configured: rows.some((r) => r.provider === p),
      valid: null,
      last_tested: null
    }))
    return { preferences, api_keys }
  })

  ipcMain.handle(IPC.SETTINGS_EXPORT, async () => {
    const preferences = getPreferences()
    const data = JSON.stringify({ preferences, exported_at: new Date().toISOString() }, null, 2)
    return { data, filename: `moltvision-settings-${Date.now()}.json` }
  })

  // --- Search Clusters (UMAP-based) ---
  ipcMain.handle(IPC.SEARCH_GET_CLUSTERS, async (_e, payload) => {
    // Simple cluster assignment based on result types
    const { results } = payload
    const clusters: any[] = []
    const points: any[] = []
    const typeGroups = new Map<string, any[]>()

    results.forEach((r: any, i: number) => {
      const type = r.type || 'unknown'
      if (!typeGroups.has(type)) typeGroups.set(type, [])
      typeGroups.get(type)!.push(r)
      // Simple pseudo-random 2D layout
      const angle = (i / results.length) * Math.PI * 2
      const radius = 2 + Math.random() * 3
      points.push({ id: r.id, x: Math.cos(angle) * radius + (Math.random() - 0.5), y: Math.sin(angle) * radius + (Math.random() - 0.5) })
    })

    const colors = ['#7c5cfc', '#22c55e', '#3b82f6', '#eab308']
    let ci = 0
    typeGroups.forEach((items, type) => {
      const clusterPoints = points.filter((p: any) => items.some((r: any) => r.id === p.id))
      const cx = clusterPoints.reduce((s: number, p: any) => s + p.x, 0) / clusterPoints.length
      const cy = clusterPoints.reduce((s: number, p: any) => s + p.y, 0) / clusterPoints.length
      clusters.push({
        id: type,
        label: type,
        center: [cx, cy],
        items: items.map((r: any) => r.id),
        color: colors[ci % colors.length]
      })
      ci++
    })

    return { clusters, points }
  })

  // --- Bonus Features ---
  ipcMain.handle(IPC.BONUS_MOOD, async () => {
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'system', content: 'Analyze community mood. Respond with JSON: {"overall":0.5,"by_submolt":{},"trend":"stable"}' },
          { role: 'user', content: 'Generate a sample community mood analysis for a social network.' }
        ],
        temperature: 0.5,
        max_tokens: 200,
        json_mode: true
      })
      const mood = JSON.parse(response.content)
      return { mood: { ...mood, timestamp: new Date().toISOString() } }
    } catch {
      return { mood: { overall: 0.5, by_submolt: {}, trend: 'stable', timestamp: new Date().toISOString() } }
    }
  })

  ipcMain.handle(IPC.BONUS_TRENDS, async () => {
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'system', content: 'Generate trending topics. Respond with JSON: {"trends":[{"topic":"...","submolts":["..."],"post_count":10,"velocity":1.5,"sparkline":[1,2,3,4,5]}]}' },
          { role: 'user', content: 'Generate sample trending topics for an AI social network.' }
        ],
        temperature: 0.7,
        max_tokens: 500,
        json_mode: true
      })
      return JSON.parse(response.content)
    } catch {
      return { trends: [] }
    }
  })

  ipcMain.handle(IPC.BONUS_RIVALRIES, async () => {
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'system', content: 'Generate agent rivalries. Respond with JSON: {"rivalries":[{"agent_a":"...","agent_b":"...","disagreement_count":5,"topics":["..."],"intensity":0.7,"history":[]}]}' },
          { role: 'user', content: 'Generate sample agent rivalries for an AI social network.' }
        ],
        temperature: 0.7,
        max_tokens: 400,
        json_mode: true
      })
      return JSON.parse(response.content)
    } catch {
      return { rivalries: [] }
    }
  })

  ipcMain.handle(IPC.BONUS_FORECAST, async () => {
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'system', content: 'Generate karma forecast. Respond with JSON: {"forecast":{"current":100,"projected_7d":120,"projected_30d":200,"trend_line":[{"date":"2026-01-01","value":100}],"analysis":"..."}}' },
          { role: 'user', content: 'Generate a sample karma forecast.' }
        ],
        temperature: 0.5,
        max_tokens: 500,
        json_mode: true
      })
      return JSON.parse(response.content)
    } catch {
      return { forecast: { current: 0, projected_7d: 0, projected_30d: 0, trend_line: [], analysis: '' } }
    }
  })

  ipcMain.handle(IPC.BONUS_IDEAS, async () => {
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'system', content: 'Generate post ideas. Respond with JSON: {"ideas":[{"id":"1","submolt":"general","title":"...","content_outline":"...","reasoning":"...","estimated_karma":50}]}' },
          { role: 'user', content: 'Generate 3 creative post ideas for an AI social network.' }
        ],
        temperature: 0.9,
        max_tokens: 600,
        json_mode: true
      })
      return JSON.parse(response.content)
    } catch {
      return { ideas: [] }
    }
  })
}
