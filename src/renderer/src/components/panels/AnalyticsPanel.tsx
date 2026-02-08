import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import * as d3 from 'd3'
import type { AgentEngagement, KarmaSnapshot } from '@shared/domain.types'

/** Defensive string coercion */
function safeStr(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return String(val)
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

// ─── Stat Cards ──────────────────────────────────────────

function StatCard({ label, value, icon, trend, color }: {
  label: string; value: string | number; icon: string; trend?: number; color: string
}) {
  return (
    <div className="bg-molt-surface/50 rounded-xl border border-molt-border/50 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-molt-muted uppercase tracking-wider">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
        {trend != null && trend !== 0 && (
          <span className={`text-xs font-medium pb-0.5 ${trend > 0 ? 'text-molt-success' : 'text-molt-error'}`}>
            {trend > 0 ? '+' : ''}{formatNum(trend)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Karma Chart ─────────────────────────────────────────

function KarmaChart({ karmaHistory }: { karmaHistory: KarmaSnapshot[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (karmaHistory.length === 0) return

    const width = containerRef.current.clientWidth
    const height = 220
    const margin = { top: 16, right: 16, bottom: 32, left: 48 }

    const xScale = d3.scaleTime()
      .domain(d3.extent(karmaHistory, (d) => new Date(d.recorded_at)) as [Date, Date])
      .range([margin.left, width - margin.right])

    const yMax = d3.max(karmaHistory, (d) => d.karma) ?? 100
    const yScale = d3.scaleLinear()
      .domain([0, yMax * 1.1])
      .nice()
      .range([height - margin.bottom, margin.top])

    // Grid lines
    svg.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data(yScale.ticks(5))
      .join('line')
      .attr('x1', margin.left)
      .attr('x2', width - margin.right)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#1e1e2e')
      .attr('stroke-dasharray', '2,4')

    // Gradient fill
    const defs = svg.append('defs')
    const gradient = defs.append('linearGradient')
      .attr('id', 'karmaGradient')
      .attr('x1', '0').attr('y1', '0')
      .attr('x2', '0').attr('y2', '1')
    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#7c5cfc').attr('stop-opacity', 0.3)
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#7c5cfc').attr('stop-opacity', 0.02)

    // Area
    const area = d3.area<any>()
      .x((d) => xScale(new Date(d.recorded_at)))
      .y0(height - margin.bottom)
      .y1((d) => yScale(d.karma))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(karmaHistory)
      .attr('d', area)
      .attr('fill', 'url(#karmaGradient)')

    // Line
    const line = d3.line<any>()
      .x((d) => xScale(new Date(d.recorded_at)))
      .y((d) => yScale(d.karma))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(karmaHistory)
      .attr('d', line)
      .attr('fill', 'none')
      .attr('stroke', '#7c5cfc')
      .attr('stroke-width', 2.5)

    // Dots at data points (if few enough)
    if (karmaHistory.length <= 60) {
      svg.selectAll('.dot')
        .data(karmaHistory)
        .join('circle')
        .attr('cx', (d) => xScale(new Date(d.recorded_at)))
        .attr('cy', (d) => yScale(d.karma))
        .attr('r', karmaHistory.length <= 20 ? 3 : 2)
        .attr('fill', '#7c5cfc')
        .attr('stroke', '#0f0f13')
        .attr('stroke-width', 1)
    }

    // X axis
    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat('%b %d') as any))
      .call(g => g.select('.domain').attr('stroke', '#2a2a3a'))
      .selectAll('text')
      .attr('fill', '#6a6a80')
      .attr('font-size', '10px')

    svg.selectAll('.tick line').attr('stroke', '#2a2a3a')

    // Y axis
    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => formatNum(d as number)))
      .call(g => g.select('.domain').attr('stroke', '#2a2a3a'))
      .selectAll('text')
      .attr('fill', '#6a6a80')
      .attr('font-size', '10px')

  }, [karmaHistory])

  if (karmaHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-molt-muted text-xs">
        <div className="text-center space-y-1">
          <p>No karma data yet</p>
          <p className="text-[10px]">Start the autopilot to begin tracking karma over time</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef}>
      <svg ref={svgRef} className="w-full" style={{ height: 220 }} />
    </div>
  )
}

// ─── Karma Breakdown Bar ─────────────────────────────────

function KarmaBreakdown({ latest }: { latest: KarmaSnapshot | null }) {
  if (!latest) return null
  const total = (latest.post_karma ?? 0) + (latest.comment_karma ?? 0)
  if (total === 0) return null

  const postPct = ((latest.post_karma ?? 0) / total) * 100
  const commentPct = ((latest.comment_karma ?? 0) / total) * 100

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-molt-muted">Karma breakdown</span>
        <span className="text-molt-muted">{formatNum(total)} total</span>
      </div>
      <div className="h-2 bg-molt-bg rounded-full overflow-hidden flex">
        <div className="h-full bg-molt-accent rounded-l-full transition-all" style={{ width: `${postPct}%` }} />
        <div className="h-full bg-molt-success rounded-r-full transition-all" style={{ width: `${commentPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px]">
        <span className="text-molt-accent">Post: {formatNum(latest.post_karma ?? 0)}</span>
        <span className="text-molt-success">Comment: {formatNum(latest.comment_karma ?? 0)}</span>
      </div>
    </div>
  )
}

// ─── Activity Heatmap ────────────────────────────────────

function ActivityHeatmap() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activityLog = useStore((s) => s.activityLog)

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = containerRef.current.clientWidth
    const cellSize = Math.min(14, (width - 60) / 14)
    const gap = 2
    const margin = { top: 4, left: 28 }

    // Group activity by day
    const dayCounts = new Map<string, number>()
    activityLog.forEach((entry) => {
      const day = entry.created_at.split('T')[0]
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
    })

    const maxCount = Math.max(...(dayCounts.size > 0 ? dayCounts.values() : [0]), 1)
    const colorScale = d3.scaleSequential(d3.interpolatePurples).domain([0, maxCount])

    // Generate last 90 days
    const days: Array<{ date: string; count: number; col: number; row: number }> = []
    const now = new Date()
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const weekIdx = Math.floor((89 - i) / 7)
      const dayOfWeek = d.getDay()
      days.push({ date: dateStr, count: dayCounts.get(dateStr) ?? 0, col: weekIdx, row: dayOfWeek })
    }

    // Day labels
    const dayLabels = ['', 'M', '', 'W', '', 'F', '']
    dayLabels.forEach((label, i) => {
      if (label) {
        svg.append('text')
          .attr('x', margin.left - 6)
          .attr('y', margin.top + i * (cellSize + gap) + cellSize / 2)
          .attr('text-anchor', 'end')
          .attr('dominant-baseline', 'middle')
          .attr('fill', '#4a4a60')
          .attr('font-size', '9px')
          .text(label)
      }
    })

    svg.selectAll('rect')
      .data(days)
      .join('rect')
      .attr('x', (d) => margin.left + d.col * (cellSize + gap))
      .attr('y', (d) => margin.top + d.row * (cellSize + gap))
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('rx', 3)
      .attr('fill', (d) => d.count === 0 ? '#13131d' : colorScale(d.count))
      .attr('stroke', '#0a0a12')
      .attr('stroke-width', 0.5)
      .append('title')
      .text((d) => `${d.date}: ${d.count} activities`)

  }, [activityLog])

  const totalActivities = activityLog.length

  return (
    <div className="space-y-2">
      <div ref={containerRef}>
        <svg ref={svgRef} className="w-full" style={{ height: 120 }} />
      </div>
      {totalActivities > 0 && (
        <div className="flex items-center justify-between text-[10px] text-molt-muted px-1">
          <span>{totalActivities} activities in period</span>
          <div className="flex items-center gap-1">
            <span>Less</span>
            {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: v === 0 ? '#13131d' : d3.interpolatePurples(v) }} />
            ))}
            <span>More</span>
          </div>
        </div>
      )}
      {totalActivities === 0 && (
        <p className="text-[10px] text-molt-muted text-center">No activity recorded yet</p>
      )}
    </div>
  )
}

// ─── Agent Engagement Stats ──────────────────────────────

function EngagementStats() {
  const [stats, setStats] = useState<{
    posts: number; comments: number; upvotes: number; downvotes: number; total: number
  } | null>(null)

  useEffect(() => {
    invoke<{ entries: AgentEngagement[] }>(IPC.AUTOPILOT_GET_ACTIVITY, { limit: 1000 })
      .then((result) => {
        const entries = result.entries ?? []
        const posts = entries.filter(e => e.action_type === 'create_post').length
        const comments = entries.filter(e => e.action_type === 'create_comment' || e.action_type === 'reply').length
        const upvotes = entries.filter(e => e.action_type === 'upvote').length
        const downvotes = entries.filter(e => e.action_type === 'downvote').length
        setStats({ posts, comments, upvotes, downvotes, total: posts + comments + upvotes + downvotes })
      })
      .catch(console.error)
  }, [])

  if (!stats || stats.total === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-molt-muted">No agent engagements yet</p>
        <p className="text-[10px] text-molt-muted mt-1">Start the autopilot to begin engaging</p>
      </div>
    )
  }

  const items = [
    { label: 'Posts', value: stats.posts, color: 'bg-molt-accent', textColor: 'text-molt-accent' },
    { label: 'Comments', value: stats.comments, color: 'bg-molt-success', textColor: 'text-molt-success' },
    { label: 'Upvotes', value: stats.upvotes, color: 'bg-molt-warning', textColor: 'text-molt-warning' },
    { label: 'Downvotes', value: stats.downvotes, color: 'bg-molt-error', textColor: 'text-molt-error' },
  ]

  return (
    <div className="space-y-3">
      {/* Engagement type breakdown */}
      <div className="grid grid-cols-4 gap-2">
        {items.map(item => (
          <div key={item.label} className="text-center">
            <div className={`text-xl font-bold ${item.textColor}`}>{formatNum(item.value)}</div>
            <div className="text-[10px] text-molt-muted">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Proportional bar */}
      {stats.total > 0 && (
        <div className="h-2.5 rounded-full overflow-hidden flex bg-molt-bg">
          {items.filter(i => i.value > 0).map(item => (
            <div key={item.label}
              className={`h-full ${item.color} transition-all first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${(item.value / stats.total) * 100}%` }}
              title={`${item.label}: ${item.value}`} />
          ))}
        </div>
      )}

      <div className="text-[10px] text-molt-muted text-center">
        {stats.total} total engagements
      </div>
    </div>
  )
}

// ─── Token Usage Section ──────────────────────────────────

const PURPOSE_LABELS: Record<string, string> = {
  evaluation: 'Evaluation',
  content_generation: 'Content Gen',
  reply_evaluation: 'Reply Eval',
  reply_generation: 'Reply Gen',
  post_decision: 'Post Decision',
  persona_preview: 'Persona Preview',
  persona_test: 'Persona Test',
  manual_generation: 'Manual',
  whoami: 'Who Am I',
  embedding: 'Embedding',
  bonus: 'Bonus'
}

const PURPOSE_COLORS: Record<string, string> = {
  evaluation: '#7c5cfc',
  content_generation: '#22c55e',
  reply_evaluation: '#3b82f6',
  reply_generation: '#06b6d4',
  post_decision: '#eab308',
  persona_preview: '#f97316',
  persona_test: '#ec4899',
  manual_generation: '#8b5cf6',
  whoami: '#6b7280',
  embedding: '#14b8a6',
  bonus: '#f43f5e'
}

const PROVIDER_COLORS: Record<string, string> = {
  claude: '#d97706',
  openai: '#22c55e',
  gemini: '#3b82f6',
  grok: '#ef4444'
}

function TokenUsageSection() {
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    invoke<any>(IPC.ANALYTICS_TOKEN_USAGE)
      .then(setStats)
      .catch(console.error)
  }, [])

  if (!stats) return null

  const { today, week, month, all_time, by_purpose, by_provider, daily_trend } = stats
  const hasData = all_time.input > 0 || all_time.output > 0

  if (!hasData) return null

  // Find max total for bar scaling
  const maxPurpose = Math.max(1, ...by_purpose.map((p: any) => p.input + p.output))
  const maxProvider = Math.max(1, ...by_provider.map((p: any) => p.input + p.output))
  const maxDaily = Math.max(1, ...daily_trend.map((d: any) => d.input + d.output))

  return (
    <div className="space-y-4">
      {/* Period summary cards */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Today', data: today },
          { label: '7 Days', data: week },
          { label: '30 Days', data: month },
          { label: 'All Time', data: all_time }
        ].map(({ label, data }) => (
          <div key={label} className="bg-molt-bg/50 rounded-lg p-3 text-center">
            <div className="text-[10px] text-molt-muted uppercase tracking-wider mb-1">{label}</div>
            <div className="text-sm font-semibold text-molt-text">{formatNum(data.input + data.output)}</div>
            <div className="text-[9px] text-molt-muted mt-0.5">
              {formatNum(data.input)} in / {formatNum(data.output)} out
            </div>
          </div>
        ))}
      </div>

      {/* Two-column: Purpose + Provider breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {/* By Purpose */}
        {by_purpose.length > 0 && (
          <div>
            <h4 className="text-[10px] text-molt-muted uppercase tracking-wider mb-2">By Purpose</h4>
            <div className="space-y-1.5">
              {by_purpose.map((p: any) => {
                const total = p.input + p.output
                const pct = (total / maxPurpose) * 100
                return (
                  <div key={p.purpose} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-molt-muted">{PURPOSE_LABELS[p.purpose] ?? p.purpose}</span>
                      <span className="text-molt-text tabular-nums">{formatNum(total)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-molt-bg rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: PURPOSE_COLORS[p.purpose] ?? '#7c5cfc' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* By Provider */}
        {by_provider.length > 0 && (
          <div>
            <h4 className="text-[10px] text-molt-muted uppercase tracking-wider mb-2">By Provider</h4>
            <div className="space-y-1.5">
              {by_provider.map((p: any) => {
                const total = p.input + p.output
                const pct = (total / maxProvider) * 100
                return (
                  <div key={p.provider} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-molt-muted capitalize">{p.provider}</span>
                      <span className="text-molt-text tabular-nums">{formatNum(total)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-molt-bg rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: PROVIDER_COLORS[p.provider] ?? '#7c5cfc' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Daily trend (last 14 days) */}
      {daily_trend.length > 1 && (
        <div>
          <h4 className="text-[10px] text-molt-muted uppercase tracking-wider mb-2">Daily Usage (14 days)</h4>
          <div className="flex items-end gap-[2px] h-12">
            {daily_trend.map((d: any, i: number) => {
              const total = d.input + d.output
              const h = Math.max(2, (total / maxDaily) * 100)
              const inputPct = total > 0 ? (d.input / total) * 100 : 50
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm relative overflow-hidden"
                  style={{ height: `${h}%` }}
                  title={`${d.date}: ${formatNum(total)} tokens`}
                >
                  <div className="absolute inset-0 bg-molt-accent/40" />
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-molt-accent"
                    style={{ height: `${inputPct}%` }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-[9px] text-molt-muted mt-1">
            <span>{daily_trend[0]?.date?.slice(5) ?? ''}</span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-molt-accent rounded-sm" /> input
              <span className="inline-block w-2 h-2 bg-molt-accent/40 rounded-sm" /> output
            </span>
            <span>{daily_trend[daily_trend.length - 1]?.date?.slice(5) ?? ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Rate Limits ─────────────────────────────────────────

function RateLimitBars() {
  const rateLimits = useStore((s) => s.rateLimits)

  if (rateLimits.length === 0) return null

  // Friendly names
  const friendlyNames: Record<string, string> = {
    moltbook_general: 'API General',
    moltbook_posts: 'Post Creation',
    moltbook_comments: 'Comments/Day',
    claude: 'Claude',
    openai: 'OpenAI',
    gemini: 'Gemini',
    grok: 'Grok'
  }

  // Only show non-full limits + moltbook ones
  const relevant = rateLimits.filter(l =>
    l.resource.startsWith('moltbook') || l.remaining < l.max_requests
  )

  if (relevant.length === 0) return null

  return (
    <div className="space-y-2">
      {relevant.map((limit) => {
        const pct = (limit.remaining / limit.max_requests) * 100
        const color = pct > 50 ? 'bg-molt-success' : pct > 20 ? 'bg-molt-warning' : 'bg-molt-error'
        return (
          <div key={limit.resource} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-molt-muted">{friendlyNames[limit.resource] ?? limit.resource}</span>
              <span className="text-[10px] text-molt-muted">{limit.remaining}/{limit.max_requests}</span>
            </div>
            <div className="h-1.5 bg-molt-bg rounded-full overflow-hidden">
              <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Recent Activity List ────────────────────────────────

function RecentActivity() {
  const activityLog = useStore((s) => s.activityLog)
  const recent = activityLog.slice(0, 10)

  if (recent.length === 0) return null

  const typeIcons: Record<string, string> = {
    llm_generate: 'text-molt-accent',
    action_create_post: 'text-molt-accent',
    action_create_comment: 'text-molt-success',
    action_upvote: 'text-molt-warning',
    action_downvote: 'text-molt-error',
    scan_error: 'text-molt-error',
    emergency_stop: 'text-molt-error',
  }

  return (
    <div className="space-y-1">
      {recent.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-molt-bg/50 transition-colors">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            entry.level === 'error' ? 'bg-molt-error' :
            entry.level === 'warn' ? 'bg-molt-warning' : 'bg-molt-accent'
          }`} />
          <span className="text-xs text-molt-text flex-1 truncate">{safeStr(entry.summary)}</span>
          <span className="text-[10px] text-molt-muted flex-shrink-0">
            {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────

export function AnalyticsPanel() {
  const { karmaHistory, activityLog, rateLimits, dateRange, setKarmaHistory, setActivityLog, setRateLimits, setDateRange } = useStore()
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    try {
      const [karma, activity, stats] = await Promise.all([
        invoke<{ snapshots: any[] }>(IPC.ANALYTICS_KARMA_HISTORY, { days: dateRange }),
        invoke<{ entries: any[] }>(IPC.ANALYTICS_ACTIVITY, { days: dateRange, limit: 500 }),
        invoke<any>(IPC.ANALYTICS_STATS)
      ])
      setKarmaHistory(karma.snapshots)
      setActivityLog(activity.entries)
      if (stats.rate_limits) setRateLimits(stats.rate_limits)
    } catch (err) {
      console.error('Failed to load analytics:', err)
    } finally {
      setRefreshing(false)
    }
  }, [dateRange, setKarmaHistory, setActivityLog, setRateLimits])

  useEffect(() => { fetchData() }, [fetchData])

  const latestKarma = karmaHistory.length > 0 ? karmaHistory[karmaHistory.length - 1] : null
  const previousKarma = karmaHistory.length > 1 ? karmaHistory[0] : null
  const karmaTrend = latestKarma && previousKarma ? (latestKarma.karma - previousKarma.karma) : undefined
  const followerTrend = latestKarma && previousKarma ? (latestKarma.follower_count - previousKarma.follower_count) : undefined

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-molt-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Analytics</h2>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} disabled={refreshing}
              className="text-[10px] text-molt-accent hover:text-molt-accent-hover transition-colors disabled:opacity-50">
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
        <div className="flex gap-1">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} onClick={() => setDateRange(d)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                dateRange === d
                  ? 'bg-molt-accent text-white font-medium'
                  : 'bg-molt-surface text-molt-muted hover:text-molt-text'
              }`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Top stat cards */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Karma"
            value={formatNum(latestKarma?.karma ?? 0)}
            icon="*"
            trend={karmaTrend}
            color="text-molt-accent"
          />
          <StatCard
            label="Followers"
            value={formatNum(latestKarma?.follower_count ?? 0)}
            icon="+"
            trend={followerTrend}
            color="text-molt-info"
          />
          <StatCard
            label="Posts"
            value={formatNum(latestKarma?.post_count ?? 0)}
            icon="#"
            color="text-molt-success"
          />
          <StatCard
            label="Activities"
            value={formatNum(activityLog.length)}
            icon="~"
            color="text-molt-warning"
          />
        </div>

        {/* Karma chart + breakdown in a 2-column layout */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 panel-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Karma Over Time</h3>
            </div>
            <KarmaChart karmaHistory={karmaHistory} />
          </div>

          <div className="panel-card p-4 space-y-4">
            <h3 className="text-sm font-medium">Overview</h3>
            <KarmaBreakdown latest={latestKarma} />

            {/* Rate limits in sidebar */}
            <div className="pt-2 border-t border-molt-border/30">
              <h4 className="text-[10px] text-molt-muted uppercase tracking-wider mb-2">API Limits</h4>
              <RateLimitBars />
            </div>
          </div>
        </div>

        {/* Activity heatmap */}
        <div className="panel-card p-4">
          <h3 className="text-sm font-medium mb-3">Activity</h3>
          <ActivityHeatmap />
        </div>

        {/* Agent engagement + Recent activity in 2-column layout */}
        <div className="grid grid-cols-2 gap-4">
          <div className="panel-card p-4">
            <h3 className="text-sm font-medium mb-3">Agent Engagements</h3>
            <EngagementStats />
          </div>

          <div className="panel-card p-4">
            <h3 className="text-sm font-medium mb-3">Recent Activity</h3>
            <div className="max-h-56 overflow-y-auto">
              <RecentActivity />
              {activityLog.length === 0 && (
                <p className="text-xs text-molt-muted text-center py-4">No recent activity</p>
              )}
            </div>
          </div>
        </div>

        {/* Token Usage */}
        <div className="panel-card p-4">
          <h3 className="text-sm font-medium mb-3">Token Usage</h3>
          <TokenUsageSection />
        </div>
      </div>
    </div>
  )
}
