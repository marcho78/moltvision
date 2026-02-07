import { EventEmitter } from 'events'
import log from 'electron-log'
import type { OperationMode, ActionPayload, AutopilotStatus, AgentPersona, EngagementRules } from '../../shared/domain.types'
import { llmManager } from './llm.service'
import { moltbookClient } from './moltbook-api.service'
import { enqueueAction, getNextApproved, updateActionStatus, rejectAllPending, countActionsInPeriod, countActionsTodayTotal } from '../db/queries/queue.queries'
import { logActivity } from '../db/queries/analytics.queries'
import { queryOne, run } from '../db/index'
import {
  recordEngagement, hasEngaged, countEngagementsInPeriod, countRepliesInThread,
  addToReplyInbox, getUnrespondedReplies, markReplyResponded, getRecentAgentPostIds
} from '../db/queries/engagement.queries'

interface Evaluation {
  verdict: 'engage' | 'skip'
  reasoning: string
  action: 'comment' | 'upvote' | 'downvote' | 'create_post'
  priority: number
}

export class AutopilotService extends EventEmitter {
  private mode: OperationMode = 'off'
  private isRunning = false
  private scanTimer: ReturnType<typeof setInterval> | null = null
  private emergencyStopped = false
  private abortController: AbortController | null = null
  private lastScanAt: string | null = null
  private activePersonaId: string = 'default'

  // Schedule defaults — overridden by persona engagement_rules each cycle
  private scanInterval = 60000
  private cooldownMs = 5000

  getStatus(): AutopilotStatus {
    return {
      mode: this.mode,
      is_running: this.isRunning,
      last_scan_at: this.lastScanAt,
      actions_this_hour: countActionsInPeriod(1),
      actions_today: countActionsTodayTotal(),
      next_scan_at: this.scanTimer ? new Date(Date.now() + this.scanInterval).toISOString() : null,
      emergency_stopped: this.emergencyStopped
    }
  }

  getActivePersonaId(): string {
    return this.activePersonaId
  }

  setActivePersona(personaId: string): void {
    this.activePersonaId = personaId
    // Persist to DB so it survives restart
    try {
      run(`UPDATE user_preferences SET active_persona_id = ? WHERE id = 1`, [personaId])
    } catch (err) {
      log.warn('Failed to persist active persona:', (err as Error).message)
    }
    log.info(`Autopilot persona set to: ${personaId}`)
  }

  /** Load persisted persona ID from DB (call after DB init) */
  loadPersistedPersona(): void {
    try {
      const row = queryOne<{ active_persona_id: string }>('SELECT active_persona_id FROM user_preferences WHERE id = 1')
      if (row?.active_persona_id) {
        this.activePersonaId = row.active_persona_id
        log.info(`Loaded persisted persona: ${this.activePersonaId}`)
      }
    } catch (err) {
      log.warn('Failed to load persisted persona:', (err as Error).message)
    }
  }

  setMode(mode: OperationMode): void {
    if (this.emergencyStopped && mode !== 'off') {
      throw new Error('Emergency stop active. Reset before changing mode.')
    }
    this.mode = mode
    log.info(`Autopilot mode set to: ${mode}`)

    if (mode === 'off') {
      this.stop()
    } else {
      // Both autopilot and semi-auto scan for posts.
      // Autopilot executes immediately; semi-auto queues for user approval.
      this.start()
    }

    this.emit('mode:changed', mode)
  }

  private start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.abortController = new AbortController()
    this.scanTimer = setInterval(() => this.runScanCycle(), this.scanInterval)
    // Run first cycle immediately
    this.runScanCycle()
    log.info('Autopilot started')
    this.emit('cycle:start')
  }

  private stop(): void {
    this.isRunning = false
    this.stopTimer()
    log.info('Autopilot stopped')
  }

  private stopTimer(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer)
      this.scanTimer = null
    }
  }

  // --- Persona Loading ---

  private loadPersona(): AgentPersona {
    const row = queryOne<any>(
      `SELECT * FROM agent_persona WHERE id = ? OR id = 'default' ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END LIMIT 1`,
      [this.activePersonaId, this.activePersonaId]
    )
    if (!row) {
      // Return safe defaults if nothing in DB
      return {
        id: 'default',
        name: 'MoltVision Agent',
        description: '',
        tone_settings: { style: 'friendly', temperature: 0.7, max_length: 500 },
        interest_tags: [],
        engagement_rules: {
          engagement_rate: 0.3, min_karma_threshold: 0, reply_to_replies: true,
          avoid_controversial: false, max_posts_per_hour: 2, max_comments_per_hour: 10,
          max_reply_depth: 3, max_replies_per_thread: 2
        },
        submolt_priorities: {},
        system_prompt: 'You are a helpful and engaging AI agent participating in Moltbook discussions.',
        llm_provider: 'claude',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    }
    return {
      ...row,
      tone_settings: JSON.parse(row.tone_settings),
      interest_tags: JSON.parse(row.interest_tags),
      engagement_rules: { max_reply_depth: 3, max_replies_per_thread: 2, ...JSON.parse(row.engagement_rules) },
      submolt_priorities: JSON.parse(row.submolt_priorities),
      llm_provider: row.llm_provider ?? 'claude'
    }
  }

  // --- Main Scan Cycle ---

  async runScanCycle(): Promise<void> {
    if (this.emergencyStopped) return

    const persona = this.loadPersona()
    const rules = persona.engagement_rules as EngagementRules & { max_reply_depth?: number; max_replies_per_thread?: number }

    // Check limits from persona
    const postsThisHour = countEngagementsInPeriod(1, 'create_post')
    const commentsThisHour = countEngagementsInPeriod(1, 'create_comment') + countEngagementsInPeriod(1, 'reply')

    if (postsThisHour >= rules.max_posts_per_hour && commentsThisHour >= rules.max_comments_per_hour) {
      log.info(`Persona rate limits reached: ${postsThisHour} posts/h, ${commentsThisHour} comments/h`)
      this.emit('limit:reached', { type: 'persona', postsThisHour, commentsThisHour })
      return
    }

    // Also check global queue-based limits
    const actionsToday = countActionsTodayTotal()
    if (actionsToday >= 100) {
      log.info('Daily action limit reached (100)')
      this.emit('limit:reached', { type: 'daily', count: actionsToday })
      return
    }

    try {
      log.info(`Starting scan cycle with persona "${persona.name}" (${persona.id})`)
      this.lastScanAt = new Date().toISOString()
      this.emit('scan:progress', { phase: 'start', message: `Scan started with persona "${persona.name}"` })

      // --- Gather posts from multiple sources ---
      const allPosts: any[] = []
      const seenIds = new Set<string>()

      const addPosts = (posts: any[]) => {
        for (const p of posts) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id)
            allPosts.push(p)
          }
        }
      }

      // 1. Personalized feed
      this.emit('scan:progress', { phase: 'feed', message: 'Fetching personalized feed...' })
      try {
        const feed = await moltbookClient.getPersonalizedFeed({ sort: 'hot', limit: 20 })
        addPosts(feed.posts ?? [])
        this.emit('scan:progress', { phase: 'feed', message: `Got ${feed.posts?.length ?? 0} posts from feed` })
      } catch (err) {
        log.warn('Failed to fetch personalized feed:', (err as Error).message)
      }

      // 2. Top priority submolt feeds (max 3 to stay within rate limits)
      const prioritySubmolts = Object.entries(persona.submolt_priorities)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3)

      for (const [submoltName] of prioritySubmolts) {
        if (this.emergencyStopped) break
        this.emit('scan:progress', { phase: 'submolt', message: `Scanning m/${submoltName}...` })
        try {
          const feed = await moltbookClient.getSubmoltFeed(submoltName, { sort: 'hot', limit: 10 })
          addPosts(feed.posts ?? [])
          await this.delay(200) // Brief pause between requests
        } catch (err) {
          log.warn(`Failed to fetch submolt feed for ${submoltName}:`, (err as Error).message)
        }
      }

      // 3. Interest tag searches (max 3)
      const searchTags = persona.interest_tags.slice(0, 3)
      for (const tag of searchTags) {
        if (this.emergencyStopped) break
        try {
          const results = await moltbookClient.search(tag, { type: 'post', limit: 10 })
          // Search results have a different shape — normalize to post-like objects
          if (Array.isArray(results?.results)) {
            for (const r of results.results) {
              if (r.type === 'post' && r.post_id && !seenIds.has(r.post_id)) {
                seenIds.add(r.post_id)
                allPosts.push({
                  id: r.post_id ?? r.id,
                  title: r.title,
                  content: r.snippet,
                  submolt: { name: r.submolt ?? 'unknown' },
                  karma: r.upvotes ?? 0,
                  comment_count: 0
                })
              }
            }
          }
          await this.delay(200)
        } catch (err) {
          log.warn(`Failed to search for tag "${tag}":`, (err as Error).message)
        }
      }

      // --- Filter out already-engaged posts ---
      const candidatePosts = allPosts.filter(p => !hasEngaged(p.id))

      // --- Apply engagement_rate probability gate ---
      const filteredPosts = candidatePosts.filter(() => Math.random() < rules.engagement_rate)

      // --- Apply min_karma_threshold ---
      const eligiblePosts = filteredPosts.filter(p => (p.karma ?? 0) >= rules.min_karma_threshold)

      log.info(`Scan found ${allPosts.length} posts, ${candidatePosts.length} new, ${eligiblePosts.length} eligible after filters`)
      this.emit('scan:progress', { phase: 'evaluate', message: `Found ${allPosts.length} posts, ${eligiblePosts.length} eligible — evaluating...` })

      // --- Evaluate and act on eligible posts ---
      for (const post of eligiblePosts) {
        if (this.emergencyStopped) break

        // Recheck limits each iteration
        const currentPosts = countEngagementsInPeriod(1, 'create_post')
        const currentComments = countEngagementsInPeriod(1, 'create_comment') + countEngagementsInPeriod(1, 'reply')
        if (currentPosts >= rules.max_posts_per_hour && currentComments >= rules.max_comments_per_hour) break

        const evaluation = await this.evaluatePost(post, persona)
        if (!evaluation || evaluation.verdict === 'skip') continue

        // Skip if already engaged with this specific action type
        if (hasEngaged(post.id, evaluation.action)) continue

        const action = await this.planAction(post, evaluation, persona)
        if (!action) continue

        if (this.mode === 'autopilot') {
          const actionId = enqueueAction({
            payload: action,
            reasoning: evaluation.reasoning,
            priority: evaluation.priority
          })
          updateActionStatus(actionId, 'approved')
          await this.executeAction(actionId, action, persona.id, evaluation.reasoning)
          await this.delay(this.cooldownMs)
        } else {
          // Semi-auto: queue for approval
          enqueueAction({
            payload: action,
            reasoning: evaluation.reasoning,
            priority: evaluation.priority
          })
        }
      }

      // --- Content origination: create original posts in priority submolts ---
      await this.considerCreatingPost(persona, rules)

      // --- Check for replies to agent's content ---
      if (rules.reply_to_replies) {
        await this.checkForReplies(persona)
      }

      this.emit('scan:progress', { phase: 'done', message: 'Scan cycle complete' })
      this.emit('cycle:end')
    } catch (err) {
      log.error('Scan cycle error:', err)
      this.emit('scan:progress', { phase: 'error', message: `Scan failed: ${(err as Error).message}` })
      logActivity({
        activity_type: 'scan_error',
        summary: `Scan cycle failed: ${(err as Error).message}`,
        level: 'error'
      })
    }
  }

  // --- Post Evaluation (persona-driven) ---

  private async evaluatePost(post: any, persona: AgentPersona): Promise<Evaluation | null> {
    try {
      const controversialClause = persona.engagement_rules.avoid_controversial
        ? '\nIMPORTANT: AVOID controversial, heated, or politically sensitive topics. If this post is controversial, verdict MUST be "skip".'
        : ''

      const response = await llmManager.chat({
        messages: [
          {
            role: 'system',
            content: `${persona.system_prompt}\n\nYou are evaluating whether to engage with this post on Moltbook (an AI social network). Your interests: ${persona.interest_tags.join(', ') || 'general'}. Your style: ${persona.tone_settings.style}.${controversialClause}\n\nRespond with JSON only: {"verdict":"engage"|"skip","reasoning":"...","action":"comment"|"upvote"|"downvote","priority":0-10}`
          },
          {
            role: 'user',
            content: `Post in m/${post.submolt?.name ?? post.submolt_name ?? 'unknown'}:\nTitle: ${post.title}\nContent: ${post.content ?? ''}\nKarma: ${post.karma ?? 0}\nComments: ${post.comment_count ?? 0}`
          }
        ],
        temperature: 0.3,
        max_tokens: 200,
        json_mode: true,
        provider: persona.llm_provider
      })
      return JSON.parse(response.content) as Evaluation
    } catch (err) {
      log.error('Post evaluation error:', err)
      return null
    }
  }

  // --- Reply Evaluation ---

  private async evaluateReply(reply: any, persona: AgentPersona): Promise<{ should_reply: boolean; reasoning: string }> {
    const rules = persona.engagement_rules as EngagementRules & { max_reply_depth?: number; max_replies_per_thread?: number }
    if (!rules.reply_to_replies) return { should_reply: false, reasoning: 'reply_to_replies disabled' }
    if ((reply.depth ?? 0) >= (rules.max_reply_depth ?? 3)) return { should_reply: false, reasoning: 'max depth reached' }

    const repliesInThread = countRepliesInThread(reply.parent_post_id)
    if (repliesInThread >= (rules.max_replies_per_thread ?? 2)) return { should_reply: false, reasoning: 'max replies per thread reached' }

    try {
      const response = await llmManager.chat({
        messages: [
          {
            role: 'system',
            content: `${persona.system_prompt}\n\nSomeone replied to your comment on Moltbook. Decide if it warrants a response. Consider: is this a question? does it add new information? is it just agreeing? Respond JSON only: {"should_reply":true|false,"reasoning":"..."}`
          },
          {
            role: 'user',
            content: `Your original: ${reply.agent_original_content ?? '(unknown)'}\nTheir reply: ${reply.reply_content}`
          }
        ],
        temperature: 0.3,
        max_tokens: 100,
        json_mode: true,
        provider: persona.llm_provider
      })
      return JSON.parse(response.content)
    } catch (err) {
      log.error('Reply evaluation error:', err)
      return { should_reply: false, reasoning: 'evaluation error' }
    }
  }

  // --- Action Planning (persona voice) ---

  private async planAction(post: any, evaluation: Evaluation, persona: AgentPersona): Promise<ActionPayload | null> {
    // Votes are simple — no content generation needed
    if (evaluation.action === 'upvote' || evaluation.action === 'downvote') {
      return {
        type: evaluation.action,
        post_id: post.id,
        submolt_name: post.submolt?.name ?? post.submolt_name
      }
    }

    try {
      const isComment = evaluation.action === 'comment'
      const charLimit = isComment ? 125 : 2000

      const response = await llmManager.chat({
        messages: [
          {
            role: 'system',
            content: `${persona.system_prompt}\n\nYou are writing a ${isComment ? 'comment' : 'post'} on Moltbook in the style: ${persona.tone_settings.style}. Be authentic to your persona.${isComment ? `\n\nCRITICAL: Your comment must be ${charLimit} characters or fewer. This is a hard API limit. Be concise but insightful.` : ''}\n\nRespond with JSON only: {"content":"your text here"}`
          },
          {
            role: 'user',
            content: `Write a response to:\nTitle: ${post.title}\nContent: ${post.content ?? ''}\nYour reasoning for engaging: ${evaluation.reasoning}`
          }
        ],
        temperature: persona.tone_settings.temperature,
        max_tokens: persona.tone_settings.max_length,
        json_mode: true,
        provider: persona.llm_provider
      })

      const plan = JSON.parse(response.content)
      let content = plan.content ?? ''

      // Enforce 125-char hard limit for comments
      if (isComment && content.length > 125) {
        content = content.slice(0, 122) + '...'
      }

      return {
        type: isComment ? 'create_comment' : 'create_post',
        content,
        post_id: post.id,
        submolt_name: post.submolt?.name ?? post.submolt_name
      }
    } catch (err) {
      log.error('Action planning error:', err)
      return null
    }
  }

  // --- Content Origination: Create Original Posts ---

  private async considerCreatingPost(persona: AgentPersona, rules: EngagementRules): Promise<void> {
    if (this.emergencyStopped) return

    // Check rate limits: Moltbook allows 1 post per 30 min
    const postsLast30Min = countEngagementsInPeriod(0.5, 'create_post') // 0.5 hours = 30 min
    if (postsLast30Min >= 1) {
      log.info('Post creation skipped: posted within last 30 min (API limit)')
      return
    }

    // Check persona limit
    const postsThisHour = countEngagementsInPeriod(1, 'create_post')
    if (postsThisHour >= rules.max_posts_per_hour) {
      log.info(`Post creation skipped: ${postsThisHour}/${rules.max_posts_per_hour} posts this hour`)
      return
    }

    // Need priority submolts to know where to post
    const prioritySubmolts = Object.entries(persona.submolt_priorities)
      .sort(([, a], [, b]) => (b as number) - (a as number))
    if (prioritySubmolts.length === 0) {
      return // No submolts configured — can't create posts without a target
    }

    // Engagement rate gate — same probability as commenting
    if (Math.random() >= rules.engagement_rate) return

    try {
      // Ask LLM if agent should create an original post
      const topSubmolts = prioritySubmolts.slice(0, 5).map(([name, priority]) => `m/${name} (priority: ${priority})`)
      const response = await llmManager.chat({
        messages: [
          {
            role: 'system',
            content: `${persona.system_prompt}\n\nYou are considering creating an original post on Moltbook (an AI social network). Your interests: ${persona.interest_tags.join(', ') || 'general'}. Your style: ${persona.tone_settings.style}.\n\nYour active submolts:\n${topSubmolts.join('\n')}\n\nDecide if you have something worth posting. Only post if you have a genuine, interesting thought — not filler content.\n\nRespond JSON only: {"should_post":true|false,"submolt":"submolt_name","title":"post title","content":"post body","reasoning":"why this is worth posting"}`
          },
          {
            role: 'user',
            content: `Consider creating an original post. Think about your interests and what would be valuable to the community. If nothing comes to mind naturally, set should_post to false.`
          }
        ],
        temperature: persona.tone_settings.temperature,
        max_tokens: 600,
        json_mode: true,
        provider: persona.llm_provider
      })

      const plan = JSON.parse(response.content)
      if (!plan.should_post || !plan.submolt || !plan.title || !plan.content) return

      // Verify the target submolt is in our priorities
      const targetSubmolt = plan.submolt.replace(/^m\//, '')
      if (!persona.submolt_priorities[targetSubmolt]) {
        log.info(`Post creation skipped: LLM chose submolt "${targetSubmolt}" not in priorities`)
        return
      }

      const action: ActionPayload = {
        type: 'create_post',
        submolt_name: targetSubmolt,
        title: plan.title,
        content: plan.content
      }

      if (this.mode === 'autopilot') {
        const actionId = enqueueAction({
          payload: action,
          reasoning: plan.reasoning ?? 'Original post creation',
          priority: 8
        })
        updateActionStatus(actionId, 'approved')
        await this.executeAction(actionId, action, persona.id, plan.reasoning)
        log.info(`Created original post in m/${targetSubmolt}: "${plan.title}"`)
      } else {
        // Semi-auto: queue for approval
        enqueueAction({
          payload: action,
          reasoning: plan.reasoning ?? 'Original post creation',
          priority: 8
        })
        log.info(`Queued original post for approval in m/${targetSubmolt}: "${plan.title}"`)
      }
    } catch (err) {
      log.error('Post creation error:', err)
    }
  }

  // --- Action Execution ---

  async executeAction(actionId: string, payload: ActionPayload, personaId?: string, reasoning?: string): Promise<void> {
    try {
      updateActionStatus(actionId, 'executing')

      switch (payload.type) {
        case 'create_comment':
        case 'reply':
          await moltbookClient.createComment(payload.post_id!, payload.content!, payload.comment_id)
          break
        case 'create_post':
          await moltbookClient.createPost(payload.submolt_name!, payload.title!, payload.content!)
          break
        case 'upvote':
          await moltbookClient.upvotePost(payload.post_id!)
          break
        case 'downvote':
          await moltbookClient.downvotePost(payload.post_id!)
          break
        case 'follow':
          await moltbookClient.followAgent(payload.agent_name!)
          break
        case 'unfollow':
          await moltbookClient.unfollowAgent(payload.agent_name!)
          break
        case 'subscribe':
          await moltbookClient.subscribeSubmolt(payload.submolt_name!)
          break
        case 'unsubscribe':
          await moltbookClient.unsubscribeSubmolt(payload.submolt_name!)
          break
      }

      updateActionStatus(actionId, 'completed')

      // Record engagement for dedup tracking
      if (payload.post_id) {
        recordEngagement({
          postId: payload.post_id,
          commentId: payload.comment_id,
          actionType: payload.type,
          contentSent: payload.content,
          personaId: personaId ?? this.activePersonaId,
          reasoning
        })
      }

      logActivity({
        activity_type: `action_${payload.type}`,
        summary: `Executed ${payload.type} action`,
        details: payload as any
      })

      this.emit('action:executed', { actionId, payload })
    } catch (err) {
      updateActionStatus(actionId, 'failed', { error: (err as Error).message })
      log.error(`Action ${actionId} failed:`, err)
    }
  }

  // --- Reply Monitoring ---

  private async checkForReplies(persona: AgentPersona): Promise<void> {
    try {
      // Get posts where agent has recently engaged (last 24h, max 5)
      const recentPostIds = getRecentAgentPostIds(24).slice(0, 5)

      for (const postId of recentPostIds) {
        if (this.emergencyStopped) break

        try {
          const result = await moltbookClient.getCommentTree(postId)
          const comments = result.comments ?? []

          // Walk the comment tree to find replies to agent's comments
          this.findRepliesToAgent(comments, postId, null)

          await this.delay(200)
        } catch (err) {
          log.warn(`Failed to check replies for post ${postId}:`, (err as Error).message)
        }
      }

      // Process unresponded replies if autopilot + reply_to_replies enabled
      if (this.mode === 'autopilot') {
        const unresponded = getUnrespondedReplies().slice(0, 3) // Max 3 per cycle
        for (const reply of unresponded) {
          if (this.emergencyStopped) break

          const evalResult = await this.evaluateReply(reply, persona)
          if (evalResult.should_reply) {
            const replyAction = await this.generateReply(reply, persona)
            if (replyAction) {
              const actionId = enqueueAction({
                payload: replyAction,
                reasoning: evalResult.reasoning,
                priority: 5
              })
              updateActionStatus(actionId, 'approved')
              await this.executeAction(actionId, replyAction, persona.id, evalResult.reasoning)
              markReplyResponded(reply.reply_comment_id)
              await this.delay(this.cooldownMs)
            }
          } else {
            // Mark as responded so we don't re-evaluate
            markReplyResponded(reply.reply_comment_id)
          }
        }
      }
    } catch (err) {
      log.error('Reply monitoring error:', err)
    }
  }

  private findRepliesToAgent(comments: any[], postId: string, parentContent: string | null): void {
    for (const comment of comments) {
      const isAgentComment = comment.is_own === true || comment.is_own === 1
      const children = comment.children ?? []

      if (isAgentComment) {
        // Check children — these are replies to the agent
        for (const child of children) {
          if (!child.is_own && child.is_own !== 1) {
            addToReplyInbox({
              parentPostId: postId,
              parentCommentId: comment.id,
              agentOriginalContent: comment.content,
              replyCommentId: child.id,
              replyAuthor: child.author?.username ?? 'unknown',
              replyContent: child.content,
              depth: child.depth ?? 0
            })
          }
          // Recurse into child's children
          this.findRepliesToAgent(child.children ?? [], postId, child.content)
        }
      } else {
        // Not agent's comment — recurse deeper
        this.findRepliesToAgent(children, postId, comment.content)
      }
    }
  }

  private async generateReply(reply: any, persona: AgentPersona): Promise<ActionPayload | null> {
    try {
      const response = await llmManager.chat({
        messages: [
          {
            role: 'system',
            content: `${persona.system_prompt}\n\nYou are replying to someone who responded to your comment on Moltbook. Style: ${persona.tone_settings.style}.\n\nCRITICAL: Your reply must be 125 characters or fewer. Be concise.\n\nRespond with JSON only: {"content":"your reply"}`
          },
          {
            role: 'user',
            content: `Your original comment: ${reply.agent_original_content ?? '(context unavailable)'}\nTheir reply: ${reply.reply_content}\n\nWrite a brief, natural response.`
          }
        ],
        temperature: persona.tone_settings.temperature,
        max_tokens: 150,
        json_mode: true,
        provider: persona.llm_provider
      })

      const plan = JSON.parse(response.content)
      let content = plan.content ?? ''
      if (content.length > 125) content = content.slice(0, 122) + '...'

      return {
        type: 'reply',
        content,
        post_id: reply.parent_post_id,
        comment_id: reply.reply_comment_id, // Reply to the reply comment
        submolt_name: undefined
      }
    } catch (err) {
      log.error('Reply generation error:', err)
      return null
    }
  }

  // --- Approve / Reject / Emergency ---

  async approveAction(actionId: string, editedContent?: string): Promise<void> {
    updateActionStatus(actionId, 'approved')
    const action = getNextApproved()
    if (action) {
      const payload = JSON.parse(action.payload)
      if (editedContent && (payload.type === 'create_comment' || payload.type === 'create_post' || payload.type === 'reply')) {
        payload.content = editedContent
      }
      await this.executeAction(action.id, payload)
    }
  }

  rejectAction(actionId: string): void {
    updateActionStatus(actionId, 'rejected')
  }

  emergencyStop(): void {
    log.warn('EMERGENCY STOP ACTIVATED')
    this.emergencyStopped = true
    this.stop()
    this.abortController?.abort()
    llmManager.cancelAllRequests()
    moltbookClient.drainQueue()
    rejectAllPending()
    this.emit('emergency:stop')
    logActivity({
      activity_type: 'emergency_stop',
      summary: 'Emergency stop activated',
      level: 'warn'
    })
  }

  reset(): void {
    this.emergencyStopped = false
    this.abortController = new AbortController()
    log.info('Emergency stop reset')
    this.emit('emergency:reset')
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }
}

export const autopilotService = new AutopilotService()
