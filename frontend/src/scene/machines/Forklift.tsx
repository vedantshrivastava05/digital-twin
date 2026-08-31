import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import {
  categoryOf,
  statusSpeed,
  useFactoryStore,
  useMachineRuntime,
} from '../../store'
import { MachineShell } from './MachineShell'
import {
  compileRoute,
  evalRoute,
  ROLE_BY_INDEX,
  routeFor,
  type CompiledRoute,
} from '../warehouseFlow'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const YELLOW = '#d6ac16'
const YELLOW_DK = '#b28d0c'
const BLACK = '#26292f'
const STEEL = '#3a3f47'
const TIRE = '#17191e'
const SEAT = '#33343a'

/** Stagger each truck along the loop so they hand off at shared buffers. */
const PHASE = [0.0, 0.18, 0.6, 0.42]

function Wheel({
  x,
  z,
  r,
  w,
  rollRef,
}: {
  x: number
  z: number
  r: number
  w: number
  rollRef?: RefObject<Group | null>
}) {
  return (
    <group position={[x, r, z]} rotation-x={Math.PI / 2}>
      <group ref={rollRef}>
        <mesh castShadow>
          <cylinderGeometry args={[r, r, w, 22]} />
          <meshStandardMaterial color={TIRE} roughness={0.92} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[r * 0.42, r * 0.42, w + 0.03, 12]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.5} />
        </mesh>
      </group>
    </group>
  )
}

/**
 * Counterbalance forklift that actually WORKS the storage flow. Each warehouse
 * forklift is assigned a role by its sorted order (1=receiving, 2/3=put-away,
 * 4=retrieval) and drives a world-space leg between the shared logistics buffers
 * (see warehouseFlow.ts): fetch a crate at its source, carry it (forks up over
 * the racks where needed), deposit at its target, then reverse back empty — with
 * rolling/steering wheels, a spinning beacon and the load appearing at pick-up /
 * vanishing at drop-off. Motion follows machine status (slow when idle, frozen
 * when down). Positioned imperatively via the mobile MachineShell so its label,
 * status light and selection travel with the moving unit.
 */
export function Forklift({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const rig = useRef<Group>(null)
  const carriage = useRef<Group>(null)
  const carry = useRef<Group>(null)
  const beacon = useRef<Mesh>(null)
  const wheelFL = useRef<Group>(null)
  const wheelFR = useRef<Group>(null)
  const wheelRL = useRef<Group>(null)
  const wheelRR = useRef<Group>(null)
  const t = useRef(0)
  const prev = useRef<{ x: number; z: number } | null>(null)

  const twin = useFactoryStore((s) => s.twin)

  // Resolve this forklift's role + compiled world route from its sorted index.
  const { route, offsetT } = useMemo<{ route: CompiledRoute; offsetT: number }>(() => {
    const forks = twin
      ? twin.instances
          .filter((i) => categoryOf(twin, i) === 'forklift')
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      : []
    const idx = Math.max(0, forks.findIndex((i) => i.id === instance.id))
    const role = ROLE_BY_INDEX[idx] ?? 'receiving'
    const compiled = compileRoute(routeFor(role))
    return { route: compiled, offsetT: PHASE[idx % PHASE.length] * compiled.total }
  }, [twin, instance.id])

  useLayoutEffect(() => {
    t.current = offsetT
    const p = evalRoute(route, offsetT)
    if (rig.current) {
      rig.current.position.set(p.x, 0, p.z)
      rig.current.rotation.y = p.yaw
    }
    prev.current = { x: p.x, z: p.z }
  }, [route, offsetT])

  useFrame((_, dt) => {
    const s = statusSpeed(status)
    t.current += dt * s
    const pose = evalRoute(route, t.current)

    if (rig.current) {
      rig.current.position.set(pose.x, 0, pose.z)
      rig.current.rotation.y = pose.yaw
    }
    if (carriage.current) carriage.current.position.y = 0.12 + pose.lift * 1.25
    if (carry.current) carry.current.visible = pose.loaded

    // Roll wheels by distance travelled along the heading (signed for reverse).
    const p = prev.current
    if (p) {
      const dx = pose.x - p.x
      const dz = pose.z - p.z
      const fx = Math.cos(pose.yaw)
      const fz = -Math.sin(pose.yaw)
      const signed = dx * fx + dz * fz
      if (wheelFL.current) wheelFL.current.rotation.y += signed / 0.38
      if (wheelFR.current) wheelFR.current.rotation.y += signed / 0.38
      if (wheelRL.current) wheelRL.current.rotation.y += signed / 0.28
      if (wheelRR.current) wheelRR.current.rotation.y += signed / 0.28
    }
    prev.current = { x: pose.x, z: pose.z }

    if (beacon.current) beacon.current.rotation.y += dt * (2 + s * 8)
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[-1.15, 0.1, 0.55]}
      labelY={2.5}
      mobile
      groupRef={rig}
    >
      {/* ---- Wheels ---- */}
      <Wheel x={0.42} z={0.52} r={0.38} w={0.34} rollRef={wheelFL} />
      <Wheel x={0.42} z={-0.52} r={0.38} w={0.34} rollRef={wheelFR} />
      <Wheel x={-0.92} z={0.44} r={0.28} w={0.24} rollRef={wheelRL} />
      <Wheel x={-0.92} z={-0.44} r={0.28} w={0.24} rollRef={wheelRR} />

      {/* ---- Chassis / hood ---- */}
      <mesh position={[-0.2, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.7, 1.05]} />
        <meshStandardMaterial color={YELLOW} metalness={0.2} roughness={0.55} />
      </mesh>
      {/* Sloped engine hood behind the seat */}
      <mesh position={[-0.55, 1.02, 0]} castShadow>
        <boxGeometry args={[0.95, 0.35, 1.0]} />
        <meshStandardMaterial color={YELLOW_DK} metalness={0.2} roughness={0.6} />
      </mesh>
      {/* Rear counterweight (rounded block) */}
      <mesh position={[-1.05, 0.55, 0]} castShadow>
        <boxGeometry args={[0.5, 0.95, 1.0]} />
        <meshStandardMaterial color={YELLOW} metalness={0.2} roughness={0.55} />
      </mesh>
      {/* Front axle housing / bumper */}
      <mesh position={[0.55, 0.35, 0]} castShadow>
        <boxGeometry args={[0.35, 0.5, 1.2]} />
        <meshStandardMaterial color={BLACK} roughness={0.7} />
      </mesh>

      {/* ---- Operator area ---- */}
      <mesh position={[0.0, 0.98, 0]}>
        <boxGeometry args={[0.8, 0.06, 0.9]} />
        <meshStandardMaterial color={STEEL} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[-0.3, 1.12, 0]} castShadow>
        <boxGeometry args={[0.5, 0.18, 0.55]} />
        <meshStandardMaterial color={SEAT} roughness={0.8} />
      </mesh>
      <mesh position={[-0.52, 1.4, 0]} castShadow>
        <boxGeometry args={[0.16, 0.5, 0.55]} />
        <meshStandardMaterial color={SEAT} roughness={0.8} />
      </mesh>
      <mesh position={[0.16, 1.25, 0]} rotation-z={-0.5}>
        <cylinderGeometry args={[0.04, 0.04, 0.5, 10]} />
        <meshStandardMaterial color={BLACK} />
      </mesh>
      <mesh position={[0.28, 1.42, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.14, 0.03, 8, 20]} />
        <meshStandardMaterial color={BLACK} />
      </mesh>

      {/* ---- Overhead guard cage (ROPS) ---- */}
      {[
        [0.42, 0.52],
        [0.42, -0.52],
        [-0.78, 0.52],
        [-0.78, -0.52],
      ].map(([px, pz]) => (
        <mesh key={`${px}:${pz}`} position={[px, 1.55, pz]} castShadow>
          <boxGeometry args={[0.08, 1.15, 0.08]} />
          <meshStandardMaterial color={BLACK} metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[-0.18, 2.12, 0]} castShadow>
        <boxGeometry args={[1.35, 0.09, 1.18]} />
        <meshStandardMaterial color={BLACK} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Beacon on the cage */}
      <mesh ref={beacon} position={[-0.7, 2.24, 0.42]}>
        <cylinderGeometry args={[0.07, 0.07, 0.12, 10]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={1.5} />
      </mesh>

      {/* ---- Mast (two black rails up front) ---- */}
      {[0.34, -0.34].map((z) => (
        <mesh key={z} position={[0.78, 1.15, z]} castShadow>
          <boxGeometry args={[0.14, 2.1, 0.14]} />
          <meshStandardMaterial color={BLACK} metalness={0.35} roughness={0.55} />
        </mesh>
      ))}
      {[0.35, 1.15, 1.95].map((y) => (
        <mesh key={y} position={[0.78, y, 0]}>
          <boxGeometry args={[0.1, 0.1, 0.8]} />
          <meshStandardMaterial color={BLACK} />
        </mesh>
      ))}
      {/* Hydraulic tilt cylinder */}
      <mesh position={[0.45, 0.75, 0.28]} rotation-z={-0.9}>
        <cylinderGeometry args={[0.05, 0.05, 0.8, 10]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
      </mesh>

      {/* ---- Fork carriage (raises/lowers) ---- */}
      <group ref={carriage} position={[0, 0.12, 0]}>
        <mesh position={[0.86, 0.35, 0]} castShadow>
          <boxGeometry args={[0.1, 0.7, 0.86]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.4} />
        </mesh>
        {[0.34, -0.34].map((z) => (
          <group key={z}>
            <mesh position={[1.45, 0.06, z]} castShadow>
              <boxGeometry args={[1.15, 0.06, 0.14]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
            </mesh>
            <mesh position={[0.9, 0.22, z]}>
              <boxGeometry args={[0.06, 0.36, 0.14]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
            </mesh>
          </group>
        ))}
        {/* Pallet + carried load (shown only while loaded) */}
        <group ref={carry}>
          <mesh position={[1.5, 0.16, 0]} castShadow>
            <boxGeometry args={[1.0, 0.12, 0.9]} />
            <meshStandardMaterial color="#9a6b3a" roughness={0.9} />
          </mesh>
          <mesh position={[1.5, 0.5, 0]} castShadow>
            <boxGeometry args={[0.85, 0.55, 0.8]} />
            <meshStandardMaterial color="#b58a55" roughness={0.85} />
          </mesh>
        </group>
      </group>
    </MachineShell>
  )
}
