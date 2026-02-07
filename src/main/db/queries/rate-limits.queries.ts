import { queryAll, queryOne, run } from '../index'

/** Parse SQLite UTC datetime (no timezone suffix) as UTC in JavaScript */
function parseUtc(sqliteDatetime: string): Date {
  // SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' in UTC but without 'Z'
  // JS new Date() parses space-separated datetimes as local time, so we must append 'Z'
  const s = sqliteDatetime.trim()
  if (s.endsWith('Z') || s.includes('+') || s.includes('T')) return new Date(s)
  return new Date(s.replace(' ', 'T') + 'Z')
}

export function getRateLimit(resource: string): any {
  return queryOne('SELECT * FROM rate_limits WHERE resource = ?', [resource])
}

export function getAllRateLimits(): any[] {
  return queryAll('SELECT * FROM rate_limits')
}

export function updateRateLimit(resource: string, remaining: number, resetAt: string): void {
  run(
    'UPDATE rate_limits SET remaining = ?, reset_at = ? WHERE resource = ?',
    [remaining, resetAt, resource]
  )
}

/** Reset all rate limits to their max values. Called on app startup. */
export function resetAllRateLimits(): void {
  run("UPDATE rate_limits SET remaining = max_requests, reset_at = datetime('now', '+1 minute')")
}

export function decrementRateLimit(resource: string): boolean {
  const limit = getRateLimit(resource)
  if (!limit) return false

  // Check if reset time has passed (parse as UTC)
  if (parseUtc(limit.reset_at) <= new Date()) {
    run('UPDATE rate_limits SET remaining = max_requests, reset_at = datetime(\'now\', \'+1 minute\') WHERE resource = ?', [resource])
    return true
  }

  if (limit.remaining <= 0) return false

  run('UPDATE rate_limits SET remaining = remaining - 1 WHERE resource = ?', [resource])
  return true
}
