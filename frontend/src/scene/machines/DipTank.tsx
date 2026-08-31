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
 * Pre-treatment / e-coat dip tank: a large bath of coating fluid with an
 * overhead carrier that lowers a body shell into the bath, dwells, and lifts it
 * back out — the classic paint-shop dunk. Dip cadence follows machine status.
 */
export function DipTank({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const carrier = useRef<Group>(null)
  const phase = useRef(0)

  const len = asset.footprint_w
  const wid = asset.footprint_d

  useFrame((_, dt) => {
    const s = statusSpeed(status)
    phase.current += dt * s * 0.7
    // dwell at top and bottom via a shaped sine
    const raw = (Math.sin(phase.current) + 1) / 2
    const dip = Math.pow(raw, 1.6)
    if (carrier.current) carrier.current.position.y = 2.7 - dip * 2.5
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[len / 2 - 0.3, 0.1, wid / 2 - 0.3]}
      labelY={3.8}
    >
      {/* Tank shell */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, 1.8, wid]} />
        <meshStandardMaterial color="#495260" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Coating fluid surface */}
      <mesh position={[0, 1.7, 0]}>
        <boxGeometry args={[len - 0.3, 0.12, wid - 0.3]} />
        <meshStandardMaterial
          color="#0f8f8a"
          emissive="#0e6f6a"
          emissiveIntensity={0.5}
          metalness={0.2}
          roughness={0.2}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Overhead carrier gantry */}
      {[-len / 2 + 0.3, len / 2 - 0.3].map((x) => (
        <mesh key={x} position={[x, 2.9, 0]} castShadow>
          <boxGeometry args={[0.2, 3.0, wid + 0.4]} />
          <meshStandardMaterial color="#3a4150" />
        </mesh>
      ))}
      <mesh position={[0, 4.3, 0]} castShadow>
        <boxGeometry args={[len, 0.24, 0.24]} />
        <meshStandardMaterial color="#e8e2d4" />
      </mesh>
      {/* Dipping body shell */}
      <group ref={carrier} position={[0, 2.7, 0]}>
        <mesh>
          <boxGeometry args={[0.12, 1.2, 0.12]} />
          <meshStandardMaterial color="#4a5260" />
        </mesh>
        <mesh position={[0, -0.9, 0]} castShadow>
          <boxGeometry args={[3.2, 0.9, 1.5]} />
          <meshStandardMaterial color="#9aa3b2" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
    </MachineShell>
  )
}
