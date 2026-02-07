import { queryAll, queryOne, run, transaction } from '../index'

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// --- Agent Engagements ---

export function recordEngagement(opts: {
  postId: string
  commentId?: string
  actionType: string
  contentSent?: string
  personaId: string
  reasoning?: string
}): string {
  const id = genId()
  run(
    `INSERT INTO agent_engagements (id, post_id, comment_id, action_type, content_sent, persona_id, reasoning)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, opts.postId, opts.commentId ?? null, opts.actionType, opts.contentSent ?? null, opts.personaId, opts.reasoning ?? null]
  )
  return id
}

export function hasEngaged(postId: string, actionType?: string): boolean {
  if (actionType) {
    const row = queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM agent_engagements WHERE post_id = ? AND action_type = ?',
      [postId, actionType]
    )
    return (row?.cnt ?? 0) > 0
  }
  const row = queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM agent_engagements WHERE post_id = ?',
    [postId]
  )
  return (row?.cnt ?? 0) > 0
}

export function getEngagementHistory(opts: { limit?: number; offset?: number; actionType?: string } = {}): any[] {
  const { limit = 50, offset = 0, actionType } = opts
  if (actionType) {
    return queryAll(
      `SELECT * FROM agent_engagements WHERE action_type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [actionType, limit, offset]
    )
  }
  return queryAll(
    `SELECT * FROM agent_engagements ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  )
}

export function countEngagementsInPeriod(hours: number, actionType?: string): number {
  if (actionType) {
    const row = queryOne<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM agent_engagements
       WHERE action_type = ? AND created_at >= datetime('now', ?)`,
      [actionType, `-${hours} hours`]
    )
    return row?.cnt ?? 0
  }
  const row = queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM agent_engagements
     WHERE created_at >= datetime('now', ?)`,
    [`-${hours} hours`]
  )
  return row?.cnt ?? 0
}

export function countRepliesInThread(postId: string): number {
  const row = queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM agent_engagements
     WHERE post_id = ? AND action_type IN ('reply', 'create_comment')`,
    [postId]
  )
  return row?.cnt ?? 0
}

// --- Content Performance ---

export function recordContentPerformance(opts: {
  postId?: string; commentId?: string; contentType: string; karma: number; commentCount?: number
}): void {
  const existing = opts.postId
    ? queryOne<any>('SELECT id FROM agent_content_performance WHERE post_id = ?', [opts.postId])
    : opts.commentId
      ? queryOne<any>('SELECT id FROM agent_content_performance WHERE comment_id = ?', [opts.commentId])
      : null

  if (existing) {
    run(
      `UPDATE agent_content_performance
       SET karma_current = ?, comment_count = ?, last_checked_at = datetime('now')
       WHERE id = ?`,
      [opts.karma, opts.commentCount ?? 0, existing.id]
    )
  } else {
    run(
      `INSERT INTO agent_content_performance (id, post_id, comment_id, content_type, karma_at_creation, karma_current, comment_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [genId(), opts.postId ?? null, opts.commentId ?? null, opts.contentType, opts.karma, opts.karma, opts.commentCount ?? 0]
    )
  }
}

export function getContentPerformance(limit: number = 20): any[] {
  return queryAll(
    'SELECT * FROM agent_content_performance ORDER BY created_at DESC LIMIT ?',
    [limit]
  )
}

// --- Reply Inbox ---

export function addToReplyInbox(opts: {
  parentPostId: string
  parentCommentId?: string
  agentOriginalContent?: string
  replyCommentId: string
  replyAuthor: string
  replyContent: string
  depth?: number
}): void {
  run(
    `INSERT OR IGNORE INTO reply_inbox (id, parent_post_id, parent_comment_id, agent_original_content, reply_comment_id, reply_author, reply_content, depth)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [genId(), opts.parentPostId, opts.parentCommentId ?? null, opts.agentOriginalContent ?? null,
     opts.replyCommentId, opts.replyAuthor, opts.replyContent, opts.depth ?? 0]
  )
}

export function getUnreadReplies(): any[] {
  return queryAll(
    'SELECT * FROM reply_inbox WHERE is_read = 0 ORDER BY discovered_at DESC'
  )
}

export function getAllReplies(opts: { limit?: number; offset?: number } = {}): any[] {
  const { limit = 50, offset = 0 } = opts
  return queryAll(
    'SELECT * FROM reply_inbox ORDER BY discovered_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  )
}

export function markRepliesRead(ids: string[]): void {
  if (ids.length === 0) return
  transaction(() => {
    for (const id of ids) {
      run('UPDATE reply_inbox SET is_read = 1 WHERE id = ?', [id])
    }
  })
}

export function markReplyResponded(replyCommentId: string): void {
  run('UPDATE reply_inbox SET agent_responded = 1 WHERE reply_comment_id = ?', [replyCommentId])
}

export function getUnrespondedReplies(): any[] {
  return queryAll(
    'SELECT * FROM reply_inbox WHERE agent_responded = 0 ORDER BY discovered_at ASC'
  )
}

export function getUnreadReplyCount(): number {
  const row = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM reply_inbox WHERE is_read = 0')
  return row?.cnt ?? 0
}

// --- Agent's Own Content (for reply monitoring) ---

export function getRecentAgentPostIds(hours: number = 24): string[] {
  const rows = queryAll<{ post_id: string }>(
    `SELECT DISTINCT post_id FROM agent_engagements
     WHERE action_type IN ('create_post', 'create_comment', 'reply')
       AND created_at >= datetime('now', ?)
     ORDER BY created_at DESC LIMIT 20`,
    [`-${hours} hours`]
  )
  return rows.map(r => r.post_id)
}
