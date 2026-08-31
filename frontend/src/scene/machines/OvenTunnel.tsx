import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

/**
 * Paint cure oven tunnel: a long enclosed box with entry/exit openings and a
 * warm internal glow; painted bodies ride an overhead conveyor through it. The
 * conveyor speed follows machine status.
 */
export function OvenTunnel({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const bodies = useRef<Group>(null)
  const phase = useRef(0)

  const len = asset.footprint_w
  const wid = asset.footprint_d
  const count = Math.max(2, Math.round(len / 4))

  useFrame((_, dt) => {
    phase.current = (phase.current + dt * statusSpeed(status) * 0.05) % 1
    bodies.current?.children.forEach((c, i) => {
      const frac = (phase.current + i / count) % 1
      c.position.x = -len / 2 + frac * len
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[len / 2 - 0.3, 0.1, wid / 2 - 0.3]}
      labelY={4.2}
    >
      {/* Tunnel walls (leave the ends open) */}
      {[-wid / 2, wid / 2].map((z) => (
        <mesh key={z} position={[0, 1.9, z]} castShadow receiveShadow>
          <boxGeometry args={[len, 3.4, 0.25]} />
          <meshStandardMaterial color="#c9ccd1" roughness={0.85} />
        </mesh>
      ))}
      {/* Roof */}
      <mesh position={[0, 3.6, 0]} castShadow>
        <boxGeometry args={[len, 0.3, wid]} />
        <meshStandardMaterial color="#b7bcc4" />
      </mesh>
      {/* Warm cure glow inside */}
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[len - 0.6, 2.2, wid - 0.6]} />
        <meshStandardMaterial
          color="#ff8a3c"
          emissive="#ff6a1a"
          emissiveIntensity={0.5}
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
      {/* Overhead conveyor rail */}
      <mesh position={[0, 3.1, 0]}>
        <boxGeometry args={[len, 0.12, 0.12]} />
        <meshStandardMaterial color="#3a4150" />
      </mesh>
      {/* Bodies curing through the oven */}
      <group ref={bodies}>
        {Array.from({ length: count }, (_, i) => (
          <group key={i} position={[0, 1.5, 0]}>
            <mesh position={[0, 0.9, 0]}>
              <boxGeometry args={[0.06, 1.2, 0.06]} />
              <meshStandardMaterial color="#4a5260" />
            </mesh>
            <mesh castShadow>
              <boxGeometry args={[3.0, 0.9, 1.4]} />
              <meshStandardMaterial
                color={['#b91c1c', '#1d4ed8', '#e5e7eb'][i % 3]}
                metalness={0.5}
                roughness={0.35}
              />
            </mesh>
          </group>
        ))}
      </group>
    </MachineShell>
  )
}
