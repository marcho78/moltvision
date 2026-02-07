import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { moltbookClient } from '../services/moltbook-api.service'
import { upsertPosts, upsertComments, upsertAgent, upsertSubmolt, getCachedPosts, getCachedPost, getCommentsByPost, getCachedAgents, getCachedSubmolts, searchPostsFTS, clearAllCaches } from '../db/queries/cache.queries'
import log from 'electron-log'

export function registerApiHandlers(): void {
  // --- Feed ---
  ipcMain.handle(IPC.FEED_LIST, async (_e, payload) => {
    try {
      const result = await moltbookClient.getFeed(payload)
      if (result.posts?.length) {
        const mapped = result.posts.map((p: any) => ({
          id: p.id, title: p.title, content: p.content,
          author_id: p.author?.id ?? p.author_id,
          author_username: p.author?.username ?? p.author_username,
          submolt_id: p.submolt?.id ?? p.submolt_id,
          submolt_name: p.submolt?.name ?? p.submolt_name,
          submolt_theme_color: p.submolt?.theme_color ?? p.submolt_theme_color ?? '#7c5cfc',
          karma: p.karma, comment_count: p.comment_count,
          our_vote: p.our_vote ?? 'none', is_own: p.is_own ?? false,
          created_at: p.created_at, updated_at: p.updated_at
        }))
        upsertPosts(mapped)
      }
      return result
    } catch (err) {
      log.error('Feed list error:', err)
      const cached = getCachedPosts({ submolt_id: payload?.submolt, limit: payload?.limit })
      return { posts: cached, next_cursor: null }
    }
  })

  ipcMain.handle(IPC.FEED_PERSONALIZED, async (_e, payload) => {
    try {
      return await moltbookClient.getPersonalizedFeed(payload)
    } catch (err) {
      log.error('Personalized feed error:', err)
      const cached = getCachedPosts({ limit: payload?.limit })
      return { posts: cached, next_cursor: null }
    }
  })

  ipcMain.handle(IPC.FEED_GET_POST, async (_e, payload) => {
    try {
      return await moltbookClient.getPost(payload.post_id)
    } catch {
      return getCachedPost(payload.post_id)
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
    try {
      return await moltbookClient.getCommentTree(payload.post_id, payload.sort)
    } catch {
      const cached = getCommentsByPost(payload.post_id)
      return { comments: cached }
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
      const result = await moltbookClient.getAgents(payload)
      result.agents?.forEach((a: any) => upsertAgent(a))
      return result
    } catch {
      return { agents: getCachedAgents(payload), next_cursor: null }
    }
  })

  ipcMain.handle(IPC.AGENTS_GET_PROFILE, async (_e, payload) => {
    return await moltbookClient.getAgentProfile(payload.agent_name)
  })

  ipcMain.handle(IPC.AGENTS_GET_MY_PROFILE, async () => {
    return await moltbookClient.getMyProfile()
  })

  ipcMain.handle(IPC.AGENTS_GET_NETWORK, async (_e, payload) => {
    return await moltbookClient.getAgentNetwork(payload?.agent_name, payload?.depth)
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
  ipcMain.handle(IPC.SUBMOLTS_LIST, async () => {
    try {
      const result = await moltbookClient.getSubmolts()
      result.submolts?.forEach((s: any) => upsertSubmolt(s))
      return result
    } catch {
      return { submolts: getCachedSubmolts() }
    }
  })

  ipcMain.handle(IPC.SUBMOLTS_GET_DETAIL, async (_e, payload) => {
    return await moltbookClient.getSubmoltDetail(payload.submolt_name)
  })

  ipcMain.handle(IPC.SUBMOLTS_GET_FEED, async (_e, payload) => {
    return await moltbookClient.getSubmoltFeed(payload.submolt_name, { sort: payload.sort, limit: payload.limit })
  })

  ipcMain.handle(IPC.SUBMOLTS_GET_GALAXY, async () => {
    return await moltbookClient.getGalaxyData()
  })

  ipcMain.handle(IPC.SUBMOLTS_CREATE, async (_e, payload) => {
    return await moltbookClient.createSubmolt(payload.name, payload.display_name, payload.description)
  })

  ipcMain.handle(IPC.SUBMOLTS_SUBSCRIBE, async (_e, payload) => {
    return await moltbookClient.subscribeSubmolt(payload.submolt_name)
  })

  ipcMain.handle(IPC.SUBMOLTS_UNSUBSCRIBE, async (_e, payload) => {
    return await moltbookClient.unsubscribeSubmolt(payload.submolt_name)
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

  // --- Search ---
  ipcMain.handle(IPC.SEARCH_EXECUTE, async (_e, payload) => {
    try {
      return await moltbookClient.search(payload.query, payload.type, payload.limit)
    } catch {
      // Fallback to local FTS
      const results = searchPostsFTS(payload.query, payload.limit)
      return { results: results.map((r: any) => ({ id: r.id, type: 'post', title: r.title, snippet: r.content.slice(0, 200), score: 1 })) }
    }
  })

  // --- Settings ---
  ipcMain.handle(IPC.SETTINGS_CLEAR_CACHE, async () => {
    clearAllCaches()
    return { success: true }
  })
}
