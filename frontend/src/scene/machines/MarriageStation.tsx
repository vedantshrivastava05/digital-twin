import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { CYCLE_SEC, GA_LINE_ID, cycleInfo, getLineClock } from '../lineClock'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const STEEL = '#5b6577'
const FRAME = '#3f4a5e'
const ENGINE = '#37414f'

const ARM_LEN = 1.7
const TH_LO = 0.28 // scissor angle (rad) when lowered
const TH_HI = 1.15 // scissor angle when raised (engine up to the body)
const BASE_Y = 0.25

/**
 * Engine-marriage / decking station: as a painted body dwells over the pit, a
 * scissor lift raises the engine + front subframe up from below to meet the
 * underbody, then lowers to collect the next powertrain. Synced to the GA line
 * clock so it decks exactly during the line dwell.
 */
export function MarriageStation({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const clock = getLineClock(GA_LINE_ID)
  const platform = useRef<Group>(null)
  const armsFront = useRef<Group>(null)
  const armsBack = useRef<Group>(null)
  const lift = useRef(0)

  useFrame((_, dt) => {
    const f = (((clock.t / CYCLE_SEC) % 1) + 1) % 1
    const { welding } = cycleInfo(clock.t)
    // Rise while a body dwells overhead; retract during the index move.
    const target = status === 'down' ? 0 : welding && f > 0.45 ? 1 : 0
    lift.current += (target - lift.current) * Math.min(1, dt * (3 + statusSpeed(status)))
    const l = lift.current
    const th = TH_LO + (TH_HI - TH_LO) * l
    const topY = BASE_Y + ARM_LEN * Math.sin(th)
    if (platform.current) platform.current.position.y = topY + 0.12
    const setArms = (g: Group | null) => {
      if (!g) return
      const [a, b] = g.children as Group[]
      if (a) {
        a.rotation.z = th
        a.position.y = BASE_Y + (ARM_LEN * Math.sin(th)) / 2
      }
      if (b) {
        b.rotation.z = -th
        b.position.y = BASE_Y + (ARM_LEN * Math.sin(th)) / 2
      }
    }
    setArms(armsFront.current)
    setArms(armsBack.current)
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.3, 0.1, asset.footprint_d / 2 - 0.3]}
      labelY={3.4}
    >
      {/* Pit frame / base */}
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[3.0, 0.24, 2.4]} />
        <meshStandardMaterial color={FRAME} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Yellow safety kerb around the pit */}
      {[
        [0, 1.15, 3.0, 0.14],
        [0, -1.15, 3.0, 0.14],
        [1.5, 0, 0.14, 2.4],
        [-1.5, 0, 0.14, 2.4],
      ].map(([px, pz, sw, sd], i) => (
        <mesh key={i} position={[px, 0.28, pz]}>
          <boxGeometry args={[sw, 0.12, sd]} />
          <meshStandardMaterial color="#e6b800" />
        </mesh>
      ))}

      {/* Scissor arm pairs, front and back */}
      {[
        { ref: armsFront, z: 0.8 },
        { ref: armsBack, z: -0.8 },
      ].map(({ ref, z }) => (
        <group key={z} ref={ref} position={[0, 0, z]}>
          <mesh>
            <boxGeometry args={[0.12, ARM_LEN, 0.12]} />
            <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.12, ARM_LEN, 0.12]} />
            <meshStandardMaterial color={STEEL} metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Lifting platform with engine + front subframe */}
      <group ref={platform} position={[0, BASE_Y + 0.5, 0]}>
        <mesh castShadow>
          <boxGeometry args={[2.4, 0.14, 1.8]} />
          <meshStandardMaterial color="#6b7280" metalness={0.4} roughness={0.5} />
        </mesh>
        {/* Front subframe rails */}
        {[-0.55, 0.55].map((z) => (
          <mesh key={z} position={[0, 0.18, z]}>
            <boxGeometry args={[1.9, 0.12, 0.12]} />
            <meshStandardMaterial color={FRAME} metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        {/* Engine block */}
        <group position={[0.1, 0.42, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.0, 0.6, 0.85]} />
            <meshStandardMaterial color={ENGINE} metalness={0.5} roughness={0.45} />
          </mesh>
          {/* Cam covers / cylinder bank */}
          <mesh position={[0, 0.38, 0]}>
            <boxGeometry args={[0.8, 0.2, 0.7]} />
            <meshStandardMaterial color="#2a313d" metalness={0.5} roughness={0.4} />
          </mesh>
          {/* Transmission bell housing */}
          <mesh position={[-0.7, -0.08, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.34, 0.34, 0.5, 16]} />
            <meshStandardMaterial color="#42505f" metalness={0.5} roughness={0.45} />
          </mesh>
          {/* Exhaust manifold nub */}
          <mesh position={[0.2, 0.05, 0.5]}>
            <cylinderGeometry args={[0.08, 0.08, 0.4, 8]} />
            <meshStandardMaterial color="#8a929e" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      </group>
    </MachineShell>
  )
}
