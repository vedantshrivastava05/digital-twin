import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const FRAME = '#c9ccd2'
const DARK = '#2b3240'
const HALF_W = 3.0 // gantry half-width (across the line, z)
const H = 4.6

/**
 * Body QC inspection gate: a portal gantry with machine-vision scanner heads and
 * a light bar that BIW bodies pass under on their way out to paint. A cyan scan
 * plane sweeps across the aperture while running (amber when idle).
 */
export function QCGate({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const scan = useRef<Mesh>(null)
  const bar = useRef<Mesh>(null)
  const t = useRef(0)

  const active = status === 'running'
  const scanColor = active ? '#22d3ee' : status === 'down' ? '#ef4444' : '#f59e0b'

  useFrame((_, dt) => {
    t.current += dt * statusSpeed(status)
    // Sweep the scan plane fore/aft across the aperture.
    const s = (Math.sin(t.current * 1.6) * 0.5 + 0.5) * 3.2 - 1.6
    if (scan.current) {
      scan.current.position.x = s
      const m = scan.current.material as MeshStandardMaterial
      m.opacity = active ? 0.5 : 0.18
    }
    if (bar.current) {
      const m = bar.current.material as MeshStandardMaterial
      m.emissiveIntensity = 0.6 + (active ? Math.sin(t.current * 4) * 0.4 + 0.6 : 0)
    }
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.3, 0.1, asset.footprint_d / 2 - 0.3]}
      labelY={5.4}
      noPlinth
    >
      {/* Portal posts */}
      {[-HALF_W, HALF_W].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 0.1, 0]} receiveShadow>
            <boxGeometry args={[1.2, 0.2, 1.2]} />
            <meshStandardMaterial color="#aeb6c2" />
          </mesh>
          <mesh position={[0, H / 2, 0]} castShadow>
            <boxGeometry args={[0.45, H, 0.45]} />
            <meshStandardMaterial color={FRAME} metalness={0.3} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {/* Top beam */}
      <mesh position={[0, H, 0]} castShadow>
        <boxGeometry args={[0.55, 0.55, HALF_W * 2 + 0.5]} />
        <meshStandardMaterial color={FRAME} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Light bar under the beam */}
      <mesh ref={bar} position={[0, H - 0.4, 0]}>
        <boxGeometry args={[0.2, 0.14, HALF_W * 2]} />
        <meshStandardMaterial color={scanColor} emissive={scanColor} emissiveIntensity={1.0} />
      </mesh>

      {/* Machine-vision scanner heads (on beam + posts, pointing inward) */}
      {[
        [0, H - 0.7, -HALF_W + 0.6],
        [0, H - 0.7, HALF_W - 0.6],
        [0, 2.6, -HALF_W + 0.35],
        [0, 2.6, HALF_W - 0.35],
      ].map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh castShadow>
            <boxGeometry args={[0.4, 0.4, 0.3]} />
            <meshStandardMaterial color={DARK} metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, z < 0 ? 0.18 : -0.18]}>
            <cylinderGeometry args={[0.08, 0.1, 0.12, 12]} />
            <meshStandardMaterial color={scanColor} emissive={scanColor} emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}

      {/* Sweeping scan plane */}
      <mesh ref={scan} position={[0, 1.6, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[HALF_W * 2, 3.0]} />
        <meshStandardMaterial
          color={scanColor}
          emissive={scanColor}
          emissiveIntensity={0.9}
          transparent
          opacity={0.4}
          side={2}
          depthWrite={false}
        />
      </mesh>
    </MachineShell>
  )
}
