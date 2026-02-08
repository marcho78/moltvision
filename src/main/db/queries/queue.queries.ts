import { queryAll, queryOne, run } from '../index'

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function enqueueAction(action: {
  payload: Record<string, unknown>; priority?: number;
  reasoning?: string; context?: string
}): string {
  const id = genId()
  run(
    `INSERT INTO action_queue (id, payload, status, priority, reasoning, context)
     VALUES (?, ?, 'pending', ?, ?, ?)`,
    [id, JSON.stringify(action.payload), action.priority ?? 0, action.reasoning ?? '', action.context ?? '']
  )
  return id
}

export function getQueuedActions(status?: string): any[] {
  if (status) {
    return queryAll('SELECT * FROM action_queue WHERE status = ? ORDER BY priority DESC, created_at ASC', [status])
  }
  return queryAll('SELECT * FROM action_queue ORDER BY priority DESC, created_at ASC')
}

export function getAction(id: string): any {
  return queryOne('SELECT * FROM action_queue WHERE id = ?', [id])
}

export function updateActionStatus(id: string, status: string, extra?: { error?: string; llm_provider?: string; tokens_used?: number; cost?: number }): void {
  const completedAt = ['completed', 'failed'].includes(status) ? new Date().toISOString() : null
  run(
    `UPDATE action_queue SET status = ?, completed_at = ?, error = ?,
     llm_provider = COALESCE(?, llm_provider), tokens_used = COALESCE(?, tokens_used),
     cost = COALESCE(?, cost)
     WHERE id = ?`,
    [status, completedAt, extra?.error ?? null, extra?.llm_provider ?? null,
     extra?.tokens_used ?? null, extra?.cost ?? null, id]
  )
}

export function rejectAllPending(): number {
  const result = run("UPDATE action_queue SET status = 'rejected' WHERE status = 'pending'")
  return result.changes
}

export function getNextApproved(): any {
  return queryOne("SELECT * FROM action_queue WHERE status = 'approved' ORDER BY priority DESC, created_at ASC LIMIT 1")
}

export function countActionsInPeriod(hours: number): number {
  const row = queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM action_queue
     WHERE status IN ('completed', 'executing') AND created_at >= datetime('now', ?)`,
    [`-${hours} hours`]
  )
  return row?.cnt ?? 0
}

export function countActionsTodayTotal(): number {
  const row = queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM action_queue
     WHERE status IN ('completed', 'executing') AND created_at >= datetime('now', 'start of day')`
  )
  return row?.cnt ?? 0
}

export function clearCompletedActions(): number {
  const result = run("DELETE FROM action_queue WHERE status IN ('completed', 'failed', 'rejected')")
  return result.changes
}
