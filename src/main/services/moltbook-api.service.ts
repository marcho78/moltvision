import { net } from 'electron'
import log from 'electron-log'
import { updateRateLimit, decrementRateLimit, getRateLimit } from '../db/queries/rate-limits.queries'

const BASE_URL = 'https://www.moltbook.com/api/v1'

// Use Electron's net.fetch (Chromium network stack) instead of Node's fetch
// This properly handles SSL, proxies, and system certificates
function electronFetch(url: string, opts?: RequestInit): Promise<Response> {
  return net.fetch(url, opts as any)
}

// --- Error Types ---

export class MoltbookApiError extends Error {
  constructor(public statusCode: number, message: string, public hint?: string, public body?: unknown) {
    super(message)
    this.name = 'MoltbookApiError'
  }
}

export class RateLimitError extends MoltbookApiError {
  constructor(
    public resource: string,
    public retryAfterSeconds?: number,
    public retryAfterMinutes?: number,
    public dailyRemaining?: number
  ) {
    super(429, `Rate limited on ${resource}.${retryAfterSeconds ? ` Retry after ${retryAfterSeconds}s` : ''}${retryAfterMinutes ? ` Retry after ${retryAfterMinutes}min` : ''}`)
    this.name = 'RateLimitError'
  }
}

export class AuthenticationError extends MoltbookApiError {
  constructor(hint?: string) {
    super(401, hint ?? 'Invalid or expired API key', hint)
    this.name = 'AuthenticationError'
  }
}

export class NotFoundError extends MoltbookApiError {
  constructor(resource: string) {
    super(404, `Resource not found: ${resource}`)
    this.name = 'NotFoundError'
  }
}

// --- Rate Limit Tracker ---

class RateLimitTracker {
  parseHeaders(headers: Headers, resource: string): void {
    const remaining = headers.get('x-ratelimit-remaining')
    const reset = headers.get('x-ratelimit-reset')
    if (remaining !== null && reset !== null) {
      updateRateLimit(resource, parseInt(remaining, 10), new Date(parseInt(reset, 10) * 1000).toISOString())
    }
  }

  canRequest(resource: string): boolean {
    const limit = getRateLimit(resource)
    if (!limit) return true
    if (new Date(limit.reset_at) <= new Date()) return true
    return limit.remaining > 0
  }
}

// --- Request Queue ---

interface QueuedRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  execute: () => Promise<unknown>
  priority: number
  resource: string
}

class RequestQueue {
  private queue: QueuedRequest[] = []
  private processing = false

  enqueue<T>(execute: () => Promise<T>, resource: string, priority: number = 0): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve: resolve as (v: unknown) => void, reject, execute, priority, resource })
      this.queue.sort((a, b) => b.priority - a.priority)
      this.process()
    })
  }

  private async process(): Promise<void> {
    if (this.processing) return
    this.processing = true
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      try {
        const result = await item.execute()
        item.resolve(result)
      } catch (err) {
        item.reject(err as Error)
      }
    }
    this.processing = false
  }

  drain(): void {
    const items = this.queue.splice(0)
    items.forEach(i => i.reject(new Error('Queue drained')))
  }
}

// --- Main Client ---

export class MoltbookClient {
  private apiKey: string = ''
  private rateLimits = new RateLimitTracker()
  private requestQueue = new RequestQueue()

  setApiKey(key: string): void {
    this.apiKey = key
  }

  getApiKey(): string {
    return this.apiKey
  }

  /**
   * Core fetch wrapper that handles:
   * - Auth header injection
   * - Rate limit checking + header parsing
   * - Response envelope unwrapping: {success: true, data: ...} → data
   * - Error envelope parsing: {success: false, error: "...", hint: "..."}
   * - Auto-retry on 5xx with exponential backoff (max 2 retries)
   */
  private async fetch<T>(
    path: string,
    opts: RequestInit = {},
    resource: string = 'moltbook_general'
  ): Promise<T> {
    if (!this.apiKey) throw new AuthenticationError('No API key configured')

    if (!this.rateLimits.canRequest(resource)) {
      const limit = getRateLimit(resource)
      throw new RateLimitError(resource)
    }

    decrementRateLimit(resource)

    const url = `${BASE_URL}${path}`
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      ...((opts.headers as Record<string, string>) ?? {})
    }
    // Only add Content-Type for JSON bodies (not FormData)
    if (!(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }

    let lastError: Error | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await electronFetch(url, { ...opts, headers })

        this.rateLimits.parseHeaders(response.headers, resource)

        if (response.status === 401) {
          const body = await response.json().catch(() => ({}))
          throw new AuthenticationError(body.hint)
        }
        if (response.status === 404) {
          throw new NotFoundError(path)
        }
        if (response.status === 429) {
          const body = await response.json().catch(() => ({}))
          throw new RateLimitError(
            resource,
            body.retry_after_seconds,
            body.retry_after_minutes,
            body.daily_remaining
          )
        }

        if (!response.ok) {
          const body = await response.json().catch(() => null)
          throw new MoltbookApiError(
            response.status,
            body?.error ?? `API error: ${response.statusText}`,
            body?.hint,
            body
          )
        }

        const json = await response.json()

        // Unwrap Moltbook response envelope: {success: true, data: {...}}
        if (json && typeof json === 'object' && 'success' in json) {
          if (json.success === false) {
            throw new MoltbookApiError(response.status, json.error ?? 'Unknown error', json.hint)
          }
          return (json.data ?? json) as T
        }

        return json as T
      } catch (err) {
        lastError = err as Error
        // Don't retry client errors (4xx)
        if (err instanceof MoltbookApiError && err.statusCode < 500) throw err
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
        }
      }
    }
    throw lastError!
  }

  // ==========================================
  // Registration
  // ==========================================

  async register(name: string, description: string) {
    // Registration does NOT require auth, so we do a raw fetch
    const url = `${BASE_URL}/agents/register`
    const response = await electronFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    })
    const json = await response.json()
    log.info('Moltbook register response:', JSON.stringify(json, null, 2))
    if (json.success === false) {
      throw new MoltbookApiError(response.status, json.error ?? 'Registration failed', json.hint)
    }
    // Real response: { success, agent: { api_key, claim_url, verification_code, ... }, setup: {...}, ... }
    const agent = json.agent ?? json.data ?? json
    if (!agent?.api_key) {
      log.error('No api_key in register response. Keys found:', Object.keys(agent ?? {}))
      throw new MoltbookApiError(response.status, 'Registration response missing api_key. Check logs for details.')
    }
    return {
      api_key: agent.api_key,
      claim_url: agent.claim_url,
      verification_code: agent.verification_code,
      profile_url: agent.profile_url,
      name: agent.name,
      setup: json.setup,
      tweet_template: json.tweet_template
    }
  }

  // ==========================================
  // Agent Endpoints
  // ==========================================

  /** GET /agents/me — authenticated agent's own profile */
  async getMyProfile() {
    return this.fetch<any>('/agents/me')
  }

  /** GET /agents/status — check claim status */
  async getClaimStatus() {
    return this.fetch<{ status: string }>('/agents/status')
  }

  /** GET /agents/profile?name=NAME — view another agent's profile */
  async getAgentProfile(name: string) {
    return this.fetch<any>(`/agents/profile?name=${encodeURIComponent(name)}`)
  }

  /** PATCH /agents/me — update own profile */
  async updateProfile(data: { description?: string; metadata?: Record<string, unknown> }) {
    return this.fetch<any>('/agents/me', {
      method: 'PATCH',
      body: JSON.stringify(data)
    })
  }

  /** POST /agents/me/avatar — upload avatar (max 1 MB; JPEG/PNG/GIF/WebP) */
  async uploadAvatar(file: Buffer, filename: string, mimeType: string) {
    const formData = new FormData()
    formData.append('file', new Blob([file], { type: mimeType }), filename)
    return this.fetch<any>('/agents/me/avatar', {
      method: 'POST',
      body: formData
    })
  }

  /** DELETE /agents/me/avatar — remove avatar */
  async deleteAvatar() {
    return this.fetch<any>('/agents/me/avatar', { method: 'DELETE' })
  }

  /** POST /agents/{name}/follow — follow an agent */
  async followAgent(agentName: string) {
    return this.fetch<any>(`/agents/${encodeURIComponent(agentName)}/follow`, { method: 'POST' })
  }

  /** DELETE /agents/{name}/follow — unfollow an agent */
  async unfollowAgent(agentName: string) {
    return this.fetch<any>(`/agents/${encodeURIComponent(agentName)}/follow`, { method: 'DELETE' })
  }

  /** GET /agents — list agents (for network graph, etc.) */
  async getAgents(opts: { cursor?: string; limit?: number; search?: string } = {}) {
    const params = new URLSearchParams()
    if (opts.cursor) params.set('cursor', opts.cursor)
    if (opts.limit) params.set('limit', opts.limit.toString())
    if (opts.search) params.set('search', opts.search)
    const qs = params.toString()
    return this.fetch<{ agents: any[]; next_cursor: string | null }>(`/agents${qs ? `?${qs}` : ''}`)
  }

  /** GET /agents/network — network graph data */
  async getAgentNetwork(agentName?: string, depth?: number) {
    const params = new URLSearchParams()
    if (agentName) params.set('name', agentName)
    if (depth) params.set('depth', depth.toString())
    const qs = params.toString()
    return this.fetch<{ nodes: any[]; edges: any[] }>(`/agents/network${qs ? `?${qs}` : ''}`)
  }

  // ==========================================
  // Post Endpoints
  // ==========================================

  /** GET /posts — get feed with sort/limit/submolt filter */
  async getFeed(opts: { sort?: string; submolt?: string; limit?: number } = {}) {
    const params = new URLSearchParams()
    if (opts.sort) params.set('sort', opts.sort)
    if (opts.submolt) params.set('submolt', opts.submolt)
    if (opts.limit) params.set('limit', opts.limit.toString())
    const qs = params.toString()
    return this.fetch<{ posts: any[]; next_cursor: string | null }>(`/posts${qs ? `?${qs}` : ''}`)
  }

  /** GET /feed — personalized feed (subscriptions + follows) */
  async getPersonalizedFeed(opts: { sort?: string; limit?: number } = {}) {
    const params = new URLSearchParams()
    if (opts.sort) params.set('sort', opts.sort)
    if (opts.limit) params.set('limit', opts.limit.toString())
    const qs = params.toString()
    return this.fetch<{ posts: any[]; next_cursor: string | null }>(`/feed${qs ? `?${qs}` : ''}`)
  }

  /** GET /posts/{id} — get single post */
  async getPost(postId: string) {
    return this.fetch<any>(`/posts/${encodeURIComponent(postId)}`)
  }

  /** POST /posts — create post. Rate limit: 1 per 30 min */
  async createPost(submolt: string, title: string, content: string, url?: string) {
    const body: Record<string, string> = { submolt, title, content }
    if (url) body.url = url
    return this.fetch<any>('/posts', {
      method: 'POST',
      body: JSON.stringify(body)
    }, 'moltbook_posts')
  }

  /** DELETE /posts/{id} — delete own post */
  async deletePost(postId: string) {
    return this.fetch<any>(`/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' })
  }

  /** POST /posts/{id}/upvote — upvote a post */
  async upvotePost(postId: string) {
    return this.fetch<any>(`/posts/${encodeURIComponent(postId)}/upvote`, { method: 'POST' })
  }

  /** POST /posts/{id}/downvote — downvote a post */
  async downvotePost(postId: string) {
    return this.fetch<any>(`/posts/${encodeURIComponent(postId)}/downvote`, { method: 'POST' })
  }

  /** POST /posts/{id}/pin — pin post (moderators only; max 3 per submolt) */
  async pinPost(postId: string) {
    return this.fetch<any>(`/posts/${encodeURIComponent(postId)}/pin`, { method: 'POST' })
  }

  /** DELETE /posts/{id}/pin — unpin post */
  async unpinPost(postId: string) {
    return this.fetch<any>(`/posts/${encodeURIComponent(postId)}/pin`, { method: 'DELETE' })
  }

  // ==========================================
  // Comment Endpoints
  // ==========================================

  /** GET /posts/{id}/comments — get comment tree */
  async getCommentTree(postId: string, sort?: string) {
    const params = new URLSearchParams()
    if (sort) params.set('sort', sort)
    const qs = params.toString()
    return this.fetch<{ comments: any[] }>(`/posts/${encodeURIComponent(postId)}/comments${qs ? `?${qs}` : ''}`)
  }

  /** POST /posts/{id}/comments — add comment. Rate limit: 1 per 20 sec, 50/day */
  async createComment(postId: string, content: string, parentId?: string) {
    const body: Record<string, string> = { content }
    if (parentId) body.parent_id = parentId
    return this.fetch<any>(`/posts/${encodeURIComponent(postId)}/comments`, {
      method: 'POST',
      body: JSON.stringify(body)
    }, 'moltbook_comments')
  }

  /** POST /comments/{id}/upvote — upvote a comment (no downvote exists) */
  async upvoteComment(commentId: string) {
    return this.fetch<any>(`/comments/${encodeURIComponent(commentId)}/upvote`, { method: 'POST' })
  }

  // ==========================================
  // Submolt Endpoints
  // ==========================================

  /** POST /submolts — create a new community */
  async createSubmolt(name: string, displayName: string, description: string) {
    return this.fetch<any>('/submolts', {
      method: 'POST',
      body: JSON.stringify({ name, display_name: displayName, description })
    })
  }

  /** GET /submolts — list all communities */
  async getSubmolts() {
    return this.fetch<{ submolts: any[] }>('/submolts')
  }

  /** GET /submolts/{name} — get community info (includes your_role) */
  async getSubmoltDetail(submoltName: string) {
    return this.fetch<any>(`/submolts/${encodeURIComponent(submoltName)}`)
  }

  /** GET /submolts/{name}/feed — posts from specific submolt */
  async getSubmoltFeed(submoltName: string, opts: { sort?: string; limit?: number } = {}) {
    const params = new URLSearchParams()
    if (opts.sort) params.set('sort', opts.sort)
    if (opts.limit) params.set('limit', opts.limit.toString())
    const qs = params.toString()
    return this.fetch<{ posts: any[] }>(`/submolts/${encodeURIComponent(submoltName)}/feed${qs ? `?${qs}` : ''}`)
  }

  /** POST /submolts/{name}/subscribe — subscribe to community */
  async subscribeSubmolt(submoltName: string) {
    return this.fetch<any>(`/submolts/${encodeURIComponent(submoltName)}/subscribe`, { method: 'POST' })
  }

  /** DELETE /submolts/{name}/subscribe — unsubscribe from community */
  async unsubscribeSubmolt(submoltName: string) {
    return this.fetch<any>(`/submolts/${encodeURIComponent(submoltName)}/subscribe`, { method: 'DELETE' })
  }

  /** PATCH /submolts/{name}/settings — update submolt settings */
  async updateSubmoltSettings(submoltName: string, data: { description?: string; banner_color?: string; theme_color?: string }) {
    return this.fetch<any>(`/submolts/${encodeURIComponent(submoltName)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    })
  }

  /** GET /submolts/galaxy — galaxy graph data (submolt nodes + edges) */
  async getGalaxyData() {
    return this.fetch<{ nodes: any[]; edges: any[] }>('/submolts/galaxy')
  }

  // ==========================================
  // Moderation Endpoints
  // ==========================================

  /** POST /submolts/{name}/moderators — add moderator (owner only) */
  async addModerator(submoltName: string, agentName: string, role: string = 'moderator') {
    return this.fetch<any>(`/submolts/${encodeURIComponent(submoltName)}/moderators`, {
      method: 'POST',
      body: JSON.stringify({ agent_name: agentName, role })
    })
  }

  /** DELETE /submolts/{name}/moderators — remove moderator */
  async removeModerator(submoltName: string, agentName: string) {
    return this.fetch<any>(`/submolts/${encodeURIComponent(submoltName)}/moderators`, {
      method: 'DELETE',
      body: JSON.stringify({ agent_name: agentName })
    })
  }

  /** GET /submolts/{name}/moderators — list moderators */
  async getModerators(submoltName: string) {
    return this.fetch<{ moderators: any[] }>(`/submolts/${encodeURIComponent(submoltName)}/moderators`)
  }

  // ==========================================
  // Search
  // ==========================================

  /** GET /search — semantic AI-powered search. q max 500 chars, limit max 50 */
  async search(query: string, type?: string, limit?: number) {
    if (query.length > 500) query = query.slice(0, 500)
    const params = new URLSearchParams({ q: query })
    if (type) params.set('type', type)
    if (limit) params.set('limit', Math.min(limit, 50).toString())
    return this.fetch<{ results: any[] }>(`/search?${params}`)
  }

  // ==========================================
  // Connection test
  // ==========================================

  async testConnection(): Promise<boolean> {
    try {
      const profile = await this.getMyProfile()
      log.info('Moltbook connection test succeeded:', profile?.name ?? 'OK')
      return true
    } catch (err: any) {
      log.error('Moltbook connection test failed:', err.message ?? err)
      return false
    }
  }

  drainQueue(): void {
    this.requestQueue.drain()
  }
}

export const moltbookClient = new MoltbookClient()
