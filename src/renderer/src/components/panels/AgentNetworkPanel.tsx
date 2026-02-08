import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'

// --- Defensive string coercion (matches ModerationPanel) ---

function safeStr(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    return String(obj.display_name ?? obj.name ?? obj.username ?? JSON.stringify(val))
  }
  return String(val)
}

// --- Types ---

interface DisplayAgent {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  karma: number
  is_following: boolean
  post_count: number
  active_submolts: string
}

interface AgentProfileData {
  username: string
  display_name: string
  avatar_url: string | null
  bio: string
  karma: number
  post_karma: number
  comment_karma: number
  follower_count: number
  following_count: number
  is_following: boolean
  created_at: string
  post_count?: number
  active_submolts?: string
}

// --- Helpers ---

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}

function getTimeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`
}

const AGENT_COLORS = ['#7c5cfc', '#5c8afc', '#fc5c8a', '#5cfca4', '#fcb45c', '#c45cfc', '#5cd4fc', '#fc5c5c', '#8afc5c', '#fc8a5c']
function agentColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length]
}

function mapToDisplayAgent(n: Record<string, unknown>): DisplayAgent {
  return {
    id: safeStr(n.id ?? n.username),
    username: safeStr(n.username ?? n.name),
    display_name: safeStr(n.display_name ?? n.username ?? n.name),
    avatar_url: n.avatar_url != null ? safeStr(n.avatar_url) : null,
    karma: Number(n.karma) || 0,
    post_count: Number(n.post_count) || 0,
    active_submolts: safeStr(n.active_submolts),
    is_following: Boolean(n.is_following)
  }
}

// --- Sort Options ---

type SortMode = 'karma' | 'posts' | 'name'

// --- Network Stats ---

function NetworkStats({ agents, edgeCount }: { agents: DisplayAgent[]; edgeCount: number }) {
  const followingCount = agents.filter((a) => a.is_following).length
  const avgKarma = agents.length > 0 ? Math.round(agents.reduce((s, a) => s + a.karma, 0) / agents.length) : 0

  const stats = [
    { label: 'Agents', value: formatCount(agents.length), color: 'text-molt-accent' },
    { label: 'Following', value: formatCount(followingCount), color: 'text-molt-success' },
    { label: 'Avg Karma', value: formatCount(avgKarma), color: 'text-molt-warning' },
    { label: 'Connections', value: formatCount(edgeCount), color: 'text-molt-info' }
  ]

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-molt-surface/50 rounded-xl border border-molt-border/50 p-4">
          <span className="text-[10px] text-molt-muted uppercase tracking-wider">{s.label}</span>
          <div className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</div>
        </div>
      ))}
    </div>
  )
}

// --- Agent Card ---

function AgentCard({ agent, isSelected, onSelect }: {
  agent: DisplayAgent
  isSelected: boolean
  onSelect: () => void
}) {
  const color = agentColor(agent.username || agent.id)
  const submolts = safeStr(agent.active_submolts).split(',').filter(Boolean)

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border transition-colors duration-150 ${
        isSelected
          ? 'border-molt-accent/60 bg-molt-accent/10 shadow-lg shadow-molt-accent/10'
          : 'border-molt-border bg-molt-surface hover:border-molt-border/80 hover:bg-molt-surface/80'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
          >
            {safeStr(agent.display_name || agent.username || '?').charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-molt-text truncate">
                {safeStr(agent.display_name || agent.username)}
              </span>
              {agent.is_following && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-molt-accent/20 text-molt-accent shrink-0">
                  Following
                </span>
              )}
            </div>
            <p className="text-xs text-molt-muted mt-0.5 font-mono truncate">@{safeStr(agent.username)}</p>

            {/* Stats row */}
            <div className="flex items-center gap-3 mt-2 text-xs text-molt-muted">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-molt-warning/20 text-molt-warning">
                {formatCount(agent.karma)} karma
              </span>
              {agent.post_count > 0 && (
                <span>{agent.post_count} posts</span>
              )}
            </div>

            {/* Submolt tags */}
            {submolts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {submolts.slice(0, 3).map((s) => (
                  <span key={s} className="text-[10px] bg-molt-bg text-molt-muted px-2 py-0.5 rounded border border-molt-border">
                    m/{s}
                  </span>
                ))}
                {submolts.length > 3 && (
                  <span className="text-[10px] text-molt-muted">+{submolts.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// --- Agent Detail Sidebar ---

function AgentDetailSidebar({ agent, onClose }: { agent: DisplayAgent; onClose: () => void }) {
  const addNotification = useStore((s) => s.addNotification)
  const networkNodes = useStore((s) => s.networkNodes)
  const networkEdges = useStore((s) => s.networkEdges)
  const setNetworkData = useStore((s) => s.setNetworkData)
  const setSelectedAgent = useStore((s) => s.setSelectedAgent)
  const [following, setFollowing] = useState(false)
  const [profile, setProfile] = useState<AgentProfileData | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Fetch full profile
  useEffect(() => {
    if (!agent?.username) return
    setProfile(null)
    setProfileError(null)
    setProfileLoading(true)
    invoke(IPC.AGENTS_GET_PROFILE, { agent_name: agent.username })
      .then((p: unknown) => setProfile(p as AgentProfileData))
      .catch((err: Error) => {
        setProfileError(err?.message || 'Failed to load profile')
      })
      .finally(() => setProfileLoading(false))
  }, [agent?.username])

  const color = agentColor(agent.username || agent.id)
  const dp = profile || agent

  const handleFollow = async () => {
    setFollowing(true)
    try {
      if (agent.is_following) {
        await invoke(IPC.AGENTS_UNFOLLOW, { agent_name: agent.username })
        addNotification(`Unfollowed ${safeStr(agent.display_name || agent.username)}`, 'info')
      } else {
        await invoke(IPC.AGENTS_FOLLOW, { agent_name: agent.username })
        addNotification(`Following ${safeStr(agent.display_name || agent.username)}`, 'success')
      }
      const newFollowing = !agent.is_following
      // Update the selected agent in store — cast through AgentProfile shape
      setSelectedAgent({
        id: agent.id,
        username: agent.username,
        display_name: agent.display_name || agent.username,
        bio: (profile as AgentProfileData | null)?.bio ?? '',
        avatar_url: agent.avatar_url ?? null,
        karma: agent.karma ?? 0,
        post_karma: profile?.post_karma ?? 0,
        comment_karma: profile?.comment_karma ?? 0,
        follower_count: profile?.follower_count ?? 0,
        following_count: profile?.following_count ?? 0,
        is_following: newFollowing,
        created_at: profile?.created_at ?? ''
      })
      const updatedNodes = networkNodes.map((n) =>
        n.id === agent.id ? { ...n, is_following: newFollowing } : n
      )
      setNetworkData(updatedNodes, networkEdges)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed'
      addNotification(msg, 'error')
    } finally {
      setFollowing(false)
    }
  }

  const submolts = safeStr(agent.active_submolts || (dp as AgentProfileData)?.active_submolts || '').split(',').filter(Boolean)

  // Profile data for stats
  const displayName = safeStr((dp as AgentProfileData)?.display_name || agent.display_name || agent.username)
  const displayUsername = safeStr(agent.username)
  const karma = (dp as AgentProfileData)?.karma ?? agent.karma ?? 0
  const bio = (dp as AgentProfileData)?.bio || ''
  const followerCount = (dp as AgentProfileData)?.follower_count ?? 0
  const followingCount = (dp as AgentProfileData)?.following_count ?? 0
  const postCount = (dp as AgentProfileData)?.post_count ?? agent.post_count ?? 0
  const postKarma = profile?.post_karma ?? 0
  const commentKarma = profile?.comment_karma ?? 0
  const createdAt = (dp as AgentProfileData)?.created_at || ''
  const karmaTotal = postKarma + commentKarma

  return (
    <div className="w-80 border-l border-molt-border flex flex-col bg-molt-bg overflow-y-auto shrink-0">
      {/* Header bar */}
      <div className="px-4 py-3 border-b border-molt-border flex items-center justify-between">
        <span className="text-sm font-medium text-molt-text">Agent Profile</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-molt-muted hover:text-molt-text hover:bg-molt-surface transition-colors text-sm"
        >
          &times;
        </button>
      </div>

      {/* Banner */}
      <div className="h-16" style={{ background: `linear-gradient(135deg, ${color}50, ${color}15)` }} />

      <div className="px-5 pb-5 -mt-5">
        {/* Avatar + name + follow */}
        <div className="flex items-end gap-3">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-lg font-bold text-white shadow-lg ring-2 ring-molt-bg"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 pb-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-molt-text truncate leading-tight">{displayName}</h3>
              <button
                onClick={handleFollow}
                disabled={following}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${
                  agent.is_following
                    ? 'bg-molt-surface border border-molt-border text-molt-muted hover:text-red-400 hover:border-red-400/40'
                    : 'btn-primary'
                }`}
              >
                {following
                  ? (agent.is_following ? 'Unfollowing...' : 'Following...')
                  : (agent.is_following ? 'Unfollow' : 'Follow')
                }
              </button>
            </div>
            <p className="text-xs text-molt-muted font-mono truncate">@{displayUsername}</p>
          </div>
        </div>

        {/* Loading state */}
        {profileLoading && (
          <div className="flex items-center gap-2 mt-4 text-molt-muted">
            <div className="w-4 h-4 border-2 border-molt-accent/30 border-t-molt-accent rounded-full animate-spin" />
            <span className="text-xs">Loading profile...</span>
          </div>
        )}

        {/* Error state */}
        {profileError && (
          <div className="mt-4 px-3 py-2 rounded-lg bg-molt-error/5 border border-molt-error/20 text-xs text-molt-error">
            {profileError}
          </div>
        )}

        {/* Stats */}
        {!profileLoading && (
          <>
            <div className="mt-4">
              <div className="text-[10px] text-molt-muted uppercase tracking-wider mb-2">Stats</div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Karma', value: formatCount(karma), color: 'text-molt-accent' },
                  { label: 'Followers', value: formatCount(followerCount), color: 'text-molt-text' },
                  { label: 'Following', value: formatCount(followingCount), color: 'text-molt-text' },
                  { label: 'Posts', value: formatCount(postCount), color: 'text-molt-text' }
                ].map((s) => (
                  <div key={s.label} className="bg-molt-surface rounded-lg p-3 text-center">
                    <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-molt-muted uppercase tracking-wider mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bio */}
            {bio && (
              <div className="mt-4">
                <div className="text-[10px] text-molt-muted uppercase tracking-wider mb-2">Bio</div>
                <p className="text-sm text-molt-text/70 leading-relaxed">{safeStr(bio)}</p>
              </div>
            )}

            {/* Karma Breakdown */}
            {profile && karmaTotal > 0 && (
              <div className="mt-4">
                <div className="text-[10px] text-molt-muted uppercase tracking-wider mb-2">Karma Breakdown</div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-molt-muted">Total</span>
                    <span className="text-molt-muted">{formatCount(karmaTotal)}</span>
                  </div>
                  <div className="h-2 bg-molt-bg rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-molt-accent rounded-l-full transition-all"
                      style={{ width: `${(postKarma / karmaTotal) * 100}%` }}
                    />
                    <div
                      className="h-full bg-molt-success rounded-r-full transition-all"
                      style={{ width: `${(commentKarma / karmaTotal) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-molt-accent">Post: {formatCount(postKarma)}</span>
                    <span className="text-molt-success">Comment: {formatCount(commentKarma)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Active In */}
            {submolts.length > 0 && (
              <div className="mt-4">
                <div className="text-[10px] text-molt-muted uppercase tracking-wider mb-2">Active In</div>
                <div className="flex flex-wrap gap-1.5">
                  {submolts.map((s) => (
                    <span key={s} className="text-xs bg-molt-surface text-molt-text/80 px-2.5 py-1 rounded border border-molt-border">
                      m/{s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Joined */}
            {createdAt && (
              <div className="mt-4">
                <div className="text-[10px] text-molt-muted uppercase tracking-wider mb-2">Joined</div>
                <span className="text-xs text-molt-text/70">{getTimeAgo(createdAt)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// --- Main Panel ---

export function AgentNetworkPanel() {
  const networkNodes = useStore((s) => s.networkNodes)
  const networkEdges = useStore((s) => s.networkEdges)
  const setNetworkData = useStore((s) => s.setNetworkData)
  const selectedAgent = useStore((s) => s.selectedAgent)
  const setSelectedAgent = useStore((s) => s.setSelectedAgent)
  const addNotification = useStore((s) => s.addNotification)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('karma')

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await invoke(IPC.AGENTS_GET_NETWORK, {}) as Record<string, unknown>
      const rawNodes = data?.nodes as Record<string, unknown>[] | undefined
      if (Array.isArray(rawNodes) && rawNodes.length > 0) {
        const nodes = rawNodes.map(mapToDisplayAgent)
        const edges = (data?.edges ?? []) as { source: string; target: string; direction: 'following' | 'follower' | 'mutual' }[]
        setNetworkData(nodes, edges)
        return
      }

      const listData = await invoke(IPC.AGENTS_LIST, { limit: 100 }) as Record<string, unknown>
      const agents = (listData?.agents ?? listData ?? []) as Record<string, unknown>[]
      if (Array.isArray(agents) && agents.length > 0) {
        const nodes = agents.map(mapToDisplayAgent)
        setNetworkData(nodes, [])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load agent network'
      setError(msg)
      addNotification(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [setNetworkData, addNotification])

  useEffect(() => {
    reload()
  }, [reload])

  const handleSelect = useCallback((node: DisplayAgent) => {
    setSelectedAgent({
      id: node.id,
      username: node.username,
      display_name: node.display_name || node.username,
      bio: '',
      avatar_url: node.avatar_url ?? null,
      karma: node.karma ?? 0,
      post_karma: 0,
      comment_karma: 0,
      follower_count: 0,
      following_count: 0,
      is_following: node.is_following ?? false,
      created_at: ''
    })
  }, [setSelectedAgent])

  // Build DisplayAgent list from store networkNodes (which lack post_count/active_submolts)
  const displayAgents: DisplayAgent[] = useMemo(() =>
    networkNodes.map((n) => ({
      id: n.id,
      username: n.username,
      display_name: n.display_name,
      avatar_url: n.avatar_url,
      karma: n.karma,
      is_following: n.is_following,
      post_count: (n as unknown as DisplayAgent).post_count ?? 0,
      active_submolts: (n as unknown as DisplayAgent).active_submolts ?? ''
    })),
    [networkNodes]
  )

  const filteredAndSorted = useMemo(() => {
    let list = [...displayAgents]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((n) =>
        n.username.toLowerCase().includes(q) ||
        n.display_name.toLowerCase().includes(q) ||
        n.active_submolts.toLowerCase().includes(q)
      )
    }

    if (sort === 'karma') list.sort((a, b) => b.karma - a.karma)
    else if (sort === 'posts') list.sort((a, b) => b.post_count - a.post_count)
    else list.sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username))

    return list
  }, [displayAgents, search, sort])

  // Map selected agent back to DisplayAgent for sidebar
  const selectedDisplay: DisplayAgent | null = useMemo(() => {
    if (!selectedAgent) return null
    const match = displayAgents.find((a) => a.id === selectedAgent.id)
    if (match) return match
    return {
      id: selectedAgent.id,
      username: selectedAgent.username,
      display_name: selectedAgent.display_name,
      avatar_url: selectedAgent.avatar_url,
      karma: selectedAgent.karma,
      is_following: selectedAgent.is_following,
      post_count: 0,
      active_submolts: ''
    }
  }, [selectedAgent, displayAgents])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-molt-border space-y-3">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Agent Network</h2>
            <p className="text-[10px] text-molt-muted">Discover and follow agents in the Moltbook network</p>
          </div>
          {displayAgents.length > 0 && (
            <span className="text-xs text-molt-muted">{displayAgents.length} agents</span>
          )}
        </div>
        {/* Search + sort row */}
        {displayAgents.length > 0 && (
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search agents or submolts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field flex-1 text-sm py-1.5"
            />
            <div className="flex gap-0.5 bg-molt-bg rounded-lg p-0.5 shrink-0">
              {(['karma', 'posts', 'name'] as SortMode[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                    sort === s
                      ? 'bg-molt-surface text-molt-text font-medium shadow-sm'
                      : 'text-molt-muted hover:text-molt-text'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Card grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            /* Loading state */
            <div className="flex items-center justify-center h-full text-molt-muted">
              <div className="text-center space-y-2">
                <div className="w-8 h-8 border-2 border-molt-accent/30 border-t-molt-accent rounded-full animate-spin mx-auto" />
                <p className="text-sm">Loading agents...</p>
                <p className="text-xs opacity-60">Building network from feed activity</p>
              </div>
            </div>
          ) : error ? (
            /* Error state */
            <div className="flex items-center justify-center h-full text-molt-muted">
              <div className="text-center space-y-2">
                <p className="text-sm text-molt-error">{error}</p>
                <button
                  onClick={reload}
                  className="text-xs text-molt-accent hover:underline"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : displayAgents.length === 0 ? (
            /* Empty state */
            <div className="flex items-center justify-center h-full text-molt-muted">
              <div className="text-center">
                <p className="text-lg mb-2">No agents found</p>
                <p className="text-sm">Browse the feed first to discover agents,<br/>then come back to see the network</p>
              </div>
            </div>
          ) : (
            /* Data loaded */
            <>
              <NetworkStats agents={displayAgents} edgeCount={networkEdges.length} />
              {filteredAndSorted.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-molt-muted">
                  <p className="text-sm">No agents match &quot;{search}&quot;</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredAndSorted.map((agent) => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      isSelected={agent.id === selectedDisplay?.id}
                      onSelect={() => handleSelect(agent)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail sidebar */}
        {selectedDisplay && (
          <AgentDetailSidebar
            agent={selectedDisplay}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </div>
    </div>
  )
}
