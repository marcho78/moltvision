import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import * as d3 from 'd3'
import type { AgentEngagement } from '@shared/domain.types'

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="panel-card p-3">
      <div className="text-xs text-molt-muted mb-1">{label}</div>
      <div className={`text-xl font-bold ${color ?? 'text-molt-text'}`}>{value}</div>
    </div>
  )
}

function KarmaChart() {
  const svgRef = useRef<SVGSVGElement>(null)
  const karmaHistory = useStore((s) => s.karmaHistory)

  useEffect(() => {
    if (!svgRef.current || karmaHistory.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 200
    const margin = { top: 20, right: 20, bottom: 30, left: 50 }

    const xScale = d3.scaleTime()
      .domain(d3.extent(karmaHistory, (d) => new Date(d.recorded_at)) as [Date, Date])
      .range([margin.left, width - margin.right])

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(karmaHistory, (d) => d.karma) ?? 100])
      .nice()
      .range([height - margin.bottom, margin.top])

    // Area
    const area = d3.area<any>()
      .x((d) => xScale(new Date(d.recorded_at)))
      .y0(height - margin.bottom)
      .y1((d) => yScale(d.karma))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(karmaHistory)
      .attr('d', area)
      .attr('fill', 'rgba(124, 92, 252, 0.15)')

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
      .attr('stroke-width', 2)

    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(6).tickFormat(d3.timeFormat('%b %d') as any))
      .selectAll('text, line, path')
      .attr('stroke', '#3a3a4a')
      .attr('fill', '#8888a0')
      .attr('font-size', '10px')

    svg.append('g')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(5))
      .selectAll('text, line, path')
      .attr('stroke', '#3a3a4a')
      .attr('fill', '#8888a0')
      .attr('font-size', '10px')

  }, [karmaHistory])

  return <svg ref={svgRef} className="w-full" style={{ height: 200 }} />
}

function ActivityHeatmap() {
  const svgRef = useRef<SVGSVGElement>(null)
  const activityLog = useStore((s) => s.activityLog)

  useEffect(() => {
    if (!svgRef.current || activityLog.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const cellSize = 14
    const margin = { top: 20, left: 30 }

    // Group activity by day
    const dayCounts = new Map<string, number>()
    activityLog.forEach((entry) => {
      const day = entry.created_at.split('T')[0]
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
    })

    const maxCount = Math.max(...dayCounts.values(), 1)
    const colorScale = d3.scaleSequential(d3.interpolatePurples)
      .domain([0, maxCount])

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

    svg.selectAll('rect')
      .data(days)
      .join('rect')
      .attr('x', (d) => margin.left + d.col * (cellSize + 2))
      .attr('y', (d) => margin.top + d.row * (cellSize + 2))
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('rx', 2)
      .attr('fill', (d) => d.count === 0 ? '#1a1a24' : colorScale(d.count))
      .attr('stroke', '#0f0f13')
      .attr('stroke-width', 1)
      .append('title')
      .text((d) => `${d.date}: ${d.count} activities`)

  }, [activityLog])

  return <svg ref={svgRef} className="w-full" style={{ height: 140 }} />
}

function RateLimitBars() {
  const rateLimits = useStore((s) => s.rateLimits)

  if (rateLimits.length === 0) return null

  return (
    <div className="space-y-2">
      {rateLimits.map((limit) => {
        const pct = (limit.remaining / limit.max_requests) * 100
        const color = pct > 50 ? 'bg-molt-success' : pct > 20 ? 'bg-molt-warning' : 'bg-molt-error'
        return (
          <div key={limit.resource} className="flex items-center gap-2">
            <span className="text-xs text-molt-muted w-32 truncate">{limit.resource}</span>
            <div className="flex-1 h-2 bg-molt-bg rounded-full overflow-hidden">
              <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-molt-muted w-16 text-right">{limit.remaining}/{limit.max_requests}</span>
          </div>
        )
      })}
    </div>
  )
}

function AgentPerformanceSection() {
  const [stats, setStats] = useState<{
    totalPosts: number; totalComments: number; totalUpvotes: number; totalDownvotes: number
    topSubmolts: Array<{ submolt: string; count: number }>
  } | null>(null)

  useEffect(() => {
    invoke<{ entries: AgentEngagement[] }>(IPC.AUTOPILOT_GET_ACTIVITY, { limit: 500 })
      .then((result) => {
        const entries = result.entries ?? []
        const totalPosts = entries.filter(e => e.action_type === 'create_post').length
        const totalComments = entries.filter(e => e.action_type === 'create_comment' || e.action_type === 'reply').length
        const totalUpvotes = entries.filter(e => e.action_type === 'upvote').length
        const totalDownvotes = entries.filter(e => e.action_type === 'downvote').length

        // Count submolt engagement frequency (from content_sent context — not available directly,
        // so we count unique post_ids as a proxy for active posts)
        const submoltCounts = new Map<string, number>()
        for (const e of entries) {
          if (e.action_type === 'create_post' || e.action_type === 'create_comment') {
            // Post ID serves as proxy — we don't have submolt in engagement table
            // so just count action types
          }
        }

        setStats({
          totalPosts, totalComments, totalUpvotes, totalDownvotes,
          topSubmolts: Array.from(submoltCounts.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([submolt, count]) => ({ submolt, count }))
        })
      })
      .catch(console.error)
  }, [])

  if (!stats) return null

  const total = stats.totalPosts + stats.totalComments + stats.totalUpvotes + stats.totalDownvotes
  if (total === 0) return null

  return (
    <div className="panel-card">
      <h3 className="text-sm font-medium mb-3">Agent Performance</h3>
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <div className="text-lg font-bold text-molt-accent">{stats.totalPosts}</div>
          <div className="text-[10px] text-molt-muted">Posts</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-molt-success">{stats.totalComments}</div>
          <div className="text-[10px] text-molt-muted">Comments</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-molt-warning">{stats.totalUpvotes}</div>
          <div className="text-[10px] text-molt-muted">Upvotes</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-molt-error">{stats.totalDownvotes}</div>
          <div className="text-[10px] text-molt-muted">Downvotes</div>
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-molt-border/50">
        <div className="text-[10px] text-molt-muted">
          Total engagements: {total}
        </div>
      </div>
    </div>
  )
}

export function AnalyticsPanel() {
  const { karmaHistory, activityLog, rateLimits, dateRange, setKarmaHistory, setActivityLog, setRateLimits, setDateRange } = useStore()

  useEffect(() => {
    Promise.all([
      invoke<{ snapshots: any[] }>(IPC.ANALYTICS_KARMA_HISTORY, { days: dateRange }),
      invoke<{ entries: any[] }>(IPC.ANALYTICS_ACTIVITY, { days: dateRange }),
      invoke<any>(IPC.ANALYTICS_STATS)
    ]).then(([karma, activity, stats]) => {
      setKarmaHistory(karma.snapshots)
      setActivityLog(activity.entries)
      if (stats.rate_limits) setRateLimits(stats.rate_limits)
    }).catch(console.error)
  }, [dateRange, setKarmaHistory, setActivityLog, setRateLimits])

  const latestKarma = karmaHistory.length > 0 ? karmaHistory[karmaHistory.length - 1] : null

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border flex items-center justify-between">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="flex gap-1">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDateRange(d)}
              className={`px-3 py-1 text-xs rounded-full ${
                dateRange === d ? 'bg-molt-accent text-white' : 'bg-molt-surface text-molt-muted'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total Karma" value={latestKarma?.karma ?? 0} color="text-molt-accent" />
          <StatCard label="Followers" value={latestKarma?.follower_count ?? 0} />
          <StatCard label="Posts" value={latestKarma?.post_count ?? 0} />
          <StatCard label="Activities" value={activityLog.length} />
        </div>

        {/* Karma Chart */}
        <div className="panel-card">
          <h3 className="text-sm font-medium mb-3">Karma Over Time</h3>
          <KarmaChart />
        </div>

        {/* Activity Heatmap */}
        <div className="panel-card">
          <h3 className="text-sm font-medium mb-3">Activity Heatmap</h3>
          <ActivityHeatmap />
        </div>

        {/* Agent Performance */}
        <AgentPerformanceSection />

        {/* Rate Limits */}
        <div className="panel-card">
          <h3 className="text-sm font-medium mb-3">Rate Limits</h3>
          <RateLimitBars />
        </div>
      </div>
    </div>
  )
}
