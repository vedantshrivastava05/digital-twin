import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, type Group, type Material } from 'three'
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

const SPAN = 9
const BOOTH_X = 5.6
const ROOF_Y = 4.5
/** Overhead manifolds across the booth, and the side-spray stations. */
const MANIFOLD_X = [-3, 0, 3]
const NOZZLE_Z = [-2.2, -1.1, 0, 1.1, 2.2]
const STRIP_COUNT = 13

/**
 * Water leak-test booth: the finished car rolls in and gets hosed from above and
 * both sides at pressure while an inspector watches for water in the cabin. The
 * strip curtains at each end keep the spray inside the booth.
 */
export function ShowerTest({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const t = useRef(0)
  const car = useRef<Group>(null)
  const sprays = useRef<(Group | null)[]>([])
  const strips = useRef<(Group | null)[]>([])
  const puddle = useRef<Material | null>(null)
  const [carColour, tickColour] = useCarColour(SHOP_LEAD.check - 4)

  useFrame((_, dt) => {
    t.current += dt * statusSpeed(status)
    tickColour(t.current, CHECK_CYCLE_SEC)
    const { carX, carVisible, intensity } = checkPhase(t.current, SPAN)
    if (car.current) {
      car.current.position.x = carX
      car.current.visible = carVisible && status !== 'down'
    }
    // Spray banks pulse as the pumps cycle; each bank is slightly out of phase.
    sprays.current.forEach((s, i) => {
      if (!s) return
      const on = intensity > 0.05
      s.visible = on
      if (!on) return
      const pulse = 0.75 + 0.25 * Math.sin(t.current * 9 + i * 1.7)
      s.scale.set(1, pulse, 1)
      const mat = (s.children[0] as { material?: Material } | undefined)?.material
      if (mat) mat.opacity = 0.13 + 0.16 * intensity * pulse
    })
    if (puddle.current) puddle.current.opacity = 0.25 + 0.35 * intensity
    // Curtains part as the car pushes through them.
    strips.current.forEach((g, i) => {
      if (!g) return
      const end = i === 0 ? -BOOTH_X : BOOTH_X
      const near = Math.max(0, 1 - Math.abs(carX - end) / 2.6)
      g.children.forEach((strip, si) => {
        const off = (si - (STRIP_COUNT - 1) / 2) / ((STRIP_COUNT - 1) / 2)
        strip.rotation.x = off * near * 0.85
      })
    })
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.4, 0.1, 3.9]}
      labelY={5.6}
      noPlinth
    >
      {/* Wet floor slab with the centre drain channel */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[13, 6.4]} />
        <meshStandardMaterial color="#39414c" metalness={0.5} roughness={0.22} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <planeGeometry args={[12.4, 5.8]} />
        <meshStandardMaterial
          ref={(el) => {
            puddle.current = el
          }}
          color="#7fb4c9"
          metalness={0.85}
          roughness={0.06}
          transparent
          opacity={0.25}
        />
      </mesh>
      {[-2.6, 2.6].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[12, 0.08, 0.5]} />
            <meshStandardMaterial color="#22262d" metalness={0.4} roughness={0.6} />
          </mesh>
          {Array.from({ length: 24 }, (_, i) => (
            <mesh key={i} position={[-5.75 + i * 0.5, 0.09, 0]}>
              <boxGeometry args={[0.22, 0.05, 0.44]} />
              <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Booth frame */}
      {[-BOOTH_X, BOOTH_X].map((x) =>
        [-3.2, 3.2].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, ROOF_Y / 2, z]} castShadow>
            <boxGeometry args={[0.24, ROOF_Y, 0.24]} />
            <meshStandardMaterial color="#8f979f" metalness={0.45} roughness={0.45} />
          </mesh>
        )),
      )}
      <mesh position={[0, ROOF_Y, 0]} castShadow>
        <boxGeometry args={[12, 0.22, 7]} />
        <meshStandardMaterial color="#aeb6c0" metalness={0.35} roughness={0.55} />
      </mesh>
      {/* Translucent side walls so the spray is visible but contained */}
      {[-3.2, 3.2].map((z) => (
        <mesh key={`wall-${z}`} position={[0, 2.6, z]}>
          <planeGeometry args={[11.2, 3.4]} />
          <meshStandardMaterial
            color="#9fc6d6"
            transparent
            opacity={0.28}
            roughness={0.35}
            metalness={0.1}
            side={DoubleSide}
          />
        </mesh>
      ))}

      {/* Overhead + side spray manifolds with their nozzle banks */}
      {MANIFOLD_X.map((mx, mi) => (
        <group key={mx} position={[mx, 0, 0]}>
          {/* Cross pipe under the roof */}
          <mesh position={[0, ROOF_Y - 0.45, 0]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.09, 0.09, 6.4, 10]} />
            <meshStandardMaterial color="#3f7fa8" metalness={0.6} roughness={0.35} />
          </mesh>
          {/* Vertical risers feeding it */}
          {[-3.0, 3.0].map((z) => (
            <mesh key={z} position={[0, 2.4, z]}>
              <cylinderGeometry args={[0.08, 0.08, 4.2, 10]} />
              <meshStandardMaterial color="#3f7fa8" metalness={0.6} roughness={0.35} />
            </mesh>
          ))}
          {/* Downward sprays from the cross pipe */}
          {NOZZLE_Z.map((nz, ni) => (
            <group key={nz} position={[0, ROOF_Y - 0.55, nz]}>
              <mesh position={[0, -0.1, 0]}>
                <cylinderGeometry args={[0.04, 0.06, 0.16, 8]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.3} />
              </mesh>
              <group
                ref={(el) => {
                  sprays.current[mi * NOZZLE_Z.length + ni] = el
                }}
                position={[0, -1.5, 0]}
              >
                <mesh>
                  <coneGeometry args={[0.55, 2.7, 10, 1, true]} />
                  <meshStandardMaterial
                    color="#dff2fb"
                    transparent
                    opacity={0.2}
                    roughness={0.1}
                    metalness={0.05}
                    side={DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
              </group>
            </group>
          ))}
          {/* Inward sprays from the side risers */}
          {[-2.7, 2.7].map((sz, si) => (
            <group key={`side-${sz}`} position={[0, 1.6, sz]}>
              <mesh rotation-x={sz > 0 ? Math.PI / 2 : -Math.PI / 2}>
                <cylinderGeometry args={[0.04, 0.06, 0.18, 8]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.3} />
              </mesh>
              <group
                ref={(el) => {
                  sprays.current[MANIFOLD_X.length * NOZZLE_Z.length + mi * 2 + si] = el
                }}
                position={[0, 0, sz > 0 ? -1.1 : 1.1]}
                rotation-x={sz > 0 ? -Math.PI / 2 : Math.PI / 2}
              >
                <mesh>
                  <coneGeometry args={[0.5, 2.0, 10, 1, true]} />
                  <meshStandardMaterial
                    color="#dff2fb"
                    transparent
                    opacity={0.18}
                    roughness={0.1}
                    metalness={0.05}
                    side={DoubleSide}
                    depthWrite={false}
                  />
                </mesh>
              </group>
            </group>
          ))}
        </group>
      ))}

      {/* Strip curtains at both ends */}
      {[-BOOTH_X, BOOTH_X].map((x, ci) => (
        <group key={`cur-${x}`} position={[x, 0, 0]}>
          <mesh position={[0, 3.35, 0]}>
            <boxGeometry args={[0.16, 0.16, 6.6]} />
            <meshStandardMaterial color="#6b7484" metalness={0.4} roughness={0.5} />
          </mesh>
          <group
            ref={(el) => {
              strips.current[ci] = el
            }}
          >
            {Array.from({ length: STRIP_COUNT }, (_, i) => (
              <group key={i} position={[0, 3.28, -3 + i * (6 / (STRIP_COUNT - 1))]}>
                <mesh position={[0, -1.6, 0]}>
                  <planeGeometry args={[0.44, 3.2]} />
                  <meshStandardMaterial
                    color="#e8f3f7"
                    transparent
                    opacity={0.42}
                    roughness={0.6}
                    side={DoubleSide}
                  />
                </mesh>
              </group>
            ))}
          </group>
        </group>
      ))}

      {/* Pump skid + water tank alongside the booth */}
      <group position={[-3.4, 0, 4.6]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <cylinderGeometry args={[0.85, 0.85, 1.8, 18]} />
          <meshStandardMaterial color="#5b8fa8" metalness={0.35} roughness={0.5} />
        </mesh>
        <mesh position={[1.6, 0.45, 0]} castShadow>
          <boxGeometry args={[1.5, 0.9, 1.0]} />
          <meshStandardMaterial color="#42505f" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0.75, 1.6, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.08, 0.08, 1.7, 10]} />
          <meshStandardMaterial color="#3f7fa8" metalness={0.6} roughness={0.35} />
        </mesh>
      </group>

      {/* The car under test */}
      <group ref={car} position={[-SPAN, 0, 0]}>
        <CarBody color={carColour} wheels />
      </group>
    </MachineShell>
  )
}
