import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, type BufferGeometry, type Group } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const LEVELS = 5
const LEVEL_H = 1.15

function box(x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const g = new BoxGeometry(sx, sy, sz)
  g.translate(x, y, z)
  return g
}

const FRAME_CACHE = new Map<string, BufferGeometry>()

function frameGeometry(len: number, depth: number, cols: number): BufferGeometry {
  const key = `${len}|${depth}|${cols}`
  const cached = FRAME_CACHE.get(key)
  if (cached) return cached
  const parts: BoxGeometry[] = []
  const rackZ = depth / 2 - 0.55
  const colXs = Array.from({ length: cols + 1 }, (_, i) => -len / 2 + (i * len) / cols)
  for (const z of [rackZ, -rackZ]) {
    for (const x of colXs) {
      parts.push(box(x, LEVELS * LEVEL_H * 0.5, z, 0.12, LEVELS * LEVEL_H, 0.12))
      parts.push(box(x, LEVELS * LEVEL_H * 0.5, z + 0.4, 0.12, LEVELS * LEVEL_H, 0.12))
    }
    for (let l = 0; l <= LEVELS; l++) {
      parts.push(box(0, l * LEVEL_H, z + 0.2, len, 0.07, 0.9))
    }
  }
  const merged = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  FRAME_CACHE.set(key, merged)
  return merged
}

/**
 * Automated storage & retrieval racking with a stacker crane: two tall racking
 * bays either side of a central aisle, filled with totes, and a crane whose mast
 * traverses the aisle (X) while its shuttle rises/falls (Y) to put/pick loads.
 */
export function ASRSRack({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const crane = useRef<Group>(null)
  const shuttle = useRef<Group>(null)
  const phase = useRef(0)

  const len = asset.footprint_w
  const depth = asset.footprint_d
  const cols = Math.max(3, Math.round(len / 1.6))
  const frame = useMemo(() => frameGeometry(len, depth, cols), [len, depth, cols])
  const mastTop = LEVELS * LEVEL_H + 0.35
  const railLen = len - 0.8

  const totes = useMemo(() => {
    const out: [number, number, number][] = []
    const rackZ = depth / 2 - 0.35
    for (const z of [rackZ, -rackZ]) {
      for (let c = 0; c < cols; c++) {
        for (let l = 0; l < LEVELS; l++) {
          if (Math.random() > 0.35) {
            const x = -len / 2 + (c + 0.5) * (len / cols)
            out.push([x, l * LEVEL_H + 0.42, z])
          }
        }
      }
    }
    return out
  }, [len, depth, cols])

  useFrame((_, dt) => {
    const s = statusSpeed(status)
    phase.current += dt * s
    if (crane.current) crane.current.position.x = Math.sin(phase.current * 0.5) * (len * 0.4)
    if (shuttle.current)
      shuttle.current.position.y = (0.5 + (Math.sin(phase.current * 1.1) + 1) / 2 * (LEVELS - 1)) * LEVEL_H
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[len / 2 - 0.3, 0.1, depth / 2 - 0.3]}
      labelY={LEVELS * LEVEL_H + 0.8}
    >
      <mesh geometry={frame} castShadow receiveShadow>
        <meshStandardMaterial color="#2563eb" metalness={0.3} roughness={0.55} />
      </mesh>
      {totes.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <boxGeometry args={[len / cols - 0.2, 0.7, 0.8]} />
          <meshStandardMaterial color={['#b58a55', '#c79a63', '#9aa3b2'][i % 3]} />
        </mesh>
      ))}
      {/* Aisle guide rails the crane rides (fixed, don't move with the crane) */}
      <mesh position={[0, 0.09, 0]}>
        <boxGeometry args={[railLen, 0.18, 0.5]} />
        <meshStandardMaterial color="#2f353d" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.19, 0]}>
        <boxGeometry args={[railLen, 0.04, 0.12]} />
        <meshStandardMaterial color="#e0a021" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, mastTop + 0.34, 0]}>
        <boxGeometry args={[railLen, 0.16, 0.34]} />
        <meshStandardMaterial color="#4a5260" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Stacker crane: drive base on the floor rail, twin-post mast tied to the
          top rail, and a lifting carriage with telescopic forks + a tote. */}
      <group ref={crane}>
        {/* Drive carriage at the base */}
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[1.5, 0.6, 0.95]} />
          <meshStandardMaterial color="#3a4150" metalness={0.45} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.72, 0]} castShadow>
          <boxGeometry args={[0.7, 0.35, 0.7]} />
          <meshStandardMaterial color="#e0a021" metalness={0.3} roughness={0.5} />
        </mesh>
        {[-0.52, 0.52].map((x) => (
          <mesh key={x} position={[x, 0.18, 0]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.18, 0.18, 0.34, 14]} />
            <meshStandardMaterial color="#17191e" roughness={0.9} />
          </mesh>
        ))}
        {/* Twin-post mast */}
        {[-0.2, 0.2].map((z) => (
          <mesh key={z} position={[0, (0.75 + mastTop) / 2, z]} castShadow>
            <boxGeometry args={[0.16, mastTop - 0.75, 0.16]} />
            <meshStandardMaterial color="#5b6470" metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        {[1.6, 3.1, 4.6].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[0.1, 0.1, 0.5]} />
            <meshStandardMaterial color="#5b6470" metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        {/* Top guide trolley riding the top rail */}
        <mesh position={[0, mastTop + 0.34, 0]} castShadow>
          <boxGeometry args={[0.7, 0.34, 0.5]} />
          <meshStandardMaterial color="#3a4150" metalness={0.45} roughness={0.5} />
        </mesh>

        {/* Lifting carriage (moves up/down the mast) */}
        <group ref={shuttle} position={[0, 0.75, 0]}>
          {/* Back plate hugging the mast */}
          <mesh position={[0, 0.35, 0]} castShadow>
            <boxGeometry args={[0.85, 0.9, 0.16]} />
            <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.45} />
          </mesh>
          {/* Telescopic fork arms reaching toward a rack */}
          {[-0.28, 0.28].map((x) => (
            <mesh key={x} position={[x, 0.06, 0.75]} castShadow>
              <boxGeometry args={[0.12, 0.1, 1.4]} />
              <meshStandardMaterial color="#8b96a8" metalness={0.6} roughness={0.4} />
            </mesh>
          ))}
          {/* Tote carried on the forks */}
          <mesh position={[0, 0.32, 0.85]} castShadow>
            <boxGeometry args={[0.75, 0.55, 0.85]} />
            <meshStandardMaterial color="#b58a55" roughness={0.85} />
          </mesh>
        </group>
      </group>
    </MachineShell>
  )
}
