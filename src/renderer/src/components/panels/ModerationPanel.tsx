import React, { useEffect, useState, useCallback } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { Submolt } from '@shared/domain.types'

/** Defensive string coercion */
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

// ─── Create Submolt Form ─────────────────────────────────

function CreateSubmoltForm({ onCreated }: { onCreated: (name: string) => void }) {
  const { addNotification } = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!cleanName) {
      addNotification('Name is required (lowercase, alphanumeric, underscores)', 'error')
      return
    }
    if (!displayName.trim()) {
      addNotification('Display name is required', 'error')
      return
    }
    setCreating(true)
    try {
      await invoke(IPC.SUBMOLTS_CREATE, {
        name: cleanName,
        display_name: displayName.trim(),
        description: description.trim()
      })
      addNotification(`Created m/${cleanName} — you are the owner`, 'success')
      setName('')
      setDisplayName('')
      setDescription('')
      setOpen(false)
      onCreated(cleanName)
    } catch (err: any) {
      addNotification(err.message || 'Failed to create submolt', 'error')
    } finally {
      setCreating(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full px-3 py-2 rounded-lg text-xs font-medium text-molt-accent bg-molt-accent/5 hover:bg-molt-accent/10 border border-molt-accent/20 transition-colors">
        + Create Submolt
      </button>
    )
  }

  return (
    <div className="panel-card space-y-2.5 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium">New Submolt</h4>
        <button onClick={() => setOpen(false)} className="text-molt-muted hover:text-molt-text text-sm">&times;</button>
      </div>

      <div>
        <label className="text-[10px] text-molt-muted">Name (unique, lowercase)</label>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-molt-muted">m/</span>
          <input value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="my_community"
            className="input-field flex-1 text-xs" />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-molt-muted">Display Name</label>
        <input value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="My Community"
          className="input-field w-full text-xs mt-0.5" />
      </div>

      <div>
        <label className="text-[10px] text-molt-muted">Description</label>
        <textarea value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this community about?"
          rows={2}
          className="input-field w-full text-xs mt-0.5 resize-y" />
      </div>

      <button onClick={handleCreate}
        disabled={!name.trim() || !displayName.trim() || creating}
        className="btn-primary w-full text-xs py-1.5">
        {creating ? 'Creating...' : 'Create Submolt'}
      </button>
    </div>
  )
}

// ─── Link Existing Submolt ────────────────────────────────

function LinkSubmoltForm({ onLinked }: { onLinked: (name: string) => void }) {
  const { addNotification } = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [linking, setLinking] = useState(false)

  const handleLink = async () => {
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!cleanName) {
      addNotification('Enter a submolt name', 'error')
      return
    }
    setLinking(true)
    try {
      const detail = await invoke<any>(IPC.SUBMOLTS_GET_DETAIL, { submolt_name: cleanName })
      const role = detail?.your_role
      if (role !== 'owner' && role !== 'moderator') {
        addNotification(`You are not an owner or moderator of m/${cleanName}`, 'warning')
        return
      }
      addNotification(`Linked m/${cleanName} — you are ${role}`, 'success')
      setName('')
      setOpen(false)
      onLinked(cleanName)
    } catch (err: any) {
      addNotification(err.message || `Submolt m/${cleanName} not found`, 'error')
    } finally {
      setLinking(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full px-3 py-2 rounded-lg text-xs text-molt-muted hover:text-molt-text bg-molt-surface/50 hover:bg-molt-surface border border-molt-border/50 transition-colors">
        Link Existing Submolt
      </button>
    )
  }

  return (
    <div className="panel-card space-y-2 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium">Link Submolt</h4>
        <button onClick={() => setOpen(false)} className="text-molt-muted hover:text-molt-text text-sm">&times;</button>
      </div>
      <p className="text-[10px] text-molt-muted">Enter the name of a submolt you own or moderate.</p>
      <div className="flex items-center gap-1">
        <span className="text-xs text-molt-muted">m/</span>
        <input value={name}
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && handleLink()}
          placeholder="submolt_name"
          className="input-field flex-1 text-xs" />
      </div>
      <button onClick={handleLink}
        disabled={!name.trim() || linking}
        className="btn-secondary w-full text-xs py-1.5">
        {linking ? 'Checking...' : 'Link'}
      </button>
    </div>
  )
}

// ─── Moderator List ──────────────────────────────────────

function ModeratorList({ submoltName, role }: { submoltName: string; role: 'owner' | 'moderator' | null }) {
  const { addNotification } = useStore()
  const [moderators, setModerators] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [addInput, setAddInput] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchMods = useCallback(async () => {
    setLoading(true)
    try {
      const result = await invoke<{ moderators: any[] }>(IPC.MOD_GET_MODS, { submolt_name: submoltName })
      setModerators(result.moderators ?? [])
    } catch (err) {
      console.error('Failed to load moderators:', err)
    } finally {
      setLoading(false)
    }
  }, [submoltName])

  useEffect(() => { fetchMods() }, [fetchMods])

  const handleAdd = async () => {
    const name = addInput.trim()
    if (!name) return
    setAdding(true)
    try {
      await invoke(IPC.MOD_ADD_MOD, { submolt_name: submoltName, agent_name: name, role: 'moderator' })
      addNotification(`Added ${name} as moderator`, 'success')
      setAddInput('')
      fetchMods()
    } catch (err: any) {
      addNotification(err.message || 'Failed to add moderator', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (agentName: string) => {
    try {
      await invoke(IPC.MOD_REMOVE_MOD, { submolt_name: submoltName, agent_name: agentName })
      addNotification(`Removed ${agentName} from moderators`, 'success')
      fetchMods()
    } catch (err: any) {
      addNotification(err.message || 'Failed to remove moderator', 'error')
    }
  }

  return (
    <div className="panel-card space-y-3">
      <h3 className="text-sm font-medium">Moderators</h3>

      {loading && moderators.length === 0 && (
        <p className="text-xs text-molt-muted">Loading...</p>
      )}

      {!loading && moderators.length === 0 && (
        <p className="text-xs text-molt-muted">No moderators configured</p>
      )}

      {moderators.length > 0 && (
        <div className="space-y-1.5">
          {moderators.map((mod: any) => (
            <div key={safeStr(mod.name ?? mod.agent_name ?? mod.id)} className="flex items-center justify-between bg-molt-bg rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-molt-text">{safeStr(mod.display_name ?? mod.name ?? mod.agent_name)}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-molt-surface text-molt-muted">
                  {safeStr(mod.role ?? 'moderator')}
                </span>
              </div>
              {role === 'owner' && (
                <button onClick={() => handleRemove(safeStr(mod.name ?? mod.agent_name))}
                  className="text-molt-muted hover:text-molt-error text-xs transition-colors">
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {role === 'owner' && (
        <div className="flex gap-2">
          <input value={addInput} onChange={(e) => setAddInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Agent name to add as mod..."
            className="input-field flex-1 text-xs" />
          <button onClick={handleAdd}
            disabled={!addInput.trim() || adding}
            className="btn-secondary text-xs px-3">
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}

      {role === 'moderator' && (
        <p className="text-[10px] text-molt-muted">Only the submolt owner can add or remove moderators.</p>
      )}
    </div>
  )
}

// ─── Pin Manager ─────────────────────────────────────────

function PinManager({ submoltName }: { submoltName: string }) {
  const { addNotification } = useStore()
  const [pinnedPosts, setPinnedPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [pinInput, setPinInput] = useState('')

  const fetchPinned = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch submolt feed and filter for pinned posts
      const result = await invoke<{ posts: any[] }>(IPC.SUBMOLTS_GET_FEED, { submolt_name: submoltName, sort: 'new', limit: 50 })
      const pinned = (result.posts ?? []).filter((p: any) => p.is_pinned)
      setPinnedPosts(pinned)
    } catch (err) {
      console.error('Failed to load pinned posts:', err)
    } finally {
      setLoading(false)
    }
  }, [submoltName])

  useEffect(() => { fetchPinned() }, [fetchPinned])

  const handlePin = async () => {
    const postId = pinInput.trim()
    if (!postId) return
    try {
      await invoke(IPC.MOD_PIN, { post_id: postId })
      addNotification('Post pinned', 'success')
      setPinInput('')
      fetchPinned()
    } catch (err: any) {
      addNotification(err.message || 'Pin failed', 'error')
    }
  }

  const handleUnpin = async (postId: string) => {
    try {
      await invoke(IPC.MOD_UNPIN, { post_id: postId })
      addNotification('Post unpinned', 'success')
      fetchPinned()
    } catch (err: any) {
      addNotification(err.message || 'Unpin failed', 'error')
    }
  }

  return (
    <div className="panel-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Pinned Posts</h3>
        <span className="text-[10px] text-molt-muted">{pinnedPosts.length} / 3 max</span>
      </div>

      {/* Current pins */}
      {loading && pinnedPosts.length === 0 && (
        <p className="text-xs text-molt-muted">Loading...</p>
      )}

      {pinnedPosts.length > 0 && (
        <div className="space-y-1.5">
          {pinnedPosts.map((post: any) => (
            <div key={safeStr(post.id)} className="flex items-center gap-2 bg-molt-bg rounded-lg px-3 py-2">
              <svg className="w-3.5 h-3.5 text-molt-accent flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.789l1.599.799L9 4.323V3a1 1 0 011-1z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-molt-text truncate">{safeStr(post.title)}</p>
                <p className="text-[10px] text-molt-muted">by {safeStr(post.author?.name ?? post.author?.username ?? post.author)} · {safeStr(post.karma)} karma</p>
              </div>
              <button onClick={() => handleUnpin(safeStr(post.id))}
                className="text-[10px] text-molt-muted hover:text-molt-error transition-colors flex-shrink-0">
                Unpin
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && pinnedPosts.length === 0 && (
        <p className="text-xs text-molt-muted">No pinned posts</p>
      )}

      {/* Pin input */}
      {pinnedPosts.length < 3 && (
        <div className="flex gap-2">
          <input value={pinInput} onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePin()}
            placeholder="Post ID to pin..."
            className="input-field flex-1 text-xs" />
          <button onClick={handlePin}
            disabled={!pinInput.trim()}
            className="btn-secondary text-xs px-3">
            Pin
          </button>
        </div>
      )}

      {pinnedPosts.length >= 3 && (
        <p className="text-[10px] text-molt-warning">Maximum 3 pins reached. Unpin a post to pin another.</p>
      )}
    </div>
  )
}

// ─── Settings Editor ─────────────────────────────────────

function SettingsEditor({ submolt }: { submolt: Submolt }) {
  const { addNotification } = useStore()
  const [description, setDescription] = useState(submolt.description)
  const [themeColor, setThemeColor] = useState(submolt.theme_color)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Reset when submolt changes
  useEffect(() => {
    setDescription(submolt.description)
    setThemeColor(submolt.theme_color)
    setDirty(false)
  }, [submolt.name])

  const handleSave = async () => {
    setSaving(true)
    try {
      const data: Record<string, string> = {}
      if (description !== submolt.description) data.description = description
      if (themeColor !== submolt.theme_color) data.theme_color = themeColor
      if (Object.keys(data).length === 0) {
        addNotification('No changes to save', 'info')
        setSaving(false)
        return
      }
      await invoke(IPC.SUBMOLTS_UPDATE_SETTINGS, { submolt_name: submolt.name, ...data })
      addNotification('Settings saved', 'success')
      setDirty(false)
    } catch (err: any) {
      addNotification(err.message || 'Failed to save settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel-card space-y-3">
      <h3 className="text-sm font-medium">Submolt Settings</h3>

      <div className="space-y-2">
        <div>
          <label className="text-[10px] text-molt-muted uppercase tracking-wider">Description</label>
          <textarea value={description}
            onChange={(e) => { setDescription(e.target.value); setDirty(true) }}
            rows={3}
            className="input-field w-full text-xs mt-1 resize-y" />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-molt-muted uppercase tracking-wider">Theme Color</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={themeColor}
                onChange={(e) => { setThemeColor(e.target.value); setDirty(true) }}
                className="w-8 h-8 rounded border border-molt-border cursor-pointer" />
              <input value={themeColor}
                onChange={(e) => { setThemeColor(e.target.value); setDirty(true) }}
                className="input-field text-xs w-24 font-mono" />
              <div className="w-6 h-6 rounded-full border border-molt-border"
                style={{ backgroundColor: themeColor }} />
            </div>
          </div>
        </div>
      </div>

      {dirty && (
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={saving}
            className="btn-primary text-xs py-1.5 px-4">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button onClick={() => {
            setDescription(submolt.description)
            setThemeColor(submolt.theme_color)
            setDirty(false)
          }} className="text-xs text-molt-muted hover:text-molt-text transition-colors px-2">
            Reset
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────

export function ModerationPanel() {
  const { submolts, setSubmolts, modSelectedSubmolt, setModSelectedSubmolt, addNotification } = useStore()
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<Submolt | null>(null)

  // Filter to only submolts where user has a moderation role
  const moderatableSubmolts = submolts.filter(s => s.your_role === 'owner' || s.your_role === 'moderator')

  // After creating a submolt, fetch its detail and add to store, then select it
  const handleCreated = useCallback(async (name: string) => {
    try {
      const detail = await invoke<any>(IPC.SUBMOLTS_GET_DETAIL, { submolt_name: name })
      const newSubmolt: Submolt = {
        id: detail.id ?? name,
        name: detail.name ?? name,
        display_name: detail.display_name ?? name,
        description: detail.description ?? '',
        theme_color: detail.theme_color ?? '#7c5cfc',
        subscriber_count: detail.subscriber_count ?? 0,
        post_count: detail.post_count ?? 0,
        is_subscribed: detail.is_subscribed ?? false,
        moderators: detail.moderators ?? [],
        rules: detail.rules ?? [],
        your_role: detail.your_role ?? 'owner',
        created_at: detail.created_at ?? ''
      }
      // Add to store if not already present
      const exists = submolts.some(s => s.name === name)
      if (exists) {
        setSubmolts(submolts.map(s => s.name === name ? newSubmolt : s))
      } else {
        setSubmolts([...submolts, newSubmolt])
      }
      setModSelectedSubmolt(name)
    } catch {
      // Even if detail fetch fails, add a minimal entry so it appears in sidebar
      const minimal: Submolt = {
        id: name, name, display_name: name, description: '',
        theme_color: '#7c5cfc', subscriber_count: 0, post_count: 0,
        is_subscribed: false, moderators: [], rules: [],
        your_role: 'owner', created_at: new Date().toISOString()
      }
      setSubmolts([...submolts, minimal])
      setModSelectedSubmolt(name)
    }
  }, [submolts, setSubmolts, setModSelectedSubmolt])

  // When a submolt is selected, fetch its detail to get fresh your_role
  useEffect(() => {
    if (!modSelectedSubmolt) {
      setSelectedDetail(null)
      return
    }
    setDetailLoading(true)
    invoke<any>(IPC.SUBMOLTS_GET_DETAIL, { submolt_name: modSelectedSubmolt })
      .then((detail: any) => {
        const submolt: Submolt = {
          id: detail.id ?? modSelectedSubmolt,
          name: detail.name ?? modSelectedSubmolt,
          display_name: detail.display_name ?? modSelectedSubmolt,
          description: detail.description ?? '',
          theme_color: detail.theme_color ?? '#7c5cfc',
          subscriber_count: detail.subscriber_count ?? 0,
          post_count: detail.post_count ?? 0,
          is_subscribed: detail.is_subscribed ?? false,
          moderators: detail.moderators ?? [],
          rules: detail.rules ?? [],
          your_role: detail.your_role ?? null,
          created_at: detail.created_at ?? ''
        }
        setSelectedDetail(submolt)

        // Update the submolt in the global store with fresh your_role
        setSubmolts(submolts.map(s => s.name === submolt.name ? { ...s, your_role: submolt.your_role } : s))
      })
      .catch((err: any) => {
        addNotification(err.message || 'Failed to load submolt details', 'error')
      })
      .finally(() => setDetailLoading(false))
  }, [modSelectedSubmolt])

  const role = selectedDetail?.your_role ?? null

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border">
        <h2 className="text-lg font-semibold">Moderation</h2>
        <p className="text-[10px] text-molt-muted mt-0.5">
          Manage submolts you own or moderate
        </p>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Submolt selector */}
        <div className="w-52 border-r border-molt-border overflow-y-auto p-2 flex-shrink-0">
          <h3 className="text-[10px] text-molt-muted px-2 mb-2 uppercase tracking-wider">Your Submolts</h3>

          {/* Create or link submolt */}
          <div className="mb-3 space-y-2">
            <CreateSubmoltForm onCreated={handleCreated} />
            <LinkSubmoltForm onLinked={handleCreated} />
          </div>

          {moderatableSubmolts.length === 0 && (
            <div className="px-2 py-3 text-center">
              <p className="text-[10px] text-molt-muted">
                No submolts yet. Create one above or get added as a moderator by a submolt owner.
              </p>
            </div>
          )}

          {moderatableSubmolts.map((s) => (
            <button key={s.id} onClick={() => setModSelectedSubmolt(s.name)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                modSelectedSubmolt === s.name
                  ? 'bg-molt-accent/10 text-molt-accent'
                  : 'text-molt-muted hover:bg-molt-surface hover:text-molt-text'
              }`}>
              <div className="flex items-center justify-between">
                <span className="truncate">m/{safeStr(s.name)}</span>
                <span className={`text-[9px] px-1 py-0.5 rounded ${
                  s.your_role === 'owner'
                    ? 'bg-molt-accent/20 text-molt-accent'
                    : 'bg-molt-surface text-molt-muted'
                }`}>
                  {s.your_role === 'owner' ? 'OWNER' : 'MOD'}
                </span>
              </div>
            </button>
          ))}

          {/* Show all submolts section if there are non-mod ones loaded */}
          {submolts.length > moderatableSubmolts.length && moderatableSubmolts.length > 0 && (
            <div className="mt-3 pt-3 border-t border-molt-border">
              <p className="text-[10px] text-molt-muted px-2">
                {submolts.length - moderatableSubmolts.length} other submolts loaded (no mod access)
              </p>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!modSelectedSubmolt && (
            <div className="text-molt-muted text-center mt-12">
              {moderatableSubmolts.length > 0 ? (
                <p className="text-sm">Select a submolt from the sidebar to manage it</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm">Create your first submolt to get started</p>
                  <p className="text-xs">Use the "Create Submolt" button in the sidebar. You'll become the owner with full moderation access.</p>
                </div>
              )}
            </div>
          )}

          {modSelectedSubmolt && detailLoading && (
            <div className="text-molt-muted text-sm text-center mt-12">Loading submolt details...</div>
          )}

          {modSelectedSubmolt && !detailLoading && selectedDetail && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: selectedDetail.theme_color }}>
                  {safeStr(selectedDetail.name).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">m/{safeStr(selectedDetail.name)}</h3>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      role === 'owner'
                        ? 'bg-molt-accent/20 text-molt-accent'
                        : role === 'moderator'
                        ? 'bg-molt-success/20 text-molt-success'
                        : 'bg-molt-error/20 text-molt-error'
                    }`}>
                      {role === 'owner' ? 'OWNER' : role === 'moderator' ? 'MODERATOR' : 'NO ACCESS'}
                    </span>
                  </div>
                  <p className="text-xs text-molt-muted">
                    {selectedDetail.subscriber_count} subscribers · {selectedDetail.post_count} posts
                  </p>
                </div>
              </div>

              {/* No access warning */}
              {!role && (
                <div className="panel-card bg-molt-error/5 border-molt-error/20">
                  <p className="text-xs text-molt-error">
                    You don't have moderation access to this submolt. Actions will fail with a permission error.
                  </p>
                </div>
              )}

              {/* Pin Manager — owners and moderators */}
              {role && <PinManager submoltName={selectedDetail.name} />}

              {/* Settings Editor — owners and moderators */}
              {role && <SettingsEditor submolt={selectedDetail} />}

              {/* Moderator Management — owners and moderators can view, only owners can modify */}
              {role && <ModeratorList submoltName={selectedDetail.name} role={role} />}
            </div>
          )}

          {modSelectedSubmolt && !detailLoading && !selectedDetail && (
            <div className="text-molt-muted text-sm text-center mt-12">
              Failed to load submolt details. Try selecting again.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
