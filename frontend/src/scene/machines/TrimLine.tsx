import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { CarBody } from '../CarBody'
import { MachineShell } from './MachineShell'

const SPAN = 60
const CAR_COLORS = ['#2dd4bf', '#3b82f6', '#e5e7eb', '#b91c1c', '#0f766e', '#64748b']

interface TrimLineProps {
  instance: AssetInstanceDto
  asset: AssetDto
}

/**
 * Background trim line: painted, finished cars creeping along a flat-top
 * conveyor — the "rest of the plant" behind the weld cell.
 */
export function TrimLine({ instance, asset }: TrimLineProps) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const progress = useRef(0)
  const cars = useRef<(Group | null)[]>([])

  useFrame((_, dt) => {
    progress.current = (progress.current + dt * statusSpeed(status) * 0.014) % 1
    cars.current.forEach((car, i) => {
      if (!car) return
      const frac = (progress.current + i / CAR_COLORS.length) % 1
      car.position.x = -SPAN / 2 + frac * SPAN
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[29, 0.1, 1.3]}
      labelY={2.4}
    >
      {/* Flat-top conveyor platform */}
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[SPAN, 0.28, 2.4]} />
        <meshStandardMaterial color="#9aa1ad" />
      </mesh>
      <mesh position={[0, 0.29, 0]}>
        <boxGeometry args={[SPAN - 0.4, 0.03, 2.0]} />
        <meshStandardMaterial color="#3a404c" roughness={0.9} />
      </mesh>
      {/* Finished cars */}
      {CAR_COLORS.map((color, i) => (
        <group
          key={color}
          ref={(el) => {
            cars.current[i] = el
          }}
          position={[0, 0.3, 0]}
        >
          <CarBody color={color} wheels />
        </group>
      ))}
    </MachineShell>
  )
}
