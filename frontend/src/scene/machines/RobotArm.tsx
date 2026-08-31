import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshStandardMaterial, PointLight } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { lineOf, statusSpeed, useFactoryStore, useMachineRuntime } from '../../store'
import { cycleInfo, getLineClock } from '../lineClock'
import { MachineShell } from './MachineShell'

const ORANGE = '#f97316'
const JOINT = '#252c38'
const PEDESTAL = '#d8d2c4'

/** Damped approach that freezes when the machine is down (speed 0) */
function approach(current: number, target: number, dt: number, speed: number): number {
  return current + (target - current) * Math.min(1, dt * 4.5 * speed)
}

// --- Arm kinematics (MUST match the meshes rendered below) -------------------
const SHOULDER_Y = 1.49 // turret base (1.02) + shoulder pivot (0.47)
const L1 = 1.5 // upper arm: shoulder -> elbow
const L2 = Math.hypot(0.24, 1.8) // elbow -> weld-gun tip (the spark position)
const TIP_OFFSET = -Math.atan2(0.24, 1.8) // gun tip's angular offset from the forearm axis
const HALF_PI = Math.PI / 2

interface ArmPose {
  yaw: number
  shoulder: number
  elbow: number
}

/**
 * Analytic 2-bone inverse kinematics. Given a weld target in the robot's OWN
 * local space (x = out toward the body line, y = up, z = along the line), it
 * returns the turret yaw + shoulder/elbow angles that land the gun tip exactly
 * on the target. The turret swings the arm plane to the target azimuth, then
 * the shoulder/elbow form a planar 2R chain solved in closed form (elbow-up).
 *
 * The seed rotates the left (z=+2.8) and right (z=-2.8) robots by ±90°, so the
 * near face of the car ends up at the SAME local +x for both — one solver fits
 * every station.
 */
function solveArm(tx: number, ty: number, tz: number): ArmPose {
  const yaw = Math.atan2(-tz, tx)
  const a = Math.hypot(tx, tz) // horizontal reach within the arm plane
  const b = ty - SHOULDER_Y // height relative to the shoulder pivot

  // Clamp the target into the reachable annulus so acos() stays valid.
  let d = Math.hypot(a, b)
  const dMax = L1 + L2 - 0.03
  const dMin = Math.abs(L1 - L2) + 0.03
  let ax = a
  let bx = b
  if (d > dMax) {
    const k = dMax / d
    ax = a * k
    bx = b * k
    d = dMax
  } else if (d < dMin) {
    const k = dMin / (d || 1e-4)
    ax = a * k
    bx = b * k
    d = dMin
  }

  const cosE = Math.min(1, Math.max(-1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2)))
  const elbowInterior = -Math.acos(cosE) // elbow-up: reach over the top, weld downward
  const alpha1 =
    Math.atan2(bx, ax) -
    Math.atan2(L2 * Math.sin(elbowInterior), L1 + L2 * Math.cos(elbowInterior))

  return {
    yaw,
    shoulder: alpha1 - HALF_PI,
    elbow: elbowInterior - TIP_OFFSET,
  }
}

interface RobotArmProps {
  instance: AssetInstanceDto
  asset: AssetDto
}

export function RobotArm({ instance, asset }: RobotArmProps) {
  const runtime = useMachineRuntime(instance.id)
  // Resolve THIS robot's own line (its node hangs under a line node) so it syncs
  // to the body line dwelling in front of it, not some other shop's line.
  const lineId = useFactoryStore((s) =>
    s.twin ? lineOf(s.twin, instance)?.id : undefined,
  )
  const lineStatus = useFactoryStore(
    (s) => (lineId && s.machines[lineId]?.status) ?? 'running',
  )

  const turret = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const sparkLight = useRef<PointLight>(null)
  const sparkBall = useRef<Mesh>(null)

  // Desync the sway between neighboring robots
  const swayOffset = useMemo(() => Math.random() * Math.PI * 2, [])
  const status = runtime?.status ?? 'idle'

  const clock = getLineClock(lineId ?? 'line-body-1')

  useFrame((_, dt) => {
    const speed = statusSpeed(status)
    const { welding } = cycleInfo(clock.t)
    const active = welding && status === 'running' && lineStatus !== 'down'

    const t = clock.t + swayOffset
    let turretT: number
    let shoulderT: number
    let elbowT: number
    if (active) {
      // Chase a weld seam on the near face of the car parked at this station.
      // Local frame: x = out toward the body (~2.0 m to the sheet metal),
      // y = seam height (sweeps sills -> beltline), z = along the car length.
      const tx = 2.0
      const ty = 1.02 + Math.sin(t * 1.6) * 0.34
      const tz = Math.sin(t * 0.9) * 0.7 + Math.sin(t * 2.7) * 0.12
      const pose = solveArm(tx, ty, tz)
      turretT = pose.yaw
      shoulderT = pose.shoulder
      elbowT = pose.elbow
    } else {
      // Retract to an upright home pose while the line indexes.
      turretT = 0
      shoulderT = -0.2
      elbowT = 0.55
    }

    if (turret.current) turret.current.rotation.y = approach(turret.current.rotation.y, turretT, dt, speed)
    if (shoulder.current) shoulder.current.rotation.z = approach(shoulder.current.rotation.z, shoulderT, dt, speed)
    if (elbow.current) elbow.current.rotation.z = approach(elbow.current.rotation.z, elbowT, dt, speed)

    // Spark flicker at the weld gun tip
    const sparking = active && Math.random() > 0.25
    if (sparkLight.current) sparkLight.current.intensity = sparking ? 6 + Math.random() * 14 : 0
    if (sparkBall.current) {
      const s = sparking ? 0.7 + Math.random() * 0.9 : 0.001
      sparkBall.current.scale.setScalar(s)
      const mat = sparkBall.current.material as MeshStandardMaterial
      mat.emissiveIntensity = sparking ? 5 : 0
    }
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[-0.85, 0.1, 0.85]}
    >
      {/* Pedestal */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[0.72, 0.78, 0.2, 20]} />
        <meshStandardMaterial color="#a8a294" />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.58, 0.85, 20]} />
        <meshStandardMaterial color={PEDESTAL} />
      </mesh>
      {/* Rotating turret + articulated arm */}
      <group ref={turret} position={[0, 1.02, 0]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.42, 0.46, 0.5, 16]} />
          <meshStandardMaterial color={ORANGE} />
        </mesh>
        <group ref={shoulder} position={[0, 0.47, 0]}>
          <mesh rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.28, 0.28, 0.56, 14]} />
            <meshStandardMaterial color={JOINT} />
          </mesh>
          {/* Upper arm */}
          <mesh position={[0, 0.75, 0]} castShadow>
            <boxGeometry args={[0.36, 1.5, 0.34]} />
            <meshStandardMaterial color={ORANGE} />
          </mesh>
          <group ref={elbow} position={[0, 1.5, 0]}>
            <mesh rotation-x={Math.PI / 2} castShadow>
              <cylinderGeometry args={[0.22, 0.22, 0.48, 14]} />
              <meshStandardMaterial color={JOINT} />
            </mesh>
            {/* Forearm */}
            <mesh position={[0, 0.6, 0]} castShadow>
              <boxGeometry args={[0.27, 1.2, 0.26]} />
              <meshStandardMaterial color={ORANGE} />
            </mesh>
            {/* Wrist + weld gun */}
            <mesh position={[0, 1.26, 0]}>
              <cylinderGeometry args={[0.13, 0.13, 0.22, 12]} />
              <meshStandardMaterial color={JOINT} />
            </mesh>
            <mesh position={[0.09, 1.48, 0]}>
              <boxGeometry args={[0.3, 0.1, 0.09]} />
              <meshStandardMaterial color="#8b96a8" metalness={0.5} roughness={0.35} />
            </mesh>
            <mesh position={[0.24, 1.61, 0]}>
              <boxGeometry args={[0.08, 0.34, 0.08]} />
              <meshStandardMaterial color="#8b96a8" metalness={0.5} roughness={0.35} />
            </mesh>
            {/* Spark at the gun tip */}
            <mesh ref={sparkBall} position={[0.24, 1.8, 0]}>
              <sphereGeometry args={[0.09, 8, 8]} />
              <meshStandardMaterial color="#dbeafe" emissive="#93c5fd" emissiveIntensity={0} />
            </mesh>
            <pointLight
              ref={sparkLight}
              position={[0.24, 1.8, 0]}
              color="#a5c8ff"
              intensity={0}
              distance={5.5}
              decay={2}
            />
          </group>
        </group>
      </group>
    </MachineShell>
  )
}
