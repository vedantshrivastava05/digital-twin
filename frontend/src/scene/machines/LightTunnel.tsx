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

/** X positions of the light banks down each side, and how far each toes in. */
const BANK_X = [-3.4, 0, 3.4]
const BANK_Z = 3.1
const TUBES = [-0.52, -0.17, 0.18, 0.53]

/**
 * Final visual inspection tunnel: A-frame fluorescent banks on rolling frames
 * stand in a V down both sides of the car so the striped reflections sweep the
 * panels and reveal dents. Two inspectors walk the length of the body.
 */
export function LightTunnel({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const t = useRef(0)
  const car = useRef<Group>(null)
  const stripes = useRef<Group>(null)
  const walkers = useRef<(Group | null)[]>([])
  const tubes = useRef<(MeshStandardMaterial | null)[]>([])
  const [carColour, tickColour] = useCarColour(SHOP_LEAD.check - 3)

  useFrame((_, dt) => {
    t.current += dt * statusSpeed(status)
    tickColour(t.current, CHECK_CYCLE_SEC)
    const { carX, carVisible, testing, intensity, f } = checkPhase(t.current, 9)
    if (car.current) {
      car.current.position.x = carX
      car.current.visible = carVisible
    }
    if (stripes.current) {
      stripes.current.visible = testing
      stripes.current.position.x = carX
    }
    // Inspectors pace the length of the body while it is parked.
    const pace = Math.sin(f * Math.PI * 6) * 2.2
    walkers.current.forEach((w, i) => {
      if (!w) return
      w.visible = testing
      w.position.x = (i === 0 ? pace : -pace) * 0.9
    })
    // Very slight flicker so the banks do not look like dead geometry.
    const flick = 2.4 + Math.sin(t.current * 7.3) * 0.12 + intensity * 0.5
    tubes.current.forEach((m) => {
      if (m) m.emissiveIntensity = flick
    })
  })

  let tubeIdx = 0

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[-5.4, 0.1, -4.2]}
      labelY={4.6}
      noPlinth
    >
      {/* Glossy epoxy inspection pad */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.018, 0]} receiveShadow>
        <planeGeometry args={[12, 8]} />
        <meshStandardMaterial color="#2f3a44" metalness={0.55} roughness={0.18} />
      </mesh>

      {/* A-frame light banks, toed in toward the car in a V */}
      {[1, -1].map((side) =>
        BANK_X.map((x) => (
          <group
            key={`${side}:${x}`}
            position={[x, 0, side * BANK_Z]}
            rotation-y={side * (x < 0 ? 0.42 : x > 0 ? -0.42 : 0)}
          >
            {/* Rolling frame legs + casters */}
            {[-0.75, 0.75].map((dx) => (
              <group key={dx} position={[dx, 0, 0]}>
                <mesh position={[0, 1.55, 0]} castShadow>
                  <boxGeometry args={[0.1, 3.1, 0.1]} />
                  <meshStandardMaterial color="#8f979f" metalness={0.4} roughness={0.5} />
                </mesh>
                <mesh position={[0, 0.06, 0]}>
                  <boxGeometry args={[0.5, 0.12, 0.5]} />
                  <meshStandardMaterial color="#3a4048" />
                </mesh>
              </group>
            ))}
            <mesh position={[0, 3.1, 0]}>
              <boxGeometry args={[1.7, 0.1, 0.1]} />
              <meshStandardMaterial color="#8f979f" metalness={0.4} roughness={0.5} />
            </mesh>
            {/* Reflector panel, tipped in over the car */}
            <group position={[0, 1.7, -side * 0.18]} rotation-x={side * 0.28}>
              <mesh castShadow>
                <boxGeometry args={[1.66, 2.5, 0.1]} />
                <meshStandardMaterial color="#e8ecef" metalness={0.2} roughness={0.5} />
              </mesh>
              {/* Vertical fluorescent tubes */}
              {TUBES.map((dx) => {
                const idx = tubeIdx++
                return (
                  <mesh key={dx} position={[dx, 0, -side * 0.09]}>
                    <boxGeometry args={[0.14, 2.3, 0.06]} />
                    <meshStandardMaterial
                      ref={(el) => {
                        tubes.current[idx] = el
                      }}
                      color="#ffffff"
                      emissive="#f2f8ff"
                      emissiveIntensity={2.4}
                    />
                  </mesh>
                )
              })}
            </group>
          </group>
        )),
      )}

      {/* Striped highlights running along the flanks — the reflection the
          inspectors actually read the panels by. */}
      <group ref={stripes}>
        {[1, -1].map((side) =>
          TUBES.map((dx, i) => (
            <mesh
              key={`${side}:${dx}`}
              position={[i * 0.9 - 1.35, 0.62 + (i % 2) * 0.16, side * 0.88]}
              rotation-y={side > 0 ? 0 : Math.PI}
            >
              <planeGeometry args={[0.7, 0.34]} />
              <meshBasicMaterial
                color="#eef6ff"
                transparent
                opacity={0.3}
                depthWrite={false}
              />
            </mesh>
          )),
        )}
      </group>

      {/* Pedestal fans, as on the real inspection aisle */}
      {[-4.6, 4.6].map((x) => (
        <group key={x} position={[x, 0, -3.9]}>
          <mesh position={[0, 0.7, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 1.4, 8]} />
            <meshStandardMaterial color="#6b737c" metalness={0.4} roughness={0.55} />
          </mesh>
          <mesh position={[0, 1.5, 0.1]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.34, 0.34, 0.2, 16]} />
            <meshStandardMaterial color="#4b535c" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.08, 12]} />
            <meshStandardMaterial color="#3a4048" />
          </mesh>
        </group>
      ))}

      {/* Paperwork trolley at the exit end */}
      <group position={[5.2, 0, 2.4]}>
        <mesh position={[0, 0.85, 0]} castShadow>
          <boxGeometry args={[0.9, 0.06, 0.6]} />
          <meshStandardMaterial color="#8d959f" metalness={0.3} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.9, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.4, 0.3]} />
          <meshBasicMaterial color="#f8fafc" />
        </mesh>
        {[-0.35, 0.35].map((dx) => (
          <mesh key={dx} position={[dx, 0.42, 0]}>
            <boxGeometry args={[0.06, 0.85, 0.06]} />
            <meshStandardMaterial color="#6b737c" />
          </mesh>
        ))}
      </group>

      {/* Two inspectors working the body */}
      {[1, -1].map((side, i) => (
        <group
          key={side}
          ref={(el) => {
            walkers.current[i] = el
          }}
        >
          <group position={[0, 0, side * 1.7]}>
            <mesh position={[0, 0.6, 0]} castShadow>
              <capsuleGeometry args={[0.22, 0.72, 4, 8]} />
              <meshStandardMaterial color={i === 0 ? '#1d4ed8' : '#0f766e'} roughness={0.7} />
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
        </group>
      ))}

      {/* The finished car under inspection */}
      <group ref={car}>
        <CarBody color={carColour} wheels />
      </group>
    </MachineShell>
  )
}
