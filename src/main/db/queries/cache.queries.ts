import { queryAll, queryOne, run, transaction } from '../index'

export function upsertPost(post: any): void {
  run(
    `INSERT INTO cached_posts (id, title, content, author_id, author_username, submolt_id, submolt_name, submolt_theme_color, karma, comment_count, our_vote, is_own, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, content=excluded.content,
       author_id=excluded.author_id, author_username=excluded.author_username,
       submolt_id=excluded.submolt_id, submolt_name=excluded.submolt_name,
       submolt_theme_color=excluded.submolt_theme_color,
       karma=excluded.karma, comment_count=excluded.comment_count,
       our_vote=excluded.our_vote, updated_at=excluded.updated_at,
       cached_at=datetime('now')`,
    [post.id, post.title, post.content, post.author_id, post.author_username,
     post.submolt_id, post.submolt_name, post.submolt_theme_color,
     post.karma, post.comment_count, post.our_vote, post.is_own ? 1 : 0,
     post.created_at, post.updated_at]
  )
}

export function upsertPosts(posts: any[]): void {
  transaction(() => {
    for (const post of posts) upsertPost(post)
  })
}

export function getCachedPosts(opts: { submolt_id?: string; sort?: string; limit?: number; offset?: number } = {}): any[] {
  const { submolt_id, sort = 'created_at', limit = 50, offset = 0 } = opts
  const where = submolt_id ? 'WHERE submolt_id = ?' : ''
  const params: unknown[] = submolt_id ? [submolt_id] : []
  const orderBy = sort === 'karma' ? 'karma DESC' : 'created_at DESC'
  return queryAll(`SELECT * FROM cached_posts ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, offset])
}

export function getCachedPost(id: string): any {
  return queryOne('SELECT * FROM cached_posts WHERE id = ?', [id])
}

export function upsertComment(comment: any): void {
  run(
    `INSERT INTO cached_comments (id, post_id, parent_id, content, author_id, author_username, karma, our_vote, is_own, depth, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content=excluded.content, karma=excluded.karma, our_vote=excluded.our_vote,
       cached_at=datetime('now')`,
    [comment.id, comment.post_id, comment.parent_id, comment.content,
     comment.author_id, comment.author_username, comment.karma,
     comment.our_vote, comment.is_own ? 1 : 0, comment.depth, comment.created_at]
  )
}

export function upsertComments(comments: any[]): void {
  transaction(() => {
    for (const c of comments) upsertComment(c)
  })
}

export function getCommentsByPost(postId: string): any[] {
  return queryAll('SELECT * FROM cached_comments WHERE post_id = ? ORDER BY created_at ASC', [postId])
}

export function upsertAgent(agent: any): void {
  run(
    `INSERT INTO cached_agents (id, username, display_name, bio, avatar_url, karma, post_karma, comment_karma, follower_count, following_count, is_following, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name=excluded.display_name, bio=excluded.bio, avatar_url=excluded.avatar_url,
       karma=excluded.karma, post_karma=excluded.post_karma, comment_karma=excluded.comment_karma,
       follower_count=excluded.follower_count, following_count=excluded.following_count,
       is_following=excluded.is_following, cached_at=datetime('now')`,
    [agent.id ?? agent.name, agent.username ?? agent.name ?? '', agent.display_name ?? agent.name ?? '',
     agent.bio ?? agent.description ?? '', agent.avatar_url ?? null,
     agent.karma ?? 0, agent.post_karma ?? 0, agent.comment_karma ?? 0,
     agent.follower_count ?? 0, agent.following_count ?? 0,
     agent.is_following ? 1 : 0, agent.created_at ?? new Date().toISOString()]
  )
}

export function getCachedAgents(opts: { limit?: number; offset?: number } = {}): any[] {
  return queryAll('SELECT * FROM cached_agents ORDER BY karma DESC LIMIT ? OFFSET ?', [opts.limit ?? 50, opts.offset ?? 0])
}

/** Extract unique agents from cached posts (fallback when /agents endpoint doesn't exist) */
export function getAgentsFromPosts(): any[] {
  return queryAll(
    `SELECT
       COALESCE(NULLIF(author_id, ''), author_username) as id,
       COALESCE(NULLIF(author_username, ''), author_id) as username,
       COALESCE(NULLIF(author_username, ''), author_id) as display_name,
       '' as bio,
       NULL as avatar_url,
       SUM(karma) as karma,
       COUNT(*) as post_count,
       GROUP_CONCAT(DISTINCT submolt_name) as active_submolts,
       0 as is_following
     FROM cached_posts
     WHERE COALESCE(NULLIF(author_id, ''), NULLIF(author_username, '')) IS NOT NULL
     GROUP BY COALESCE(NULLIF(author_id, ''), author_username)
     ORDER BY karma DESC
     LIMIT 100`
  )
}

/** Get edges between agents who share submolts */
export function getAgentSubmoltEdges(): any[] {
  return queryAll(
    `SELECT DISTINCT
       COALESCE(NULLIF(a.author_id, ''), a.author_username) as source,
       COALESCE(NULLIF(b.author_id, ''), b.author_username) as target,
       a.submolt_name as shared_submolt
     FROM cached_posts a
     JOIN cached_posts b ON a.submolt_name = b.submolt_name
       AND COALESCE(NULLIF(a.author_id, ''), a.author_username) < COALESCE(NULLIF(b.author_id, ''), b.author_username)
     WHERE COALESCE(NULLIF(a.author_id, ''), a.author_username) IS NOT NULL
       AND COALESCE(NULLIF(b.author_id, ''), b.author_username) IS NOT NULL
     GROUP BY source, target, a.submolt_name
     LIMIT 500`
  )
}

export function upsertSubmolt(submolt: any): void {
  run(
    `INSERT INTO cached_submolts (id, name, display_name, description, theme_color, subscriber_count, post_count, is_subscribed, moderators, rules, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name=excluded.display_name, description=excluded.description,
       theme_color=excluded.theme_color, subscriber_count=excluded.subscriber_count,
       post_count=excluded.post_count,
       moderators=excluded.moderators, rules=excluded.rules, cached_at=datetime('now')`,
    [submolt.id ?? submolt.name, submolt.name, submolt.display_name ?? submolt.name ?? '',
     submolt.description ?? '', submolt.theme_color ?? '#7c5cfc',
     submolt.subscriber_count ?? 0, submolt.post_count ?? 0,
     0, JSON.stringify(submolt.moderators ?? []),
     JSON.stringify(submolt.rules ?? []), submolt.created_at ?? new Date().toISOString()]
  )
}

export function updateSubmoltSubscription(submoltName: string, isSubscribed: boolean): void {
  if (isSubscribed) {
    run(
      `INSERT OR IGNORE INTO user_subscriptions (submolt_name) VALUES (?)`,
      [submoltName]
    )
  } else {
    run(`DELETE FROM user_subscriptions WHERE submolt_name = ?`, [submoltName])
  }
}

export function getSubscribedSubmoltNames(): string[] {
  return queryAll<{ submolt_name: string }>('SELECT submolt_name FROM user_subscriptions')
    .map(r => r.submolt_name)
}

export function getCachedSubmolts(): any[] {
  const rows = queryAll<any>(
    `SELECT cs.*, CASE WHEN us.submolt_name IS NOT NULL THEN 1 ELSE 0 END as is_subscribed
     FROM cached_submolts cs
     LEFT JOIN user_subscriptions us ON cs.name = us.submolt_name
     ORDER BY subscriber_count DESC`
  )
  return rows.map((r) => ({ ...r, is_subscribed: !!r.is_subscribed }))
}

/** Search cached submolts by keyword (LIKE match on name, display_name, description) */
export function searchCachedSubmolts(keyword: string, limit: number = 20): any[] {
  const pattern = `%${keyword}%`
  const rows = queryAll<any>(
    `SELECT cs.*, CASE WHEN us.submolt_name IS NOT NULL THEN 1 ELSE 0 END as is_subscribed
     FROM cached_submolts cs
     LEFT JOIN user_subscriptions us ON cs.name = us.submolt_name
     WHERE cs.name LIKE ? OR cs.display_name LIKE ? OR cs.description LIKE ?
     ORDER BY cs.subscriber_count DESC
     LIMIT ?`,
    [pattern, pattern, pattern, limit]
  )
  return rows.map((r) => ({ ...r, is_subscribed: !!r.is_subscribed }))
}

/** Get total count of cached submolts */
export function getCachedSubmoltCount(): number {
  const row = queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM cached_submolts')
  return row?.cnt ?? 0
}

export function searchPostsFTS(query: string, limit: number = 20): any[] {
  return queryAll(
    `SELECT p.* FROM cached_posts p
     JOIN fts_posts fts ON p.rowid = fts.rowid
     WHERE fts_posts MATCH ?
     ORDER BY rank LIMIT ?`,
    [query, limit]
  )
}

/** Remove cached posts older than N days (default 3). Called after each feed upsert. */
export function expireOldPosts(days: number = 3): number {
  const result = run(
    `DELETE FROM cached_posts WHERE cached_at < datetime('now', '-' || ? || ' days')`,
    [days]
  )
  return result.changes
}

/** Remove cached agents/comments older than N days */
export function expireOldCaches(days: number = 7): void {
  run(`DELETE FROM cached_comments WHERE cached_at < datetime('now', '-' || ? || ' days')`, [days])
  run(`DELETE FROM cached_agents WHERE cached_at < datetime('now', '-' || ? || ' days')`, [days])
}

export function clearAllCaches(): void {
  transaction(() => {
    run('DELETE FROM cached_posts')
    run('DELETE FROM cached_comments')
    run('DELETE FROM cached_agents')
    run('DELETE FROM cached_submolts')
  })
}
