import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Material, Mesh, MeshStandardMaterial } from 'three'
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

/** Lateral offsets of the two headlamps on CarBody's nose. */
const LAMP_Z = [0.58, -0.58]
const LAMP_X = 1.86
const LAMP_Y = 0.72

/**
 * Headlamp aim station: the car parks on the pad with its lights on and a
 * target board on a floor rail traverses across the nose, stopping square in
 * front of each lamp while the camera head reads the beam pattern.
 */
export function LampAimRig({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const t = useRef(0)
  const car = useRef<Group>(null)
  const board = useRef<Group>(null)
  const beams = useRef<(Mesh | null)[]>([])
  const quadrants = useRef<(MeshStandardMaterial | null)[]>([])
  const [carColour, tickColour] = useCarColour(SHOP_LEAD.check - 1)

  useFrame((_, dt) => {
    t.current += dt * statusSpeed(status)
    tickColour(t.current, CHECK_CYCLE_SEC)
    const { carX, carVisible, testing, intensity, f } = checkPhase(t.current, 8)
    if (car.current) {
      car.current.position.x = carX
      car.current.visible = carVisible
    }
    // Headlamps come on as soon as the car is parked.
    beams.current.forEach((b) => {
      if (!b) return
      b.visible = testing
      ;(b.material as Material).opacity = 0.16 * intensity
    })
    // Board dwells in front of the left lamp, traverses, dwells at the right.
    if (board.current) {
      const p = Math.min(1, Math.max(0, (f - 0.2) / 0.5))
      const leg = p < 0.4 ? 0 : p < 0.6 ? (p - 0.4) / 0.2 : 1
      board.current.position.z = LAMP_Z[0] + (LAMP_Z[1] - LAMP_Z[0]) * leg
      board.current.visible = carVisible
    }
    // Reading quadrants blink while the board is settled on a lamp.
    const settled = testing && (f < 0.4 || f > 0.6)
    quadrants.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = settled && i === 2 ? 2.2 : settled ? 0.35 : 0.12
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[-3.8, 0.1, -2.4]}
      labelY={3.8}
      noPlinth
    >
      {/* Aim pad: level plate the car must stand on, with a centring line */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.018, 0]} receiveShadow>
        <planeGeometry args={[9, 4.6]} />
        <meshStandardMaterial color="#5a626c" metalness={0.3} roughness={0.55} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.024, 0]}>
        <planeGeometry args={[8.6, 0.12]} />
        <meshBasicMaterial color="#f2f4f7" />
      </mesh>

      {/* Traverse rail in front of the nose */}
      <mesh position={[3.5, 0.1, 0]} castShadow>
        <boxGeometry args={[0.4, 0.16, 3.4]} />
        <meshStandardMaterial color="#7b838d" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Target board + camera head on the traverse carriage */}
      <group ref={board} position={[0, 0, LAMP_Z[0]]}>
        <group position={[3.5, 0, 0]}>
          <mesh position={[0, 0.24, 0]} castShadow>
            <boxGeometry args={[0.7, 0.3, 0.8]} />
            <meshStandardMaterial color="#3d444e" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.95, 0]} castShadow>
            <boxGeometry args={[0.18, 1.4, 0.18]} />
            <meshStandardMaterial color="#8f979f" metalness={0.4} roughness={0.5} />
          </mesh>
          {/* Board face turned back toward the lamp (-X) */}
          <mesh position={[-0.12, 1.15, 0]} castShadow>
            <boxGeometry args={[0.12, 1.3, 1.7]} />
            <meshStandardMaterial color="#20252d" roughness={0.75} />
          </mesh>
          <group position={[-0.19, 1.15, 0]}>
            {[
              [0.3, 0.4],
              [0.3, -0.4],
              [-0.3, 0.4],
              [-0.3, -0.4],
            ].map(([y, z], q) => (
              <mesh key={q} position={[0, y, z]} rotation-y={-Math.PI / 2}>
                <planeGeometry args={[0.72, 0.55]} />
                <meshStandardMaterial
                  ref={(el) => {
                    quadrants.current[q] = el
                  }}
                  color="#0b2c38"
                  emissive="#7ee0ff"
                  emissiveIntensity={0.12}
                />
              </mesh>
            ))}
            {/* Cross hair */}
            <mesh rotation-y={-Math.PI / 2}>
              <planeGeometry args={[1.5, 0.04]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
            <mesh rotation-y={-Math.PI / 2}>
              <planeGeometry args={[0.04, 1.15]} />
              <meshBasicMaterial color="#f8fafc" />
            </mesh>
          </group>
          {/* Camera head above the board, sighting down at the pattern */}
          <mesh position={[0.1, 2.0, 0]} rotation-z={0.35} castShadow>
            <boxGeometry args={[0.5, 0.34, 0.34]} />
            <meshStandardMaterial color="#2b313a" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[-0.2, 1.88, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.1, 0.13, 0.22, 14]} />
            <meshStandardMaterial color="#101318" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      </group>

      {/* Operator console with the aim readout */}
      <group position={[1.4, 0, -2.9]}>
        <mesh position={[0, 0.85, 0]} castShadow>
          <boxGeometry args={[1.2, 1.7, 0.6]} />
          <meshStandardMaterial color="#c3c9d1" metalness={0.2} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.25, -0.32]} rotation-y={Math.PI}>
          <planeGeometry args={[0.8, 0.5]} />
          <meshStandardMaterial color="#07222c" emissive="#1c7f9c" emissiveIntensity={0.9} />
        </mesh>
      </group>

      {/* The car with its lights on */}
      <group ref={car}>
        <group position={[0, 0, 0]}>
          <CarBody color={carColour} wheels />
        </group>
        {LAMP_Z.map((z, i) => (
          <group key={z} position={[LAMP_X, LAMP_Y, z]}>
            <mesh>
              <sphereGeometry args={[0.13, 12, 10]} />
              <meshStandardMaterial
                color="#fffbe8"
                emissive="#fff3c4"
                emissiveIntensity={2.4}
              />
            </mesh>
            {/* Beam cone toward the target board */}
            <mesh
              ref={(el) => {
                beams.current[i] = el
              }}
              position={[0.85, -0.02, 0]}
              rotation-z={Math.PI / 2}
            >
              <coneGeometry args={[0.42, 1.7, 16, 1, true]} />
              <meshBasicMaterial color="#fff6d5" transparent opacity={0.16} depthWrite={false} />
            </mesh>
          </group>
        ))}
      </group>
    </MachineShell>
  )
}
