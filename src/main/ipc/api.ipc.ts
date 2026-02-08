import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { moltbookClient } from '../services/moltbook-api.service'
import { upsertPosts, upsertComments, upsertAgent, upsertSubmolt, getCachedPosts, getCachedPost, getCommentsByPost, getCachedAgents, getCachedSubmolts, searchPostsFTS, clearAllCaches, getAgentsFromPosts, getAgentSubmoltEdges, updateSubmoltSubscription, getSubscribedSubmoltNames, expireOldPosts, expireOldCaches, searchCachedSubmolts, getCachedSubmoltCount } from '../db/queries/cache.queries'
import log from 'electron-log'

// --- Submolt Cache Sync ---

let submoltSyncRunning = false
let submoltSyncAbort = false

async function syncSubmoltCache(mainWindow: BrowserWindow | null, force: boolean = false): Promise<void> {
  if (submoltSyncRunning) {
    log.info('Submolt cache sync already running, skipping')
    return
  }
  submoltSyncRunning = true
  submoltSyncAbort = false

  const sendStatus = (status: { syncing: boolean; cached: number; total: number; phase: string }) => {
    try { mainWindow?.webContents?.send(IPC.SUBMOLTS_CACHE_STATUS, status) } catch { /* window may be closed */ }
  }

  try {
    // Step 1: Check how many we have cached vs API total
    const cachedCount = getCachedSubmoltCount()
    log.info(`Submolt cache: ${cachedCount} cached locally`)

    // Fetch one page to get the API total count
    sendStatus({ syncing: true, cached: cachedCount, total: 0, phase: 'Checking for updates...' })
    const probe = await moltbookClient.getSubmolts({ limit: 1, offset: 0 })
    const apiTotal = (probe as any)?.count ?? 0
    log.info(`Submolt cache: API reports ${apiTotal} total submolts`)

    if (!force && cachedCount >= apiTotal && cachedCount > 0) {
      log.info('Submolt cache is up to date, no sync needed')
      sendStatus({ syncing: false, cached: cachedCount, total: apiTotal, phase: 'Up to date' })
      return
    }

    // Step 2: Calculate what needs fetching
    const PAGE_SIZE = 100
    const DELAY_MS = 1500 // ~40 req/min, leaves headroom

    let fetched = 0
    let offset = 0

    if (cachedCount > 0 && !force) {
      // Incremental: only fetch the new submolts (from end of list)
      // But since the API sorts by activity not creation, new submolts could be anywhere.
      // Strategy: fetch from offset 0 to upsert new + updated, stop when we encounter
      // a full page of already-cached submolts (all IDs exist).
      log.info(`Incremental sync: ${apiTotal - cachedCount} new submolts to find`)
    }

    const totalPages = Math.ceil(apiTotal / PAGE_SIZE)

    for (let page = 0; page < totalPages; page++) {
      if (submoltSyncAbort) {
        log.info('Submolt cache sync aborted by user')
        break
      }

      offset = page * PAGE_SIZE
      sendStatus({
        syncing: true,
        cached: getCachedSubmoltCount(),
        total: apiTotal,
        phase: `Fetching submolts... (${Math.min(offset + PAGE_SIZE, apiTotal)}/${apiTotal})`
      })

      try {
        const raw = await moltbookClient.getSubmolts({ limit: PAGE_SIZE, offset })
        const submolts: any[] = Array.isArray(raw) ? raw : (raw?.submolts ?? [])

        if (submolts.length === 0) break

        // Upsert all into cache
        for (const s of submolts) {
          try { upsertSubmolt(s) } catch { /* skip individual failures */ }
        }
        fetched += submolts.length

        // For incremental sync: if this is NOT a forced full sync and we had existing cache,
        // stop once we've fetched enough to cover the delta
        if (!force && cachedCount > 0) {
          const currentCached = getCachedSubmoltCount()
          if (currentCached >= apiTotal) {
            log.info(`Incremental sync complete: cached ${currentCached} of ${apiTotal}`)
            break
          }
        }
      } catch (err: any) {
        // Rate limit hit — wait and retry this page
        if (err.statusCode === 429) {
          log.warn('Rate limited during submolt sync, pausing 60s...')
          sendStatus({
            syncing: true,
            cached: getCachedSubmoltCount(),
            total: apiTotal,
            phase: 'Rate limited, pausing...'
          })
          await new Promise(r => setTimeout(r, 60000))
          page-- // Retry this page
          continue
        }
        log.error(`Submolt sync page error at offset ${offset}:`, err.message)
        // Continue to next page
      }

      // Delay between requests
      if (page < totalPages - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    }

    const finalCount = getCachedSubmoltCount()
    log.info(`Submolt cache sync complete: ${finalCount} cached (fetched ${fetched} this session)`)
    sendStatus({ syncing: false, cached: finalCount, total: apiTotal, phase: 'Up to date' })
  } catch (err: any) {
    log.error('Submolt cache sync error:', err.message)
    sendStatus({ syncing: false, cached: getCachedSubmoltCount(), total: 0, phase: `Error: ${err.message}` })
  } finally {
    submoltSyncRunning = false
  }
}

export function registerApiHandlers(mainWindow?: BrowserWindow | null): void {
  // --- Feed ---
  ipcMain.handle(IPC.FEED_LIST, async (_e, payload) => {
    try {
      const raw = await moltbookClient.getFeed(payload)
      log.info('Feed raw response type:', typeof raw, Array.isArray(raw) ? 'array' : 'object', 'keys:', raw ? Object.keys(raw) : 'null',
        'has_more:', (raw as any)?.has_more, 'next_offset:', (raw as any)?.next_offset, 'count:', (raw as any)?.count)

      // Normalize: API may return {posts: [...]} or [...] directly
      const posts: any[] = Array.isArray(raw) ? raw : (raw?.posts ?? [])

      if (posts.length > 0) {
        log.info('First post keys:', Object.keys(posts[0]))
        log.info('First post author field:', JSON.stringify(posts[0].author), 'author_id:', posts[0].author_id, 'author_name:', posts[0].author_name, 'author_username:', posts[0].author_username)
      }

      // Cache with flat fields
      // API returns author: { id: "uuid", name: "display_name" } and submolt: { name: "...", display_name: "..." }
      // author_id = UUID for dedup, author_username = human-readable name for display
      // Karma is computed from upvotes - downvotes
      const mapped = posts.map((p: any) => ({
        id: p.id ?? p.post_id, title: p.title, content: p.content ?? p.body ?? '',
        author_id: p.author?.id ?? p.author_id ?? p.author?.name ?? (typeof p.author === 'string' ? p.author : ''),
        author_username: p.author?.name ?? p.author?.username ?? p.author_name ?? p.author_username ?? (typeof p.author === 'string' ? p.author : ''),
        submolt_id: p.submolt?.name ?? p.submolt?.id ?? p.submolt_id ?? (typeof p.submolt === 'string' ? p.submolt : ''),
        submolt_name: p.submolt?.display_name ?? p.submolt?.name ?? p.submolt_name ?? (typeof p.submolt === 'string' ? p.submolt : ''),
        submolt_theme_color: p.submolt?.theme_color ?? p.submolt_theme_color ?? '#7c5cfc',
        karma: p.karma ?? (p.upvotes ?? 0) - (p.downvotes ?? 0),
        comment_count: p.comment_count ?? p.comments_count ?? 0,
        our_vote: p.our_vote ?? 'none', is_own: p.is_own ?? false,
        created_at: p.created_at, updated_at: p.updated_at ?? p.created_at
      }))
      if (mapped.length) {
        upsertPosts(mapped)
        // Purge posts cached more than 3 days ago so stale data doesn't accumulate
        const expired = expireOldPosts(3)
        if (expired > 0) log.info(`Expired ${expired} old cached posts`)
      }

      // Return with nested objects that match the Post interface
      const normalized = mapped.map((p: any) => ({
        id: p.id, title: p.title, content: p.content,
        author: { id: p.author_id, username: p.author_username },
        submolt: { id: p.submolt_id, name: p.submolt_name, theme_color: p.submolt_theme_color },
        karma: p.karma, comment_count: p.comment_count,
        our_vote: p.our_vote, is_own: p.is_own,
        created_at: p.created_at, updated_at: p.updated_at
      }))

      return { posts: normalized, next_offset: raw?.next_offset ?? null, has_more: raw?.has_more ?? false }
    } catch (err) {
      log.error('Feed list error:', err)
      const cached = getCachedPosts({ submolt_id: payload?.submolt, limit: payload?.limit })
      // Normalize cached flat rows into Post-shaped objects
      const posts = cached.map((p: any) => ({
        id: p.id, title: p.title, content: p.content,
        author: { id: p.author_id, username: p.author_username },
        submolt: { id: p.submolt_id, name: p.submolt_name, theme_color: p.submolt_theme_color },
        karma: p.karma, comment_count: p.comment_count,
        our_vote: p.our_vote ?? 'none', is_own: !!p.is_own,
        created_at: p.created_at, updated_at: p.updated_at
      }))
      return { posts, next_offset: null, has_more: false }
    }
  })

  ipcMain.handle(IPC.FEED_PERSONALIZED, async (_e, payload) => {
    try {
      const raw = await moltbookClient.getPersonalizedFeed(payload)
      const posts: any[] = Array.isArray(raw) ? raw : (raw?.posts ?? [])
      const normalized = posts.map((p: any) => ({
        id: p.id, title: p.title, content: p.content ?? p.body ?? '',
        author: { id: p.author?.id ?? p.author_id ?? p.author?.name ?? '', username: p.author?.name ?? p.author?.username ?? p.author_name ?? p.author_username ?? (typeof p.author === 'string' ? p.author : '') },
        submolt: { id: p.submolt?.name ?? p.submolt?.id ?? p.submolt_id ?? '', name: p.submolt?.display_name ?? p.submolt?.name ?? p.submolt_name ?? (typeof p.submolt === 'string' ? p.submolt : ''), theme_color: p.submolt?.theme_color ?? '#7c5cfc' },
        karma: p.karma ?? (p.upvotes ?? 0) - (p.downvotes ?? 0),
        comment_count: p.comment_count ?? p.comments_count ?? 0,
        our_vote: p.our_vote ?? 'none', is_own: p.is_own ?? false,
        created_at: p.created_at, updated_at: p.updated_at ?? p.created_at
      }))
      return { posts: normalized, next_offset: raw?.next_offset ?? null, has_more: raw?.has_more ?? false }
    } catch (err) {
      log.error('Personalized feed error:', err)
      const cached = getCachedPosts({ limit: payload?.limit })
      const posts = cached.map((p: any) => ({
        id: p.id, title: p.title, content: p.content,
        author: { id: p.author_id, username: p.author_username },
        submolt: { id: p.submolt_id, name: p.submolt_name, theme_color: p.submolt_theme_color },
        karma: p.karma, comment_count: p.comment_count,
        our_vote: p.our_vote ?? 'none', is_own: !!p.is_own,
        created_at: p.created_at, updated_at: p.updated_at
      }))
      return { posts, next_offset: null, has_more: false }
    }
  })

  ipcMain.handle(IPC.FEED_GET_POST, async (_e, payload) => {
    const normalizePost = (p: any) => ({
      id: p.id, title: p.title, content: p.content ?? p.body ?? '',
      author: { id: p.author?.id ?? p.author_id ?? '', username: p.author?.name ?? p.author?.username ?? p.author_name ?? (typeof p.author === 'string' ? p.author : '') },
      submolt: { id: p.submolt?.name ?? p.submolt?.id ?? p.submolt_id ?? '', name: p.submolt?.display_name ?? p.submolt?.name ?? p.submolt_name ?? (typeof p.submolt === 'string' ? p.submolt : ''), theme_color: p.submolt?.theme_color ?? '#7c5cfc' },
      karma: p.karma ?? (p.upvotes ?? 0) - (p.downvotes ?? 0),
      comment_count: p.comment_count ?? p.comments_count ?? 0,
      our_vote: p.our_vote ?? 'none', is_own: p.is_own ?? false,
      created_at: p.created_at, updated_at: p.updated_at ?? p.created_at
    })
    try {
      const raw = await moltbookClient.getPost(payload.post_id)
      return normalizePost(raw)
    } catch {
      const cached = getCachedPost(payload.post_id)
      return cached ? normalizePost(cached) : null
    }
  })

  ipcMain.handle(IPC.FEED_CREATE_POST, async (_e, payload) => {
    return await moltbookClient.createPost(payload.submolt, payload.title, payload.content, payload.url)
  })

  ipcMain.handle(IPC.FEED_DELETE_POST, async (_e, payload) => {
    return await moltbookClient.deletePost(payload.post_id)
  })

  ipcMain.handle(IPC.FEED_UPVOTE, async (_e, payload) => {
    return await moltbookClient.upvotePost(payload.post_id)
  })

  ipcMain.handle(IPC.FEED_DOWNVOTE, async (_e, payload) => {
    return await moltbookClient.downvotePost(payload.post_id)
  })

  // --- Comments ---
  ipcMain.handle(IPC.COMMENTS_GET_TREE, async (_e, payload) => {
    // Recursively normalize comment author fields so raw API objects never reach React
    const normalizeComment = (c: any): any => ({
      ...c,
      author: typeof c.author === 'object' && c.author !== null
        ? { id: c.author.id ?? '', username: c.author.name ?? c.author.username ?? '' }
        : { id: '', username: typeof c.author === 'string' ? c.author : '' },
      children: Array.isArray(c.children) ? c.children.map(normalizeComment) : []
    })
    try {
      const raw = await moltbookClient.getCommentTree(payload.post_id, payload.sort)
      const comments = Array.isArray(raw?.comments) ? raw.comments.map(normalizeComment)
        : Array.isArray(raw) ? raw.map(normalizeComment) : []
      return { comments }
    } catch {
      const cached = getCommentsByPost(payload.post_id)
      return { comments: Array.isArray(cached) ? cached.map(normalizeComment) : [] }
    }
  })

  ipcMain.handle(IPC.COMMENTS_CREATE, async (_e, payload) => {
    return await moltbookClient.createComment(payload.post_id, payload.content, payload.parent_id)
  })

  ipcMain.handle(IPC.COMMENTS_UPVOTE, async (_e, payload) => {
    return await moltbookClient.upvoteComment(payload.comment_id)
  })

  // --- Agents ---
  ipcMain.handle(IPC.AGENTS_LIST, async (_e, payload) => {
    try {
      const raw = await moltbookClient.getAgents(payload)
      log.info('Agents raw response type:', typeof raw, Array.isArray(raw) ? 'array' : 'object', 'keys:', raw ? Object.keys(raw) : 'null')
      const agents: any[] = Array.isArray(raw) ? raw : (raw?.agents ?? raw?.data ?? [])
      if (agents.length > 0) log.info('First agent keys:', Object.keys(agents[0]))
      try { agents.forEach((a: any) => upsertAgent(a)) } catch (cacheErr: any) {
        log.warn('Agent cache upsert failed (non-fatal):', cacheErr.message)
      }
      return { agents, next_cursor: raw?.next_cursor ?? null }
    } catch (err: any) {
      log.info('Agents list endpoint not available, building from posts:', err.message)
      // Fall back: extract unique agents from cached posts
      const fromPosts = getAgentsFromPosts()
      if (fromPosts.length > 0) {
        log.info(`Built ${fromPosts.length} agents from cached posts`)
        return { agents: fromPosts, next_cursor: null }
      }
      return { agents: getCachedAgents(payload), next_cursor: null }
    }
  })

  ipcMain.handle(IPC.AGENTS_GET_PROFILE, async (_e, payload) => {
    return await moltbookClient.getAgentProfile(payload.agent_name)
  })

  ipcMain.handle(IPC.AGENTS_GET_MY_PROFILE, async () => {
    return await moltbookClient.getMyProfile()
  })

  ipcMain.handle(IPC.AGENTS_GET_NETWORK, async (_e, _payload) => {
    try {
      // Try the real endpoint first
      return await moltbookClient.getAgentNetwork(_payload?.agent_name, _payload?.depth)
    } catch {
      // Build network from cached post data
      const agents = getAgentsFromPosts()
      const edges = getAgentSubmoltEdges()
      log.info(`Built agent network from posts: ${agents.length} nodes, ${edges.length} edges`)
      if (agents.length > 0) log.info('First agent from posts:', JSON.stringify(agents[0]))
      const nodes = agents.map((a: any) => ({
        id: a.id ?? a.name ?? a.username,
        username: a.username ?? a.name ?? '',
        display_name: a.display_name ?? a.username ?? a.name ?? '',
        avatar_url: a.avatar_url ?? null,
        karma: a.karma ?? 0,
        post_count: a.post_count ?? 0,
        active_submolts: a.active_submolts ?? '',
        is_following: false
      }))
      const networkEdges = edges.map((e: any) => ({
        source: e.source,
        target: e.target,
        shared_submolt: e.shared_submolt,
        direction: 'mutual'
      }))
      return { nodes, edges: networkEdges }
    }
  })

  ipcMain.handle(IPC.AGENTS_FOLLOW, async (_e, payload) => {
    return await moltbookClient.followAgent(payload.agent_name)
  })

  ipcMain.handle(IPC.AGENTS_UNFOLLOW, async (_e, payload) => {
    return await moltbookClient.unfollowAgent(payload.agent_name)
  })

  ipcMain.handle(IPC.AGENTS_REGISTER, async (_e, payload) => {
    return await moltbookClient.register(payload.name, payload.description)
  })

  ipcMain.handle(IPC.AGENTS_UPDATE_PROFILE, async (_e, payload) => {
    return await moltbookClient.updateProfile(payload)
  })

  // --- Submolts ---
  // General submolt list — returns ALL cached submolts (preserves subscriptions)
  ipcMain.handle(IPC.SUBMOLTS_LIST, async () => {
    try {
      const raw = await moltbookClient.getSubmolts({ limit: 100 })
      const submolts: any[] = Array.isArray(raw) ? raw : (raw?.submolts ?? [])
      const apiTotal = (raw as any)?.count ?? submolts.length
      try { submolts.forEach((s: any) => upsertSubmolt(s)) } catch (cacheErr: any) {
        log.warn('Submolt cache upsert failed (non-fatal):', cacheErr.message)
      }
      const merged = getCachedSubmolts()
      return { submolts: merged, api_total: apiTotal }
    } catch (err: any) {
      log.error('Submolts list error:', err.message ?? err)
      return { submolts: getCachedSubmolts(), api_total: null }
    }
  })

  // Paginated submolt fetch — for galaxy map browsing (single API call per page)
  ipcMain.handle(IPC.SUBMOLTS_GET_PAGE, async (_e, payload) => {
    const limit = payload?.limit ?? 500
    const offset = payload?.offset ?? 0
    try {
      const raw = await moltbookClient.getSubmolts({ limit, offset })
      const submolts: any[] = Array.isArray(raw) ? raw : (raw?.submolts ?? [])
      const apiTotal = (raw as any)?.count ?? submolts.length
      log.info(`Submolts page: offset=${offset}, limit=${limit}, got=${submolts.length}, API total=${apiTotal}`)
      try { submolts.forEach((s: any) => upsertSubmolt(s)) } catch (cacheErr: any) {
        log.warn('Submolt cache upsert failed (non-fatal):', cacheErr.message)
      }
      // Merge subscription state from user_subscriptions table
      const subscribedNames = new Set(getSubscribedSubmoltNames())
      const merged = submolts.map((s: any) => ({
        ...s,
        is_subscribed: subscribedNames.has(s.name)
      }))
      const hasMore = (offset + submolts.length) < apiTotal
      return { submolts: merged, api_total: apiTotal, has_more: hasMore, next_offset: offset + submolts.length }
    } catch (err: any) {
      log.error('Submolts page error:', err.message ?? err)
      const cached = getCachedSubmolts()
      return { submolts: cached, api_total: cached.length, has_more: false, next_offset: 0 }
    }
  })

  ipcMain.handle(IPC.SUBMOLTS_GET_DETAIL, async (_e, payload) => {
    const detail = await moltbookClient.getSubmoltDetail(payload.submolt_name)
    // Cache with role so owned/moderated submolts survive restarts
    if (detail?.your_role) {
      try { upsertSubmolt(detail) } catch (err: any) {
        log.warn('Failed to cache submolt detail:', err.message)
      }
    }
    return detail
  })

  ipcMain.handle(IPC.SUBMOLTS_GET_FEED, async (_e, payload) => {
    const raw = await moltbookClient.getSubmoltFeed(payload.submolt_name, { sort: payload.sort, limit: payload.limit })
    const posts: any[] = Array.isArray(raw) ? raw : (raw?.posts ?? [])
    const normalized = posts.map((p: any) => ({
      id: p.id, title: p.title, content: p.content ?? p.body ?? '',
      author: { id: p.author?.id ?? p.author?.name ?? '', username: p.author?.name ?? p.author?.username ?? (typeof p.author === 'string' ? p.author : '') },
      submolt: { id: p.submolt?.name ?? p.submolt?.id ?? (typeof p.submolt === 'string' ? p.submolt : ''), name: p.submolt?.display_name ?? p.submolt?.name ?? (typeof p.submolt === 'string' ? p.submolt : ''), theme_color: p.submolt?.theme_color ?? '#7c5cfc' },
      karma: p.karma ?? (p.upvotes ?? 0) - (p.downvotes ?? 0),
      comment_count: p.comment_count ?? p.comments_count ?? 0,
      our_vote: p.our_vote ?? 'none', is_own: p.is_own ?? false,
      created_at: p.created_at, updated_at: p.updated_at ?? p.created_at
    }))
    return { posts: normalized, next_offset: raw?.next_offset ?? null, has_more: raw?.has_more ?? false }
  })

  ipcMain.handle(IPC.SUBMOLTS_GET_GALAXY, async () => {
    try {
      return await moltbookClient.getGalaxyData()
    } catch (err: any) {
      log.info('Galaxy endpoint not available:', err.message)
      throw err // Let renderer fallback to SUBMOLTS_LIST
    }
  })

  ipcMain.handle(IPC.SUBMOLTS_CREATE, async (_e, payload) => {
    const result = await moltbookClient.createSubmolt(payload.name, payload.display_name, payload.description)
    // Cache locally with owner role so it survives restarts
    try {
      upsertSubmolt({
        id: result?.id ?? payload.name,
        name: payload.name,
        display_name: payload.display_name ?? payload.name,
        description: payload.description ?? '',
        your_role: 'owner'
      })
    } catch (err: any) {
      log.warn('Failed to cache created submolt:', err.message)
    }
    return result
  })

  ipcMain.handle(IPC.SUBMOLTS_SUBSCRIBE, async (_e, payload) => {
    // Save to DB FIRST so it persists even if API fails
    try { updateSubmoltSubscription(payload.submolt_name, true) } catch (dbErr: any) {
      log.error('Failed to save subscription to DB:', dbErr.message)
    }
    try {
      return await moltbookClient.subscribeSubmolt(payload.submolt_name)
    } catch (apiErr: any) {
      log.warn('API subscribe failed (subscription saved locally):', apiErr.message)
      return { success: true, local_only: true }
    }
  })

  ipcMain.handle(IPC.SUBMOLTS_UNSUBSCRIBE, async (_e, payload) => {
    // Save to DB FIRST so it persists even if API fails
    try { updateSubmoltSubscription(payload.submolt_name, false) } catch (dbErr: any) {
      log.error('Failed to save unsubscription to DB:', dbErr.message)
    }
    try {
      return await moltbookClient.unsubscribeSubmolt(payload.submolt_name)
    } catch (apiErr: any) {
      log.warn('API unsubscribe failed (unsubscription saved locally):', apiErr.message)
      return { success: true, local_only: true }
    }
  })

  ipcMain.handle(IPC.SUBMOLTS_UPDATE_SETTINGS, async (_e, payload) => {
    const { submolt_name, ...data } = payload
    return await moltbookClient.updateSubmoltSettings(submolt_name, data)
  })

  // --- Moderation ---
  ipcMain.handle(IPC.MOD_PIN, async (_e, payload) => {
    return await moltbookClient.pinPost(payload.post_id)
  })

  ipcMain.handle(IPC.MOD_UNPIN, async (_e, payload) => {
    return await moltbookClient.unpinPost(payload.post_id)
  })

  ipcMain.handle(IPC.MOD_ADD_MOD, async (_e, payload) => {
    return await moltbookClient.addModerator(payload.submolt_name, payload.agent_name, payload.role)
  })

  ipcMain.handle(IPC.MOD_REMOVE_MOD, async (_e, payload) => {
    return await moltbookClient.removeModerator(payload.submolt_name, payload.agent_name)
  })

  ipcMain.handle(IPC.MOD_GET_MODS, async (_e, payload) => {
    return await moltbookClient.getModerators(payload.submolt_name)
  })

  // --- Submolt Cache ---
  ipcMain.handle(IPC.SUBMOLTS_CACHE_SYNC, async (_e, payload) => {
    const force = payload?.force ?? false
    // Run sync in background (don't await — return immediately)
    syncSubmoltCache(mainWindow ?? null, force).catch(err => {
      log.error('Background submolt sync failed:', err.message)
    })
    return { started: true }
  })

  ipcMain.handle(IPC.SUBMOLTS_SEARCH_CACHED, async (_e, payload) => {
    const keyword = payload?.keyword ?? ''
    const limit = payload?.limit ?? 20
    const totalCached = getCachedSubmoltCount()
    if (!keyword.trim()) {
      // Return top submolts by subscriber count when no keyword
      return { submolts: getCachedSubmolts().slice(0, limit), total_cached: totalCached, syncing: submoltSyncRunning }
    }
    return { submolts: searchCachedSubmolts(keyword, limit), total_cached: totalCached, syncing: submoltSyncRunning }
  })

  // --- Search ---
  ipcMain.handle(IPC.SEARCH_EXECUTE, async (_e, payload) => {
    try {
      const raw = await moltbookClient.search(payload.query, {
        type: payload.type,
        limit: payload.limit,
        cursor: payload.cursor,
        author: payload.author,
        submolt: payload.submolt
      })
      const stripMarks = (s: string) => s.replace(/<\/?mark>/g, '')
      const rawResults = raw?.results ?? []
      // Normalize relevance to 0-1 relative to max in this batch
      // For paginated results, use maxRelevance from first page if provided
      const batchMax = rawResults.reduce((max: number, r: any) => Math.max(max, r.relevance ?? r.similarity ?? 0), 0) || 1
      const maxRelevance = payload.maxRelevance ?? batchMax
      const results = rawResults.map((r: any) => {
        const rawScore = r.relevance ?? r.similarity ?? r.score ?? 0
        return {
          id: r.id,
          type: r.type ?? 'post',
          title: stripMarks(r.title ?? r.content?.slice(0, 80) ?? ''),
          snippet: stripMarks(r.content?.slice(0, 200) ?? ''),
          score: Math.min(rawScore / maxRelevance, 1),
          author: r.author?.name ?? '',
          submolt: r.submolt?.display_name ?? r.submolt?.name ?? '',
          post_id: r.post_id ?? r.id,
          upvotes: r.upvotes ?? 0,
          downvotes: r.downvotes ?? 0,
          created_at: r.created_at ?? ''
        }
      })
      return {
        results,
        next_cursor: raw?.next_cursor ?? null,
        has_more: raw?.has_more ?? false,
        maxRelevance
      }
    } catch (err: any) {
      log.error('Search error:', err.message ?? err)
      try {
        const results = searchPostsFTS(payload.query, payload.limit)
        return { results: results.map((r: any) => ({ id: r.id, type: 'post', title: r.title, snippet: r.content?.slice(0, 200) ?? '', score: 1 })), next_cursor: null, has_more: false, maxRelevance: 1 }
      } catch {
        return { results: [], next_cursor: null, has_more: false, maxRelevance: 1 }
      }
    }
  })

  // --- Settings ---
  ipcMain.handle(IPC.SETTINGS_CLEAR_CACHE, async () => {
    clearAllCaches()
    return { success: true }
  })
}
