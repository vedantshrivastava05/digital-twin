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

const CASE = '#526075'

/**
 * Enclosed CNC machining centre (powertrain): a sheet-metal cabinet with a big
 * window, a spindle head on a gantry that traverses X/Z over the workpiece, and
 * a coolant-lit interior. Traverse + spindle speed follow machine status.
 */
export function CNCMachine({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const gantry = useRef<Group>(null)
  const head = useRef<Group>(null)
  const spindle = useRef<Mesh>(null)
  const phase = useRef(0)

  const w = asset.footprint_w
  const d = asset.footprint_d

  useFrame((_, dt) => {
    const s = statusSpeed(status)
    phase.current += dt * s
    if (gantry.current) gantry.current.position.x = Math.sin(phase.current * 0.8) * (w * 0.25)
    if (head.current) head.current.position.z = Math.sin(phase.current * 1.3) * (d * 0.18)
    if (spindle.current) spindle.current.rotation.y += dt * s * 30
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[w / 2 - 0.3, 0.1, d / 2 - 0.3]}
      labelY={3.0}
    >
      {/* Cabinet */}
      <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 2.1, d]} />
        <meshStandardMaterial color={CASE} metalness={0.25} roughness={0.6} />
      </mesh>
      {/* Window */}
      <mesh position={[0, 1.25, d / 2 + 0.01]}>
        <planeGeometry args={[w * 0.6, 0.9]} />
        <meshStandardMaterial
          color="#0d2b33"
          emissive="#12414a"
          emissiveIntensity={0.6}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Control pendant */}
      <mesh position={[w / 2 + 0.2, 1.2, 0]} castShadow>
        <boxGeometry args={[0.4, 0.7, 0.35]} />
        <meshStandardMaterial color="#42506b" />
      </mesh>
      {/* Inner traversing gantry + spindle head (peeking above the case) */}
      <group ref={gantry} position={[0, 2.2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.5, d - 0.4]} />
          <meshStandardMaterial color="#8b96a8" metalness={0.4} roughness={0.45} />
        </mesh>
        <group ref={head} position={[0, -0.1, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <boxGeometry args={[0.4, 0.5, 0.4]} />
            <meshStandardMaterial color="#c8d0dc" metalness={0.5} roughness={0.35} />
          </mesh>
          <mesh ref={spindle} position={[0, -0.62, 0]}>
            <cylinderGeometry args={[0.08, 0.05, 0.28, 10]} />
            <meshStandardMaterial color="#dbeafe" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      </group>
    </MachineShell>
  )
}
