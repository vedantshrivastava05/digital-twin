import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
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

const DECK_TOP = 0.22
const ROLLER_R = 0.24
const ROLLER_Y = 0.3
/** Wheel centres of CarBody sit at x = ±1.25, so the roller wells match. */
const AXLE_X = [1.25, -1.25]
/** Car group height so the tyres rest on the roller crowns. */
const CAR_Y = ROLLER_Y + ROLLER_R + 0.07

/**
 * Final-check roller test bed: the car drives onto a diamond-plate deck with
 * recessed roller wells under each axle, then the rollers drive the wheels for
 * the speedometer / brake test while an overhead HUD shows the live readout and
 * an extraction hose takes the exhaust away.
 */
export function RollerTestBed({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const t = useRef(0)
  const car = useRef<Group>(null)
  const rollers = useRef<(Mesh | null)[]>([])
  const speedBar = useRef<Mesh>(null)
  const needle = useRef<Group>(null)
  const tempBar = useRef<Mesh>(null)
  const [carColour, tickColour] = useCarColour(SHOP_LEAD.check)

  useFrame((_, dt) => {
    t.current += dt * statusSpeed(status)
    tickColour(t.current, CHECK_CYCLE_SEC)
    const { carX, carVisible, intensity } = checkPhase(t.current, 8)
    if (car.current) {
      car.current.position.x = carX
      car.current.visible = carVisible
    }
    rollers.current.forEach((r, i) => {
      if (r) r.rotation.y += dt * intensity * 26 * (i % 2 === 0 ? 1 : -1)
    })
    // HUD: speed bar fills, needle sweeps, coolant creeps up and holds.
    if (speedBar.current) {
      speedBar.current.scale.x = Math.max(0.001, intensity)
      speedBar.current.position.z = -(1 - intensity) * 0.45
    }
    if (needle.current) needle.current.rotation.x = -2.1 + intensity * 4.2
    if (tempBar.current) {
      const warm = Math.min(1, intensity * 1.3)
      tempBar.current.scale.x = Math.max(0.001, warm)
      tempBar.current.position.z = -(1 - warm) * 0.45
    }
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[-4.6, 0.1, -2.6]}
      labelY={4.4}
      noPlinth
    >
      {/* Diamond-plate drive-on deck */}
      <mesh position={[0, DECK_TOP / 2, 0]} receiveShadow>
        <boxGeometry args={[10, DECK_TOP, 5.6]} />
        <meshStandardMaterial color="#4d545e" metalness={0.55} roughness={0.42} />
      </mesh>
      {/* Approach lips so the car is not driving up a step */}
      {[-5.6, 5.6].map((x) => (
        <mesh key={x} position={[x, DECK_TOP / 2 - 0.03, 0]} rotation-z={x > 0 ? -0.09 : 0.09}>
          <boxGeometry args={[1.4, DECK_TOP, 5.6]} />
          <meshStandardMaterial color="#454c55" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}

      {/* Roller wells under each axle */}
      {AXLE_X.map((x, ai) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, DECK_TOP - 0.02, 0]}>
            <boxGeometry args={[1.5, 0.3, 2.5]} />
            <meshStandardMaterial color="#14171c" roughness={0.9} />
          </mesh>
          {[-0.32, 0.32].map((dx, i) => (
            <group key={dx} position={[dx, ROLLER_Y, 0]} rotation-x={Math.PI / 2}>
              <mesh
                ref={(el) => {
                  rollers.current[ai * 2 + i] = el
                }}
                castShadow
              >
                <cylinderGeometry args={[ROLLER_R, ROLLER_R, 2.3, 18]} />
                <meshStandardMaterial color="#8d959f" metalness={0.75} roughness={0.32} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* Yellow wheel guide rails down both sides of the deck */}
      {[-2.5, 2.5].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[9.4, 0.1, 0.1]} />
            <meshStandardMaterial color="#e6b800" metalness={0.3} roughness={0.6} />
          </mesh>
          {[-4, -1.3, 1.3, 4].map((x) => (
            <mesh key={x} position={[x, 0.36, 0]}>
              <boxGeometry args={[0.1, 0.55, 0.1]} />
              <meshStandardMaterial color="#ca9a04" />
            </mesh>
          ))}
        </group>
      ))}

      {/* Test-equipment cabinets on the operator side */}
      {[-2.2, -0.2].map((x) => (
        <group key={x} position={[x, 0, -3.5]}>
          <mesh position={[0, 0.95, 0]} castShadow>
            <boxGeometry args={[1.5, 1.9, 0.7]} />
            <meshStandardMaterial color="#c3c9d1" metalness={0.2} roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.35, 0.36]}>
            <planeGeometry args={[0.9, 0.6]} />
            <meshStandardMaterial color="#0d2b38" emissive="#1c7f9c" emissiveIntensity={0.8} />
          </mesh>
        </group>
      ))}

      {/* Overhead HUD gantry in front of the windscreen */}
      <group position={[3.9, 0, 0]}>
        {[-2.7, 2.7].map((z) => (
          <mesh key={z} position={[0, 1.85, z]} castShadow>
            <boxGeometry args={[0.22, 3.7, 0.22]} />
            <meshStandardMaterial color="#9aa2ac" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, 3.7, 0]} castShadow>
          <boxGeometry args={[0.24, 0.24, 5.6]} />
          <meshStandardMaterial color="#9aa2ac" metalness={0.4} roughness={0.5} />
        </mesh>
        {/* Three screens: headlamp target quadrants, speedometer, engine page */}
        {[-1.5, 0, 1.5].map((z, i) => (
          <group key={z} position={[0, 2.6, z]}>
            <mesh position={[0, 1.0, 0]}>
              <boxGeometry args={[0.06, 0.5, 0.06]} />
              <meshStandardMaterial color="#5b6371" />
            </mesh>
            <mesh castShadow>
              <boxGeometry args={[0.1, 0.95, 1.35]} />
              <meshStandardMaterial color="#1b1f26" metalness={0.3} roughness={0.6} />
            </mesh>
            {/* Screen face, pointing back at the driver (-X) */}
            <mesh position={[-0.06, 0, 0]} rotation-y={-Math.PI / 2}>
              <planeGeometry args={[1.24, 0.84]} />
              <meshStandardMaterial color="#07222c" emissive="#0b3d4d" emissiveIntensity={0.9} />
            </mesh>
            {i === 0 && (
              // Headlamp targeting: four quadrants with the aim spot lit
              <group position={[-0.07, 0, 0]}>
                {[
                  [0.3, 0.21],
                  [0.3, -0.21],
                  [-0.3, 0.21],
                  [-0.3, -0.21],
                ].map(([y, z2], q) => (
                  <mesh key={q} position={[0, y, z2]} rotation-y={-Math.PI / 2}>
                    <planeGeometry args={[0.5, 0.3]} />
                    <meshStandardMaterial
                      color="#0a3444"
                      emissive={q === 1 ? '#7ee0ff' : '#12546a'}
                      emissiveIntensity={q === 1 ? 1.8 : 0.5}
                    />
                  </mesh>
                ))}
              </group>
            )}
            {i === 1 && (
              // Speedometer: sweeping needle over a dial arc
              <group position={[-0.07, -0.1, 0]}>
                <mesh rotation-y={-Math.PI / 2}>
                  <ringGeometry args={[0.26, 0.32, 20, 1, Math.PI * 0.15, Math.PI * 0.7]} />
                  <meshStandardMaterial color="#0d4a5e" emissive="#3fd0f0" emissiveIntensity={1.1} />
                </mesh>
                <group ref={needle}>
                  <mesh position={[0, 0.14, 0]}>
                    <boxGeometry args={[0.02, 0.28, 0.03]} />
                    <meshStandardMaterial color="#ffd166" emissive="#ffb703" emissiveIntensity={1.6} />
                  </mesh>
                </group>
              </group>
            )}
            {i === 2 && (
              // Engine page: speed + coolant bars filling left to right
              <group position={[-0.07, 0, 0]}>
                <mesh ref={speedBar} position={[0, 0.16, 0]} rotation-y={-Math.PI / 2}>
                  <planeGeometry args={[0.9, 0.14]} />
                  <meshStandardMaterial color="#0e5f3f" emissive="#22c55e" emissiveIntensity={1.5} />
                </mesh>
                <mesh ref={tempBar} position={[0, -0.08, 0]} rotation-y={-Math.PI / 2}>
                  <planeGeometry args={[0.9, 0.14]} />
                  <meshStandardMaterial color="#5f3a0e" emissive="#f59e0b" emissiveIntensity={1.4} />
                </mesh>
                <mesh position={[0, -0.3, 0.38]} rotation-y={-Math.PI / 2}>
                  <planeGeometry args={[0.2, 0.14]} />
                  <meshStandardMaterial color="#0e5f3f" emissive="#22c55e" emissiveIntensity={1.8} />
                </mesh>
              </group>
            )}
          </group>
        ))}
      </group>

      {/* Exhaust extraction hose dropping onto the tailpipe */}
      <group position={[-3.4, 0, 1.9]}>
        <mesh position={[0, 3.4, 0]}>
          <cylinderGeometry args={[0.19, 0.19, 3.6, 12]} />
          <meshStandardMaterial color="#7c838d" metalness={0.3} roughness={0.75} />
        </mesh>
        <mesh position={[0, 1.4, 0]}>
          <coneGeometry args={[0.3, 0.7, 12, 1, true]} />
          <meshStandardMaterial color="#3d434c" metalness={0.4} roughness={0.6} />
        </mesh>
      </group>

      {/* The car under test */}
      <group ref={car} position={[0, CAR_Y, 0]}>
        <CarBody color={carColour} wheels />
      </group>
    </MachineShell>
  )
}
