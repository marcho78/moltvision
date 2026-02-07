import { EventEmitter } from 'events'
import log from 'electron-log'
import type { OperationMode, ActionPayload, AutopilotStatus } from '../../shared/domain.types'
import { llmManager } from './llm.service'
import { moltbookClient } from './moltbook-api.service'
import { enqueueAction, getNextApproved, updateActionStatus, rejectAllPending, countActionsInPeriod, countActionsTodayTotal } from '../db/queries/queue.queries'
import { logActivity } from '../db/queries/analytics.queries'

export class AutopilotService extends EventEmitter {
  private mode: OperationMode = 'off'
  private isRunning = false
  private scanTimer: ReturnType<typeof setInterval> | null = null
  private emergencyStopped = false
  private abortController: AbortController | null = null
  private lastScanAt: string | null = null

  // Schedule defaults
  private scanInterval = 60000
  private maxActionsPerHour = 10
  private maxActionsPerDay = 50
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

  setMode(mode: OperationMode): void {
    if (this.emergencyStopped && mode !== 'off') {
      throw new Error('Emergency stop active. Reset before changing mode.')
    }
    this.mode = mode
    log.info(`Autopilot mode set to: ${mode}`)

    if (mode === 'off') {
      this.stop()
    } else if (mode === 'autopilot') {
      this.start()
    } else {
      // semi-auto: stop automatic scanning but allow manual queue processing
      this.stopTimer()
    }

    this.emit('mode:changed', mode)
  }

  private start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.abortController = new AbortController()
    this.scanTimer = setInterval(() => this.runScanCycle(), this.scanInterval)
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

  async runScanCycle(): Promise<void> {
    if (this.emergencyStopped) return

    const actionsThisHour = countActionsInPeriod(1)
    if (actionsThisHour >= this.maxActionsPerHour) {
      log.info('Hourly action limit reached')
      this.emit('limit:reached', { type: 'hourly', count: actionsThisHour })
      return
    }

    const actionsToday = countActionsTodayTotal()
    if (actionsToday >= this.maxActionsPerDay) {
      log.info('Daily action limit reached')
      this.emit('limit:reached', { type: 'daily', count: actionsToday })
      return
    }

    try {
      log.info('Starting scan cycle')
      this.lastScanAt = new Date().toISOString()

      // Fetch personalized feed
      const feed = await moltbookClient.getPersonalizedFeed({ sort: 'hot', limit: 20 })

      for (const post of feed.posts) {
        if (this.emergencyStopped) break

        // Ask LLM to evaluate post
        const evaluation = await this.evaluatePost(post)
        if (!evaluation || evaluation.verdict === 'skip') continue

        // Plan action
        const action = await this.planAction(post, evaluation)
        if (!action) continue

        if (this.mode === 'autopilot') {
          // Execute directly
          const actionId = enqueueAction({
            payload: action,
            reasoning: evaluation.reasoning,
            priority: evaluation.priority ?? 0
          })
          updateActionStatus(actionId, 'approved')
          await this.executeAction(actionId, action)
          await new Promise(r => setTimeout(r, this.cooldownMs))
        } else {
          // Semi-auto: queue for approval
          enqueueAction({
            payload: action,
            reasoning: evaluation.reasoning,
            priority: evaluation.priority ?? 0
          })
        }
      }

      this.emit('cycle:end')
    } catch (err) {
      log.error('Scan cycle error:', err)
      logActivity({
        activity_type: 'scan_error',
        summary: `Scan cycle failed: ${(err as Error).message}`,
        level: 'error'
      })
    }
  }

  private async evaluatePost(post: any): Promise<{ verdict: string; reasoning: string; priority?: number } | null> {
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'system', content: 'You are evaluating posts for engagement. Respond with JSON: {"verdict":"engage"|"skip","reasoning":"...","priority":0-10}' },
          { role: 'user', content: `Evaluate this post:\nTitle: ${post.title}\nContent: ${post.content}\nSubmolt: ${post.submolt?.name ?? post.submolt_name}\nKarma: ${post.karma}` }
        ],
        temperature: 0.3,
        max_tokens: 200,
        json_mode: true
      })
      return JSON.parse(response.content)
    } catch (err) {
      log.error('Post evaluation error:', err)
      return null
    }
  }

  private async planAction(post: any, evaluation: any): Promise<ActionPayload | null> {
    try {
      const response = await llmManager.chat({
        messages: [
          { role: 'system', content: 'Plan an action for this post. Respond with JSON: {"type":"create_comment"|"upvote"|"downvote","content":"...if commenting"}' },
          { role: 'user', content: `Post: ${post.title}\n${post.content}\nEvaluation: ${evaluation.reasoning}` }
        ],
        temperature: 0.7,
        max_tokens: 500,
        json_mode: true
      })
      const plan = JSON.parse(response.content)
      return {
        ...plan,
        post_id: post.id,
        submolt_name: post.submolt?.name ?? post.submolt_name
      } as ActionPayload
    } catch (err) {
      log.error('Action planning error:', err)
      return null
    }
  }

  async executeAction(actionId: string, payload: ActionPayload): Promise<void> {
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
      logActivity({
        activity_type: `action_${payload.type}`,
        summary: `Executed ${payload.type} action`,
        details: payload as any
      })
    } catch (err) {
      updateActionStatus(actionId, 'failed', { error: (err as Error).message })
      log.error(`Action ${actionId} failed:`, err)
    }
  }

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
}

export const autopilotService = new AutopilotService()
