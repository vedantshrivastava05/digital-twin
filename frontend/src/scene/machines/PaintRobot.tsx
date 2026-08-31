import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { categoryOf, statusSpeed, useFactoryStore, useMachineRuntime } from '../../store'
import { cycleInfo, getLineClock } from '../lineClock'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const BODY = '#e5e7eb'
const JOINT = '#252c38'

/** Fallback booth centre if the paint line can't be resolved (world X/Z). */
const FALLBACK_CX = 143
const FALLBACK_CZ = 9.5

/**
 * Paint-spray robot: a slim articulated arm on a pedestal. It aims squarely at
 * the centre of the paint booth, where a car body indexes in and PARKS on the
 * overhead monorail. The robots read the same shared line clock as the monorail,
 * so they only reach out and spray while a body is dwelling in front of them,
 * then retract upright while the line indexes the next body in. All robots
 * converge their spray on the middle of the booth.
 */
export function PaintRobot({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const turret = useRef<Group>(null)
  const mist = useRef<Mesh>(null)
  const phase = useRef(useMemo(() => Math.random() * Math.PI * 2, []))
  // Smoothed 0..1 "painting" activity so the arm eases between rest and reach.
  const act = useRef(0)

  // Resolve the paint monorail this robot serves so we can (a) aim at its centre
  // and (b) share its index clock.
  const line = useFactoryStore((s) => {
    const t = s.twin
    if (!t) return undefined
    return t.instances.find((i) => categoryOf(t, i) === 'paintline')
  })
  const clock = getLineClock(line?.id ?? 'paintline-1')

  // Yaw so the arm's local +X points straight at the booth centre point.
  const cx = line?.x ?? FALLBACK_CX
  const cz = line?.z ?? FALLBACK_CZ
  const baseYaw = Math.atan2(-(cz - instance.z), cx - instance.x)

  useFrame((_, dt) => {
    const s = statusSpeed(status)
    phase.current += dt * s
    const { welding } = cycleInfo(clock.t)
    const painting = status === 'running' && welding
    // ease activity toward target
    act.current += ((painting ? 1 : 0) - act.current) * Math.min(1, dt * 4)
    const k = act.current
    const sweep = Math.sin(phase.current * 2.2) * 0.16 * k
    if (turret.current) turret.current.rotation.y = baseYaw + sweep
    if (shoulder.current)
      shoulder.current.rotation.z = -0.2 - 0.95 * k + sweep * 0.4
    if (elbow.current) elbow.current.rotation.z = 0.5 + 0.85 * k
    if (mist.current) {
      const spraying = k > 0.5 && Math.sin(phase.current * 7) > -0.2
      const mat = mist.current.material as MeshStandardMaterial
      mat.opacity = spraying ? 0.36 * k : 0
      mist.current.scale.setScalar(spraying ? 1 : 0.001)
    }
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[-0.8, 0.1, 0.8]}
      labelY={3.2}
    >
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.5, 0.9, 18]} />
        <meshStandardMaterial color={BODY} />
      </mesh>
      <group ref={turret} position={[0, 0.95, 0]} rotation-y={baseYaw}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.38, 0.45, 16]} />
          <meshStandardMaterial color={BODY} />
        </mesh>
        <group ref={shoulder} position={[0, 0.42, 0]}>
          <mesh position={[0, 0.7, 0]} castShadow>
            <boxGeometry args={[0.26, 1.45, 0.24]} />
            <meshStandardMaterial color={BODY} />
          </mesh>
          <group ref={elbow} position={[0, 1.42, 0]}>
            <mesh rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.16, 0.16, 0.34, 12]} />
              <meshStandardMaterial color={JOINT} />
            </mesh>
            <mesh position={[0, 0.55, 0]} castShadow>
              <boxGeometry args={[0.2, 1.1, 0.18]} />
              <meshStandardMaterial color={BODY} />
            </mesh>
            {/* Bell applicator */}
            <mesh position={[0, 1.16, 0]}>
              <cylinderGeometry args={[0.12, 0.05, 0.24, 12]} />
              <meshStandardMaterial color="#8b96a8" metalness={0.6} roughness={0.3} />
            </mesh>
            {/* Atomised paint plume projecting out toward the parked body */}
            <mesh ref={mist} position={[0, 2.1, 0]} rotation-x={Math.PI}>
              <coneGeometry args={[0.75, 2.6, 18, 1, true]} />
              <meshStandardMaterial
                color="#2b2f36"
                emissive="#1b1e24"
                emissiveIntensity={0.15}
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
          </group>
        </group>
      </group>
    </MachineShell>
  )
}
