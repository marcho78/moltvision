import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { SearchResult } from '@shared/domain.types'
import * as d3 from 'd3'

function SearchScatter() {
  const svgRef = useRef<SVGSVGElement>(null)
  const { searchPoints, searchClusters, searchResults } = useStore()

  useEffect(() => {
    if (!svgRef.current || searchPoints.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight
    const margin = { top: 20, right: 20, bottom: 20, left: 20 }

    const xExtent = d3.extent(searchPoints, (d) => d.x) as [number, number]
    const yExtent = d3.extent(searchPoints, (d) => d.y) as [number, number]

    const xScale = d3.scaleLinear()
      .domain(xExtent)
      .range([margin.left, width - margin.right])

    const yScale = d3.scaleLinear()
      .domain(yExtent)
      .range([margin.top, height - margin.bottom])

    const g = svg.append('g')

    // Draw cluster hulls
    searchClusters.forEach((cluster) => {
      const clusterPoints = searchPoints
        .filter((p) => cluster.items.includes(p.id))
        .map((p) => [xScale(p.x), yScale(p.y)] as [number, number])

      if (clusterPoints.length >= 3) {
        const hull = d3.polygonHull(clusterPoints)
        if (hull) {
          g.append('path')
            .attr('d', `M${hull.join('L')}Z`)
            .attr('fill', cluster.color)
            .attr('fill-opacity', 0.1)
            .attr('stroke', cluster.color)
            .attr('stroke-opacity', 0.3)
            .attr('stroke-width', 1)
        }
      }
    })

    // Draw points
    g.selectAll('circle')
      .data(searchPoints)
      .join('circle')
      .attr('cx', (d) => xScale(d.x))
      .attr('cy', (d) => yScale(d.y))
      .attr('r', 5)
      .attr('fill', (d) => {
        const cluster = searchClusters.find((c) => c.items.includes(d.id))
        return cluster?.color ?? '#7c5cfc'
      })
      .attr('fill-opacity', 0.7)
      .attr('stroke', '#1a1a24')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .append('title')
      .text((d) => {
        const result = searchResults.find((r) => r.id === d.id)
        return result?.title ?? d.id
      })

  }, [searchPoints, searchClusters, searchResults])

  if (searchPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-molt-muted text-sm">
        Search results will appear as a scatter plot
      </div>
    )
  }

  return <svg ref={svgRef} className="w-full h-full" />
}

function SearchResultCard({ result }: { result: SearchResult }) {
  return (
    <div className="panel-card p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="badge bg-molt-accent/20 text-molt-accent text-xs">{result.type}</span>
        <span className="text-xs text-molt-muted">Score: {result.score.toFixed(2)}</span>
      </div>
      <h4 className="text-sm font-medium text-molt-text truncate">{result.title}</h4>
      <p className="text-xs text-molt-muted mt-1 line-clamp-2">{result.snippet}</p>
    </div>
  )
}

export function SearchExplorerPanel() {
  const { searchQuery, searchResults, setSearchQuery, setSearchResults, setSearchClusters, similarityThreshold, setSimilarityThreshold } = useStore()
  const [loading, setLoading] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    try {
      const result = await invoke<{ results: SearchResult[] }>(IPC.SEARCH_EXECUTE, {
        query: searchQuery,
        limit: 50
      })
      setSearchResults(result.results)

      // Get clusters
      if (result.results.length > 0) {
        const clusters = await invoke<{ clusters: any[]; points: any[] }>(IPC.SEARCH_GET_CLUSTERS, {
          results: result.results
        })
        setSearchClusters(clusters.clusters, clusters.points)
      }
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, setSearchResults, setSearchClusters])

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border">
        <h2 className="text-lg font-semibold mb-3">Semantic Search Explorer</h2>
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search posts, comments, agents..."
            className="input-field flex-1 text-sm"
          />
          <button onClick={handleSearch} className="btn-primary text-sm" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-molt-muted">Similarity:</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={similarityThreshold}
            onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-xs text-molt-muted w-8">{similarityThreshold.toFixed(2)}</span>
        </div>
      </div>
      <div className="flex-1 flex min-h-0">
        <div className="flex-1">
          <SearchScatter />
        </div>
        <div className="w-72 border-l border-molt-border overflow-y-auto p-2 space-y-2">
          {searchResults.length === 0 ? (
            <div className="text-molt-muted text-sm text-center mt-8">No results</div>
          ) : (
            searchResults.map((r) => <SearchResultCard key={r.id} result={r} />)
          )}
        </div>
      </div>
    </div>
  )
}
