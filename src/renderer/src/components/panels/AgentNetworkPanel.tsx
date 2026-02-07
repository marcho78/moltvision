import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'

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

// --- Agent Card ---

function AgentCard({ agent, isSelected, onSelect }: {
  agent: any
  isSelected: boolean
  onSelect: () => void
}) {
  const color = agentColor(agent.username || agent.id || '')
  const submolts = String(agent.active_submolts || '').split(',').filter(Boolean)

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-xl border transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] ${
        isSelected
          ? 'border-molt-accent/60 bg-molt-accent/10 shadow-lg shadow-molt-accent/10'
          : 'border-molt-border bg-molt-surface hover:border-molt-border/80 hover:bg-molt-surface/80'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
          >
            {(agent.display_name || agent.username || '?').charAt(0).toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-molt-text truncate">
                {agent.display_name || agent.username}
              </span>
              {agent.is_following && (
                <span className="text-[10px] bg-molt-accent/20 text-molt-accent px-1.5 py-0.5 rounded-full shrink-0">
                  Following
                </span>
              )}
            </div>
            <p className="text-xs text-molt-muted mt-0.5 font-mono truncate">@{agent.username}</p>

            {/* Stats row */}
            <div className="flex items-center gap-3 mt-2 text-xs text-molt-muted">
              <span className="font-medium" style={{ color }}>{formatCount(agent.karma ?? 0)} karma</span>
              {agent.post_count != null && agent.post_count > 0 && (
                <span>{agent.post_count} posts</span>
              )}
            </div>

            {/* Submolt tags */}
            {submolts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {submolts.slice(0, 3).map((s: string) => (
                  <span key={s} className="text-[10px] bg-molt-bg text-molt-muted px-2 py-0.5 rounded-full border border-molt-border">
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

function AgentDetailSidebar({ agent, onClose }: { agent: any; onClose: () => void }) {
  const addNotification = useStore((s) => s.addNotification)
  const networkNodes = useStore((s) => s.networkNodes)
  const networkEdges = useStore((s) => s.networkEdges)
  const setNetworkData = useStore((s) => s.setNetworkData)
  const setSelectedAgent = useStore((s) => s.setSelectedAgent)
  const [following, setFollowing] = useState(false)
  const [profile, setProfile] = useState<any>(null)

  // Fetch full profile
  useEffect(() => {
    if (!agent?.username) return
    setProfile(null)
    invoke(IPC.AGENTS_GET_PROFILE, { agent_name: agent.username })
      .then((p: any) => setProfile(p))
      .catch(() => {})
  }, [agent?.username])

  const color = agentColor(agent.username || agent.id || '')
  const dp = profile || agent

  const handleFollow = async () => {
    setFollowing(true)
    try {
      if (agent.is_following) {
        await invoke(IPC.AGENTS_UNFOLLOW, { agent_name: agent.username })
        addNotification(`Unfollowed ${agent.display_name || agent.username}`, 'info')
      } else {
        await invoke(IPC.AGENTS_FOLLOW, { agent_name: agent.username })
        addNotification(`Following ${agent.display_name || agent.username}`, 'success')
      }
      const newFollowing = !agent.is_following
      setSelectedAgent({ ...agent, is_following: newFollowing })
      const updatedNodes = networkNodes.map((n) =>
        n.id === agent.id ? { ...n, is_following: newFollowing } : n
      )
      setNetworkData(updatedNodes, networkEdges)
    } catch (err: any) {
      addNotification(err.message || 'Action failed', 'error')
    } finally {
      setFollowing(false)
    }
  }

  const submolts = String(agent.active_submolts || dp.active_submolts || '').split(',').filter(Boolean)

  return (
    <div className="w-80 border-l border-molt-border flex flex-col bg-molt-bg overflow-y-auto shrink-0">
      <div className="relative">
        <div className="h-20" style={{ background: `linear-gradient(135deg, ${color}50, ${color}15)` }} />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-molt-bg/60 hover:bg-molt-bg text-molt-muted hover:text-molt-text text-lg transition-colors"
        >
          &times;
        </button>
      </div>

      <div className="px-5 pb-5 -mt-6">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg ring-2 ring-molt-bg"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
        >
          {(dp.display_name || dp.username || '?').charAt(0).toUpperCase()}
        </div>

        <h3 className="text-lg font-bold text-molt-text mt-3 leading-tight">
          {dp.display_name || dp.username}
        </h3>
        <p className="text-xs text-molt-muted mt-0.5 font-mono">@{dp.username}</p>

        {dp.bio && dp.bio !== '' && (
          <p className="text-sm text-molt-text/70 mt-3 leading-relaxed">{dp.bio}</p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="bg-molt-surface rounded-xl p-3 text-center">
            <div className="text-xl font-bold" style={{ color }}>{formatCount(dp.karma ?? 0)}</div>
            <div className="text-[10px] text-molt-muted uppercase tracking-wider mt-0.5">Karma</div>
          </div>
          <div className="bg-molt-surface rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-molt-text">{formatCount(dp.post_count ?? dp.follower_count ?? 0)}</div>
            <div className="text-[10px] text-molt-muted uppercase tracking-wider mt-0.5">{dp.post_count != null ? 'Posts' : 'Followers'}</div>
          </div>
        </div>

        {submolts.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] text-molt-muted uppercase tracking-wider mb-2">Active in</div>
            <div className="flex flex-wrap gap-1.5">
              {submolts.map((s: string) => (
                <span key={s} className="text-xs bg-molt-surface text-molt-text/80 px-2.5 py-1 rounded-full border border-molt-border">
                  m/{s}
                </span>
              ))}
            </div>
          </div>
        )}

        {dp.created_at && (
          <div className="mt-4 text-xs text-molt-muted flex justify-between">
            <span>Joined</span>
            <span className="text-molt-text/70">{getTimeAgo(dp.created_at)}</span>
          </div>
        )}

        <button
          onClick={handleFollow}
          disabled={following}
          className={`mt-5 w-full py-3 rounded-xl text-sm font-semibold transition-all ${
            agent.is_following
              ? 'bg-molt-surface border border-molt-border text-molt-muted hover:text-red-400 hover:border-red-400/40'
              : 'text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]'
          } disabled:opacity-50 disabled:pointer-events-none`}
          style={!agent.is_following ? { background: `linear-gradient(135deg, ${color}, ${color}cc)` } : undefined}
        >
          {following
            ? (agent.is_following ? 'Unfollowing...' : 'Following...')
            : (agent.is_following ? 'Unfollow' : 'Follow')
          }
        </button>
      </div>
    </div>
  )
}

// --- Sort Options ---

type SortMode = 'karma' | 'posts' | 'name'

// --- Main Panel ---

export function AgentNetworkPanel() {
  const networkNodes = useStore((s) => s.networkNodes)
  const networkEdges = useStore((s) => s.networkEdges)
  const setNetworkData = useStore((s) => s.setNetworkData)
  const selectedAgent = useStore((s) => s.selectedAgent)
  const setSelectedAgent = useStore((s) => s.setSelectedAgent)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('karma')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data: any = await invoke(IPC.AGENTS_GET_NETWORK, {})
        if (data?.nodes?.length) {
          const nodes = data.nodes.map((n: any) => ({
            id: n.id ?? n.username,
            username: n.username ?? n.name ?? '',
            display_name: n.display_name ?? n.username ?? n.name ?? '',
            avatar_url: n.avatar_url ?? null,
            karma: n.karma ?? 0,
            post_count: n.post_count ?? 0,
            active_submolts: n.active_submolts ?? '',
            is_following: n.is_following ?? false
          }))
          setNetworkData(nodes, data.edges ?? [])
          return
        }

        const listData: any = await invoke(IPC.AGENTS_LIST, { limit: 100 })
        const agents = listData?.agents ?? listData ?? []
        if (Array.isArray(agents) && agents.length > 0) {
          const nodes = agents.map((a: any) => ({
            id: a.id ?? a.username ?? a.name,
            username: a.username ?? a.name ?? '',
            display_name: a.display_name ?? a.username ?? a.name ?? '',
            avatar_url: a.avatar_url ?? null,
            karma: a.karma ?? 0,
            post_count: a.post_count ?? 0,
            active_submolts: a.active_submolts ?? '',
            is_following: a.is_following ?? false
          }))
          setNetworkData(nodes, [])
        }
      } catch (err) {
        console.error('Agent network load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [setNetworkData])

  const handleSelect = useCallback((node: any) => {
    setSelectedAgent({
      id: node.id,
      username: node.username,
      display_name: node.display_name || node.username,
      bio: node.bio ?? '',
      avatar_url: node.avatar_url ?? null,
      karma: node.karma ?? 0,
      post_karma: 0,
      comment_karma: 0,
      follower_count: 0,
      following_count: 0,
      is_following: node.is_following ?? false,
      created_at: node.created_at ?? '',
      active_submolts: node.active_submolts ?? '',
      post_count: node.post_count ?? 0
    } as any)
  }, [setSelectedAgent])

  const filteredAndSorted = useMemo(() => {
    let list = [...networkNodes] as any[]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(n =>
        n.username.toLowerCase().includes(q) ||
        (n.display_name || '').toLowerCase().includes(q) ||
        (n.active_submolts || '').toLowerCase().includes(q)
      )
    }

    if (sort === 'karma') list.sort((a, b) => (b.karma ?? 0) - (a.karma ?? 0))
    else if (sort === 'posts') list.sort((a, b) => (b.post_count ?? 0) - (a.post_count ?? 0))
    else list.sort((a, b) => (a.display_name || a.username || '').localeCompare(b.display_name || b.username || ''))

    return list
  }, [networkNodes, search, sort])

  const selectedId = (selectedAgent as any)?.id ?? null

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-molt-border">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold shrink-0">Agent Network</h2>
          <div className="flex-1 max-w-sm">
            <input
              type="text"
              placeholder="Search agents or submolts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-molt-surface border border-molt-border rounded-lg px-3 py-1.5 text-sm text-molt-text placeholder:text-molt-muted/50 focus:outline-none focus:border-molt-accent/50"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(['karma', 'posts', 'name'] as SortMode[]).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  sort === s
                    ? 'bg-molt-accent/15 text-molt-accent font-medium'
                    : 'text-molt-muted hover:text-molt-text hover:bg-molt-surface'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <span className="text-xs text-molt-muted shrink-0">{filteredAndSorted.length} agents</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Card grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {networkNodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-molt-muted">
              <div className="text-center">
                {loading ? (
                  <div className="space-y-2">
                    <div className="w-8 h-8 border-2 border-molt-accent/30 border-t-molt-accent rounded-full animate-spin mx-auto" />
                    <p className="text-sm">Loading agents...</p>
                    <p className="text-xs opacity-60">Building network from feed activity</p>
                  </div>
                ) : (
                  <>
                    <p className="text-lg mb-2">No agents found</p>
                    <p className="text-sm">Browse the feed first to discover agents,<br/>then come back to see the network</p>
                  </>
                )}
              </div>
            </div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="flex items-center justify-center h-full text-molt-muted">
              <p className="text-sm">No agents match &quot;{search}&quot;</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredAndSorted.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={agent.id === selectedId}
                  onSelect={() => handleSelect(agent)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail sidebar */}
        {selectedAgent && (
          <AgentDetailSidebar
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </div>
    </div>
  )
}
