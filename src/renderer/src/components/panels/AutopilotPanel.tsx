import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useStore } from '../../stores'
// useAutopilotEvents is called in App.tsx — not here (avoids duplicate listeners)
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { OperationMode, AgentAction, AgentPersona, AgentEngagement, ReplyInboxEntry } from '@shared/domain.types'

/** Defensive: ensure a value is rendered as a safe React child (string), never an object */
function safeStr(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    return String(obj.display_name ?? obj.name ?? obj.username ?? obj.title ?? JSON.stringify(val))
  }
  return String(val)
}

// ─── Expandable Reasoning ────────────────────────────────

function ExpandableReasoning({ reasoning, compact }: { reasoning: string; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false)

  // Try to parse structured JSON reasoning (from evaluatePost / planAction)
  const parsed = useMemo(() => {
    try {
      const obj = JSON.parse(reasoning)
      if (obj && typeof obj === 'object' && (obj.reasoning || obj.verdict || obj.thinking)) return obj
    } catch { /* not JSON, use raw string */ }
    return null
  }, [reasoning])

  const displayText = parsed?.reasoning ?? parsed?.thinking ?? reasoning
  const verdict = parsed?.verdict
  const strategies = parsed?.active_strategies ?? parsed?.strategies

  // Short reasoning (< 80 chars) doesn't need expand
  if (displayText.length < 80 && !verdict && !strategies) {
    return (
      <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-molt-muted`}>
        {verdict && (
          <span className={`font-semibold mr-1.5 ${verdict === 'engage' ? 'text-molt-success' : verdict === 'skip' ? 'text-molt-warning' : 'text-molt-muted'}`}>
            [{verdict.toUpperCase()}]
          </span>
        )}
        {displayText}
      </div>
    )
  }

  return (
    <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-molt-muted`}>
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        className="flex items-center gap-1 text-molt-accent hover:text-molt-accent-hover transition-colors mb-0.5"
      >
        <span className="text-[10px]">{expanded ? '▾' : '▸'}</span>
        <span>{expanded ? 'Hide reasoning' : 'Show reasoning'}</span>
        {verdict && (
          <span className={`font-semibold ml-1 ${verdict === 'engage' ? 'text-molt-success' : verdict === 'skip' ? 'text-molt-warning' : 'text-molt-muted'}`}>
            [{verdict.toUpperCase()}]
          </span>
        )}
      </button>

      {expanded && (
        <div className="bg-molt-bg rounded-lg p-2.5 mt-1 space-y-1.5 border border-molt-border/50">
          {strategies && Array.isArray(strategies) && strategies.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {strategies.map((s: string, i: number) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-[9px] bg-molt-accent/10 text-molt-accent">
                  {s}
                </span>
              ))}
            </div>
          )}
          <p className="whitespace-pre-wrap leading-relaxed">{displayText}</p>
          {parsed?.priority != null && (
            <div className="text-[10px] text-molt-muted pt-1 border-t border-molt-border/30">
              Priority: {parsed.priority}/10
              {parsed?.action && <span className="ml-2">Action: {parsed.action}</span>}
            </div>
          )}
        </div>
      )}

      {!expanded && (
        <p className="line-clamp-1 mt-0.5">{displayText}</p>
      )}
    </div>
  )
}

// ─── Tab Type ────────────────────────────────────────────

type AutopilotTab = 'controls' | 'activity' | 'queue' | 'replies'

// ─── Mode Toggle ─────────────────────────────────────────

function ModeToggle() {
  const { autopilotStatus, setAutopilotStatus, addNotification } = useStore()
  const modes: OperationMode[] = ['off', 'semi-auto', 'autopilot']
  const modeInfo: Record<OperationMode, { label: string; dot: string }> = {
    off: { label: 'Off', dot: 'bg-molt-muted' },
    'semi-auto': { label: 'Semi-Auto', dot: 'bg-molt-warning' },
    autopilot: { label: 'Autopilot', dot: 'bg-molt-success' }
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
    <div className="flex gap-0.5 bg-molt-bg rounded-lg p-0.5">
      {modes.map((mode) => {
        const info = modeInfo[mode]
        return (
          <button key={mode} onClick={() => handleSetMode(mode)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-md transition-all ${
              autopilotStatus.mode === mode
                ? 'bg-molt-surface text-molt-text font-medium shadow-sm'
                : 'text-molt-muted hover:text-molt-text'
            }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
            {info.label}
          </button>
        )
      })}
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
    <div className="space-y-1.5">
      <label className="text-[11px] text-molt-muted">Active Persona</label>
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
        <p className="text-[10px] text-molt-muted">
          {safeStr(savedPersonas.find(p => p.id === activePersonaId)?.description) || 'Configure in Persona Studio'}
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
          if (list.length > 0) {
            // Normalize to ensure all fields are proper primitives (match Sidebar normalization)
            const normalized = list.map((s: any) => ({
              id: s.id ?? s.name ?? '',
              name: typeof s.name === 'string' ? s.name : String(s.name ?? ''),
              display_name: typeof s.display_name === 'string' ? s.display_name : String(s.display_name ?? s.name ?? ''),
              description: s.description ?? '',
              theme_color: s.theme_color ?? '#7c5cfc',
              subscriber_count: s.subscriber_count ?? s.subscribers ?? 0,
              post_count: s.post_count ?? 0,
              is_subscribed: s.is_subscribed ?? false,
              moderators: s.moderators ?? [],
              rules: s.rules ?? [],
              your_role: s.your_role ?? null,
              created_at: s.created_at ?? ''
            }))
            setSubmolts(normalized)
          }
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
                <button key={safeStr(s.name)} onClick={() => addSubmolt(safeStr(s.name))}
                  className="px-2 py-0.5 text-[10px] rounded-full bg-molt-surface text-molt-muted hover:text-molt-text hover:bg-molt-accent/10 border border-molt-border transition-colors">
                  + m/{safeStr(s.name)}
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
              <span className="text-xs font-medium text-molt-text w-24 truncate shrink-0" title={`m/${name}`}>m/{safeStr(name)}</span>
              <input type="range" min="1" max="10" step="1" value={typeof priority === 'number' ? priority : 5}
                onChange={(e) => setPriority(name, parseInt(e.target.value))}
                className="w-full max-w-[180px] h-1" />
              <span className="text-[10px] text-molt-muted w-4 text-center shrink-0">{safeStr(priority)}</span>
              <button onClick={() => removeSubmolt(name)}
                className="text-molt-muted hover:text-molt-error text-sm transition-colors w-4 shrink-0">&times;</button>
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
    { label: 'General', max: 100, resource: 'moltbook_general' },
    { label: 'Posts', max: 1, resource: 'moltbook_posts' },
    { label: 'Comments', max: 50, resource: 'moltbook_comments' }
  ]
  const rateLimits = useStore((s) => s.rateLimits)

  return (
    <div className="panel-card">
      <h3 className="text-xs font-medium text-molt-muted uppercase tracking-wider mb-2">Rate Limits</h3>
      <div className="space-y-1.5">
        {limits.map((lim) => {
          const current = rateLimits.find(r => r.resource === lim.resource)
          const remaining = current?.remaining ?? lim.max
          const pct = (remaining / lim.max) * 100
          const color = pct > 50 ? 'bg-molt-success' : pct > 20 ? 'bg-molt-warning' : 'bg-molt-error'
          return (
            <div key={lim.resource} className="flex items-center gap-2">
              <span className="text-[11px] text-molt-muted w-16 shrink-0">{lim.label}</span>
              <div className="flex-1 h-1 bg-molt-bg rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-molt-muted w-10 text-right shrink-0">{remaining}/{lim.max}</span>
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
      className="w-full max-w-xs mx-auto block py-2 rounded-lg bg-molt-error/20 hover:bg-molt-error/40 border border-molt-error
                 text-molt-error font-bold text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
      EMERGENCY STOP
    </button>
  )
}

// ─── Live Agent Thinking Log ─────────────────────────────

function LiveAgentFeed() {
  const { liveEvents, autopilotStatus } = useStore()

  if (autopilotStatus.mode === 'off') return null

  // Phase-based styling for the thinking log
  const phaseStyle: Record<string, { icon: string; color: string }> = {
    start: { icon: '>', color: 'text-molt-accent' },
    feed: { icon: '~', color: 'text-molt-info' },
    submolt: { icon: '~', color: 'text-molt-info' },
    evaluate: { icon: '?', color: 'text-molt-warning' },
    evaluating: { icon: '?', color: 'text-molt-muted' },
    evaluated: { icon: '-', color: 'text-molt-muted' },
    planning: { icon: '+', color: 'text-molt-warning' },
    queued: { icon: '#', color: 'text-molt-accent' },
    executed: { icon: '!', color: 'text-molt-success' },
    done: { icon: '*', color: 'text-molt-success' },
    error: { icon: 'x', color: 'text-molt-error' }
  }

  // Show all events in a scrollable console-style log
  const allEvents = liveEvents.slice(0, 30) // last 30 events

  return (
    <div className="panel-card space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Agent Thinking</h3>
        {autopilotStatus.is_running && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-molt-accent animate-pulse" />
            <span className="text-[10px] text-molt-accent">Live</span>
          </div>
        )}
      </div>

      {allEvents.length === 0 && (
        <div className="text-xs text-molt-muted bg-molt-bg rounded-lg px-3 py-2">
          Waiting for first scan cycle...
        </div>
      )}

      {allEvents.length > 0 && (
        <div className="bg-molt-bg rounded-lg p-2 max-h-64 overflow-y-auto space-y-0.5 font-mono">
          {allEvents.map((event, i) => {
            if (event.type === 'action') {
              // Action events (executed actions)
              const actionLabels: Record<string, string> = {
                create_post: 'POSTED', create_comment: 'COMMENTED', reply: 'REPLIED',
                upvote: 'UPVOTED', downvote: 'DOWNVOTED'
              }
              return (
                <div key={`${event.timestamp}-${i}`} className="text-[11px] leading-relaxed">
                  <span className="text-molt-muted">{new Date(event.timestamp).toLocaleTimeString()} </span>
                  <span className="text-molt-success font-semibold">{actionLabels[safeStr(event.action_type)] ?? safeStr(event.action_type)} </span>
                  <span className="text-molt-text">
                    {event.title ? `"${safeStr(event.title)}"` : event.content ? `"${safeStr(event.content).slice(0, 80)}"` : ''}
                    {event.submolt ? ` in m/${safeStr(event.submolt)}` : ''}
                  </span>
                </div>
              )
            }

            // Scan progress events (agent thinking)
            const style = phaseStyle[safeStr(event.phase)] ?? { icon: '.', color: 'text-molt-muted' }
            return (
              <div key={`${event.timestamp}-${i}`} className="text-[11px] leading-relaxed">
                <span className="text-molt-muted">{new Date(event.timestamp).toLocaleTimeString()} </span>
                <span className={`${style.color}`}>[{style.icon}] </span>
                <span className={event.phase === 'evaluated' || event.phase === 'evaluating' ? 'text-molt-muted' : 'text-molt-text'}>
                  {safeStr(event.message)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Tab 1: Controls ─────────────────────────────────────

function ControlsTab() {
  const { autopilotStatus } = useStore()

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Row 1: Mode + Persona — compact top controls */}
      <div className="panel-card space-y-3">
        <ModeToggle />
        <PersonaSelector />
      </div>

      {/* Row 2: Two-column — Activity stats + Rate limits side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Agent Activity stats */}
        <div className="panel-card space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-molt-muted uppercase tracking-wider">Activity</h3>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${
                autopilotStatus.emergency_stopped ? 'bg-molt-error' :
                autopilotStatus.is_running ? 'bg-molt-success animate-pulse' : 'bg-molt-muted'
              }`} />
              <span className={`text-[10px] font-medium ${
                autopilotStatus.emergency_stopped ? 'text-molt-error' :
                autopilotStatus.is_running ? 'text-molt-success' : 'text-molt-muted'
              }`}>
                {autopilotStatus.emergency_stopped ? 'STOPPED' : autopilotStatus.is_running ? 'ACTIVE' : 'IDLE'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-molt-bg rounded-md px-2 py-1.5 text-center">
              <div className="text-[9px] text-molt-muted leading-tight">Cmt/hr</div>
              <div className="text-sm font-bold text-molt-text">{autopilotStatus.comments_this_hour ?? 0}</div>
            </div>
            <div className="bg-molt-bg rounded-md px-2 py-1.5 text-center">
              <div className="text-[9px] text-molt-muted leading-tight">Cmt/day</div>
              <div className={`text-sm font-bold ${(autopilotStatus.comments_today ?? 0) >= 45 ? 'text-molt-warning' : 'text-molt-text'}`}>
                {autopilotStatus.comments_today ?? 0}
                <span className="text-[9px] text-molt-muted font-normal">/50</span>
              </div>
            </div>
            <div className="bg-molt-bg rounded-md px-2 py-1.5 text-center">
              <div className="text-[9px] text-molt-muted leading-tight">Posts</div>
              <div className="text-sm font-bold text-molt-text">{autopilotStatus.posts_today ?? 0}</div>
            </div>
          </div>

          {/* Comment limit bar */}
          <div className="space-y-0.5">
            <div className="h-1 bg-molt-bg rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (autopilotStatus.comments_today ?? 0) >= 50 ? 'bg-molt-error' :
                  (autopilotStatus.comments_today ?? 0) >= 40 ? 'bg-molt-warning' : 'bg-molt-success'
                }`}
                style={{ width: `${Math.min(((autopilotStatus.comments_today ?? 0) / 50) * 100, 100)}%` }}
              />
            </div>
            <div className="text-[9px] text-molt-muted text-right">{autopilotStatus.comments_today ?? 0}/50 daily</div>
          </div>
        </div>

        {/* Rate limits + Emergency stop */}
        <div className="space-y-3">
          <RateLimitDashboard />
          <EmergencyStop />
        </div>
      </div>

      {/* Row 3: Target Submolts — full width but constrained by max-w-2xl mx-auto */}
      <TargetSubmolts />

      {/* Row 4: Live Agent Thinking — full width */}
      <LiveAgentFeed />

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
    <div className="space-y-3 max-w-2xl mx-auto">
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
              <p className="text-xs text-molt-text line-clamp-2 mb-1">{safeStr(entry.content_sent)}</p>
            )}
            {entry.reasoning && (
              <ExpandableReasoning reasoning={safeStr(entry.reasoning)} compact />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab 3: Action Queue ─────────────────────────────────

function ActionQueueItem({ action, onRefresh }: { action: AgentAction; onRefresh: () => void }) {
  const { removeFromQueue, addNotification } = useStore()
  const [editedContent, setEditedContent] = useState(action.payload.content ?? '')
  const [editing, setEditing] = useState(false)

  // Parse context to get original post info
  let originalPost: { title?: string; content?: string; submolt?: string; author?: string; karma?: number } | null = null
  try {
    if (action.context) {
      const ctx = JSON.parse(action.context)
      originalPost = ctx.original_post ?? null
    }
  } catch { /* ignore parse errors */ }

  const handleApprove = async () => {
    try {
      await invoke(IPC.AUTOPILOT_APPROVE, {
        action_id: action.id,
        edited_content: editing ? editedContent : undefined
      })
      removeFromQueue(action.id)
      addNotification('Action approved and executing', 'success')
      onRefresh()
    } catch (err: any) {
      addNotification(err.message || 'Approve failed', 'error')
    }
  }

  const handleReject = async () => {
    try {
      await invoke(IPC.AUTOPILOT_REJECT, { action_id: action.id })
      removeFromQueue(action.id)
      onRefresh()
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

  const actionLabels: Record<string, { label: string; color: string }> = {
    create_post: { label: 'NEW POST', color: 'bg-molt-accent/20 text-molt-accent' },
    create_comment: { label: 'COMMENT', color: 'bg-molt-success/20 text-molt-success' },
    reply: { label: 'REPLY', color: 'bg-molt-info/20 text-molt-info' },
    upvote: { label: 'UPVOTE', color: 'bg-molt-warning/20 text-molt-warning' },
    downvote: { label: 'DOWNVOTE', color: 'bg-molt-error/20 text-molt-error' }
  }

  const badge = actionLabels[action.payload.type] ?? { label: action.payload.type, color: 'bg-molt-surface text-molt-muted' }

  return (
    <div className="panel-card p-3 space-y-2.5">
      {/* Header: action type, status, time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badge.color}`}>{badge.label}</span>
          <span className={`text-xs ${statusColors[action.status]}`}>{action.status}</span>
          {action.payload.submolt_name && (
            <span className="text-[10px] text-molt-muted">m/{safeStr(action.payload.submolt_name)}</span>
          )}
        </div>
        <span className="text-[10px] text-molt-muted">
          {new Date(action.created_at).toLocaleTimeString()}
        </span>
      </div>

      {/* Original post context (what the agent is responding to) */}
      {originalPost && (
        <div className="bg-molt-bg rounded-lg p-2.5 border-l-2 border-molt-muted/30">
          <div className="text-[10px] text-molt-muted mb-1 uppercase tracking-wider">Responding to:</div>
          <div className="text-xs font-medium text-molt-text mb-0.5">{safeStr(originalPost.title)}</div>
          {originalPost.content && (
            <p className="text-[11px] text-molt-muted line-clamp-3">{safeStr(originalPost.content)}</p>
          )}
          <div className="flex gap-2 mt-1 text-[10px] text-molt-muted">
            {originalPost.author && <span>by {safeStr(originalPost.author)}</span>}
            {originalPost.submolt && <span>m/{safeStr(originalPost.submolt)}</span>}
            {originalPost.karma != null && <span>{originalPost.karma} karma</span>}
          </div>
        </div>
      )}

      {/* Agent's draft content */}
      {action.payload.content && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-molt-muted uppercase tracking-wider">
              Agent's draft{action.payload.type === 'create_comment' ? ` (${editedContent.length} chars)` : ''}:
            </span>
            {action.status === 'pending' && !editing && (
              <button onClick={() => setEditing(true)}
                className="text-[10px] text-molt-accent hover:text-molt-accent-hover transition-colors">
                Edit
              </button>
            )}
          </div>
          {editing ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              maxLength={undefined}
              rows={action.payload.type === 'create_post' ? 5 : 2}
              className="input-field w-full text-xs font-mono resize-y"
            />
          ) : (
            <div className="bg-molt-surface rounded-lg p-2.5 border border-molt-border">
              {action.payload.title && (
                <div className="text-xs font-semibold text-molt-text mb-1">{safeStr(action.payload.title)}</div>
              )}
              <p className="text-xs text-molt-text whitespace-pre-wrap">{safeStr(action.payload.content)}</p>
            </div>
          )}
        </div>
      )}

      {/* Reasoning */}
      {action.reasoning && (
        <ExpandableReasoning reasoning={safeStr(action.reasoning)} />
      )}

      {/* Actions */}
      {action.status === 'pending' && (
        <div className="flex gap-2 pt-1">
          <button onClick={handleApprove} className="btn-primary text-xs py-1.5 px-4">
            {editing ? 'Approve (edited)' : 'Approve'}
          </button>
          <button onClick={handleReject} className="btn-danger text-xs py-1.5 px-4">Reject</button>
          {editing && (
            <button onClick={() => { setEditing(false); setEditedContent(action.payload.content ?? '') }}
              className="text-xs text-molt-muted hover:text-molt-text transition-colors px-2">Cancel edit</button>
          )}
        </div>
      )}
    </div>
  )
}

function QueueTab() {
  const { actionQueue, setActionQueue, autopilotStatus, liveEvents, addNotification } = useStore()

  const fetchQueue = useCallback(async () => {
    try {
      const result = await invoke<{ actions: AgentAction[] }>(IPC.AUTOPILOT_GET_QUEUE, {})
      setActionQueue(result.actions)
    } catch (err) {
      console.error('Failed to load queue:', err)
    }
  }, [setActionQueue])

  // Load on mount
  useEffect(() => { fetchQueue() }, [fetchQueue])

  // Auto-refresh when queue_updated event arrives
  const lastQueueEvent = liveEvents.find(e => e.type === 'queue_updated')
  useEffect(() => {
    if (lastQueueEvent) fetchQueue()
  }, [lastQueueEvent?.timestamp, fetchQueue])

  const pendingActions = actionQueue.filter(a => a.status === 'pending')
  const otherActions = actionQueue.filter(a => a.status !== 'pending')

  const handleRejectAll = async () => {
    try {
      const result = await invoke<{ rejected: number }>(IPC.AUTOPILOT_REJECT_ALL)
      addNotification(`Rejected ${result.rejected} pending actions`, 'warning')
      fetchQueue()
    } catch (err: any) {
      addNotification(err.message || 'Reject all failed', 'error')
    }
  }

  const handleClearHistory = async () => {
    try {
      const result = await invoke<{ cleared: number }>(IPC.AUTOPILOT_CLEAR_QUEUE)
      addNotification(`Cleared ${result.cleared} completed actions`, 'success')
      fetchQueue()
    } catch (err: any) {
      addNotification(err.message || 'Clear failed', 'error')
    }
  }

  return (
    <div className="space-y-3 max-w-2xl mx-auto">
      {autopilotStatus.mode === 'semi-auto' && (
        <div className="text-xs text-molt-muted bg-molt-surface rounded-lg px-3 py-2">
          Semi-auto mode: review and approve each action before execution. You can edit the agent's draft before approving.
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Pending Actions ({pendingActions.length})</h3>
        <div className="flex gap-2">
          {pendingActions.length > 1 && (
            <button onClick={handleRejectAll}
              className="text-[10px] text-molt-error hover:text-molt-error/80 transition-colors">
              Reject All
            </button>
          )}
          <button onClick={fetchQueue} className="text-[10px] text-molt-accent hover:text-molt-accent-hover transition-colors">
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {pendingActions.length === 0 && otherActions.length === 0 && (
          <div className="text-molt-muted text-sm text-center py-6">
            No queued actions. In semi-auto mode, the agent will propose actions here for your review.
          </div>
        )}
        {pendingActions.map((action) => (
          <ActionQueueItem key={action.id} action={action} onRefresh={fetchQueue} />
        ))}
      </div>

      {otherActions.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-molt-muted">Recent ({otherActions.length})</h3>
            <button onClick={handleClearHistory}
              className="text-[10px] text-molt-muted hover:text-molt-error transition-colors">
              Clear History
            </button>
          </div>
          <div className="space-y-2">
            {otherActions.slice(0, 10).map((action) => (
              <ActionQueueItem key={action.id} action={action} onRefresh={fetchQueue} />
            ))}
          </div>
        </>
      )}
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
    <div className="space-y-2 max-w-2xl mx-auto">
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
              <span className="text-xs font-semibold text-molt-text">{safeStr(reply.reply_author)}</span>
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
              You said: {safeStr(reply.agent_original_content)}
            </p>
          )}

          <p className="text-xs text-molt-text mb-2">{safeStr(reply.reply_content)}</p>

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
  const { unreadReplyCount, actionQueue, liveEvents } = useStore()
  // NOTE: useAutopilotEvents() is called in App.tsx — do NOT call it here too (causes duplicate events)

  const pendingCount = actionQueue.filter(a => a.status === 'pending').length

  // Auto-switch to Queue tab when new actions are queued for approval
  const lastQueueEvent = liveEvents.find(e => e.type === 'queue_updated')
  useEffect(() => {
    if (lastQueueEvent && activeTab !== 'queue') {
      setActiveTab('queue')
    }
  }, [lastQueueEvent?.timestamp])

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
