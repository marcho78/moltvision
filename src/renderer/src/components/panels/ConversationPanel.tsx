import React, { useEffect, useState } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { Post, Comment, VoteDirection, AgentPersona } from '@shared/domain.types'

// ─── Icons ──────────────────────────────────────────────

function IconUp({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? 'text-molt-accent' : 'text-molt-muted hover:text-molt-accent/70'}>
      <path d="M9 14V4M9 4l-4 4M9 4l4 4" />
    </svg>
  )
}

function IconDown({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={active ? 'text-molt-error' : 'text-molt-muted hover:text-molt-error/70'}>
      <path d="M9 4v10M9 14l-4-4M9 14l4-4" />
    </svg>
  )
}

// ─── Avatar ─────────────────────────────────────────────

function AgentAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const initial = (name ?? '?')[0]?.toUpperCase() ?? '?'
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

// ─── Post Detail Header ─────────────────────────────────

function PostDetail({ post }: { post: Post }) {
  const { setActivePanel, addNotification } = useStore()
  const timeAgo = getTimeAgo(post.created_at)

  const handleVote = async (direction: VoteDirection) => {
    try {
      const channel = direction === 'up' ? IPC.FEED_UPVOTE : IPC.FEED_DOWNVOTE
      await invoke(channel, { post_id: post.id })
    } catch (err) {
      console.error('Vote error:', err)
    }
  }

  return (
    <div className="border-b border-molt-border">
      {/* Back bar */}
      <div className="px-4 py-2 border-b border-molt-border/50 flex items-center gap-2">
        <button onClick={() => setActivePanel('feed')}
          className="flex items-center gap-1 text-xs text-molt-muted hover:text-molt-text transition-colors">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12L6 8l4-4" />
          </svg>
          Back to Feed
        </button>
      </div>

      {/* Post content */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <AgentAvatar name={post.author?.username ?? '?'} size="md" />
          <div>
            <span className="text-sm font-semibold text-molt-text">{post.author?.username}</span>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                style={{ backgroundColor: post.submolt?.theme_color ?? '#7c5cfc' }}>
                {post.submolt?.name}
              </span>
              <span className="text-xs text-molt-muted">{timeAgo}</span>
            </div>
          </div>
        </div>

        <h1 className="text-lg font-bold text-white mb-2 leading-snug">{post.title}</h1>
        {post.content && (
          <p className="text-sm text-molt-text leading-relaxed whitespace-pre-wrap">{post.content}</p>
        )}

        {/* Post action bar */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-molt-border/50">
          <div className="flex items-center gap-1">
            <button onClick={() => handleVote('up')} className="p-0.5 rounded hover:bg-molt-surface transition-colors">
              <IconUp active={post.our_vote === 'up'} />
            </button>
            <span className={`text-sm font-bold ${
              post.our_vote === 'up' ? 'text-molt-accent' : post.our_vote === 'down' ? 'text-molt-error' : 'text-molt-muted'
            }`}>
              {post.karma}
            </span>
            <button onClick={() => handleVote('down')} className="p-0.5 rounded hover:bg-molt-surface transition-colors">
              <IconDown active={post.our_vote === 'down'} />
            </button>
          </div>
          <span className="text-xs text-molt-muted">{post.comment_count} comments</span>
          {post.is_own && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-molt-accent/15 text-molt-accent border border-molt-accent/20">
              YOUR POST
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Comment Reply Box ──────────────────────────────────

function ReplyBox({ postId, parentId, onClose, onSubmitted }: {
  postId: string; parentId?: string; onClose: () => void; onSubmitted: () => void
}) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { addNotification } = useStore()

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    try {
      await invoke(IPC.COMMENTS_CREATE, { post_id: postId, content: content.trim(), parent_id: parentId })
      addNotification('Comment posted!', 'success')
      setContent('')
      onClose()
      onSubmitted()
    } catch (err: any) {
      addNotification(err.message || 'Failed to post comment', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-2 ml-8">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a reply..."
        rows={3}
        className="input-field w-full text-sm resize-none"
        autoFocus
      />
      <div className="flex justify-end gap-2 mt-1.5">
        <button onClick={onClose} className="text-xs text-molt-muted hover:text-molt-text px-2 py-1">Cancel</button>
        <button onClick={handleSubmit} className="btn-primary text-xs py-1 px-3" disabled={submitting || !content.trim()}>
          {submitting ? 'Posting...' : 'Reply'}
        </button>
      </div>
    </div>
  )
}

// ─── Agent Reply Generator ───────────────────────────────

function AgentReplyBox({ postId, parentId, postTitle, postContent, commentContent, onClose, onSubmitted }: {
  postId: string; parentId?: string; postTitle: string; postContent: string; commentContent: string
  onClose: () => void; onSubmitted: () => void
}) {
  const [draft, setDraft] = useState('')
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { addNotification } = useStore()

  const generateReply = async () => {
    setGenerating(true)
    try {
      // Load the active persona to use for generation
      const personas = await invoke<AgentPersona[]>(IPC.PERSONA_LIST)
      const { persona_id } = await invoke<{ persona_id: string }>(IPC.AUTOPILOT_GET_PERSONA)
      const persona = personas.find(p => p.id === persona_id) ?? personas[0]

      if (!persona) {
        addNotification('No persona configured. Set one in Persona Studio.', 'warning')
        setGenerating(false)
        return
      }

      const response = await invoke<{ content: string }>(IPC.LLM_GENERATE, {
        messages: [
          {
            role: 'system',
            content: `${persona.system_prompt}\n\nYou are writing a reply comment on Moltbook. Style: ${persona.tone_settings?.style ?? 'friendly'}.\n\nCRITICAL: Your reply must be 125 characters or fewer. This is a hard API limit. Be concise but insightful.\n\nRespond with the comment text directly, no JSON wrapping.`
          },
          {
            role: 'user',
            content: `Post context:\nTitle: ${postTitle}\nContent: ${postContent}\n\nComment you're replying to:\n${commentContent}\n\nWrite a natural, brief reply (max 125 chars).`
          }
        ],
        temperature: persona.tone_settings?.temperature ?? 0.7,
        max_tokens: 150,
        provider: persona.llm_provider ?? undefined
      })

      let text = response.content ?? ''
      if (text.length > 125) text = text.slice(0, 122) + '...'
      setDraft(text)
    } catch (err: any) {
      addNotification(err.message || 'Failed to generate reply', 'error')
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => { generateReply() }, [])

  const handleSubmit = async () => {
    if (!draft.trim()) return
    setSubmitting(true)
    try {
      let text = draft.trim()
      if (text.length > 125) text = text.slice(0, 122) + '...'
      await invoke(IPC.COMMENTS_CREATE, { post_id: postId, content: text, parent_id: parentId })
      addNotification('Agent reply posted!', 'success')
      setDraft('')
      onClose()
      onSubmitted()
    } catch (err: any) {
      addNotification(err.message || 'Failed to post agent reply', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const charCount = draft.length
  const charColor = charCount > 125 ? 'text-molt-error' : charCount > 110 ? 'text-molt-warning' : 'text-molt-muted'

  return (
    <div className="mt-2 ml-8 border border-molt-accent/20 rounded-lg p-2 bg-molt-accent/5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-semibold text-molt-accent">Agent Reply</span>
        {generating && (
          <span className="text-[10px] text-molt-muted flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
              className="animate-spin" strokeLinecap="round"><path d="M14 8A6 6 0 112.5 5.5" /></svg>
            Generating...
          </span>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Agent-generated reply..."
        rows={2}
        maxLength={125}
        className="input-field w-full text-sm resize-none"
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-[10px] ${charColor}`}>{charCount}/125</span>
        <div className="flex gap-2">
          <button onClick={onClose} className="text-xs text-molt-muted hover:text-molt-text px-2 py-1">Cancel</button>
          <button onClick={generateReply} className="text-xs text-molt-accent hover:text-molt-accent-hover px-2 py-1" disabled={generating}>
            Regenerate
          </button>
          <button onClick={handleSubmit} className="btn-primary text-xs py-1 px-3"
            disabled={submitting || !draft.trim() || generating}>
            {submitting ? 'Posting...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Single Comment ─────────────────────────────────────

function CommentItem({ comment, postId, depth, onRefresh, postTitle, postContent }: {
  comment: Comment; postId: string; depth: number; onRefresh: () => void; postTitle?: string; postContent?: string
}) {
  const [replying, setReplying] = useState(false)
  const [agentReplying, setAgentReplying] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const timeAgo = getTimeAgo(comment.created_at)
  const children = comment.children ?? []

  const handleUpvote = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await invoke(IPC.COMMENTS_UPVOTE, { comment_id: comment.id })
    } catch (err) {
      console.error('Comment upvote error:', err)
    }
  }

  return (
    <div className="relative">
      {/* Thread line */}
      {depth > 0 && (
        <div className="absolute left-3 top-0 bottom-0 w-px bg-molt-border/40 hover:bg-molt-accent/30 transition-colors cursor-pointer"
          onClick={() => setCollapsed(!collapsed)} />
      )}

      <div className={`${depth > 0 ? 'ml-7' : ''}`}>
        {/* Comment header */}
        <div className="flex items-center gap-2 pt-3 pb-1">
          <AgentAvatar name={comment.author?.username ?? '?'} size="sm" />
          <span className="text-xs font-semibold text-molt-text">{comment.author?.username}</span>
          <span className="text-xs text-molt-muted">{timeAgo}</span>
          <span className={`text-xs ${comment.karma > 0 ? 'text-molt-accent' : comment.karma < 0 ? 'text-molt-error' : 'text-molt-muted'}`}>
            {comment.karma > 0 ? '+' : ''}{comment.karma}
          </span>
          {comment.is_own && (
            <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-molt-accent/15 text-molt-accent">YOU</span>
          )}
          {children.length > 0 && (
            <button onClick={() => setCollapsed(!collapsed)}
              className="text-[10px] text-molt-muted hover:text-molt-text transition-colors">
              {collapsed ? `[+${countDescendants(children)} hidden]` : ''}
            </button>
          )}
        </div>

        {/* Comment body */}
        {!collapsed && (
          <>
            <p className="text-sm text-molt-text leading-relaxed pl-8 pr-2">{comment.content}</p>

            {/* Actions */}
            <div className="flex items-center gap-3 pl-8 pt-1 pb-1">
              <button onClick={handleUpvote}
                className="flex items-center gap-1 text-xs text-molt-muted hover:text-molt-accent transition-colors">
                <IconUp active={comment.our_vote === 'up'} />
              </button>
              <button onClick={() => setReplying(!replying)}
                className="text-xs text-molt-muted hover:text-molt-text transition-colors">
                Reply
              </button>
              <button onClick={() => setAgentReplying(!agentReplying)}
                className="text-xs text-molt-accent/60 hover:text-molt-accent transition-colors">
                Agent Reply
              </button>
            </div>

            {replying && (
              <ReplyBox postId={postId} parentId={comment.id}
                onClose={() => setReplying(false)} onSubmitted={onRefresh} />
            )}

            {agentReplying && (
              <AgentReplyBox
                postId={postId}
                parentId={comment.id}
                postTitle={postTitle ?? ''}
                postContent={postContent ?? ''}
                commentContent={comment.content}
                onClose={() => setAgentReplying(false)}
                onSubmitted={onRefresh}
              />
            )}

            {/* Children */}
            {children.map((child) => (
              <CommentItem key={child.id} comment={child} postId={postId}
                depth={depth + 1} onRefresh={onRefresh} postTitle={postTitle} postContent={postContent} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Thread View ────────────────────────────────────────

function ThreadView({ post, comments, postId, onRefresh }: {
  post: Post | null; comments: Comment[]; postId: string; onRefresh: () => void
}) {
  const [replyingToPost, setReplyingToPost] = useState(false)
  const [agentReplyingToPost, setAgentReplyingToPost] = useState(false)
  const tree = buildTree(comments)

  return (
    <div className="flex-1 overflow-y-auto">
      {post && <PostDetail post={post} />}

      <div className="px-4 py-3">
        {/* Top-level reply */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-molt-text">
            {comments.length} {comments.length === 1 ? 'Comment' : 'Comments'}
          </span>
          <div className="flex gap-2">
            <button onClick={() => { setAgentReplyingToPost(!agentReplyingToPost); setReplyingToPost(false) }}
              className="btn-secondary text-xs py-1 px-3 text-molt-accent border-molt-accent/30">
              Agent Comment
            </button>
            <button onClick={() => { setReplyingToPost(!replyingToPost); setAgentReplyingToPost(false) }}
              className="btn-primary text-xs py-1 px-3">
              + Comment
            </button>
          </div>
        </div>

        {replyingToPost && (
          <ReplyBox postId={postId} onClose={() => setReplyingToPost(false)} onSubmitted={onRefresh} />
        )}

        {agentReplyingToPost && post && (
          <AgentReplyBox
            postId={postId}
            postTitle={post.title}
            postContent={post.content}
            commentContent={post.content}
            onClose={() => setAgentReplyingToPost(false)}
            onSubmitted={onRefresh}
          />
        )}

        {/* Comment tree */}
        {tree.length === 0 && !replyingToPost && (
          <div className="text-center py-8 text-molt-muted text-sm">
            No comments yet. Be the first to reply!
          </div>
        )}
        {tree.map((comment) => (
          <CommentItem key={comment.id} comment={comment} postId={postId}
            depth={0} onRefresh={onRefresh} postTitle={post?.title} postContent={post?.content} />
        ))}
      </div>
    </div>
  )
}

// ─── D3 Tree Visualization (kept as secondary view) ─────


// ─── Main Panel ─────────────────────────────────────────

export function ConversationPanel() {
  const { activePostId, activePost, comments, setComments, setActivePanel } = useStore()

  const fetchComments = () => {
    if (!activePostId) return
    invoke(IPC.COMMENTS_GET_TREE, { post_id: activePostId })
      .then((result: any) => setComments(result.comments ?? []))
      .catch(console.error)
  }

  useEffect(() => {
    fetchComments()
  }, [activePostId])

  if (!activePostId) {
    return (
      <div className="h-full flex items-center justify-center text-molt-muted">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-molt-surface flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-molt-muted" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <p className="text-molt-text font-medium mb-1">No conversation selected</p>
          <p className="text-sm">Click on a post in the Feed to view its full thread</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <ThreadView post={activePost} comments={comments} postId={activePostId}
        onRefresh={fetchComments} />
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────

function buildTree(comments: Comment[]): Comment[] {
  const map = new Map<string, Comment & { children: Comment[] }>()
  const roots: Comment[] = []
  for (const c of comments) map.set(c.id, { ...c, children: [] })
  for (const c of comments) {
    const node = map.get(c.id)!
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function countDescendants(children: Comment[]): number {
  let count = children.length
  for (const c of children) count += countDescendants((c as any).children ?? [])
  return count
}

function getTimeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
