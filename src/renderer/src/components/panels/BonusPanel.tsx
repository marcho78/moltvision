import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import * as d3 from 'd3'
import type { MoodData, TrendItem, Rivalry, KarmaForecast, PostIdea } from '@shared/domain.types'

// --- Mood Ring (D3 radial chart) ---
function MoodRing() {
  const svgRef = useRef<SVGSVGElement>(null)
  const { moodData, setMoodData } = useStore()

  useEffect(() => {
    invoke<{ mood: MoodData }>(IPC.BONUS_MOOD)
      .then((r) => setMoodData(r.mood))
      .catch(console.error)
  }, [setMoodData])

  useEffect(() => {
    if (!svgRef.current || !moodData) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = 200
    const height = 200
    const radius = 80

    const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`)

    const submolts = Object.entries(moodData.by_submolt)
    if (submolts.length === 0) return

    const arc = d3.arc<any>().innerRadius(50).outerRadius(radius)
    const pie = d3.pie<any>().value(() => 1).sort(null)

    const colorScale = d3.scaleSequential(d3.interpolateRdYlGn).domain([-1, 1])

    const arcs = g.selectAll('.arc')
      .data(pie(submolts))
      .join('g')
      .attr('class', 'arc')

    arcs.append('path')
      .attr('d', arc)
      .attr('fill', (d: any) => colorScale(d.data[1]))
      .attr('stroke', '#0f0f13')
      .attr('stroke-width', 2)

    arcs.append('text')
      .attr('transform', (d: any) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e0e0e8')
      .attr('font-size', '8px')
      .text((d: any) => d.data[0])

    // Center text
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.3em')
      .attr('fill', '#e0e0e8')
      .attr('font-size', '20px')
      .attr('font-weight', 'bold')
      .text((moodData.overall * 100).toFixed(0))

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.2em')
      .attr('fill', '#8888a0')
      .attr('font-size', '10px')
      .text(moodData.trend)

  }, [moodData])

  return (
    <div className="panel-card flex flex-col items-center">
      <h3 className="text-sm font-medium mb-2">Community Mood</h3>
      <svg ref={svgRef} width={200} height={200} />
    </div>
  )
}

// --- Trend Detector ---
function TrendDetector() {
  const { trends, setTrends } = useStore()

  useEffect(() => {
    invoke<{ trends: TrendItem[] }>(IPC.BONUS_TRENDS)
      .then((r) => setTrends(r.trends))
      .catch(console.error)
  }, [setTrends])

  return (
    <div className="panel-card">
      <h3 className="text-sm font-medium mb-3">Trending Topics</h3>
      {trends.length === 0 ? (
        <p className="text-xs text-molt-muted">No trends detected yet</p>
      ) : (
        <div className="space-y-2">
          {trends.map((trend, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-molt-muted w-4">{i + 1}</span>
              <div className="flex-1">
                <div className="text-sm font-medium">{trend.topic}</div>
                <div className="text-xs text-molt-muted">{trend.submolts.join(', ')}</div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-molt-muted">{trend.post_count} posts</span>
                <svg width="40" height="16" className="text-molt-accent">
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    points={trend.sparkline.map((v, j) =>
                      `${(j / (trend.sparkline.length - 1)) * 38 + 1},${15 - (v / Math.max(...trend.sparkline, 1)) * 13}`
                    ).join(' ')}
                  />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Rivalry Tracker ---
function RivalryTracker() {
  const { rivalries, setRivalries } = useStore()

  useEffect(() => {
    invoke<{ rivalries: Rivalry[] }>(IPC.BONUS_RIVALRIES)
      .then((r) => setRivalries(r.rivalries))
      .catch(console.error)
  }, [setRivalries])

  return (
    <div className="panel-card">
      <h3 className="text-sm font-medium mb-3">Agent Rivalries</h3>
      {rivalries.length === 0 ? (
        <p className="text-xs text-molt-muted">No rivalries detected</p>
      ) : (
        <div className="space-y-2">
          {rivalries.map((rivalry, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <span className="text-sm font-medium text-molt-accent">{rivalry.agent_a}</span>
              <span className="text-xs text-molt-error">vs</span>
              <span className="text-sm font-medium text-molt-accent">{rivalry.agent_b}</span>
              <div className="flex-1" />
              <div className="w-20 h-2 bg-molt-bg rounded-full overflow-hidden">
                <div className="h-full bg-molt-error rounded-full" style={{ width: `${rivalry.intensity * 100}%` }} />
              </div>
              <span className="text-xs text-molt-muted">{rivalry.disagreement_count} clashes</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Karma Forecast (D3 line chart) ---
function KarmaForecastChart() {
  const svgRef = useRef<SVGSVGElement>(null)
  const { karmaForecast, setKarmaForecast } = useStore()

  useEffect(() => {
    invoke<{ forecast: KarmaForecast }>(IPC.BONUS_FORECAST)
      .then((r) => setKarmaForecast(r.forecast))
      .catch(console.error)
  }, [setKarmaForecast])

  useEffect(() => {
    if (!svgRef.current || !karmaForecast || !karmaForecast.trend_line.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 150
    const margin = { top: 10, right: 10, bottom: 25, left: 40 }

    const data = karmaForecast.trend_line
    const xScale = d3.scaleTime()
      .domain(d3.extent(data, (d) => new Date(d.date)) as [Date, Date])
      .range([margin.left, width - margin.right])

    const yScale = d3.scaleLinear()
      .domain([
        d3.min(data, (d) => d.value) ?? 0,
        d3.max(data, (d) => d.value) ?? 100
      ]).nice()
      .range([height - margin.bottom, margin.top])

    const line = d3.line<any>()
      .x((d) => xScale(new Date(d.date)))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX)

    // Historical portion (solid)
    const now = new Date()
    const historical = data.filter((d) => new Date(d.date) <= now)
    const projected = data.filter((d) => new Date(d.date) >= now)

    if (historical.length > 0) {
      svg.append('path').datum(historical).attr('d', line)
        .attr('fill', 'none').attr('stroke', '#7c5cfc').attr('stroke-width', 2)
    }

    if (projected.length > 0) {
      svg.append('path').datum(projected).attr('d', line)
        .attr('fill', 'none').attr('stroke', '#7c5cfc').attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,4').attr('opacity', 0.6)
    }

    svg.append('g').attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.timeFormat('%b %d') as any))
      .selectAll('text, line, path').attr('stroke', '#3a3a4a').attr('fill', '#8888a0').attr('font-size', '9px')

    svg.append('g').attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale).ticks(4))
      .selectAll('text, line, path').attr('stroke', '#3a3a4a').attr('fill', '#8888a0').attr('font-size', '9px')

  }, [karmaForecast])

  return (
    <div className="panel-card">
      <h3 className="text-sm font-medium mb-2">Karma Forecast</h3>
      {karmaForecast && (
        <div className="flex gap-4 mb-2 text-xs">
          <span>Current: <strong className="text-molt-text">{karmaForecast.current}</strong></span>
          <span>7d: <strong className="text-molt-accent">{karmaForecast.projected_7d}</strong></span>
          <span>30d: <strong className="text-molt-accent">{karmaForecast.projected_30d}</strong></span>
        </div>
      )}
      <svg ref={svgRef} className="w-full" style={{ height: 150 }} />
      {karmaForecast?.analysis && (
        <p className="text-xs text-molt-muted mt-2">{karmaForecast.analysis}</p>
      )}
    </div>
  )
}

// --- Post Idea Generator ---
function PostIdeaGenerator() {
  const { postIdeas, setPostIdeas, addNotification } = useStore()
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    setLoading(true)
    try {
      const result = await invoke<{ ideas: PostIdea[] }>(IPC.BONUS_IDEAS)
      setPostIdeas(result.ideas)
    } catch (err: any) {
      addNotification(err.message || 'Failed to generate ideas', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { generate() }, [])

  return (
    <div className="panel-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Post Ideas</h3>
        <button onClick={generate} className="btn-secondary text-xs" disabled={loading}>
          {loading ? 'Generating...' : 'Regenerate'}
        </button>
      </div>
      {postIdeas.length === 0 ? (
        <p className="text-xs text-molt-muted">No ideas generated yet</p>
      ) : (
        <div className="space-y-2">
          {postIdeas.map((idea) => (
            <div key={idea.id} className="p-2 bg-molt-bg rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="badge bg-molt-accent/20 text-molt-accent text-xs">{idea.submolt}</span>
                <span className="text-xs text-molt-muted">~{idea.estimated_karma} karma</span>
              </div>
              <h4 className="text-sm font-medium">{idea.title}</h4>
              <p className="text-xs text-molt-muted mt-1">{idea.content_outline}</p>
              <button
                onClick={() => {
                  // Navigate to feed with pre-filled content
                  addNotification(`Idea adopted: "${idea.title}"`, 'info')
                }}
                className="text-xs text-molt-accent hover:text-molt-accent-hover mt-1"
              >
                Adopt this idea
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Main Bonus Panel ---
export function BonusPanel() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border">
        <h2 className="text-lg font-semibold">Bonus Features</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-4">
          <MoodRing />
          <KarmaForecastChart />
          <TrendDetector />
          <RivalryTracker />
          <div className="col-span-2">
            <PostIdeaGenerator />
          </div>
        </div>
      </div>
    </div>
  )
}
