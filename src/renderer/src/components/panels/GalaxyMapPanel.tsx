import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { GalaxyNode, GalaxyEdge, AgentPersona } from '@shared/domain.types'

// --- Helpers ---

function getTimeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}

// --- Log-based normalization (spreads lower values, compresses top) ---
// Maps subscriber count to 0..1 using log scale relative to max
function logNorm(subs: number, maxSubs: number): number {
  if (maxSubs <= 1) return 0
  const s = Math.max(subs, 1)
  return Math.log10(s) / Math.log10(maxSubs)
}

// --- Popularity color: hard tiers, no blending, stark contrast ---
function popularityColor(subscriberCount: number): string {
  const s = subscriberCount ?? 0
  if (s >= 2000) return '#f04040'  // hot red
  if (s >= 500)  return '#e88a40'  // bright orange
  if (s >= 100)  return '#a855f4'  // vivid purple
  if (s >= 20)   return '#3b9cf0'  // bright blue
  return '#4a5578'                  // dim steel
}

// --- Node radius: power-curve on linear ratio for dramatic size tiers ---
//   1 → ~15px,  50 → ~27px,  200 → ~35px,
//   1000 → ~49px,  5000 → ~69px,  10000 → ~80px
function nodeRadius(subscriberCount: number, maxSubs: number): number {
  if (maxSubs <= 1) return 15
  const ratio = Math.min(Math.max(subscriberCount, 1) / maxSubs, 1)
  const t = Math.pow(ratio, 0.25) // strong root pushes small up, keeps big big
  return 8 + t * 72 // 8px floor → 80px ceiling
}

// --- Glow intensity from popularity (log-scaled) ---
function glowStrength(subscriberCount: number, maxSubs: number): number {
  if (maxSubs <= 1) return 2
  const t = logNorm(subscriberCount, maxSubs)
  return 2 + t * 6
}

// --- Truncate long labels ---
function truncLabel(name: string, max: number = 20): string {
  return name.length > max ? name.slice(0, max - 1) + '\u2026' : name
}

// --- Fallback color for sidebar/detail (preserves identity) ---
const PALETTE = ['#7c5cfc', '#5c8afc', '#fc5c8a', '#5cfca4', '#fcb45c', '#c45cfc', '#5cd4fc', '#fc5c5c']
function fallbackColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

// --- Force Graph Component ---

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  data: GalaxyNode
  radius: number
  color: string
  glow: number   // stdDeviation for this node's glow filter
}

function ForceGraph({ nodes, edges, selectedId, onSelect, pagination }: {
  nodes: GalaxyNode[]
  edges: GalaxyEdge[]
  selectedId: string | null
  onSelect: (node: GalaxyNode) => void
  pagination?: {
    pageOffset: number
    hasMore: boolean
    loading: boolean
    apiTotal: number | null
    currentCount: number
    onPrev: () => void
    onNext: () => void
  }
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GalaxyNode } | null>(null)
  const simRef = useRef<d3.Simulation<SimNode, undefined> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  // Build simulation nodes — sized + colored by popularity
  const simNodes: SimNode[] = useMemo(() => {
    const maxSubs = nodes.length > 0
      ? Math.max(...nodes.map(n => n.subscriber_count ?? 0), 1)
      : 1
    return nodes.map((n) => ({
      id: n.id,
      data: n,
      radius: nodeRadius(n.subscriber_count ?? 0, maxSubs),
      color: popularityColor(n.subscriber_count ?? 0),
      glow: glowStrength(n.subscriber_count ?? 0, maxSubs)
    }))
  }, [nodes])

  // Build simulation links
  const simLinks = useMemo(() => {
    const nodeIds = new Set(nodes.map(n => n.id))
    return edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)).map(e => ({
      source: e.source,
      target: e.target,
      weight: e.weight ?? 1
    }))
  }, [edges, nodes])

  useEffect(() => {
    const svg = svgRef.current
    const container = containerRef.current
    if (!svg || !container || simNodes.length === 0) return

    const width = container.clientWidth
    const height = container.clientHeight

    // Clear previous
    d3.select(svg).selectAll('*').remove()

    const defs = d3.select(svg).append('defs')

    // Per-node glow filters (keyed by rounded stdDeviation to avoid excessive filter elements)
    const glowLevels = new Set(simNodes.map(n => Math.round(n.glow)))
    glowLevels.forEach(level => {
      const filter = defs.append('filter').attr('id', `glow-${level}`)
        .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
      filter.append('feGaussianBlur').attr('stdDeviation', level).attr('result', 'blur')
      filter.append('feMerge').selectAll('feMergeNode')
        .data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', d => d)
    })

    // Selected ring filter (extra bright)
    const selectedFilter = defs.append('filter').attr('id', 'selected-glow')
      .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
    selectedFilter.append('feGaussianBlur').attr('stdDeviation', '8').attr('result', 'blur')
    selectedFilter.append('feMerge').selectAll('feMergeNode')
      .data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', d => d)

    // Radial gradients per node
    simNodes.forEach((n) => {
      const grad = defs.append('radialGradient')
        .attr('id', `grad-${n.id}`)
        .attr('cx', '35%').attr('cy', '35%').attr('r', '65%')
      grad.append('stop').attr('offset', '0%').attr('stop-color', d3.color(n.color)!.brighter(1.2).formatHex())
      grad.append('stop').attr('offset', '100%').attr('stop-color', n.color)
    })

    const g = d3.select(svg).append('g')

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .on('zoom', (event) => g.attr('transform', event.transform))
    d3.select(svg).call(zoom)
    zoomRef.current = zoom

    // Center initially
    d3.select(svg).call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85))

    // Links — very subtle, only visible on hover/zoom
    const linkGroup = g.append('g').attr('class', 'links')
    const linkElements = linkGroup.selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', '#2a2a4a')
      .attr('stroke-width', 0.5)
      .attr('stroke-opacity', 0.1)

    // Node groups
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const nodeElements = nodeGroup.selectAll<SVGGElement, SimNode>('g')
      .data(simNodes, d => d.id)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x; d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simRef.current?.alphaTarget(0)
          d.fx = null; d.fy = null
        })
      )

    // Main circle
    nodeElements.append('circle')
      .attr('class', 'main-orb')
      .attr('r', d => d.radius)
      .attr('fill', d => `url(#grad-${d.id})`)
      .attr('stroke', d => d.color)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('filter', d => `url(#glow-${Math.round(d.glow)})`)

    // Label — truncated, brighter for popular submolts
    nodeElements.append('text')
      .text(d => truncLabel(d.data.display_name || d.data.name))
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 14)
      .attr('fill', d => d.radius > 40 ? '#c0c0d0' : '#8888a0')
      .attr('font-size', d => Math.max(9, Math.min(14, d.radius * 0.28)))
      .attr('font-weight', d => d.radius > 50 ? '600' : '400')
      .attr('font-family', 'inherit')
      .attr('pointer-events', 'none')

    // Subscriber count inside node (for larger nodes) — dark outline for readability
    nodeElements.each(function(d) {
      if (d.radius >= 28) {
        d3.select(this).append('text')
          .text(formatCount(d.data.subscriber_count))
          .attr('text-anchor', 'middle')
          .attr('dy', -2)
          .attr('fill', '#fff')
          .attr('stroke', '#000')
          .attr('stroke-width', 3)
          .attr('paint-order', 'stroke')
          .attr('font-size', Math.max(9, d.radius * 0.3))
          .attr('font-weight', '700')
          .attr('font-family', 'inherit')
          .attr('pointer-events', 'none')

        d3.select(this).append('text')
          .text('subs')
          .attr('text-anchor', 'middle')
          .attr('dy', 10)
          .attr('fill', '#fff')
          .attr('stroke', '#000')
          .attr('stroke-width', 2)
          .attr('paint-order', 'stroke')
          .attr('font-size', Math.max(7, d.radius * 0.2))
          .attr('font-family', 'inherit')
          .attr('pointer-events', 'none')
          .attr('opacity', 0.7)
      }
    })

    // Initial letter for small nodes
    nodeElements.each(function(d) {
      if (d.radius < 28) {
        d3.select(this).append('text')
          .text((d.data.display_name || d.data.name).charAt(0).toUpperCase())
          .attr('text-anchor', 'middle')
          .attr('dy', 4)
          .attr('fill', '#fff')
          .attr('stroke', '#000')
          .attr('stroke-width', 2)
          .attr('paint-order', 'stroke')
          .attr('font-size', d.radius * 0.7)
          .attr('font-weight', '700')
          .attr('font-family', 'inherit')
          .attr('pointer-events', 'none')
      }
    })

    // Subscribed indicator — bright white ring + small star badge
    nodeElements.each(function(d) {
      if (d.data.is_subscribed) {
        const el = d3.select(this)

        // Bright outer ring
        el.append('circle')
          .attr('r', d.radius + 3)
          .attr('fill', 'none')
          .attr('stroke', '#fff')
          .attr('stroke-width', 2.5)
          .attr('stroke-opacity', 0.85)
          .attr('pointer-events', 'none')

        // Small star at top-right
        const starR = Math.max(7, d.radius * 0.2)
        const sx = d.radius * 0.7
        const sy = -d.radius * 0.7
        const star = el.append('g')
          .attr('transform', `translate(${sx},${sy})`)
          .attr('pointer-events', 'none')

        star.append('circle')
          .attr('r', starR + 1)
          .attr('fill', '#0a0a12')

        // 5-point star path
        const pts: string[] = []
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? starR : starR * 0.45
          const a = (Math.PI / 2) + (i * Math.PI / 5)
          pts.push(`${-Math.cos(a) * r},${-Math.sin(a) * r}`)
        }
        star.append('polygon')
          .attr('points', pts.join(' '))
          .attr('fill', '#fbbf24')
          .attr('stroke', '#0a0a12')
          .attr('stroke-width', 0.5)
      }
    })

    // Interactions
    nodeElements
      .on('click', (_event, d) => {
        onSelect(d.data)
      })
      .on('mouseenter', (event, d) => {
        setHoveredId(d.id)
        const rect = container.getBoundingClientRect()
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top - 10,
          node: d.data
        })
        d3.select(event.currentTarget).select('circle.main-orb')
          .transition().duration(150)
          .attr('r', d.radius + 4)
          .attr('stroke-width', 2.5)
          .attr('stroke-opacity', 1)
      })
      .on('mouseleave', (event, d) => {
        setHoveredId(null)
        setTooltip(null)
        d3.select(event.currentTarget).select('circle.main-orb')
          .transition().duration(150)
          .attr('r', d.radius)
          .attr('stroke-width', 1.5)
          .attr('stroke-opacity', 0.6)
      })

    // Force simulation
    const sim = d3.forceSimulation(simNodes)
      .force('charge', d3.forceManyBody().strength(d => -d.radius * 8))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide<SimNode>().radius(d => d.radius + 8).strength(0.8))
      .force('link', d3.forceLink(simLinks).id((d: any) => d.id).distance(120).strength(0.3))
      .force('x', d3.forceX(0).strength(0.05))
      .force('y', d3.forceY(0).strength(0.05))
      .on('tick', () => {
        linkElements
          .attr('x1', (d: any) => d.source.x)
          .attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x)
          .attr('y2', (d: any) => d.target.y)

        nodeElements.attr('transform', d => `translate(${d.x},${d.y})`)
      })

    simRef.current = sim

    return () => { sim.stop() }
  }, [simNodes, simLinks, onSelect])

  // Highlight selected node
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    d3.select(svg).selectAll<SVGGElement, SimNode>('.nodes g').each(function(d) {
      const el = d3.select(this)
      const isSelected = d.id === selectedId
      el.select('circle.main-orb')
        .attr('filter', isSelected ? 'url(#selected-glow)' : `url(#glow-${Math.round(d.glow)})`)
        .attr('stroke-width', isSelected ? 3 : 1.5)
        .attr('stroke-opacity', isSelected ? 1 : 0.6)
    })
  }, [selectedId])

  const handleZoom = useCallback((factor: number) => {
    const svg = svgRef.current
    if (!svg || !zoomRef.current) return
    d3.select(svg).transition().duration(250).call(zoomRef.current.scaleBy, factor)
  }, [])

  const handleResetView = useCallback(() => {
    const svg = svgRef.current
    const container = containerRef.current
    if (!svg || !container || !zoomRef.current || simNodes.length === 0) return

    const width = container.clientWidth
    const height = container.clientHeight

    // Compute bounding box of all nodes (including their radius)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of simNodes) {
      const x = n.x ?? 0
      const y = n.y ?? 0
      minX = Math.min(minX, x - n.radius)
      maxX = Math.max(maxX, x + n.radius)
      minY = Math.min(minY, y - n.radius)
      maxY = Math.max(maxY, y + n.radius)
    }

    const graphW = maxX - minX || 1
    const graphH = maxY - minY || 1
    const padding = 40
    const scale = Math.min(
      (width - padding * 2) / graphW,
      (height - padding * 2) / graphH
    )
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    d3.select(svg).transition().duration(400)
      .call(zoomRef.current.transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-cx, -cy)
      )
  }, [simNodes])

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ background: '#0a0a12' }}>
      <svg ref={svgRef} width="100%" height="100%" />

      {/* Bottom-right controls: pagination + zoom */}
      <div className="absolute bottom-4 right-4 flex items-end gap-2 z-10">
        {/* Pagination */}
        {pagination && pagination.apiTotal != null && pagination.apiTotal > PAGE_SIZE && (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] text-molt-muted/70 tabular-nums">
              {pagination.pageOffset + 1}&ndash;{pagination.pageOffset + pagination.currentCount} / {pagination.apiTotal.toLocaleString()}
            </span>
            <div className="flex gap-1">
              <button
                onClick={pagination.onPrev}
                disabled={pagination.pageOffset === 0 || pagination.loading}
                className="h-9 px-2.5 flex items-center justify-center rounded-lg bg-molt-surface/80 backdrop-blur border border-molt-border text-molt-text hover:bg-molt-surface hover:text-white transition-colors text-xs font-medium disabled:opacity-30 disabled:pointer-events-none"
                title="Previous page"
              >&larr; Prev</button>
              <button
                onClick={pagination.onNext}
                disabled={!pagination.hasMore || pagination.loading}
                className="h-9 px-2.5 flex items-center justify-center rounded-lg bg-molt-surface/80 backdrop-blur border border-molt-border text-molt-text hover:bg-molt-surface hover:text-white transition-colors text-xs font-medium disabled:opacity-30 disabled:pointer-events-none"
                title="Next page"
              >Next &rarr;</button>
            </div>
          </div>
        )}
        {/* Zoom */}
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => handleZoom(1.4)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-molt-surface/80 backdrop-blur border border-molt-border text-molt-text hover:bg-molt-surface hover:text-white transition-colors text-lg font-medium"
            title="Zoom in"
          >+</button>
          <button
            onClick={() => handleZoom(1 / 1.4)}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-molt-surface/80 backdrop-blur border border-molt-border text-molt-text hover:bg-molt-surface hover:text-white transition-colors text-lg font-medium"
            title="Zoom out"
          >&minus;</button>
          <button
            onClick={handleResetView}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-molt-surface/80 backdrop-blur border border-molt-border text-molt-muted hover:bg-molt-surface hover:text-white transition-colors text-xs font-medium"
            title="Reset view"
          >FIT</button>
        </div>
      </div>

      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 bg-molt-surface/95 backdrop-blur border border-molt-border rounded-xl px-4 py-3 shadow-2xl"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="font-semibold text-sm text-molt-text">{tooltip.node.display_name || tooltip.node.name}</div>
          <div className="flex items-center gap-3 mt-1 text-xs text-molt-muted">
            <span>{formatCount(tooltip.node.subscriber_count)} subscribers</span>
            <span>{tooltip.node.post_count} posts</span>
          </div>
          {tooltip.node.is_subscribed && (
            <div className="mt-1 text-[10px] text-molt-accent font-medium">Subscribed</div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Detail Sidebar ---

function SubmoltDetailSidebar() {
  const { selectedSubmoltDetail, setSelectedSubmoltDetail, galaxyNodes, setGalaxyData, galaxyEdges, addNotification, submolts, setSubmolts, activePersonaId, savedPersonas, setSavedPersonas } = useStore()
  const [subscribing, setSubscribing] = useState(false)
  const [deploying, setDeploying] = useState(false)

  if (!selectedSubmoltDetail) return null

  const sub = selectedSubmoltDetail as any
  const themeColor = sub.theme_color || '#7c5cfc'

  const handleSubscribe = async () => {
    setSubscribing(true)
    try {
      if (sub.is_subscribed) {
        await invoke(IPC.SUBMOLTS_UNSUBSCRIBE, { submolt_name: sub.name })
        addNotification(`Unsubscribed from ${sub.display_name || sub.name}`, 'info')
      } else {
        await invoke(IPC.SUBMOLTS_SUBSCRIBE, { submolt_name: sub.name })
        addNotification(`Subscribed to ${sub.display_name || sub.name}`, 'success')
      }
      const newSubscribed = !sub.is_subscribed
      const newCount = sub.subscriber_count + (newSubscribed ? 1 : -1)
      setSelectedSubmoltDetail({ ...sub, is_subscribed: newSubscribed, subscriber_count: newCount })
      const updatedNodes = galaxyNodes.map((n) =>
        n.id === sub.id ? { ...n, is_subscribed: newSubscribed, subscriber_count: newCount } : n
      )
      setGalaxyData(updatedNodes, galaxyEdges)
      // Sync submolts store so sidebar subscriptions update
      if (submolts.length > 0) {
        setSubmolts(submolts.map((s) =>
          s.id === sub.id ? { ...s, is_subscribed: newSubscribed, subscriber_count: newCount } : s
        ))
      }
    } catch (err: any) {
      addNotification(err.message || 'Action failed', 'error')
    } finally {
      setSubscribing(false)
    }
  }

  return (
    <div className="w-80 border-l border-molt-border flex flex-col bg-molt-bg overflow-y-auto shrink-0">
      {/* Accent header */}
      <div className="relative">
        <div className="h-20" style={{ background: `linear-gradient(135deg, ${themeColor}50, ${themeColor}15)` }} />
        <button
          onClick={() => setSelectedSubmoltDetail(null)}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-molt-bg/60 hover:bg-molt-bg text-molt-muted hover:text-molt-text text-lg transition-colors"
        >
          &times;
        </button>
      </div>

      <div className="px-5 pb-5 -mt-6">
        {/* Icon */}
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-lg ring-2 ring-molt-bg"
          style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` }}
        >
          {(sub.display_name || sub.name || '?').charAt(0).toUpperCase()}
        </div>

        {/* Name */}
        <h3 className="text-lg font-bold text-molt-text mt-3 leading-tight">
          {sub.display_name || sub.name}
        </h3>
        <p className="text-xs text-molt-muted mt-0.5 font-mono">m/{sub.name}</p>

        {/* Description */}
        {sub.description && (
          <p className="text-sm text-molt-text/70 mt-3 leading-relaxed">{sub.description}</p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="bg-molt-surface rounded-xl p-3 text-center">
            <div className="text-xl font-bold" style={{ color: themeColor }}>
              {formatCount(sub.subscriber_count ?? 0)}
            </div>
            <div className="text-[10px] text-molt-muted uppercase tracking-wider mt-0.5">Subscribers</div>
          </div>
          <div className="bg-molt-surface rounded-xl p-3 text-center">
            <div className="text-xl font-bold text-molt-text">
              {formatCount(sub.post_count ?? 0)}
            </div>
            <div className="text-[10px] text-molt-muted uppercase tracking-wider mt-0.5">Posts</div>
          </div>
        </div>

        {/* Meta */}
        {(sub.created_at || sub.last_activity_at || sub.created_by) && (
          <div className="mt-4 space-y-2 text-xs">
            {sub.created_at && (
              <div className="flex justify-between text-molt-muted">
                <span>Created</span>
                <span className="text-molt-text/70">{getTimeAgo(sub.created_at)}</span>
              </div>
            )}
            {sub.last_activity_at && (
              <div className="flex justify-between text-molt-muted">
                <span>Last active</span>
                <span className="text-molt-text/70">{getTimeAgo(sub.last_activity_at)}</span>
              </div>
            )}
            {sub.created_by && (
              <div className="flex justify-between text-molt-muted">
                <span>Created by</span>
                <span className="text-molt-accent">{sub.created_by}</span>
              </div>
            )}
          </div>
        )}

        {/* Subscribe button */}
        <button
          onClick={handleSubscribe}
          disabled={subscribing}
          className={`mt-5 w-full py-3 rounded-xl text-sm font-semibold transition-all ${
            sub.is_subscribed
              ? 'bg-molt-surface border border-molt-border text-molt-muted hover:text-red-400 hover:border-red-400/40'
              : 'text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]'
          } disabled:opacity-50 disabled:pointer-events-none`}
          style={!sub.is_subscribed ? { background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` } : undefined}
        >
          {subscribing
            ? (sub.is_subscribed ? 'Unsubscribing...' : 'Subscribing...')
            : (sub.is_subscribed ? 'Unsubscribe' : 'Subscribe')
          }
        </button>

        {/* Deploy agent */}
        {(() => {
          const persona = savedPersonas.find(p => p.id === activePersonaId) ?? null
          const isTargeted = persona ? persona.submolt_priorities?.[sub.name] !== undefined : false

          const handleDeployAgent = async () => {
            if (!persona) {
              addNotification('No persona selected. Go to Autopilot to select one.', 'warning')
              return
            }
            setDeploying(true)
            try {
              const newPriorities = { ...persona.submolt_priorities }
              if (isTargeted) {
                delete newPriorities[sub.name]
              } else {
                newPriorities[sub.name] = 5
              }
              const updated = { ...persona, submolt_priorities: newPriorities }
              await invoke(IPC.PERSONA_SAVE, { persona: updated })
              const personas = await invoke<AgentPersona[]>(IPC.PERSONA_LIST)
              setSavedPersonas(personas)
              addNotification(
                isTargeted
                  ? `Removed m/${sub.name} from agent targets`
                  : `Agent now targeting m/${sub.name}`,
                isTargeted ? 'info' : 'success'
              )
            } catch (err: any) {
              addNotification(err.message || 'Failed to update agent targets', 'error')
            } finally {
              setDeploying(false)
            }
          }

          return (
            <button
              onClick={handleDeployAgent}
              disabled={deploying}
              className={`mt-2 w-full py-3 rounded-xl text-sm font-semibold transition-all ${
                isTargeted
                  ? 'bg-molt-accent/10 border border-molt-accent/30 text-molt-accent hover:bg-molt-accent/20'
                  : 'bg-molt-accent/20 border-2 border-molt-accent text-molt-accent hover:bg-molt-accent/30'
              } disabled:opacity-50 disabled:pointer-events-none`}
            >
              {deploying
                ? (isTargeted ? 'Removing...' : 'Deploying...')
                : (isTargeted ? 'Agent Targeting (click to remove)' : 'Deploy Agent Here')
              }
            </button>
          )
        })()}

        {/* View feed */}
        <button
          onClick={() => {
            const { setActivePanel, setSelectedSubmolt } = useStore.getState() as any
            if (setSelectedSubmolt) setSelectedSubmolt(sub.name)
            if (setActivePanel) setActivePanel('feed')
          }}
          className="mt-2 w-full py-2.5 rounded-xl text-sm text-molt-muted hover:text-molt-text bg-molt-surface hover:bg-molt-surface/80 transition-colors"
        >
          View Posts in Feed
        </button>
      </div>
    </div>
  )
}

// --- Main Panel ---

// 100 per page — matches what the API returns per call (one call per page, no batching)
const PAGE_SIZE = 100

function submoltsToNodes(submolts: any[]): GalaxyNode[] {
  return submolts.map((s: any) => ({
    id: s.id ?? s.name,
    name: s.name,
    display_name: s.display_name ?? s.name,
    theme_color: s.theme_color ?? '',
    subscriber_count: s.subscriber_count ?? s.subscribers ?? 0,
    post_count: s.post_count ?? 0,
    is_subscribed: s.is_subscribed ?? false,
    x: undefined as any,
    y: undefined as any,
    z: undefined as any
  }))
}

export function GalaxyMapPanel() {
  const { galaxyNodes, galaxyEdges, setGalaxyData, selectedSubmoltDetail, setSelectedSubmoltDetail } = useStore()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [apiTotal, setApiTotal] = useState<number | null>(null)
  const [pageOffset, setPageOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const loadPage = useCallback(async (offset: number) => {
    setLoading(true)
    try {
      // Single API call per page via the dedicated paginated endpoint
      const data: any = await invoke(IPC.SUBMOLTS_GET_PAGE, { limit: PAGE_SIZE, offset })
      if (data?.api_total != null) setApiTotal(data.api_total)
      setHasMore(data?.has_more ?? false)
      setPageOffset(offset)
      const submolts = data?.submolts ?? data ?? []
      if (!Array.isArray(submolts) || submolts.length === 0) {
        setGalaxyData([], [])
        return
      }
      setGalaxyData(submoltsToNodes(submolts), [])
    } catch (err) {
      console.error('Galaxy map load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [setGalaxyData])

  useEffect(() => {
    // Try galaxy endpoint first, fall back to paginated list
    const load = async () => {
      setLoading(true)
      try {
        const galaxyData: any = await invoke(IPC.SUBMOLTS_GET_GALAXY).catch(() => null)
        if (galaxyData?.nodes?.length) {
          setGalaxyData(galaxyData.nodes, galaxyData.edges ?? [])
          setLoading(false)
          return
        }
      } catch {}
      // Fall back to paginated list
      await loadPage(0)
    }
    load()
  }, [setGalaxyData, loadPage])

  const handleSelect = useCallback((node: GalaxyNode) => {
    setSelectedSubmoltDetail({
      id: node.id,
      name: node.name,
      display_name: node.display_name,
      description: '',
      theme_color: node.theme_color || fallbackColor(node.name),
      subscriber_count: node.subscriber_count,
      post_count: node.post_count,
      is_subscribed: node.is_subscribed,
      moderators: [],
      rules: [],
      your_role: null,
      created_at: ''
    })
    invoke(IPC.SUBMOLTS_GET_DETAIL, { submolt_name: node.name })
      .then((detail: any) => {
        setSelectedSubmoltDetail({
          id: detail.id ?? node.id,
          name: detail.name ?? node.name,
          display_name: detail.display_name ?? node.display_name,
          description: detail.description ?? '',
          theme_color: detail.theme_color ?? node.theme_color ?? fallbackColor(node.name),
          subscriber_count: detail.subscriber_count ?? node.subscriber_count,
          post_count: detail.post_count ?? node.post_count,
          is_subscribed: detail.is_subscribed ?? node.is_subscribed,
          moderators: detail.moderators ?? [],
          rules: detail.rules ?? [],
          your_role: detail.your_role ?? null,
          created_at: detail.created_at ?? ''
        })
      })
      .catch(() => {})
  }, [setSelectedSubmoltDetail])

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return galaxyNodes
    const q = search.toLowerCase()
    return galaxyNodes.filter(n =>
      n.name.toLowerCase().includes(q) || (n.display_name || '').toLowerCase().includes(q)
    )
  }, [galaxyNodes, search])

  const selectedId = (selectedSubmoltDetail as any)?.id ?? null

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-molt-border flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold shrink-0">Submolt Network</h2>
        <div className="flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Search submolts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-molt-surface border border-molt-border rounded-lg px-3 py-1.5 text-sm text-molt-text placeholder:text-molt-muted/50 focus:outline-none focus:border-molt-accent/50"
          />
        </div>
        <span className="text-xs text-molt-muted shrink-0">
          {apiTotal != null
            ? `${apiTotal.toLocaleString()} submolts`
            : `${filteredNodes.length} submolts`
          }
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0">
          {galaxyNodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-molt-muted">
              <div className="text-center">
                {loading ? (
                  <div className="space-y-2">
                    <div className="w-8 h-8 border-2 border-molt-accent/30 border-t-molt-accent rounded-full animate-spin mx-auto" />
                    <p className="text-sm">Loading submolts...</p>
                  </div>
                ) : (
                  <>
                    <p className="text-lg mb-2">No submolts found</p>
                    <p className="text-sm">Make sure your Moltbook API key is connected in Settings</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <ForceGraph
              nodes={filteredNodes}
              edges={galaxyEdges}
              selectedId={selectedId}
              onSelect={handleSelect}
              pagination={{
                pageOffset,
                hasMore,
                loading,
                apiTotal,
                currentCount: filteredNodes.length,
                onPrev: () => loadPage(Math.max(0, pageOffset - PAGE_SIZE)),
                onNext: () => loadPage(pageOffset + PAGE_SIZE)
              }}
            />
          )}
        </div>
        <SubmoltDetailSidebar />
      </div>
    </div>
  )
}
