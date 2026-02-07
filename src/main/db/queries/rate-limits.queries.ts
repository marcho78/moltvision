import { queryAll, queryOne, run } from '../index'

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

export function decrementRateLimit(resource: string): boolean {
  const limit = getRateLimit(resource)
  if (!limit) return false

  // Check if reset time has passed
  if (new Date(limit.reset_at) <= new Date()) {
    run('UPDATE rate_limits SET remaining = max_requests, reset_at = datetime(\'now\', \'+1 minute\') WHERE resource = ?', [resource])
    return true
  }

  if (limit.remaining <= 0) return false

  run('UPDATE rate_limits SET remaining = remaining - 1 WHERE resource = ?', [resource])
  return true
}
