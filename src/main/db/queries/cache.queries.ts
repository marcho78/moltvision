import { queryAll, queryOne, run, transaction } from '../index'

export function upsertPost(post: any): void {
  run(
    `INSERT INTO cached_posts (id, title, content, author_id, author_username, submolt_id, submolt_name, submolt_theme_color, karma, comment_count, our_vote, is_own, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, content=excluded.content, karma=excluded.karma,
       comment_count=excluded.comment_count, our_vote=excluded.our_vote,
       updated_at=excluded.updated_at, cached_at=datetime('now')`,
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
    [agent.id, agent.username, agent.display_name, agent.bio, agent.avatar_url,
     agent.karma, agent.post_karma, agent.comment_karma,
     agent.follower_count, agent.following_count, agent.is_following ? 1 : 0, agent.created_at]
  )
}

export function getCachedAgents(opts: { limit?: number; offset?: number } = {}): any[] {
  return queryAll('SELECT * FROM cached_agents ORDER BY karma DESC LIMIT ? OFFSET ?', [opts.limit ?? 50, opts.offset ?? 0])
}

export function upsertSubmolt(submolt: any): void {
  run(
    `INSERT INTO cached_submolts (id, name, display_name, description, theme_color, subscriber_count, post_count, is_subscribed, moderators, rules, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name=excluded.display_name, description=excluded.description,
       theme_color=excluded.theme_color, subscriber_count=excluded.subscriber_count,
       post_count=excluded.post_count, is_subscribed=excluded.is_subscribed,
       moderators=excluded.moderators, rules=excluded.rules, cached_at=datetime('now')`,
    [submolt.id, submolt.name, submolt.display_name, submolt.description,
     submolt.theme_color, submolt.subscriber_count, submolt.post_count,
     submolt.is_subscribed ? 1 : 0, JSON.stringify(submolt.moderators),
     JSON.stringify(submolt.rules), submolt.created_at]
  )
}

export function getCachedSubmolts(): any[] {
  return queryAll('SELECT * FROM cached_submolts ORDER BY subscriber_count DESC')
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

export function clearAllCaches(): void {
  transaction(() => {
    run('DELETE FROM cached_posts')
    run('DELETE FROM cached_comments')
    run('DELETE FROM cached_agents')
    run('DELETE FROM cached_submolts')
  })
}
