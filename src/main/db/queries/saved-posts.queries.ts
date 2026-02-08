import { queryAll, run } from '../index'

export function savePost(postId: string): void {
  run('INSERT OR IGNORE INTO saved_posts (post_id) VALUES (?)', [postId])
}

export function unsavePost(postId: string): void {
  run('DELETE FROM saved_posts WHERE post_id = ?', [postId])
}

export function getSavedPostIds(): string[] {
  const rows = queryAll<{ post_id: string }>('SELECT post_id FROM saved_posts')
  return rows.map((r) => r.post_id)
}

export function getSavedPosts(limit = 50, offset = 0): any[] {
  return queryAll(
    `SELECT p.* FROM cached_posts p
     INNER JOIN saved_posts s ON p.id = s.post_id
     ORDER BY s.saved_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  )
}
