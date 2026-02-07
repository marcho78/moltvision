import React, { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { Comment } from '@shared/domain.types'
import * as d3 from 'd3'

function CommentDetail({ comment }: { comment: Comment | null }) {
  if (!comment) return (
    <div className="flex items-center justify-center h-full text-molt-muted text-sm">
      Select a comment to view details
    </div>
  )

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{comment.author?.username}</span>
        <span className="text-xs text-molt-muted">{comment.karma} karma</span>
      </div>
      <p className="text-sm text-molt-text">{comment.content}</p>
      <div className="text-xs text-molt-muted">
        Depth: {comment.depth} | ID: {comment.id}
      </div>
    </div>
  )
}

function ConversationTree({ comments }: { comments: Comment[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const setSelectedComment = useStore((s) => s.setSelectedComment)

  useEffect(() => {
    if (!svgRef.current || comments.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight
    const margin = { top: 20, right: 20, bottom: 20, left: 40 }

    // Build hierarchy
    const rootData = {
      id: 'root',
      content: 'Post',
      karma: 0,
      children: buildTree(comments)
    }

    const root = d3.hierarchy(rootData)
    const treeLayout = d3.tree().size([
      height - margin.top - margin.bottom,
      width - margin.left - margin.right
    ])
    treeLayout(root as any)

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Links
    g.selectAll('.link')
      .data(root.links())
      .join('path')
      .attr('class', 'link')
      .attr('d', d3.linkHorizontal()
        .x((d: any) => d.y)
        .y((d: any) => d.x) as any)
      .attr('fill', 'none')
      .attr('stroke', '#2a2a3a')
      .attr('stroke-width', 1.5)

    // Nodes
    const nodes = g.selectAll('.node')
      .data(root.descendants())
      .join('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer')
      .on('click', (_e: any, d: any) => {
        if (d.data.id !== 'root') {
          setSelectedComment(d.data as Comment)
        }
      })

    // Node circles — size by karma, color by sentiment
    nodes.append('circle')
      .attr('r', (d: any) => Math.max(4, Math.min(12, Math.sqrt(Math.abs(d.data.karma || 0) + 1) * 3)))
      .attr('fill', (d: any) => {
        const karma = d.data.karma ?? 0
        if (karma > 5) return '#22c55e'
        if (karma > 0) return '#7c5cfc'
        if (karma === 0) return '#8888a0'
        return '#ef4444'
      })
      .attr('stroke', '#1a1a24')
      .attr('stroke-width', 2)

    // Labels
    nodes.append('text')
      .attr('dy', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#8888a0')
      .attr('font-size', '10px')
      .text((d: any) => d.data.author?.username ?? '')

  }, [comments, setSelectedComment])

  return <svg ref={svgRef} className="w-full h-full" />
}

function buildTree(comments: Comment[]): any[] {
  const map = new Map<string | null, Comment[]>()
  comments.forEach((c) => {
    const parent = c.parent_id ?? null
    if (!map.has(parent)) map.set(parent, [])
    map.get(parent)!.push(c)
  })

  function build(parentId: string | null): any[] {
    const children = map.get(parentId) ?? []
    return children.map((c) => ({
      ...c,
      children: build(c.id)
    }))
  }

  return build(null)
}

export function ConversationPanel() {
  const { activePostId, comments, selectedComment, setComments } = useStore()

  useEffect(() => {
    if (!activePostId) return
    invoke(IPC.COMMENTS_GET_TREE, { post_id: activePostId })
      .then((result: any) => setComments(result.comments ?? []))
      .catch(console.error)
  }, [activePostId, setComments])

  if (!activePostId) {
    return (
      <div className="h-full flex items-center justify-center text-molt-muted">
        <div className="text-center">
          <p className="text-lg mb-2">No conversation selected</p>
          <p className="text-sm">Click on a post in the Feed to view its conversation tree</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border flex items-center justify-between">
        <h2 className="text-lg font-semibold">Conversation Tree</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-molt-muted">
            <div className="w-2 h-2 rounded-full bg-molt-success" /> Positive
            <div className="w-2 h-2 rounded-full bg-molt-accent ml-2" /> Neutral+
            <div className="w-2 h-2 rounded-full bg-molt-muted ml-2" /> Zero
            <div className="w-2 h-2 rounded-full bg-molt-error ml-2" /> Negative
          </div>
        </div>
      </div>
      <div className="flex-1 flex">
        <div className="flex-1 min-h-0">
          <ConversationTree comments={comments} />
        </div>
        <div className="w-72 border-l border-molt-border overflow-y-auto">
          <CommentDetail comment={selectedComment} />
        </div>
      </div>
    </div>
  )
}
