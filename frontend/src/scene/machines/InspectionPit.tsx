import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, MeshStandardMaterial } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { CHECK_CYCLE_SEC, checkPhase } from '../lineClock'
import { SHOP_LEAD, useCarColour } from '../paintQueue'
import { CarBody } from '../CarBody'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const DECK_Y = 1.15
const TRACK_Z = 0.85
const TRACK_HALF_W = 0.55
/** Ramp run either side of the flat deck. */
const RAMP_RUN = 3.2
const FLAT_HALF = 3.4

/**
 * Underbody inspection deck: the car drives up a ramp onto two raised wheel
 * tracks with a lit walk-under trench between them, so an inspector standing at
 * floor level can check the exhaust, suspension and floor pan from below.
 */
export function InspectionPit({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const t = useRef(0)
  const car = useRef<Group>(null)
  const trenchLight = useRef<MeshStandardMaterial>(null)
  const [carColour, tickColour] = useCarColour(SHOP_LEAD.check - 2)

  useFrame((_, dt) => {
    t.current += dt * statusSpeed(status)
    tickColour(t.current, CHECK_CYCLE_SEC)
    const { carX, carVisible, intensity } = checkPhase(t.current, 10)
    if (car.current) {
      car.current.position.x = carX
      car.current.visible = carVisible
      // Riding the ramp: drop the car while it is still on the incline.
      const onRamp = Math.max(0, Math.abs(carX) - FLAT_HALF) / RAMP_RUN
      car.current.position.y = DECK_Y * (1 - Math.min(1, onRamp))
    }
    if (trenchLight.current) trenchLight.current.emissiveIntensity = 0.5 + intensity * 1.6
  })

  const rampAngle = Math.atan2(DECK_Y, RAMP_RUN)
  const rampLen = Math.hypot(DECK_Y, RAMP_RUN)

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[-6.6, 0.1, -2.6]}
      labelY={4.2}
      noPlinth
    >
      {/* Raised wheel tracks with support legs */}
      {[TRACK_Z, -TRACK_Z].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, DECK_Y - 0.09, 0]} castShadow receiveShadow>
            <boxGeometry args={[FLAT_HALF * 2, 0.18, TRACK_HALF_W * 2]} />
            <meshStandardMaterial color="#5a626c" metalness={0.5} roughness={0.45} />
          </mesh>
          {/* Approach + exit ramps */}
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              position={[s * (FLAT_HALF + RAMP_RUN / 2), DECK_Y / 2 - 0.04, 0]}
              rotation-z={s * rampAngle}
              castShadow
            >
              <boxGeometry args={[rampLen, 0.16, TRACK_HALF_W * 2]} />
              <meshStandardMaterial color="#525963" metalness={0.45} roughness={0.5} />
            </mesh>
          ))}
          {/* Legs under the flat section */}
          {[-2.6, 0, 2.6].map((x) => (
            <mesh key={x} position={[x, (DECK_Y - 0.18) / 2, 0]} castShadow>
              <boxGeometry args={[0.24, DECK_Y - 0.18, 0.9]} />
              <meshStandardMaterial color="#41474f" metalness={0.35} roughness={0.6} />
            </mesh>
          ))}
          {/* Kerb lip on the outer edge so wheels cannot walk off */}
          <mesh position={[0, DECK_Y + 0.04, z > 0 ? TRACK_HALF_W : -TRACK_HALF_W]}>
            <boxGeometry args={[FLAT_HALF * 2, 0.1, 0.1]} />
            <meshStandardMaterial color="#e6b800" />
          </mesh>
        </group>
      ))}

      {/* Lit trench between the tracks — the light that makes the underbody read */}
      <mesh position={[0, 0.06, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[FLAT_HALF * 2 + 1, TRACK_Z * 2 - TRACK_HALF_W * 2]} />
        <meshStandardMaterial color="#23272d" roughness={0.85} />
      </mesh>
      {[TRACK_Z - TRACK_HALF_W - 0.08, -(TRACK_Z - TRACK_HALF_W - 0.08)].map((z) => (
        <mesh key={z} position={[0, 0.6, z]}>
          <boxGeometry args={[FLAT_HALF * 1.8, 0.12, 0.06]} />
          <meshStandardMaterial
            ref={z > 0 ? trenchLight : undefined}
            color="#ffffff"
            emissive="#e8f4ff"
            emissiveIntensity={1.2}
          />
        </mesh>
      ))}

      {/* Handrails along the outer sides of the deck */}
      {[TRACK_Z + 1.5, -(TRACK_Z + 1.5)].map((z) => (
        <group key={z} position={[0, 0, z]}>
          {[-3, -1, 1, 3].map((x) => (
            <mesh key={x} position={[x, 0.55, 0]} castShadow>
              <boxGeometry args={[0.09, 1.1, 0.09]} />
              <meshStandardMaterial color="#ca9a04" />
            </mesh>
          ))}
          {[0.5, 1.02].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <boxGeometry args={[6.6, 0.07, 0.07]} />
              <meshStandardMaterial color="#eab308" />
            </mesh>
          ))}
        </group>
      ))}

      {/* Inspector standing in the trench under the car */}
      <group position={[-0.6, 0, 0]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <capsuleGeometry args={[0.22, 0.72, 4, 8]} />
          <meshStandardMaterial color="#2563eb" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.2, 0]} castShadow>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshStandardMaterial color="#e9c39b" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.32, 0]}>
          <sphereGeometry args={[0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      </group>

      {/* The car on the deck */}
      <group ref={car} position={[0, DECK_Y, 0]}>
        <CarBody color={carColour} wheels />
      </group>
    </MachineShell>
  )
}
