import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { AssetDto, AssetInstanceDto } from '../../types'
import { statusSpeed, useMachineRuntime } from '../../store'
import { CYCLE_SEC, FRAME_LINE_ID, getLineClock } from '../lineClock'
import { panelGeometry, type PanelKind } from '../panelShapes'
import { biwGeometry } from '../BodyInWhite'
import { MachineShell } from './MachineShell'

interface Props {
  instance: AssetInstanceDto
  asset: AssetDto
}

const ORANGE = '#f97316'
const JOINT = '#252c38'
const STEEL = '#5b6577'
const FRAME = '#3f4a5e'
const PANEL = '#c8d0dc'

// Cycle phase windows (fraction of the shared frame-cell cycle).
const INDEX_END = 2 / 7 // shell exits during the index move
const LOAD0 = 0.32
const LOAD1 = 0.55
const PRESS0 = 0.56
const PRESS1 = 0.8
const EXIT_DIST = 14 // how far the framed shell rides east on the rail

const BOOM_UP = 0.3
const BOOM_DOWN = -0.12
const TURRET_PICK = -0.9

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Three loader arms around the build fixture (fixture sits at local origin).
// baseYaw aims each arm's +x boom at the fixture; the turret swings ±from there.
const ARMS: {
  key: string
  kind: PanelKind
  ped: [number, number, number]
  baseYaw: number
  gripScale: number
  gripRot: [number, number, number]
}[] = [
  { key: 'center', kind: 'floor', ped: [0, 0, -4.6], baseYaw: -Math.PI / 2, gripScale: 1, gripRot: [-Math.PI / 2, 0, 0] },
  { key: 'left', kind: 'side', ped: [-3.6, 0, 2.9], baseYaw: Math.atan2(2.9, 3.6), gripScale: 0.6, gripRot: [0, Math.PI / 2, 0] },
  { key: 'right', kind: 'side', ped: [3.6, 0, 2.9], baseYaw: Math.atan2(2.9, -3.6), gripScale: 0.6, gripRot: [0, Math.PI / 2, 0] },
]

/**
 * Body-framing / underbody build cell (start of the body build, sited at the
 * east end of the stamping shop). One shared clock sequences the whole step:
 *   index  -> the framed body-in-white rides east on the rail toward the weld shop
 *   load   -> arm 1 sets the centre floor, arms 2/3 set the left/right sides
 *   press  -> the arms clear, geo clamps close and the join press strokes down
 *   set    -> the three panels are now one welded shell, ready to index out
 * Feeds the weld shop directly (see the stamp->body carrier in MaterialFlow).
 */
export function BodyFramingCell({ instance, asset }: Props) {
  const runtime = useMachineRuntime(instance.id)
  const status = runtime?.status ?? 'idle'
  const clock = getLineClock(FRAME_LINE_ID)

  const turret = useRef<(Group | null)[]>([])
  const boom = useRef<(Group | null)[]>([])
  const grip = useRef<(Group | null)[]>([])
  const placed = useRef<Group>(null)
  const shell = useRef<Group>(null)
  const ram = useRef<Mesh>(null)
  const clampL = useRef<Group>(null)
  const clampR = useRef<Group>(null)

  const floorGeom = useMemo(() => panelGeometry('floor'), [])
  const sideGeom = useMemo(() => panelGeometry('side'), [])
  const biw = useMemo(() => biwGeometry(), [])

  useFrame((_, dt) => {
    clock.t += dt * statusSpeed(status)
    const f = (((clock.t / CYCLE_SEC) % 1) + 1) % 1

    // Arm reach: swing in during LOAD, snap back out just after.
    let reach = 0
    if (f >= LOAD0 && f < LOAD1) reach = smooth((f - LOAD0) / (LOAD1 - LOAD0))
    else if (f >= LOAD1 && f < LOAD1 + 0.14) reach = 1 - smooth((f - LOAD1) / 0.14)
    const gripVisible = f <= LOAD1 // arm carries its panel from pickup until release

    // Join press stroke during PRESS.
    const press =
      f > PRESS0 && f < PRESS1 ? Math.sin(((f - PRESS0) / (PRESS1 - PRESS0)) * Math.PI) : 0

    for (let i = 0; i < ARMS.length; i++) {
      const tg = turret.current[i]
      const bm = boom.current[i]
      const gp = grip.current[i]
      if (tg) tg.rotation.y = lerp(TURRET_PICK, 0, reach)
      if (bm) bm.rotation.z = lerp(BOOM_UP, BOOM_DOWN, reach)
      if (gp) gp.visible = gripVisible
    }

    // Framed panels visible from load-end through to the next index.
    if (placed.current) {
      placed.current.visible = f >= 0.5
      const flash = press > 0.8 ? 1.4 : 0.1
      placed.current.children.forEach((c) => {
        const m = (c as Mesh).material as MeshStandardMaterial | undefined
        if (m) m.emissiveIntensity = flash
      })
    }

    // Join press ram + geo clamps.
    if (ram.current) ram.current.position.y = 4.0 - press * 2.2
    const open = 0.5 * (1 - press)
    if (clampL.current) clampL.current.rotation.x = open
    if (clampR.current) clampR.current.rotation.x = -open

    // The finished shell rides out east during the index move.
    if (shell.current) {
      const exiting = f < INDEX_END
      shell.current.visible = exiting
      shell.current.position.x = smooth(f / INDEX_END) * EXIT_DIST
    }
  })

  return (
    <MachineShell
      instance={instance}
      footprint={[asset.footprint_w, asset.footprint_d]}
      status={status}
      lampOffset={[asset.footprint_w / 2 - 0.4, 0.1, asset.footprint_d / 2 - 0.4]}
      labelY={5.6}
      noPlinth
    >
      {/* ---- Index rail running east toward the weld shop door ---- */}
      {[-0.78, 0.78].map((z) => (
        <mesh key={z} position={[5.5, 0.2, z]} castShadow receiveShadow>
          <boxGeometry args={[21, 0.16, 0.16]} />
          <meshStandardMaterial color={FRAME} metalness={0.35} roughness={0.55} />
        </mesh>
      ))}
      {Array.from({ length: 11 }, (_, i) => -4 + i * 2).map((x) => (
        <mesh key={x} position={[x, 0.12, 0]}>
          <boxGeometry args={[0.22, 0.1, 1.9]} />
          <meshStandardMaterial color="#3b4250" />
        </mesh>
      ))}

      {/* ---- Build fixture pallet at the load station (origin) ---- */}
      <mesh position={[0, 0.34, 0]} castShadow>
        <boxGeometry args={[3.2, 0.3, 2.2]} />
        <meshStandardMaterial color="#2a313d" metalness={0.4} roughness={0.55} />
      </mesh>
      {[-1.3, 1.3].map((x) =>
        [-0.8, 0.8].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.6, z]}>
            <cylinderGeometry args={[0.06, 0.08, 0.3, 8]} />
            <meshStandardMaterial color={ORANGE} />
          </mesh>
        )),
      )}

      {/* ---- Overhead join press portal ---- */}
      {[-2.4, 2.4].map((x) => (
        <mesh key={x} position={[x, 2.4, 0]} castShadow>
          <boxGeometry args={[0.4, 4.8, 0.4]} />
          <meshStandardMaterial color={STEEL} metalness={0.35} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 4.75, 0]} castShadow>
        <boxGeometry args={[5.6, 0.6, 1.2]} />
        <meshStandardMaterial color={FRAME} />
      </mesh>
      <mesh ref={ram} position={[0, 4.0, 0]} castShadow>
        <boxGeometry args={[3.2, 0.8, 1.9]} />
        <meshStandardMaterial color="#8b96a8" metalness={0.4} roughness={0.45} />
      </mesh>

      {/* ---- Geo clamp gates (close during the press) ---- */}
      {[
        { ref: clampL, z: 1.7 },
        { ref: clampR, z: -1.7 },
      ].map(({ ref, z }) => (
        <group key={z} ref={ref} position={[0, 0, z]}>
          {[-1.3, 1.3].map((x) => (
            <mesh key={x} position={[x, 1.0, 0]} castShadow>
              <boxGeometry args={[0.16, 2.0, 0.16]} />
              <meshStandardMaterial color="#e6b800" metalness={0.3} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 1.8, 0]}>
            <boxGeometry args={[2.8, 0.14, 0.14]} />
            <meshStandardMaterial color="#e6b800" />
          </mesh>
        </group>
      ))}

      {/* ---- Framed panels sitting on the fixture (centre floor + sides) ---- */}
      <group ref={placed} visible={false}>
        <mesh geometry={floorGeom} position={[0, 0.6, 0]} rotation-x={-Math.PI / 2} castShadow>
          <meshStandardMaterial color={PANEL} metalness={0.55} roughness={0.4} emissive="#ff7a3c" emissiveIntensity={0.1} />
        </mesh>
        <mesh geometry={sideGeom} position={[0, 1.15, 0.72]} rotation-y={Math.PI / 2} scale={0.6} castShadow>
          <meshStandardMaterial color={PANEL} metalness={0.55} roughness={0.4} emissive="#ff7a3c" emissiveIntensity={0.1} side={2} />
        </mesh>
        <mesh geometry={sideGeom} position={[0, 1.15, -0.72]} rotation-y={Math.PI / 2} scale={0.6} castShadow>
          <meshStandardMaterial color={PANEL} metalness={0.55} roughness={0.4} emissive="#ff7a3c" emissiveIntensity={0.1} side={2} />
        </mesh>
      </group>

      {/* ---- Finished body-in-white that indexes east on the rail ---- */}
      <group ref={shell} visible={false}>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[3.4, 0.12, 1.7]} />
          <meshStandardMaterial color={JOINT} />
        </mesh>
        <mesh geometry={biw} position={[0, 0.5, 0]} scale={0.82} castShadow>
          <meshStandardMaterial color="#aeb4bc" metalness={0.85} roughness={0.42} />
        </mesh>
      </group>

      {/* ---- Three loader robot arms ---- */}
      {ARMS.map((arm, i) => (
        <group key={arm.key} position={arm.ped} rotation-y={arm.baseYaw}>
          {/* Pedestal */}
          <mesh position={[0, 0.1, 0]} receiveShadow>
            <cylinderGeometry args={[0.5, 0.56, 0.2, 18]} />
            <meshStandardMaterial color="#a8a294" />
          </mesh>
          <mesh position={[0, 0.6, 0]} castShadow>
            <cylinderGeometry args={[0.38, 0.44, 0.85, 18]} />
            <meshStandardMaterial color="#d8d2c4" />
          </mesh>
          {/* Turret (yaw swing) */}
          <group
            ref={(el) => {
              turret.current[i] = el
            }}
            position={[0, 1.02, 0]}
          >
            <mesh position={[0, 0.2, 0]} castShadow>
              <cylinderGeometry args={[0.34, 0.4, 0.42, 16]} />
              <meshStandardMaterial color={ORANGE} />
            </mesh>
            {/* Boom (pitch) with the +x arm reaching toward the fixture */}
            <group
              ref={(el) => {
                boom.current[i] = el
              }}
              position={[0, 0.45, 0]}
            >
              <mesh rotation-z={Math.PI / 2} castShadow>
                <cylinderGeometry args={[0.22, 0.22, 0.5, 12]} />
                <meshStandardMaterial color={JOINT} />
              </mesh>
              <mesh position={[1.1, 0, 0]} castShadow>
                <boxGeometry args={[2.2, 0.3, 0.3]} />
                <meshStandardMaterial color={ORANGE} />
              </mesh>
              <mesh position={[3.1, 0, 0]} castShadow>
                <boxGeometry args={[2.0, 0.24, 0.24]} />
                <meshStandardMaterial color={ORANGE} />
              </mesh>
              <mesh position={[4.15, 0, 0]}>
                <cylinderGeometry args={[0.12, 0.12, 0.3, 12]} />
                <meshStandardMaterial color={JOINT} />
              </mesh>
              {/* Gripper + carried panel */}
              <group
                ref={(el) => {
                  grip.current[i] = el
                }}
                position={[4.35, 0, 0]}
              >
                {[-0.4, 0.4].map((z) => (
                  <mesh key={z} position={[0.1, 0, z]}>
                    <boxGeometry args={[0.5, 0.1, 0.1]} />
                    <meshStandardMaterial color="#20242d" metalness={0.5} roughness={0.4} />
                  </mesh>
                ))}
                <mesh
                  geometry={arm.kind === 'floor' ? floorGeom : sideGeom}
                  position={[0.35, -0.1, 0]}
                  rotation={arm.gripRot}
                  scale={arm.gripScale}
                  castShadow
                >
                  <meshStandardMaterial color={PANEL} metalness={0.55} roughness={0.4} side={2} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      ))}
    </MachineShell>
  )
}
