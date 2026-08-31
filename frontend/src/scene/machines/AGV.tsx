import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

/**
 * Automated guided vehicle parked at a pick/drop station: low chassis on four
 * wheels carrying a tote, with a spinning amber safety beacon. Cross-shop AGV
 * travel is handled by MaterialFlow; this is the docked/idling unit.
 */
export function AGV({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const beacon = useRef<Mesh>(null)
  const body = useRef<Group>(null)
  const phase = useRef(Math.random() * Math.PI * 2)

  useFrame((_, dt) => {
    const s = statusSpeed(status)
    if (beacon.current) beacon.current.rotation.y += dt * (2 + s * 6)
    phase.current += dt * s * 1.4
    if (body.current) body.current.position.x = Math.sin(phase.current) * 0.25
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 + 0.1, 0.1, asset.footprint_d / 2 - 0.2]}
      labelY={1.6}
    >
      <group ref={body}>
        {/* Chassis */}
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[1.6, 0.34, 1.0]} />
          <meshStandardMaterial color="#e0a021" metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[1.5, 0.08, 0.94]} />
          <meshStandardMaterial color="#22262e" />
        </mesh>
        {/* Wheels */}
        {[-0.6, 0.6].map((x) =>
          [-0.42, 0.42].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 0.14, z]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.14, 0.14, 0.12, 12]} />
              <meshStandardMaterial color="#1b1e24" />
            </mesh>
          )),
        )}
        {/* Carried tote */}
        <mesh position={[0, 0.72, 0]} castShadow>
          <boxGeometry args={[1.1, 0.34, 0.8]} />
          <meshStandardMaterial color="#5b6470" />
        </mesh>
        {/* Warning beacon */}
        <mesh ref={beacon} position={[0.62, 0.66, 0.36]}>
          <cylinderGeometry args={[0.06, 0.06, 0.12, 8]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.4} />
        </mesh>
      </group>
    </MachineShell>
  )
}
