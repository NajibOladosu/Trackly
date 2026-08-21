'use client'

import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createNoise3D } from 'simplex-noise'

export type OrbMode = 'idle' | 'user' | 'ai'

interface OrbProps {
  mode: OrbMode
  audioLevel?: number
}

function OrbMesh({ mode, audioLevel = 0 }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const geometryRef = useRef<THREE.SphereGeometry | null>(null)

  const noise3D = useMemo(() => createNoise3D(), [])

  const amplitudes = {
    idle: 0.075,
    user: 0.2,
    ai: 0.3,
  }


  useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- geometry buffer cached on a ref to avoid recreating per frame
    geometryRef.current = new THREE.SphereGeometry(1.5, 64, 64)
  }, [])

  useFrame(({ clock }) => {
    if (!meshRef.current || !geometryRef.current) return

    const t = clock.getElapsedTime()
    const mesh = meshRef.current
    const geometry = geometryRef.current

    // Keep scale constant at 1.0 - wobble comes from vertex displacement
    mesh.scale.set(1, 1, 1)

    const positionAttribute = geometry.attributes.position
    const vertex = new THREE.Vector3()

    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i)
      const originalVertex = vertex.clone().normalize()

      const noiseValue = noise3D(
        originalVertex.x * 2 + t * 0.5,
        originalVertex.y * 2 + t * 0.5,
        originalVertex.z * 2 + t * 0.5
      )

      const amp = amplitudes[mode] + (mode === 'user' ? audioLevel * 0.1 : 0)
      const displacement = 1 + noiseValue * amp

      vertex.copy(originalVertex).multiplyScalar(displacement)
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z)
    }

    positionAttribute.needsUpdate = true
    geometry.computeVertexNormals()
  })

  // Get current color based on mode
  const currentColor = useMemo(() => {
    const colorMap = {
      idle: '#18BB70',
      user: '#ff8800',
      ai: '#18BB70',
    }
    console.log('[AIOrb] Rendering with color:', colorMap[mode], 'for mode:', mode)
    return colorMap[mode]
  }, [mode])

  return (
    <group>
      {/* eslint-disable-next-line react-hooks/refs -- geometry built in useMemo, read by react-three-fiber */}
      <mesh ref={meshRef} geometry={geometryRef.current || undefined}>
        <meshBasicMaterial
          wireframe
          color={currentColor}
          opacity={1.0}
          transparent={false}
        />
      </mesh>
    </group>
  )
}

interface AIOrbProps {
  mode: OrbMode
  audioLevel?: number
  className?: string
}

export function AIOrb({ mode, audioLevel = 0, className = '' }: AIOrbProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard to defer 3D canvas to client
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className}`}>
        <div className="w-48 h-48 rounded-full bg-gradient-to-br from-green-400 to-green-600 animate-pulse opacity-50" />
      </div>
    )
  }

  return (
    <div className={`w-full h-full relative ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
        resize={{ scroll: false, debounce: 0 }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={2} />
        <pointLight position={[-5, -5, -5]} intensity={1} />
        <OrbMesh mode={mode} audioLevel={audioLevel} />
      </Canvas>
    </div>
  )
}
