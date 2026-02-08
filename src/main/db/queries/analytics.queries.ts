import { queryAll, queryOne, run } from '../index'

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function recordKarmaSnapshot(data: {
  karma: number; post_karma: number; comment_karma: number;
  follower_count: number; post_count: number
}): void {
  run(
    `INSERT INTO karma_snapshots (id, karma, post_karma, comment_karma, follower_count, post_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [genId(), data.karma, data.post_karma, data.comment_karma, data.follower_count, data.post_count]
  )
}

export function getKarmaHistory(days: number = 30): any[] {
  return queryAll(
    `SELECT * FROM karma_snapshots
     WHERE recorded_at >= datetime('now', ?)
     ORDER BY recorded_at ASC`,
    [`-${days} days`]
  )
}

export function recordPostPerformance(postId: string, karma: number, commentCount: number): void {
  run(
    'INSERT INTO post_performance (id, post_id, karma, comment_count) VALUES (?, ?, ?, ?)',
    [genId(), postId, karma, commentCount]
  )
}

export function getPostPerformance(postId: string): any[] {
  return queryAll(
    'SELECT * FROM post_performance WHERE post_id = ? ORDER BY recorded_at ASC',
    [postId]
  )
}

export function logActivity(entry: {
  activity_type: string; summary: string; details?: Record<string, unknown>;
  llm_provider?: string; tokens_used?: number; cost?: number; level?: string
}): void {
  run(
    `INSERT INTO activity_log (id, activity_type, summary, details, llm_provider, tokens_used, cost, level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [genId(), entry.activity_type, entry.summary, JSON.stringify(entry.details ?? {}),
     entry.llm_provider ?? null, entry.tokens_used ?? 0, entry.cost ?? 0, entry.level ?? 'info']
  )
}

export function getActivityLog(opts: { days?: number; level?: string; limit?: number; offset?: number } = {}): any[] {
  const { days = 7, level, limit = 100, offset = 0 } = opts
  const conditions = [`created_at >= datetime('now', '-${days} days')`]
  const params: unknown[] = []
  if (level) {
    conditions.push('level = ?')
    params.push(level)
  }
  return queryAll(
    `SELECT * FROM activity_log WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  )
}

export function getActivityStats(): any {
  return queryOne(`
    SELECT
      COUNT(CASE WHEN activity_type LIKE 'post%' THEN 1 END) as total_posts,
      COUNT(CASE WHEN activity_type LIKE 'comment%' THEN 1 END) as total_comments,
      COUNT(CASE WHEN activity_type LIKE 'vote%' THEN 1 END) as total_votes,
      COALESCE(SUM(tokens_used), 0) as total_tokens,
      COALESCE(SUM(cost), 0) as total_cost
    FROM activity_log
  `)
}

// --- Token Usage Tracking ---

export function recordTokenUsage(entry: {
  purpose: string; provider: string; model: string;
  tokens_input: number; tokens_output: number; persona_id?: string | null
}): void {
  run(
    `INSERT INTO token_usage (id, purpose, provider, model, tokens_input, tokens_output, persona_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [genId(), entry.purpose, entry.provider, entry.model,
     entry.tokens_input, entry.tokens_output, entry.persona_id ?? null]
  )
}

export function getTokenUsageStats(): any {
  // Period totals
  const today = queryOne<any>(`
    SELECT COALESCE(SUM(tokens_input), 0) as input, COALESCE(SUM(tokens_output), 0) as output
    FROM token_usage WHERE created_at >= datetime('now', 'start of day')
  `)
  const week = queryOne<any>(`
    SELECT COALESCE(SUM(tokens_input), 0) as input, COALESCE(SUM(tokens_output), 0) as output
    FROM token_usage WHERE created_at >= datetime('now', '-7 days')
  `)
  const month = queryOne<any>(`
    SELECT COALESCE(SUM(tokens_input), 0) as input, COALESCE(SUM(tokens_output), 0) as output
    FROM token_usage WHERE created_at >= datetime('now', '-30 days')
  `)
  const allTime = queryOne<any>(`
    SELECT COALESCE(SUM(tokens_input), 0) as input, COALESCE(SUM(tokens_output), 0) as output
    FROM token_usage
  `)

  // Breakdown by purpose (last 30 days)
  const byPurpose = queryAll<any>(`
    SELECT purpose, COALESCE(SUM(tokens_input), 0) as input, COALESCE(SUM(tokens_output), 0) as output
    FROM token_usage WHERE created_at >= datetime('now', '-30 days')
    GROUP BY purpose ORDER BY (input + output) DESC
  `)

  // Breakdown by provider (last 30 days)
  const byProvider = queryAll<any>(`
    SELECT provider, COALESCE(SUM(tokens_input), 0) as input, COALESCE(SUM(tokens_output), 0) as output
    FROM token_usage WHERE created_at >= datetime('now', '-30 days')
    GROUP BY provider ORDER BY (input + output) DESC
  `)

  // Daily trend (last 14 days)
  const dailyTrend = queryAll<any>(`
    SELECT date(created_at) as date,
      COALESCE(SUM(tokens_input), 0) as input, COALESCE(SUM(tokens_output), 0) as output
    FROM token_usage WHERE created_at >= datetime('now', '-14 days')
    GROUP BY date(created_at) ORDER BY date ASC
  `)

  return {
    today: today ?? { input: 0, output: 0 },
    week: week ?? { input: 0, output: 0 },
    month: month ?? { input: 0, output: 0 },
    all_time: allTime ?? { input: 0, output: 0 },
    by_purpose: byPurpose,
    by_provider: byProvider,
    daily_trend: dailyTrend
  }
}
