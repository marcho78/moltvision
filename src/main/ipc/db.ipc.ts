import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getPreferences, savePreferences } from '../db/queries/settings.queries'
import { getKarmaHistory, getActivityLog, getActivityStats, getTokenUsageStats } from '../db/queries/analytics.queries'
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

  ipcMain.handle(IPC.ANALYTICS_TOKEN_USAGE, async () => {
    return getTokenUsageStats()
  })

  // --- Persona ---
  ipcMain.handle(IPC.PERSONA_SAVE, async (_e, payload) => {
    const { persona } = payload
    const id = persona.id ?? 'default'
    run(
      `INSERT INTO agent_persona (id, name, description, tone_settings, interest_tags, engagement_rules, submolt_priorities, system_prompt, llm_provider, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, description=excluded.description, tone_settings=excluded.tone_settings,
         interest_tags=excluded.interest_tags, engagement_rules=excluded.engagement_rules,
         submolt_priorities=excluded.submolt_priorities, system_prompt=excluded.system_prompt,
         llm_provider=excluded.llm_provider, updated_at=excluded.updated_at`,
      [id, persona.name, persona.description, JSON.stringify(persona.tone_settings),
       JSON.stringify(persona.interest_tags), JSON.stringify(persona.engagement_rules),
       JSON.stringify(persona.submolt_priorities), persona.system_prompt, persona.llm_provider ?? 'claude']
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
    const { persona, sample_post, provider } = payload
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'system', content: persona.system_prompt },
          { role: 'user', content: `As the persona "${persona.name}", respond to this post:\nTitle: ${sample_post.title}\nContent: ${sample_post.content}` }
        ],
        temperature: persona.tone_settings?.temperature ?? 0.7,
        max_tokens: persona.tone_settings?.max_length ?? 500,
        provider: provider ?? persona.llm_provider ?? undefined,
        purpose: 'persona_preview'
      })
      return { preview_response: response.content, provider_used: response.provider, tone_analysis: `Style: ${persona.tone_settings?.style}` }
    } catch (err: any) {
      return { preview_response: `Error: ${err.message}`, tone_analysis: '' }
    }
  })

  // --- Persona Test: runs LLM through all decision paths with a sample post ---
  ipcMain.handle(IPC.PERSONA_TEST_DECISIONS, async (_e, payload) => {
    const { persona, sample_post } = payload
    const provider = persona.llm_provider ?? 'claude'
    const rules = persona.engagement_rules ?? {}
    const postStrategy = rules.post_strategy ?? { gap_detection: false, momentum_based: false, quality_gate: 5, let_llm_decide: true }
    const commentStrategy = rules.comment_strategy ?? { early_voice: false, join_popular: false, domain_expertise: true, ask_questions: false, freshness_hours: 0, let_llm_decide: true }

    const results: Array<{ test: string; status: 'pass' | 'fail' | 'error'; response: string; latency_ms: number }> = []

    // Helper to run one test
    const runTest = async (testName: string, systemPrompt: string, userPrompt: string): Promise<void> => {
      const start = Date.now()
      try {
        const response = await llmManager.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 500,
          json_mode: true,
          provider,
          purpose: 'persona_test'
        })
        const latency = Date.now() - start
        const content = response.content
        results.push({ test: testName, status: 'pass', response: content, latency_ms: latency })
      } catch (err: any) {
        results.push({ test: testName, status: 'error', response: err.message ?? 'Unknown error', latency_ms: Date.now() - start })
      }
    }

    // Build strategy descriptions for display
    const commentCriteria: string[] = []
    if (commentStrategy.let_llm_decide) commentCriteria.push('LLM has full autonomy')
    if (commentStrategy.early_voice) commentCriteria.push('Prefer low-comment posts')
    if (commentStrategy.join_popular) commentCriteria.push('Prefer high-karma posts')
    if (commentStrategy.domain_expertise) commentCriteria.push('Match interest tags')
    if (commentStrategy.ask_questions) commentCriteria.push('Ask questions')

    const postCriteria: string[] = []
    if (postStrategy.let_llm_decide) postCriteria.push('LLM has full autonomy')
    if (postStrategy.gap_detection) postCriteria.push('Gap detection')
    if (postStrategy.momentum_based) postCriteria.push('Momentum-based')
    postCriteria.push(`Quality gate: ${postStrategy.quality_gate}/10`)

    const controversialClause = rules.avoid_controversial
      ? '\nIMPORTANT: AVOID controversial topics. If this post is controversial, verdict MUST be "skip".'
      : ''

    // Build comment strategy prompt
    let commentStrategyClause = ''
    if (commentStrategy.let_llm_decide) {
      commentStrategyClause = '\nYou have full autonomy to decide whether and how to engage. Think step by step about WHY you would or would not engage. Explain your complete reasoning.'
    } else {
      const lines: string[] = []
      if (commentStrategy.early_voice) lines.push(`- PREFER posts with few comments (this post has ${sample_post.comment_count ?? 3}) — be an early voice`)
      if (commentStrategy.join_popular) lines.push(`- PREFER high-karma posts (this post has ${sample_post.karma ?? 15} karma) — join popular conversations`)
      if (commentStrategy.domain_expertise) lines.push('- ONLY comment when the topic clearly matches your interest areas')
      if (commentStrategy.ask_questions) lines.push('- PREFER asking thoughtful questions over stating opinions')
      if (commentStrategy.freshness_hours > 0) lines.push(`- SKIP posts older than ${commentStrategy.freshness_hours} hours`)
      commentStrategyClause = lines.length > 0
        ? `\n\nComment strategy:\n${lines.join('\n')}\n\nThink step by step. Explain your complete reasoning.`
        : '\nUse your best judgment. Think step by step.'
    }

    // Test 1: Comment Evaluation
    await runTest(
      'Comment Evaluation',
      `${persona.system_prompt}\n\nYou are evaluating whether to engage with this post on Moltbook (an AI social network). Your interests: ${(persona.interest_tags ?? []).join(', ') || 'general'}. Your style: ${persona.tone_settings?.style ?? 'friendly'}.${controversialClause}${commentStrategyClause}\n\nRespond with JSON only: {"verdict":"engage"|"skip","reasoning":"<your detailed step-by-step thinking>","action":"comment"|"upvote"|"downvote","priority":0-10}`,
      `Post in m/${sample_post.submolt ?? 'general'}:\nTitle: ${sample_post.title}\nContent: ${sample_post.content}\nKarma: ${sample_post.karma ?? 15}\nComments: ${sample_post.comment_count ?? 3}`
    )

    // Test 2: Comment Generation (if evaluation passed)
    await runTest(
      'Comment Generation',
      `${persona.system_prompt}\n\nYou are writing a comment on Moltbook in the style: ${persona.tone_settings?.style ?? 'friendly'}. Write a short, punchy comment — 1-2 complete sentences.\n\nRespond with JSON only: {"content":"your comment text"}`,
      `Write a response to:\nTitle: ${sample_post.title}\nContent: ${sample_post.content}`
    )

    // Test 3: Post Creation Decision
    const topSubmolts = Object.entries(persona.submolt_priorities ?? {}).slice(0, 3).map(([name, p]) => `m/${name} (priority: ${p})`)
    let postStrategyClause = ''
    if (postStrategy.let_llm_decide) {
      postStrategyClause = '\nYou have full autonomy to decide. Think step by step. Explain your reasoning.'
    } else {
      const lines: string[] = []
      if (postStrategy.gap_detection) lines.push('- ONLY post when you notice a topic gap')
      if (postStrategy.momentum_based) lines.push('- Consider your recent performance')
      postStrategyClause = lines.length > 0
        ? `\n\nPost strategy:\n${lines.join('\n')}\nQuality gate: self-score 0-10, only proceed if >= ${postStrategy.quality_gate}.\nThink step by step.`
        : '\nUse your best judgment. Think step by step.'
    }

    await runTest(
      'Post Creation Decision',
      `${persona.system_prompt}\n\nYou are considering creating an original post on Moltbook. Your interests: ${(persona.interest_tags ?? []).join(', ') || 'general'}. Your style: ${persona.tone_settings?.style ?? 'friendly'}.\n\nYour active submolts:\n${topSubmolts.length > 0 ? topSubmolts.join('\n') : '(none configured)'}\n\nDecide if you have something worth posting.${postStrategyClause}\n\nRespond JSON only: {"should_post":true|false,"quality_score":0-10,"submolt":"submolt_name","title":"post title","content":"post body","reasoning":"<your detailed step-by-step thinking>"}`,
      'Consider creating an original post. Think about your interests and what would be valuable to the community.'
    )

    // Test 4: Reply Evaluation
    await runTest(
      'Reply Evaluation',
      `${persona.system_prompt}\n\nSomeone replied to your comment on Moltbook. Decide if it warrants a response. Think step by step.\n\nRespond JSON only: {"should_reply":true|false,"reasoning":"<your detailed thinking>"}`,
      `Your original comment: "That's a fascinating perspective on emergent behavior in multi-agent systems."\nTheir reply: "Thanks! Do you think this could apply to economic markets too?"`
    )

    return {
      results,
      provider,
      comment_strategy_active: commentCriteria,
      post_strategy_active: postCriteria
    }
  })

  // --- Settings ---
  ipcMain.handle(IPC.SETTINGS_SAVE_PREFERENCES, async (_e, payload) => {
    savePreferences(payload)
    return { success: true }
  })

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

  // --- Search Clusters ---
  // Layout uses similarity score: high similarity = near center, low = outer ring.
  // Type (post/comment) determines angular sector so they separate visually.
  ipcMain.handle(IPC.SEARCH_GET_CLUSTERS, async (_e, payload) => {
    const { results } = payload
    if (!Array.isArray(results) || results.length === 0) return { clusters: [], points: [] }

    const points: any[] = []
    const typeOffsets: Record<string, number> = {}
    let nextOffset = 0

    // Assign each type an angular sector
    results.forEach((r: any) => {
      const type = r.type || 'post'
      if (!(type in typeOffsets)) {
        typeOffsets[type] = nextOffset
        nextOffset++
      }
    })
    const typeCount = Math.max(nextOffset, 1)

    // Track items per type for clusters
    const typeItems = new Map<string, string[]>()

    results.forEach((r: any, i: number) => {
      const type = r.type || 'post'
      const sim = r.score ?? r.similarity ?? 0.5
      if (!typeItems.has(type)) typeItems.set(type, [])
      typeItems.get(type)!.push(r.id)

      // Distance from center: high similarity = close (small radius), low = far
      const dist = (1 - sim) * 8 + 0.5

      // Angular position: sector by type + spread within sector by index
      const sectorSize = (Math.PI * 2) / typeCount
      const sectorStart = typeOffsets[type] * sectorSize
      const itemsInType = results.filter((x: any) => (x.type || 'post') === type).length
      const indexInType = typeItems.get(type)!.length - 1
      const spreadAngle = itemsInType > 1 ? (indexInType / (itemsInType - 1)) * (sectorSize * 0.8) : sectorSize * 0.4
      const angle = sectorStart + sectorSize * 0.1 + spreadAngle

      // Small jitter to avoid perfect overlaps
      const jx = (Math.random() - 0.5) * 0.3
      const jy = (Math.random() - 0.5) * 0.3

      points.push({
        id: r.id,
        x: Math.cos(angle) * dist + jx,
        y: Math.sin(angle) * dist + jy
      })
    })

    // Build clusters from type groups
    const colors: Record<string, string> = { post: '#7c5cfc', comment: '#22c55e', agent: '#3b82f6', submolt: '#eab308' }
    const clusters: any[] = []
    typeItems.forEach((ids, type) => {
      const cPoints = points.filter((p: any) => ids.includes(p.id))
      const cx = cPoints.reduce((s: number, p: any) => s + p.x, 0) / cPoints.length
      const cy = cPoints.reduce((s: number, p: any) => s + p.y, 0) / cPoints.length
      clusters.push({
        id: type,
        label: type.charAt(0).toUpperCase() + type.slice(1) + 's',
        center: [cx, cy],
        items: ids,
        color: colors[type] ?? '#7c5cfc'
      })
    })

    return { clusters, points }
  })

}
