import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../stores'
import { useLiveFeed } from '../../hooks/useLiveFeed'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { Post, SortOrder, VoteDirection } from '@shared/domain.types'

// ─── Icons ──────────────────────────────────────────────

function IconUp({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-colors ${active ? 'text-molt-accent' : 'text-molt-muted hover:text-molt-accent/70'}`}>
      <path d="M9 14V4M9 4l-4 4M9 4l4 4" />
    </svg>
  )
}

function IconDown({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-colors ${active ? 'text-molt-error' : 'text-molt-muted hover:text-molt-error/70'}`}>
      <path d="M9 4v10M9 14l-4-4M9 14l4-4" />
    </svg>
  )
}

function IconComment() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 10.67A1.33 1.33 0 0112.67 12H4.67L2 14.67V3.33A1.33 1.33 0 013.33 2h9.34A1.33 1.33 0 0114 3.33v7.34z" />
    </svg>
  )
}

function IconListView() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  )
}

function IconCardView() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  )
}

// ─── Vote Controls ──────────────────────────────────────

function VoteColumn({ post, vertical = true }: { post: Post; vertical?: boolean }) {
  const updatePostVote = useStore((s) => s.updatePostVote)

  const handleVote = async (e: React.MouseEvent, direction: VoteDirection) => {
    e.stopPropagation()
    try {
      const channel = direction === 'up' ? IPC.FEED_UPVOTE : IPC.FEED_DOWNVOTE
      const result = await invoke<{ new_karma: number; our_vote: VoteDirection }>(channel, {
        post_id: post.id
      })
      updatePostVote(post.id, result.our_vote, result.new_karma)
    } catch (err) {
      console.error('Vote error:', err)
    }
  }

  const karmaColor = post.our_vote === 'up' ? 'text-molt-accent' : post.our_vote === 'down' ? 'text-molt-error' : 'text-molt-muted'

  if (!vertical) {
    return (
      <div className="flex items-center gap-1">
        <button onClick={(e) => handleVote(e, 'up')} className="p-0.5 rounded hover:bg-molt-surface/50 transition-colors">
          <IconUp active={post.our_vote === 'up'} />
        </button>
        <span className={`text-xs font-bold min-w-[2ch] text-center ${karmaColor}`}>{formatKarma(post.karma)}</span>
        <button onClick={(e) => handleVote(e, 'down')} className="p-0.5 rounded hover:bg-molt-surface/50 transition-colors">
          <IconDown active={post.our_vote === 'down'} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-0.5 pt-0.5">
      <button onClick={(e) => handleVote(e, 'up')} className="p-0.5 rounded hover:bg-molt-bg transition-colors">
        <IconUp active={post.our_vote === 'up'} />
      </button>
      <span className={`text-xs font-bold ${karmaColor}`}>{formatKarma(post.karma)}</span>
      <button onClick={(e) => handleVote(e, 'down')} className="p-0.5 rounded hover:bg-molt-bg transition-colors">
        <IconDown active={post.our_vote === 'down'} />
      </button>
    </div>
  )
}

// ─── Avatar ─────────────────────────────────────────────

function AgentAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initial = (name ?? '?')[0]?.toUpperCase() ?? '?'
  // Generate a deterministic hue from the name
  let hash = 0
  for (let i = 0; i < (name ?? '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'

  return (
    <div className={`${dim} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ backgroundColor: `hsl(${hue}, 55%, 45%)` }}>
      {initial}
    </div>
  )
}

// ─── Compact (Reddit) View ──────────────────────────────

function CompactPostRow({ post, onClick }: { post: Post; onClick: () => void }) {
  const timeAgo = getTimeAgo(post.created_at)

  return (
    <div onClick={onClick}
      className="group flex items-center gap-3 px-3 py-2 rounded-lg border border-transparent
                 hover:bg-molt-surface hover:border-molt-border/50 transition-all cursor-pointer">
      <VoteColumn post={post} vertical={false} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-molt-text truncate group-hover:text-white transition-colors">
            {post.title}
          </h3>
          {post.is_own && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-molt-accent/15 text-molt-accent border border-molt-accent/20">
              Agent Posted
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-molt-muted">
          <span className="font-medium" style={{ color: post.submolt?.theme_color ?? '#7c5cfc' }}>
            {post.submolt?.name}
          </span>
          <span>by {post.author?.username}</span>
          <span>{timeAgo}</span>
          <span className="flex items-center gap-1"><IconComment /> {post.comment_count}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Card (Social) View ─────────────────────────────────

function CardPost({ post, onClick }: { post: Post; onClick: () => void }) {
  const timeAgo = getTimeAgo(post.created_at)
  const [expanded, setExpanded] = useState(false)
  const contentLong = (post.content?.length ?? 0) > 280

  return (
    <div onClick={onClick}
      className="bg-molt-surface border border-molt-border rounded-xl overflow-hidden
                 hover:border-molt-accent/30 transition-all cursor-pointer group">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-2">
        <AgentAvatar name={post.author?.username ?? '?'} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-molt-text group-hover:text-white transition-colors">
              {post.author?.username}
            </span>
            {post.is_own && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-molt-accent/15 text-molt-accent border border-molt-accent/20">
                Agent Posted
              </span>
            )}
            <span className="text-xs text-molt-muted">{timeAgo}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
              style={{ backgroundColor: post.submolt?.theme_color ?? '#7c5cfc' }}>
              {post.submolt?.name}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-2">
        <h3 className="text-[15px] font-semibold text-molt-text leading-snug mb-1.5">
          {post.title}
        </h3>
        {post.content && (
          <p className={`text-sm text-molt-muted leading-relaxed ${!expanded && contentLong ? 'line-clamp-3' : ''}`}>
            {post.content}
          </p>
        )}
        {contentLong && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            className="text-xs text-molt-accent hover:text-molt-accent-hover mt-1 transition-colors">
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-molt-border/50">
        <VoteColumn post={post} vertical={false} />
        <div className="w-px h-4 bg-molt-border/50 mx-2" />
        <button onClick={(e) => { e.stopPropagation(); onClick() }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-molt-muted
                     hover:bg-molt-bg hover:text-molt-text transition-colors">
          <IconComment />
          <span>{post.comment_count} {post.comment_count === 1 ? 'comment' : 'comments'}</span>
        </button>
      </div>
    </div>
  )
}

// ─── Submolt Browser ─────────────────────────────────────

function SubmoltBrowser({ onSelect, onClose }: { onSelect: (name: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [totalCached, setTotalCached] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { setActivePanel } = useStore()

  const searchSubmolts = useCallback((keyword: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const resp = await invoke<{ submolts: any[]; total_cached: number }>(
          IPC.SUBMOLTS_SEARCH_CACHED,
          { keyword: keyword.trim(), limit: 30 }
        )
        setResults(resp?.submolts ?? [])
        setTotalCached(resp?.total_cached ?? 0)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 150)
  }, [])

  // Load initial list on mount
  useEffect(() => {
    searchSubmolts('')
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchSubmolts])

  useEffect(() => {
    searchSubmolts(query)
  }, [query, searchSubmolts])

  return (
    <div className="w-64 border-r border-molt-border flex flex-col bg-molt-bg shrink-0">
      {/* Header */}
      <div className="px-3 py-2 border-b border-molt-border flex items-center justify-between">
        <span className="text-xs font-semibold text-molt-text">Browse Submolts</span>
        <button onClick={onClose} className="text-molt-muted hover:text-molt-text text-sm">&times;</button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-molt-border">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search communities..."
          className="input-field w-full text-xs"
          autoFocus
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {totalCached === 0 ? (
          <div className="p-4 text-center space-y-2">
            <p className="text-xs text-molt-muted">No submolts synced yet.</p>
            <p className="text-[10px] text-molt-muted">Sync submolt database from Settings &gt; Data to browse communities.</p>
            <button
              onClick={() => { setActivePanel('settings'); onClose() }}
              className="btn-primary text-xs px-3 py-1.5"
            >
              Go to Settings
            </button>
          </div>
        ) : searching && results.length === 0 ? (
          <div className="p-3 text-xs text-molt-muted flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
              className="animate-spin" strokeLinecap="round"><path d="M14 8A6 6 0 112.5 5.5" /></svg>
            Searching...
          </div>
        ) : results.length === 0 ? (
          <div className="p-3 text-xs text-molt-muted">No submolts found for &ldquo;{query}&rdquo;</div>
        ) : (
          <div className="py-1">
            {results.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.name)}
                className="w-full text-left px-3 py-2 hover:bg-molt-surface/60 transition-colors flex items-center gap-2"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: s.theme_color || '#7c5cfc' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-molt-text truncate">{s.display_name || s.name}</div>
                  <div className="text-[10px] text-molt-muted truncate">
                    m/{s.name} &middot; {(s.subscriber_count ?? 0).toLocaleString()} subs
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {totalCached > 0 && (
        <div className="px-3 py-1.5 border-t border-molt-border">
          <span className="text-[10px] text-molt-muted">{totalCached.toLocaleString()} communities indexed</span>
        </div>
      )}
    </div>
  )
}

// ─── Feed Source Tabs ────────────────────────────────────

function FeedSourceTabs() {
  const { feedSource, setFeedSource, selectedSubmolt, setSelectedSubmolt } = useStore()

  const handleTab = (source: 'all' | 'subscribed' | 'submolt') => {
    if (source !== 'submolt') setSelectedSubmolt(null)
    setFeedSource(source)
  }

  return (
    <div className="flex gap-0.5 bg-molt-bg rounded-lg p-0.5">
      <button
        onClick={() => handleTab('all')}
        className={`px-2.5 py-1 text-xs rounded-md transition-all ${
          feedSource === 'all' ? 'bg-molt-surface text-molt-text font-medium shadow-sm' : 'text-molt-muted hover:text-molt-text'
        }`}
      >All</button>
      <button
        onClick={() => handleTab('subscribed')}
        className={`px-2.5 py-1 text-xs rounded-md transition-all ${
          feedSource === 'subscribed' ? 'bg-molt-surface text-molt-text font-medium shadow-sm' : 'text-molt-muted hover:text-molt-text'
        }`}
      >Subscribed</button>
      {selectedSubmolt && (
        <button
          onClick={() => handleTab('submolt')}
          className={`px-2.5 py-1 text-xs rounded-md transition-all ${
            feedSource === 'submolt' ? 'bg-molt-surface text-molt-text font-medium shadow-sm' : 'text-molt-muted hover:text-molt-text'
          }`}
        >m/{selectedSubmolt}</button>
      )}
    </div>
  )
}

// ─── Sort Controls ──────────────────────────────────────

function SortControls() {
  const { sortOrder, setSortOrder } = useStore()
  const sorts: SortOrder[] = ['hot', 'new', 'top', 'rising']

  return (
    <div className="flex gap-0.5 bg-molt-bg rounded-lg p-0.5">
      {sorts.map((s) => (
        <button
          key={s}
          onClick={() => setSortOrder(s)}
          className={`px-2.5 py-1 text-xs rounded-md transition-all ${
            sortOrder === s
              ? 'bg-molt-surface text-molt-text font-medium shadow-sm'
              : 'text-molt-muted hover:text-molt-text'
          }`}
        >
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </button>
      ))}
    </div>
  )
}

// ─── View Toggle ────────────────────────────────────────

function ViewToggle() {
  const { feedView, setFeedView } = useStore()

  return (
    <div className="flex gap-0.5 bg-molt-bg rounded-lg p-0.5">
      <button
        onClick={() => setFeedView('compact')}
        className={`p-1.5 rounded-md transition-all ${
          feedView === 'compact' ? 'bg-molt-surface text-molt-text shadow-sm' : 'text-molt-muted hover:text-molt-text'
        }`}
        title="Compact view"
      >
        <IconListView />
      </button>
      <button
        onClick={() => setFeedView('card')}
        className={`p-1.5 rounded-md transition-all ${
          feedView === 'card' ? 'bg-molt-surface text-molt-text shadow-sm' : 'text-molt-muted hover:text-molt-text'
        }`}
        title="Card view"
      >
        <IconCardView />
      </button>
    </div>
  )
}

// ─── Post Composer ──────────────────────────────────────

function PostComposer({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submoltName, setSubmoltName] = useState('')
  const { submolts, addNotification } = useStore()

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim() || !submoltName) return
    try {
      await invoke(IPC.FEED_CREATE_POST, { submolt: submoltName, title, content })
      addNotification('Post created!', 'success')
      onClose()
    } catch (err: any) {
      addNotification(err.message || 'Failed to create post', 'error')
    }
  }

  return (
    <div className="bg-molt-surface border border-molt-border rounded-xl p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">New Post</h3>
        <button onClick={onClose} className="text-molt-muted hover:text-molt-text text-lg leading-none">&times;</button>
      </div>
      <select
        value={submoltName}
        onChange={(e) => setSubmoltName(e.target.value)}
        className="input-field w-full text-sm"
      >
        <option value="">Select submolt...</option>
        {submolts.map((s) => (
          <option key={s.id} value={s.name}>{s.name}</option>
        ))}
      </select>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="input-field w-full text-sm"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind?"
        rows={4}
        className="input-field w-full text-sm resize-none"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary text-sm py-1.5">Cancel</button>
        <button onClick={handleSubmit} className="btn-primary text-sm py-1.5" disabled={!title.trim() || !content.trim() || !submoltName}>
          Post
        </button>
      </div>
    </div>
  )
}

// ─── Empty State ────────────────────────────────────────

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="w-16 h-16 rounded-full bg-molt-surface flex items-center justify-center mb-4">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-molt-muted">
          <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V9a2 2 0 012-2h2a2 2 0 012 2v9a2 2 0 01-2 2h-2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-molt-text font-medium mb-1">No posts yet</p>
      <p className="text-sm text-molt-muted max-w-xs">Configure your Moltbook API key in Settings to start browsing the feed</p>
    </div>
  )
}

// ─── Main Panel ─────────────────────────────────────────

export function LiveFeedPanel() {
  const { posts, loading, feedView, selectedSubmolt, setSelectedSubmolt, setActivePanel, setActivePost, setActivePostData, submolts, setSubmolts, addNotification, hasMore, setFeedSource } = useStore()
  const { refresh, loadMore } = useLiveFeed()
  const [composing, setComposing] = useState(false)
  const [subLoading, setSubLoading] = useState(false)
  const [showSubmoltBrowser, setShowSubmoltBrowser] = useState(false)

  const handleSubmoltSelect = (name: string) => {
    setSelectedSubmolt(name)
    setFeedSource('submolt')
    setShowSubmoltBrowser(false)
  }

  const currentSub = selectedSubmolt ? submolts.find((s) => s.name === selectedSubmolt) : null
  const isSubscribed = currentSub?.is_subscribed ?? false

  const handleToggleSubscribe = async () => {
    if (!selectedSubmolt) return
    setSubLoading(true)
    try {
      if (isSubscribed) {
        await invoke(IPC.SUBMOLTS_UNSUBSCRIBE, { submolt_name: selectedSubmolt })
        addNotification(`Unsubscribed from ${selectedSubmolt}`, 'info')
      } else {
        await invoke(IPC.SUBMOLTS_SUBSCRIBE, { submolt_name: selectedSubmolt })
        addNotification(`Subscribed to ${selectedSubmolt}`, 'success')
      }
      setSubmolts(
        submolts.map((s) =>
          s.name === selectedSubmolt
            ? { ...s, is_subscribed: !isSubscribed, subscriber_count: s.subscriber_count + (isSubscribed ? -1 : 1) }
            : s
        )
      )
    } catch {
      addNotification('Action failed', 'error')
    } finally {
      setSubLoading(false)
    }
  }

  const handlePostClick = (post: Post) => {
    setActivePostData(post)
    setActivePost(post.id)
    setActivePanel('conversation')
  }

  const feedSource = useStore((s) => s.feedSource)

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-col border-b border-molt-border">
        {/* Top row: title + actions */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Feed</h2>
            <FeedSourceTabs />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSubmoltBrowser(!showSubmoltBrowser)}
              className={`px-2.5 py-1.5 text-xs rounded-md transition-all flex items-center gap-1.5 ${
                showSubmoltBrowser
                  ? 'bg-molt-accent/15 text-molt-accent border border-molt-accent/30'
                  : 'text-molt-muted hover:text-molt-text hover:bg-molt-surface border border-transparent'
              }`}
              title="Browse submolts"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6.5" cy="6.5" r="4.5" />
                <path d="M14 14l-3.5-3.5" />
              </svg>
              Submolts
            </button>
            <ViewToggle />
            <button onClick={() => setComposing(!composing)} className="btn-primary text-xs py-1.5 px-3">
              + Post
            </button>
            <button onClick={refresh}
              className="p-1.5 rounded-md text-molt-muted hover:text-molt-text hover:bg-molt-surface transition-colors"
              disabled={loading} title="Refresh">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                className={loading ? 'animate-spin' : ''} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 8A6 6 0 112.5 5.5M14 2v4h-4" />
              </svg>
            </button>
          </div>
        </div>
        {/* Second row: sort + submolt context */}
        <div className="flex items-center gap-3 px-4 pb-2">
          <SortControls />
          {feedSource === 'submolt' && selectedSubmolt && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleToggleSubscribe}
                disabled={subLoading}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                  isSubscribed
                    ? 'bg-molt-surface text-molt-muted hover:bg-molt-error/20 hover:text-molt-error'
                    : 'bg-molt-accent text-white hover:bg-molt-accent/80'
                }`}
                title={isSubscribed ? 'Unsubscribe' : 'Subscribe'}
              >
                {subLoading ? '...' : isSubscribed ? 'Joined' : '+ Join'}
              </button>
              <button
                onClick={() => setSelectedSubmolt(null)}
                className="w-5 h-5 flex items-center justify-center rounded-full bg-molt-surface hover:bg-molt-error/20 text-molt-muted hover:text-molt-error text-xs transition-colors"
                title="Clear submolt filter"
              >
                &times;
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content area with optional submolt browser sidebar */}
      <div className="flex-1 flex min-h-0">
        {showSubmoltBrowser && (
          <SubmoltBrowser
            onSelect={handleSubmoltSelect}
            onClose={() => setShowSubmoltBrowser(false)}
          />
        )}

        <div className="flex-1 overflow-y-auto">
          <div className={`p-4 ${feedView === 'card' ? 'space-y-3 max-w-2xl mx-auto' : 'space-y-0.5'}`}>
            {composing && <PostComposer onClose={() => setComposing(false)} />}

            {posts.length === 0 && !loading && <EmptyFeed />}

            {loading && posts.length === 0 && (
              <div className="flex items-center justify-center h-32">
                <div className="flex items-center gap-2 text-molt-muted text-sm">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className="animate-spin" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 8A6 6 0 112.5 5.5M14 2v4h-4" />
                  </svg>
                  Loading feed...
                </div>
              </div>
            )}

            {feedView === 'compact'
              ? posts.map((post) => (
                  <CompactPostRow key={post.id} post={post} onClick={() => handlePostClick(post)} />
                ))
              : posts.map((post) => (
                  <CardPost key={post.id} post={post} onClick={() => handlePostClick(post)} />
                ))
            }

            {posts.length > 0 && hasMore && (
              <div className="pt-3 pb-1">
                <button onClick={loadMore}
                  className="w-full py-2 rounded-lg border border-molt-border text-sm text-molt-muted
                             hover:bg-molt-surface hover:text-molt-text transition-colors"
                  disabled={loading}>
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────

function getTimeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  return `${months}mo`
}

function formatKarma(n: number | undefined | null): string {
  if (n == null) return '0'
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}
