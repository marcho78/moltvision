import React, { useEffect, useRef, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../../stores'
import { invoke } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { GalaxyNode, GalaxyEdge } from '@shared/domain.types'

function SubmoltNode({ node, onClick }: { node: GalaxyNode & { x: number; y: number; z: number }; onClick: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const size = Math.max(0.3, Math.log(node.subscriber_count + 1) * 0.15)
  const color = new THREE.Color(node.theme_color || '#7c5cfc')

  useFrame((state) => {
    if (meshRef.current && node.is_subscribed) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1
      meshRef.current.scale.setScalar(scale)
    }
  })

  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh
        ref={meshRef}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={node.is_subscribed ? 0.5 : hovered ? 0.3 : 0.1}
          transparent
          opacity={0.9}
        />
      </mesh>
      {hovered && (
        <Html distanceFactor={10} style={{ pointerEvents: 'none' }}>
          <div className="bg-molt-surface border border-molt-border rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-lg">
            <div className="font-medium text-molt-text">{node.display_name || node.name}</div>
            <div className="text-molt-muted">{node.subscriber_count} subscribers</div>
            <div className="text-molt-muted">{node.post_count} posts</div>
          </div>
        </Html>
      )}
      <Html distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div className="text-[10px] text-molt-muted text-center whitespace-nowrap" style={{ transform: 'translateY(20px)' }}>
          {node.name}
        </div>
      </Html>
    </group>
  )
}

function SubmoltEdges({ edges, nodeMap }: { edges: GalaxyEdge[]; nodeMap: Map<string, GalaxyNode & { x: number; y: number; z: number }> }) {
  const lineGeometries = useMemo(() => {
    return edges.map((edge) => {
      const source = nodeMap.get(edge.source)
      const target = nodeMap.get(edge.target)
      if (!source || !target) return null
      const points = [
        new THREE.Vector3(source.x, source.y, source.z),
        new THREE.Vector3(target.x, target.y, target.z)
      ]
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      return { geometry, weight: edge.weight }
    }).filter(Boolean)
  }, [edges, nodeMap])

  return (
    <>
      {lineGeometries.map((item, i) => item && (
        <line key={i}>
          <bufferGeometry attach="geometry" {...item.geometry} />
          <lineBasicMaterial attach="material" color="#2a2a3a" opacity={0.3} transparent linewidth={1} />
        </line>
      ))}
    </>
  )
}

function GalaxyScene() {
  const { galaxyNodes, galaxyEdges, setSelectedSubmoltDetail } = useStore()

  // Simple force-directed layout (positions computed once)
  const positionedNodes = useMemo(() => {
    return galaxyNodes.map((node, i) => {
      const angle = (i / galaxyNodes.length) * Math.PI * 2
      const radius = 5 + Math.random() * 10
      return {
        ...node,
        x: node.x ?? Math.cos(angle) * radius + (Math.random() - 0.5) * 3,
        y: node.y ?? (Math.random() - 0.5) * 6,
        z: node.z ?? Math.sin(angle) * radius + (Math.random() - 0.5) * 3
      }
    })
  }, [galaxyNodes])

  const nodeMap = useMemo(() => {
    const map = new Map<string, GalaxyNode & { x: number; y: number; z: number }>()
    positionedNodes.forEach((n) => map.set(n.id, n))
    return map
  }, [positionedNodes])

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.3} />

      <SubmoltEdges edges={galaxyEdges} nodeMap={nodeMap} />

      {positionedNodes.map((node) => (
        <SubmoltNode
          key={node.id}
          node={node}
          onClick={() => {
            invoke(IPC.SUBMOLTS_GET_DETAIL, { submolt_name: node.name })
              .then((detail: any) => setSelectedSubmoltDetail(detail))
              .catch(console.error)
          }}
        />
      ))}

      {/* Star field background */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={new Float32Array(Array.from({ length: 3000 }, () => (Math.random() - 0.5) * 100))}
            count={1000}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial size={0.05} color="#4a4a5a" sizeAttenuation />
      </points>

      <OrbitControls enablePan enableZoom enableRotate dampingFactor={0.1} />
    </>
  )
}

export function GalaxyMapPanel() {
  const { galaxyNodes, setGalaxyData } = useStore()

  useEffect(() => {
    invoke(IPC.SUBMOLTS_GET_GALAXY)
      .then((data: any) => setGalaxyData(data.nodes ?? [], data.edges ?? []))
      .catch(console.error)
  }, [setGalaxyData])

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-molt-border flex items-center justify-between">
        <h2 className="text-lg font-semibold">Submolt Galaxy Map</h2>
        <div className="flex items-center gap-2 text-xs text-molt-muted">
          <span>{galaxyNodes.length} submolts</span>
          <span>|</span>
          <span>Scroll to zoom, drag to rotate</span>
        </div>
      </div>
      <div className="flex-1">
        {galaxyNodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-molt-muted">
            <div className="text-center">
              <p className="text-lg mb-2">Galaxy is empty</p>
              <p className="text-sm">Connect to Moltbook to populate the galaxy map</p>
            </div>
          </div>
        ) : (
          <Canvas camera={{ position: [0, 5, 20], fov: 60 }} style={{ background: '#0a0a0f' }}>
            <GalaxyScene />
          </Canvas>
        )}
      </div>
    </div>
  )
}
