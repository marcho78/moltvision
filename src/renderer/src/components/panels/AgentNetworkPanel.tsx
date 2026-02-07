import React, { useEffect, useRef, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { NetworkNode, NetworkEdge } from '@shared/domain.types'

function AgentNode({ node, onClick, onContextMenu }: {
  node: NetworkNode & { x: number; y: number; z: number }
  onClick: () => void
  onContextMenu: (e: any) => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const size = Math.max(0.2, Math.log(node.karma + 1) * 0.1)
  const color = node.is_following ? '#7c5cfc' : '#8888a0'

  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh
        ref={meshRef}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.4 : 0.15}
        />
      </mesh>
      {hovered && (
        <Html distanceFactor={10} style={{ pointerEvents: 'none' }}>
          <div className="bg-molt-surface border border-molt-border rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-lg">
            <div className="font-medium text-molt-text">{node.display_name || node.username}</div>
            <div className="text-molt-muted">{node.karma} karma</div>
            <div className="text-molt-muted">{node.is_following ? 'Following' : 'Not following'}</div>
          </div>
        </Html>
      )}
      <Html distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div className="text-[10px] text-molt-muted text-center whitespace-nowrap" style={{ transform: 'translateY(16px)' }}>
          {node.username}
        </div>
      </Html>
    </group>
  )
}

function FollowEdges({ edges, nodeMap }: { edges: NetworkEdge[]; nodeMap: Map<string, NetworkNode & { x: number; y: number; z: number }> }) {
  const lines = useMemo(() => {
    return edges.map((edge) => {
      const source = nodeMap.get(edge.source)
      const target = nodeMap.get(edge.target)
      if (!source || !target) return null
      const points = [
        new THREE.Vector3(source.x, source.y, source.z),
        new THREE.Vector3(target.x, target.y, target.z)
      ]
      const color = edge.direction === 'mutual' ? '#7c5cfc' : '#2a2a3a'
      return { points, color }
    }).filter(Boolean)
  }, [edges, nodeMap])

  return (
    <>
      {lines.map((item, i) => item && (
        <line key={i}>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              array={new Float32Array(item.points.flatMap(p => [p.x, p.y, p.z]))}
              count={2}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial attach="material" color={item.color} opacity={0.4} transparent />
        </line>
      ))}
    </>
  )
}

function NetworkScene() {
  const { networkNodes, networkEdges, setSelectedAgent, addNotification } = useStore()

  const positionedNodes = useMemo(() => {
    return networkNodes.map((node, i) => {
      const angle = (i / networkNodes.length) * Math.PI * 2
      const radius = 3 + Math.random() * 8
      return {
        ...node,
        x: node.x ?? Math.cos(angle) * radius,
        y: node.y ?? (Math.random() - 0.5) * 5,
        z: node.z ?? Math.sin(angle) * radius
      }
    })
  }, [networkNodes])

  const nodeMap = useMemo(() => {
    const map = new Map<string, NetworkNode & { x: number; y: number; z: number }>()
    positionedNodes.forEach((n) => map.set(n.id, n))
    return map
  }, [positionedNodes])

  const handleContextMenu = async (node: NetworkNode) => {
    try {
      if (node.is_following) {
        await invoke(IPC.AGENTS_UNFOLLOW, { agent_name: node.username })
        addNotification(`Unfollowed ${node.username}`, 'info')
      } else {
        await invoke(IPC.AGENTS_FOLLOW, { agent_name: node.username })
        addNotification(`Followed ${node.username}`, 'success')
      }
    } catch (err: any) {
      addNotification(err.message || 'Action failed', 'error')
    }
  }

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={0.6} />

      <FollowEdges edges={networkEdges} nodeMap={nodeMap} />

      {positionedNodes.map((node) => (
        <AgentNode
          key={node.id}
          node={node}
          onClick={() => {
            invoke(IPC.AGENTS_GET_PROFILE, { agent_name: node.username })
              .then((agent: any) => setSelectedAgent(agent))
              .catch(console.error)
          }}
          onContextMenu={(e: any) => {
            e.stopPropagation()
            handleContextMenu(node)
          }}
        />
      ))}

      <OrbitControls enablePan enableZoom enableRotate dampingFactor={0.1} />
    </>
  )
}

export function AgentNetworkPanel() {
  const { networkNodes, selectedAgent, setNetworkData } = useStore()

  useEffect(() => {
    invoke(IPC.AGENTS_GET_NETWORK, {})
      .then((data: any) => setNetworkData(data.nodes ?? [], data.edges ?? []))
      .catch(console.error)
  }, [setNetworkData])

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agent Network</h2>
        <div className="flex items-center gap-2 text-xs text-molt-muted">
          <span>{networkNodes.length} agents</span>
          <span>|</span>
          <span>Right-click to follow/unfollow</span>
        </div>
      </div>
      <div className="flex-1 flex">
        <div className="flex-1">
          {networkNodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-molt-muted">
              <div className="text-center">
                <p className="text-lg mb-2">No network data</p>
                <p className="text-sm">Connect to Moltbook to populate the agent network</p>
              </div>
            </div>
          ) : (
            <Canvas camera={{ position: [0, 3, 15], fov: 60 }} style={{ background: '#0a0a0f' }}>
              <NetworkScene />
            </Canvas>
          )}
        </div>
        {selectedAgent && (
          <div className="w-72 border-l border-molt-border overflow-y-auto p-4">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">{selectedAgent.display_name || selectedAgent.username}</h3>
              <p className="text-xs text-molt-muted">{selectedAgent.bio}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="panel-card p-2">
                  <div className="text-molt-muted">Karma</div>
                  <div className="font-bold text-molt-accent">{selectedAgent.karma}</div>
                </div>
                <div className="panel-card p-2">
                  <div className="text-molt-muted">Followers</div>
                  <div className="font-bold">{selectedAgent.follower_count}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
