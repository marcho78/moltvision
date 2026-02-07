import React, { useEffect, useState, useCallback } from 'react'
import { useStore } from '../../stores'
import { useAutopilotEvents } from '../../hooks/useAutopilotEvents'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { OperationMode, AgentAction, AgentPersona, AgentEngagement, ReplyInboxEntry } from '@shared/domain.types'

// ─── Tab Type ────────────────────────────────────────────

type AutopilotTab = 'controls' | 'activity' | 'queue' | 'replies'

// ─── Mode Toggle ─────────────────────────────────────────

function ModeToggle() {
  const { autopilotStatus, setAutopilotStatus, addNotification } = useStore()
  const modes: OperationMode[] = ['off', 'semi-auto', 'autopilot']
  const modeInfo: Record<OperationMode, { label: string; color: string; desc: string }> = {
    off: { label: 'Off', color: 'bg-molt-muted', desc: 'Agent is idle' },
    'semi-auto': { label: 'Semi-Auto', color: 'bg-molt-warning', desc: 'Proposes actions for your approval' },
    autopilot: { label: 'Autopilot', color: 'bg-molt-success', desc: 'Fully autonomous within safety limits' }
  }

  const handleSetMode = async (mode: OperationMode) => {
    try {
      const status = await invoke<any>(IPC.AUTOPILOT_SET_MODE, { mode })
      setAutopilotStatus(status)
    } catch (err: any) {
      addNotification(err.message || 'Failed to set mode', 'error')
    }
  }

  return (
    <div className="panel-card">
      <h3 className="text-sm font-medium mb-3">Operation Mode</h3>
      <div className="flex gap-2">
        {modes.map((mode) => {
          const info = modeInfo[mode]
          return (
            <button key={mode} onClick={() => handleSetMode(mode)}
              className={`flex-1 p-3 rounded-lg border transition-colors text-left ${
                autopilotStatus.mode === mode
                  ? 'border-molt-accent bg-molt-accent/10'
                  : 'border-molt-border hover:border-molt-accent/30'
              }`}>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${info.color}`} />
                <span className="text-sm font-medium">{info.label}</span>
              </div>
              <p className="text-xs text-molt-muted">{info.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Persona Selector ────────────────────────────────────

function PersonaSelector() {
  const { activePersonaId, setActivePersonaId, savedPersonas, setSavedPersonas, addNotification } = useStore()

  useEffect(() => {
    // Load saved personas
    invoke<AgentPersona[]>(IPC.PERSONA_LIST)
      .then((personas) => setSavedPersonas(personas))
      .catch(console.error)

    // Load active persona ID
    invoke<{ persona_id: string }>(IPC.AUTOPILOT_GET_PERSONA)
      .then((result) => setActivePersonaId(result.persona_id))
      .catch(console.error)
  }, [setSavedPersonas, setActivePersonaId])

  const handleChange = async (personaId: string) => {
    try {
      await invoke(IPC.AUTOPILOT_SET_PERSONA, { persona_id: personaId })
      setActivePersonaId(personaId)
      addNotification(`Persona switched to "${savedPersonas.find(p => p.id === personaId)?.name ?? personaId}"`, 'success')
    } catch (err: any) {
      addNotification(err.message || 'Failed to set persona', 'error')
    }
  }

  return (
    <div className="panel-card">
      <h3 className="text-sm font-medium mb-2">Active Persona</h3>
      <select
        value={activePersonaId}
        onChange={(e) => handleChange(e.target.value)}
        className="input-field w-full text-sm"
      >
        {savedPersonas.length === 0 && (
          <option value="default">Default Agent</option>
        )}
        {savedPersonas.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {savedPersonas.length > 0 && (
        <p className="text-[10px] text-molt-muted mt-1.5">
          {savedPersonas.find(p => p.id === activePersonaId)?.description || 'Configure personas in the Persona Studio panel'}
        </p>
      )}
    </div>
  )
}

// ─── Target Submolts ─────────────────────────────────────

function TargetSubmolts() {
  const { activePersonaId, savedPersonas, setSavedPersonas, submolts, setSubmolts, addNotification } = useStore()
  const [addInput, setAddInput] = useState('')
  const [saving, setSaving] = useState(false)

  // Get active persona
  const persona = savedPersonas.find(p => p.id === activePersonaId) ?? null
  const priorities = persona?.submolt_priorities ?? {}
  const entries = Object.entries(priorities).sort(([, a], [, b]) => (b as number) - (a as number))

  // Load submolts for quick-add
  useEffect(() => {
    if (submolts.length === 0) {
      invoke<any>(IPC.SUBMOLTS_LIST)
        .then((result: any) => {
          const list = Array.isArray(result) ? result : (result?.submolts ?? [])
          if (list.length > 0) setSubmolts(list)
        })
        .catch(() => {})
    }
  }, [submolts.length, setSubmolts])

  const subscribedSubmolts = submolts.filter((s: any) => s.is_subscribed)

  const saveUpdatedPriorities = async (newPriorities: Record<string, number>) => {
    if (!persona) return
    setSaving(true)
    try {
      const updated = { ...persona, submolt_priorities: newPriorities }
      await invoke(IPC.PERSONA_SAVE, { persona: updated })
      // Refresh personas list
      const personas = await invoke<AgentPersona[]>(IPC.PERSONA_LIST)
      setSavedPersonas(personas)
    } catch (err: any) {
      addNotification(err.message || 'Failed to save submolt targets', 'error')
    } finally {
      setSaving(false)
    }
  }

  const addSubmolt = (name: string) => {
    const clean = name.trim().replace(/^m\//, '')
    if (!clean || priorities[clean] !== undefined) return
    saveUpdatedPriorities({ ...priorities, [clean]: 5 })
    setAddInput('')
  }

  const removeSubmolt = (name: string) => {
    const next = { ...priorities }
    delete next[name]
    saveUpdatedPriorities(next)
  }

  const setPriority = (name: string, value: number) => {
    saveUpdatedPriorities({ ...priorities, [name]: value })
  }

  if (!persona) {
    return (
      <div className="panel-card">
        <h3 className="text-sm font-medium mb-2">Target Submolts</h3>
        <p className="text-xs text-molt-muted">Select a persona first to configure submolt targets.</p>
      </div>
    )
  }

  return (
    <div className="panel-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Target Submolts</h3>
        <span className="text-[10px] text-molt-muted">
          {entries.length} active{saving ? ' · saving...' : ''}
        </span>
      </div>
      <p className="text-[10px] text-molt-muted">
        Where the agent will engage — scan feeds, create posts, and comment. No submolts = agent has nowhere to go.
      </p>

      {/* Quick add from subscriptions */}
      {subscribedSubmolts.filter((s: any) => priorities[s.name] === undefined).length > 0 && (
        <div className="space-y-1">
          <label className="text-[10px] text-molt-muted">Quick add from subscriptions:</label>
          <div className="flex flex-wrap gap-1">
            {subscribedSubmolts
              .filter((s: any) => priorities[s.name] === undefined)
              .slice(0, 10)
              .map((s: any) => (
                <button key={s.name} onClick={() => addSubmolt(s.name)}
                  className="px-2 py-0.5 text-[10px] rounded-full bg-molt-surface text-molt-muted hover:text-molt-text hover:bg-molt-accent/10 border border-molt-border transition-colors">
                  + m/{s.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Manual add */}
      <div className="flex gap-2">
        <input value={addInput} onChange={(e) => setAddInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSubmolt(addInput)}
          placeholder="Type submolt name..."
          className="input-field flex-1 text-xs" />
        <button onClick={() => addSubmolt(addInput)}
          className="btn-secondary text-xs px-3"
          disabled={!addInput.trim()}>
          Add
        </button>
      </div>

      {/* Priority list */}
      {entries.length === 0 ? (
        <div className="text-xs text-molt-warning text-center py-3 bg-molt-warning/5 border border-molt-warning/20 rounded-lg">
          No submolts targeted. The agent has nowhere to post or comment.
          {subscribedSubmolts.length > 0
            ? ' Add submolts above to get started.'
            : ' Subscribe to submolts in the Galaxy panel first.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([name, priority]) => (
            <div key={name} className="flex items-center gap-2 bg-molt-bg rounded-lg px-2.5 py-1.5">
              <span className="text-xs font-medium text-molt-text w-24 truncate" title={`m/${name}`}>m/{name}</span>
              <input type="range" min="1" max="10" step="1" value={priority}
                onChange={(e) => setPriority(name, parseInt(e.target.value))}
                className="flex-1 h-1" />
              <span className="text-[10px] text-molt-muted w-4 text-center">{priority}</span>
              <button onClick={() => removeSubmolt(name)}
                className="text-molt-muted hover:text-molt-error text-sm transition-colors w-4">&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Rate Limit Bars ─────────────────────────────────────

function RateLimitDashboard() {
  const limits = [
    { label: 'General API', max: 100, resource: 'moltbook_general' },
    { label: 'Post Creation', max: 1, resource: 'moltbook_posts' },
    { label: 'Comments/Day', max: 50, resource: 'moltbook_comments' }
  ]
  const rateLimits = useStore((s) => s.rateLimits)

  return (
    <div className="panel-card">
      <h3 className="text-sm font-medium mb-2">API Rate Limits</h3>
      <div className="space-y-2">
        {limits.map((lim) => {
          const current = rateLimits.find(r => r.resource === lim.resource)
          const remaining = current?.remaining ?? lim.max
          const pct = (remaining / lim.max) * 100
          const color = pct > 50 ? 'bg-molt-success' : pct > 20 ? 'bg-molt-warning' : 'bg-molt-error'
          return (
            <div key={lim.resource} className="flex items-center gap-2">
              <span className="text-xs text-molt-muted w-28 truncate">{lim.label}</span>
              <div className="flex-1 h-1.5 bg-molt-bg rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-molt-muted w-12 text-right">{remaining}/{lim.max}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Emergency Stop ──────────────────────────────────────

function EmergencyStop() {
  const { autopilotStatus, setAutopilotStatus, addNotification } = useStore()

  const handleStop = async () => {
    try {
      const status = await invoke<any>(IPC.AUTOPILOT_EMERGENCY_STOP)
      setAutopilotStatus(status)
      addNotification('EMERGENCY STOP activated!', 'warning')
    } catch (err: any) {
      addNotification(err.message || 'Emergency stop failed', 'error')
    }
  }

  return (
    <button onClick={handleStop}
      disabled={autopilotStatus.mode === 'off'}
      className="w-full py-3 rounded-xl bg-molt-error/20 hover:bg-molt-error/40 border-2 border-molt-error
                 text-molt-error font-bold text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
      EMERGENCY STOP
    </button>
  )
}

// ─── Live Agent Feed ─────────────────────────────────────

function LiveAgentFeed() {
  const { liveEvents, autopilotStatus } = useStore()

  // Latest scan event for status line
  const latestScan = liveEvents.find(e => e.type === 'scan')
  // Recent action events
  const recentActions = liveEvents.filter(e => e.type === 'action').slice(0, 5)

  if (autopilotStatus.mode === 'off') return null

  return (
    <div className="panel-card space-y-2">
      <h3 className="text-sm font-medium">Live Agent Status</h3>

      {/* Current scan status line */}
      {autopilotStatus.is_running && latestScan?.message && (
        <div className="flex items-center gap-2 bg-molt-bg rounded-lg px-3 py-2">
          <div className={`w-2 h-2 rounded-full ${
            latestScan.phase === 'done' ? 'bg-molt-success' :
            latestScan.phase === 'error' ? 'bg-molt-error' :
            'bg-molt-accent animate-pulse'
          }`} />
          <span className="text-xs text-molt-text">{latestScan.message}</span>
        </div>
      )}

      {!autopilotStatus.is_running && !latestScan && (
        <div className="text-xs text-molt-muted bg-molt-bg rounded-lg px-3 py-2">
          Waiting for first scan cycle...
        </div>
      )}

      {/* Recent actions */}
      {recentActions.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-molt-muted uppercase tracking-wider">Recent Actions</span>
          {recentActions.map((event, i) => {
            const actionColors: Record<string, string> = {
              create_post: 'text-molt-accent',
              create_comment: 'text-molt-success',
              reply: 'text-molt-info',
              upvote: 'text-molt-warning',
              downvote: 'text-molt-error'
            }
            const actionLabels: Record<string, string> = {
              create_post: 'Posted',
              create_comment: 'Commented',
              reply: 'Replied',
              upvote: 'Upvoted',
              downvote: 'Downvoted'
            }
            return (
              <div key={`${event.timestamp}-${i}`} className="flex items-start gap-2 text-xs bg-molt-bg rounded px-2.5 py-1.5">
                <span className={`font-semibold shrink-0 ${actionColors[event.action_type ?? ''] ?? 'text-molt-muted'}`}>
                  {actionLabels[event.action_type ?? ''] ?? event.action_type}
                </span>
                <span className="text-molt-text truncate flex-1">
                  {event.title
                    ? `"${event.title}" in m/${event.submolt ?? '?'}`
                    : event.content
                      ? event.content.slice(0, 60) + (event.content.length > 60 ? '...' : '')
                      : event.submolt
                        ? `in m/${event.submolt}`
                        : ''
                  }
                </span>
                <span className="text-[10px] text-molt-muted shrink-0">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {autopilotStatus.is_running && recentActions.length === 0 && latestScan?.phase === 'done' && (
        <div className="text-[10px] text-molt-muted">
          Last scan found no posts to engage with. Next scan at {
            autopilotStatus.next_scan_at ? new Date(autopilotStatus.next_scan_at).toLocaleTimeString() : '...'
          }
        </div>
      )}
    </div>
  )
}

// ─── Tab 1: Controls ─────────────────────────────────────

function ControlsTab() {
  const { autopilotStatus } = useStore()

  return (
    <div className="space-y-4">
      <ModeToggle />
      <PersonaSelector />
      <TargetSubmolts />
      <LiveAgentFeed />

      <div className="grid grid-cols-3 gap-3">
        <div className="panel-card p-3 text-center">
          <div className="text-xs text-molt-muted">Actions/Hour</div>
          <div className="text-xl font-bold text-molt-text">{autopilotStatus.actions_this_hour}</div>
        </div>
        <div className="panel-card p-3 text-center">
          <div className="text-xs text-molt-muted">Actions Today</div>
          <div className="text-xl font-bold text-molt-text">{autopilotStatus.actions_today}</div>
        </div>
        <div className="panel-card p-3 text-center">
          <div className="text-xs text-molt-muted">Status</div>
          <div className={`text-xl font-bold ${
            autopilotStatus.emergency_stopped ? 'text-molt-error' :
            autopilotStatus.is_running ? 'text-molt-success' : 'text-molt-muted'
          }`}>
            {autopilotStatus.emergency_stopped ? 'STOPPED' : autopilotStatus.is_running ? 'ACTIVE' : 'IDLE'}
          </div>
        </div>
      </div>

      <RateLimitDashboard />
      <EmergencyStop />

      {autopilotStatus.last_scan_at && (
        <p className="text-[10px] text-molt-muted text-center">
          Last scan: {new Date(autopilotStatus.last_scan_at).toLocaleTimeString()}
          {autopilotStatus.next_scan_at && ` · Next: ${new Date(autopilotStatus.next_scan_at).toLocaleTimeString()}`}
        </p>
      )}
    </div>
  )
}

// ─── Tab 2: Activity Feed ────────────────────────────────

function ActivityTab() {
  const { agentActivity, setAgentActivity, setActivePanel, setActivePost, setActivePostData } = useStore()
  const [filter, setFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchActivity = useCallback(async () => {
    setLoading(true)
    try {
      const result = await invoke<{ entries: AgentEngagement[] }>(IPC.AUTOPILOT_GET_ACTIVITY, {
        limit: 50,
        action_type: filter
      })
      setAgentActivity(result.entries)
    } catch (err) {
      console.error('Failed to load activity:', err)
    } finally {
      setLoading(false)
    }
  }, [filter, setAgentActivity])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  const actionBadge: Record<string, { label: string; color: string }> = {
    create_post: { label: 'POST', color: 'bg-molt-accent/20 text-molt-accent' },
    create_comment: { label: 'COMMENT', color: 'bg-molt-success/20 text-molt-success' },
    reply: { label: 'REPLY', color: 'bg-molt-info/20 text-molt-info' },
    upvote: { label: 'UPVOTE', color: 'bg-molt-warning/20 text-molt-warning' },
    downvote: { label: 'DOWNVOTE', color: 'bg-molt-error/20 text-molt-error' }
  }

  const handleClick = (postId: string) => {
    setActivePost(postId)
    setActivePostData(null)
    setActivePanel('conversation')
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {[null, 'create_post', 'create_comment', 'upvote'].map((f) => (
          <button key={f ?? 'all'} onClick={() => setFilter(f)}
            className={`px-2.5 py-1 text-xs rounded-md transition-all ${
              filter === f ? 'bg-molt-surface text-molt-text font-medium' : 'text-molt-muted hover:text-molt-text'
            }`}>
            {f === null ? 'All' : f === 'create_post' ? 'Posts' : f === 'create_comment' ? 'Comments' : 'Votes'}
          </button>
        ))}
      </div>

      {loading && agentActivity.length === 0 && (
        <div className="text-molt-muted text-sm text-center py-6">Loading activity...</div>
      )}

      {!loading && agentActivity.length === 0 && (
        <div className="text-molt-muted text-sm text-center py-6">
          No agent activity yet. Start the autopilot to begin engaging.
        </div>
      )}

      {agentActivity.map((entry) => {
        const badge = actionBadge[entry.action_type] ?? { label: entry.action_type, color: 'bg-molt-surface text-molt-muted' }
        return (
          <div key={entry.id}
            onClick={() => handleClick(entry.post_id)}
            className="panel-card p-3 cursor-pointer hover:border-molt-accent/30 transition-colors">
            <div className="flex items-center justify-between mb-1.5">
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.color}`}>
                {badge.label}
              </span>
              <span className="text-[10px] text-molt-muted">
                {new Date(entry.created_at).toLocaleString()}
              </span>
            </div>
            {entry.content_sent && (
              <p className="text-xs text-molt-text line-clamp-2 mb-1">{entry.content_sent}</p>
            )}
            {entry.reasoning && (
              <p className="text-[10px] text-molt-muted line-clamp-1">{entry.reasoning}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab 3: Action Queue ─────────────────────────────────

function ActionQueueItem({ action }: { action: AgentAction }) {
  const { removeFromQueue, addNotification } = useStore()

  const handleApprove = async () => {
    try {
      await invoke(IPC.AUTOPILOT_APPROVE, { action_id: action.id })
      removeFromQueue(action.id)
      addNotification('Action approved and executing', 'success')
    } catch (err: any) {
      addNotification(err.message || 'Approve failed', 'error')
    }
  }

  const handleReject = async () => {
    try {
      await invoke(IPC.AUTOPILOT_REJECT, { action_id: action.id })
      removeFromQueue(action.id)
    } catch (err: any) {
      addNotification(err.message || 'Reject failed', 'error')
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'text-molt-warning',
    approved: 'text-molt-info',
    executing: 'text-molt-accent',
    completed: 'text-molt-success',
    failed: 'text-molt-error',
    rejected: 'text-molt-muted'
  }

  return (
    <div className="panel-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="badge bg-molt-accent/20 text-molt-accent text-xs">{action.payload.type}</span>
          <span className={`text-xs ${statusColors[action.status]}`}>{action.status}</span>
        </div>
        <span className="text-xs text-molt-muted">
          {new Date(action.created_at).toLocaleTimeString()}
        </span>
      </div>
      {action.payload.content && (
        <p className="text-xs text-molt-text mb-2 line-clamp-3">{action.payload.content}</p>
      )}
      <p className="text-xs text-molt-muted mb-2">{action.reasoning}</p>
      {action.status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={handleApprove} className="btn-primary text-xs py-1 px-3">Approve</button>
          <button onClick={handleReject} className="btn-danger text-xs py-1 px-3">Reject</button>
        </div>
      )}
    </div>
  )
}

function QueueTab() {
  const { actionQueue, setActionQueue, autopilotStatus } = useStore()

  useEffect(() => {
    invoke<{ actions: AgentAction[] }>(IPC.AUTOPILOT_GET_QUEUE, {})
      .then((result) => setActionQueue(result.actions))
      .catch(console.error)
  }, [setActionQueue])

  return (
    <div className="space-y-3">
      {autopilotStatus.mode === 'semi-auto' && (
        <div className="text-xs text-molt-muted bg-molt-surface rounded-lg px-3 py-2">
          Semi-auto mode: actions are queued for your approval before executing.
        </div>
      )}

      <h3 className="text-sm font-medium">Pending Actions ({actionQueue.filter(a => a.status === 'pending').length})</h3>
      <div className="space-y-2">
        {actionQueue.length === 0 ? (
          <div className="text-molt-muted text-sm text-center py-6">No queued actions</div>
        ) : (
          actionQueue.map((action) => <ActionQueueItem key={action.id} action={action} />)
        )}
      </div>
    </div>
  )
}

// ─── Tab 4: Reply Inbox ──────────────────────────────────

function RepliesTab() {
  const { replyInbox, setReplyInbox, unreadReplyCount, setUnreadReplyCount, addNotification, setActivePanel, setActivePost, setActivePostData } = useStore()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    invoke<{ replies: ReplyInboxEntry[]; unread_count: number }>(IPC.AUTOPILOT_GET_REPLIES, { limit: 50 })
      .then((result) => {
        setReplyInbox(result.replies)
        setUnreadReplyCount(result.unread_count)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [setReplyInbox, setUnreadReplyCount])

  const handleMarkRead = async (ids: string[]) => {
    try {
      await invoke(IPC.AUTOPILOT_MARK_REPLIES_READ, { ids })
      setReplyInbox(replyInbox.map(r => ids.includes(r.id) ? { ...r, is_read: true } : r))
      setUnreadReplyCount(Math.max(0, unreadReplyCount - ids.length))
    } catch (err: any) {
      addNotification(err.message || 'Failed to mark as read', 'error')
    }
  }

  const handleViewThread = (postId: string) => {
    setActivePost(postId)
    setActivePostData(null)
    setActivePanel('conversation')
  }

  if (loading && replyInbox.length === 0) {
    return <div className="text-molt-muted text-sm text-center py-6">Loading replies...</div>
  }

  if (replyInbox.length === 0) {
    return (
      <div className="text-molt-muted text-sm text-center py-6">
        No replies yet. Once other agents reply to your content, they'll appear here.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {unreadReplyCount > 0 && (
        <button
          onClick={() => handleMarkRead(replyInbox.filter(r => !r.is_read).map(r => r.id))}
          className="text-xs text-molt-accent hover:text-molt-accent-hover transition-colors">
          Mark all as read ({unreadReplyCount})
        </button>
      )}

      {replyInbox.map((reply) => (
        <div key={reply.id}
          className={`panel-card p-3 ${!reply.is_read ? 'border-molt-accent/30 bg-molt-accent/5' : ''}`}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-molt-text">{reply.reply_author}</span>
              {!reply.is_read && (
                <span className="w-1.5 h-1.5 rounded-full bg-molt-accent" />
              )}
              {reply.agent_responded && (
                <span className="text-[10px] text-molt-success">replied</span>
              )}
            </div>
            <span className="text-[10px] text-molt-muted">
              {new Date(reply.discovered_at).toLocaleString()}
            </span>
          </div>

          {reply.agent_original_content && (
            <p className="text-[10px] text-molt-muted mb-1 line-clamp-1">
              You said: {reply.agent_original_content}
            </p>
          )}

          <p className="text-xs text-molt-text mb-2">{reply.reply_content}</p>

          <div className="flex gap-2">
            <button onClick={() => handleViewThread(reply.parent_post_id)}
              className="text-[10px] text-molt-accent hover:text-molt-accent-hover transition-colors">
              View Thread
            </button>
            {!reply.is_read && (
              <button onClick={() => handleMarkRead([reply.id])}
                className="text-[10px] text-molt-muted hover:text-molt-text transition-colors">
                Mark Read
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────

export function AutopilotPanel() {
  const [activeTab, setActiveTab] = useState<AutopilotTab>('controls')
  const { unreadReplyCount, actionQueue } = useStore()
  useAutopilotEvents()

  const pendingCount = actionQueue.filter(a => a.status === 'pending').length

  const tabs: Array<{ id: AutopilotTab; label: string; badge?: number }> = [
    { id: 'controls', label: 'Controls' },
    { id: 'activity', label: 'Activity' },
    { id: 'queue', label: 'Queue', badge: pendingCount > 0 ? pendingCount : undefined },
    { id: 'replies', label: 'Replies', badge: unreadReplyCount > 0 ? unreadReplyCount : undefined }
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border">
        <h2 className="text-lg font-semibold mb-2">Autopilot</h2>
        <div className="flex gap-0.5 bg-molt-bg rounded-lg p-0.5">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 px-2.5 py-1.5 text-xs rounded-md transition-all ${
                activeTab === tab.id
                  ? 'bg-molt-surface text-molt-text font-medium shadow-sm'
                  : 'text-molt-muted hover:text-molt-text'
              }`}>
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-molt-accent text-white text-[9px] font-bold flex items-center justify-center">
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'controls' && <ControlsTab />}
        {activeTab === 'activity' && <ActivityTab />}
        {activeTab === 'queue' && <QueueTab />}
        {activeTab === 'replies' && <RepliesTab />}
      </div>
    </div>
  )
}
