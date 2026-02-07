import React, { useState, useCallback } from 'react'
import { useStore } from '../../stores'
import { useLiveFeed } from '../../hooks/useLiveFeed'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { Post, SortOrder, VoteDirection } from '@shared/domain.types'

function VoteButtons({ post }: { post: Post }) {
  const updatePostVote = useStore((s) => s.updatePostVote)

  const handleVote = async (direction: VoteDirection) => {
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

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={() => handleVote('up')}
        className={`p-1 rounded hover:bg-molt-surface transition-colors ${
          post.our_vote === 'up' ? 'text-molt-accent' : 'text-molt-muted'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3l6 8H2z" />
        </svg>
      </button>
      <span className={`text-xs font-bold ${
        post.our_vote === 'up' ? 'text-molt-accent' : post.our_vote === 'down' ? 'text-molt-error' : 'text-molt-muted'
      }`}>
        {post.karma}
      </span>
      <button
        onClick={() => handleVote('down')}
        className={`p-1 rounded hover:bg-molt-surface transition-colors ${
          post.our_vote === 'down' ? 'text-molt-error' : 'text-molt-muted'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 13l6-8H2z" />
        </svg>
      </button>
    </div>
  )
}

function PostCard({ post, onClick }: { post: Post; onClick: () => void }) {
  const timeAgo = getTimeAgo(post.created_at)

  return (
    <div className="panel-card flex gap-3 hover:border-molt-accent/30 transition-colors cursor-pointer" onClick={onClick}>
      <VoteButtons post={post} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="badge text-white"
            style={{ backgroundColor: post.submolt?.theme_color ?? '#7c5cfc' }}
          >
            {post.submolt?.name}
          </span>
          <span className="text-xs text-molt-muted">by {post.author?.username}</span>
          <span className="text-xs text-molt-muted">{timeAgo}</span>
        </div>
        <h3 className="text-sm font-medium text-molt-text mb-1 truncate">{post.title}</h3>
        <p className="text-xs text-molt-muted line-clamp-2">{post.content}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-molt-muted">
          <span>{post.comment_count} comments</span>
          {post.is_own && <span className="badge bg-molt-accent/20 text-molt-accent">You</span>}
        </div>
      </div>
    </div>
  )
}

function SortControls() {
  const { sortOrder, setSortOrder } = useStore()
  const sorts: SortOrder[] = ['hot', 'new', 'top', 'controversial']

  return (
    <div className="flex gap-1">
      {sorts.map((s) => (
        <button
          key={s}
          onClick={() => setSortOrder(s)}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            sortOrder === s ? 'bg-molt-accent text-white' : 'bg-molt-surface text-molt-muted hover:text-molt-text'
          }`}
        >
          {s.charAt(0).toUpperCase() + s.slice(1)}
        </button>
      ))}
    </div>
  )
}

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
    <div className="panel-card space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium">New Post</h3>
        <button onClick={onClose} className="text-molt-muted hover:text-molt-text">&times;</button>
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
        placeholder="Content"
        rows={4}
        className="input-field w-full text-sm resize-none"
      />
      <button onClick={handleSubmit} className="btn-primary text-sm">
        Post
      </button>
    </div>
  )
}

export function LiveFeedPanel() {
  const { posts, loading, setActivePanel, setActivePost } = useStore()
  const { refresh, loadMore } = useLiveFeed()
  const [composing, setComposing] = useState(false)

  const handlePostClick = (post: Post) => {
    setActivePost(post.id)
    setActivePanel('conversation')
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-molt-border">
        <h2 className="text-lg font-semibold">Live Feed</h2>
        <div className="flex items-center gap-3">
          <SortControls />
          <button onClick={() => setComposing(!composing)} className="btn-primary text-sm">
            + New Post
          </button>
          <button onClick={refresh} className="btn-secondary text-sm" disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {composing && <PostComposer onClose={() => setComposing(false)} />}

        {posts.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-64 text-molt-muted">
            <p className="text-lg mb-2">No posts yet</p>
            <p className="text-sm">Configure your Moltbook API key in Settings to get started</p>
          </div>
        )}

        {posts.map((post) => (
          <PostCard key={post.id} post={post} onClick={() => handlePostClick(post)} />
        ))}

        {posts.length > 0 && (
          <button onClick={loadMore} className="btn-secondary w-full text-sm" disabled={loading}>
            Load More
          </button>
        )}
      </div>
    </div>
  )
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
