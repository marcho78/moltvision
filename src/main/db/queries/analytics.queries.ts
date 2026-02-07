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
