import { useMemo } from 'react'
import { Grid, MeshReflectorMaterial, Text } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { DoubleSide } from 'three'
import { categoryOf, useFactoryStore } from '../store'
import type { TwinDto } from '../types'
import { FactoryShell } from './FactoryShell'
import { MillShell } from './MillShell'
import { SpineRail } from './SpineRail'
import { ShippingYard } from './ShippingYard'
import {
  CAMPUS,
  CAMPUS_BY_ID,
  campusExtent,
  type BuildingDef,
  type ShopType,
} from './campusLayout'
import { concreteTexture } from './textures'

const CREAM = '#e8e2d4'

/** Resolve the buildings to render: backend building nodes drive it (meta is the
 *  source of truth), falling back to the frontend campus defaults by node id. */
function resolveBuildings(twin: TwinDto): BuildingDef[] {
  const nodes = twin.nodes.filter((n) => n.level === 'building')
  const out: BuildingDef[] = []
  for (const node of nodes) {
    const base = CAMPUS_BY_ID[node.id]
    const meta = (node.meta ?? null) as Partial<BuildingDef> | null
    if (meta && typeof meta.halfX === 'number') {
      out.push({ ...(base ?? ({} as BuildingDef)), ...meta, id: node.id, name: node.name })
    } else if (base) {
      out.push(base)
    }
  }
  return out.length > 0 ? out : CAMPUS
}

/** Suspended high-bay fixtures. Real point lights only in the hero (body) hall to
 *  keep the campus within a sane light budget; other shops use emissive panels
 *  lit by the shared ambient/hemisphere/environment. */
function CeilingLights({ def, withLights }: { def: BuildingDef; withLights: boolean }) {
  const nx = Math.max(2, Math.round(def.halfX / 12))
  const nz = Math.max(1, Math.round(def.halfD / 14))
  const xs = Array.from({ length: nx }, (_, i) =>
    nx === 1 ? 0 : -def.halfX * 0.66 + (i * (def.halfX * 1.32)) / (nx - 1),
  )
  const zs = Array.from({ length: nz }, (_, i) =>
    nz === 1 ? 0 : -def.halfD * 0.5 + (i * (def.halfD)) / (nz - 1),
  )
  const y = def.eavesY * 0.92
  return (
    <group>
      {xs.map((x) =>
        zs.map((z) => (
          <group key={`${x}:${z}`} position={[x, y, z]}>
            <mesh castShadow>
              <boxGeometry args={[1.5, 0.28, 0.7]} />
              <meshStandardMaterial color="#2b3240" metalness={0.4} roughness={0.6} />
            </mesh>
            <mesh position={[0, -0.17, 0]}>
              <boxGeometry args={[1.28, 0.05, 0.5]} />
              <meshStandardMaterial color="#fff7e6" emissive="#fff1cc" emissiveIntensity={1.6} />
            </mesh>
            {withLights && (
              <pointLight position={[0, -0.6, 0]} intensity={22} distance={26} decay={2} color="#fff2d6" />
            )}
          </group>
        )),
      )}
    </group>
  )
}

/** Painted aisle lanes on the shop floor, sized to the building. */
function FloorMarkings({ def }: { def: BuildingDef }) {
  const laneZ = def.halfD * 0.55
  return (
    <group>
      {[-laneZ, laneZ].map((z) => (
        <mesh key={z} rotation-x={-Math.PI / 2} position={[0, 0.015, z]}>
          <planeGeometry args={[def.halfX * 1.7, 0.45]} />
          <meshBasicMaterial color="#e6b800" />
        </mesh>
      ))}
      {[-def.halfX * 0.85, def.halfX * 0.85].map((x) => (
        <mesh key={x} rotation-x={-Math.PI / 2} position={[x, 0.015, 0]}>
          <planeGeometry args={[0.45, def.halfD * 1.4]} />
          <meshBasicMaterial color="#e6b800" />
        </mesh>
      ))}
    </group>
  )
}

function SafetyFence({ z, halfX }: { z: number; halfX: number }) {
  const n = Math.max(6, Math.round((halfX * 1.3) / 4.4))
  const span = halfX * 1.28
  const posts = Array.from({ length: n }, (_, i) => -span / 2 + (i * span) / (n - 1))
  return (
    <group position={[0, 0, z]}>
      {posts.map((x) => (
        <mesh key={x} position={[x, 0.55, 0]} castShadow>
          <boxGeometry args={[0.09, 1.1, 0.09]} />
          <meshStandardMaterial color="#ca9a04" />
        </mesh>
      ))}
      {[0.45, 0.95].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[span, 0.07, 0.07]} />
          <meshStandardMaterial color="#eab308" />
        </mesh>
      ))}
    </group>
  )
}

function ControlCabinet({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[0.95, 1.5, 0.55]} />
        <meshStandardMaterial color="#cdd2d8" />
      </mesh>
      <mesh position={[0, 1.05, 0.29]}>
        <planeGeometry args={[0.55, 0.4]} />
        <meshStandardMaterial color="#0e3a4a" emissive="#155e75" emissiveIntensity={0.7} />
      </mesh>
    </group>
  )
}

/**
 * Overhead station board: the numbered andon sign hung above each station with
 * its three-lamp status head, so an operator can read the line from anywhere.
 */
function StationBoard({
  position,
  label,
  lit = 'ok',
}: {
  position: [number, number, number]
  label: string
  lit?: 'ok' | 'call'
}) {
  return (
    <group position={position}>
      {/* Drop rods to the roof steel */}
      {[-1.3, 1.3].map((x) => (
        <mesh key={x} position={[x, 1.2, 0]}>
          <boxGeometry args={[0.07, 2.4, 0.07]} />
          <meshStandardMaterial color="#4a5260" metalness={0.35} roughness={0.6} />
        </mesh>
      ))}
      {/* Board face, both sides readable */}
      <mesh castShadow>
        <boxGeometry args={[3.2, 1.1, 0.12]} />
        <meshStandardMaterial color="#12324a" metalness={0.2} roughness={0.6} />
      </mesh>
      {[0.07, -0.07].map((dz) => (
        <Text
          key={dz}
          position={[0, 0.05, dz]}
          rotation-y={dz > 0 ? 0 : Math.PI}
          fontSize={0.5}
          color="#e8f4ff"
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
      ))}
      {/* Andon lamp head on top */}
      <group position={[1.3, 0.78, 0]}>
        {[
          { c: '#22c55e', y: 0, on: lit === 'ok' },
          { c: '#facc15', y: 0.22, on: lit === 'call' },
          { c: '#ef4444', y: 0.44, on: false },
        ].map((l) => (
          <mesh key={l.y} position={[0, l.y, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.18, 12]} />
            <meshStandardMaterial
              color={l.c}
              emissive={l.c}
              emissiveIntensity={l.on ? 2.2 : 0.05}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/**
 * Bank of weld transformers / timer cabinets against the shop wall, with the
 * overhead cable tray that feeds the guns. Every weld cell needs one.
 */
function TransformerBank({
  x,
  z,
  count = 5,
  rotation = 0,
}: {
  x: number
  z: number
  count?: number
  rotation?: number
}) {
  const span = (count - 1) * 2.3
  return (
    <group position={[x, 0, z]} rotation-y={rotation}>
      {Array.from({ length: count }, (_, i) => {
        const px = -span / 2 + i * 2.3
        return (
          <group key={i} position={[px, 0, 0]}>
            {/* Transformer body */}
            <mesh position={[0, 0.95, 0]} castShadow>
              <boxGeometry args={[1.9, 1.9, 1.05]} />
              <meshStandardMaterial color="#8e99a6" metalness={0.35} roughness={0.55} />
            </mesh>
            {/* Cooling fins */}
            {[-0.6, -0.2, 0.2, 0.6].map((fx) => (
              <mesh key={fx} position={[fx, 1.0, 0.56]}>
                <boxGeometry args={[0.12, 1.5, 0.1]} />
                <meshStandardMaterial color="#6f7a87" metalness={0.4} roughness={0.5} />
              </mesh>
            ))}
            {/* Timer cabinet on top with its indicator */}
            <mesh position={[0, 2.1, 0]} castShadow>
              <boxGeometry args={[1.6, 0.5, 0.85]} />
              <meshStandardMaterial color="#cdd2d8" metalness={0.2} roughness={0.6} />
            </mesh>
            <mesh position={[0, 2.1, 0.44]}>
              <planeGeometry args={[0.5, 0.22]} />
              <meshStandardMaterial color="#0e3a4a" emissive="#22d3ee" emissiveIntensity={0.8} />
            </mesh>
            {/* Water hoses / cable bundle up to the tray */}
            <mesh position={[0.55, 2.9, 0]}>
              <cylinderGeometry args={[0.09, 0.09, 1.1, 8]} />
              <meshStandardMaterial color="#1f2937" roughness={0.85} />
            </mesh>
          </group>
        )
      })}
      {/* Cable tray running the length of the bank */}
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[span + 2.4, 0.16, 0.65]} />
        <meshStandardMaterial color="#6b7484" metalness={0.4} roughness={0.5} />
      </mesh>
      {[-span / 2 - 0.8, span / 2 + 0.8].map((px) => (
        <mesh key={px} position={[px, 1.75, 0]}>
          <boxGeometry args={[0.12, 3.5, 0.12]} />
          <meshStandardMaterial color="#6b7484" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Teal weld-flash curtains on a track: the translucent screens that wall off
 * every weld cell so the arc flash does not reach the aisle.
 */
function WeldCurtain({
  z,
  halfX,
  panels = 14,
}: {
  z: number
  halfX: number
  panels?: number
}) {
  const span = halfX * 2
  const pw = span / panels
  return (
    <group position={[0, 0, z]}>
      {/* Curtain track and its drop rods */}
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[span + 0.6, 0.14, 0.16]} />
        <meshStandardMaterial color="#6b7484" metalness={0.45} roughness={0.45} />
      </mesh>
      {Array.from({ length: Math.round(panels / 3) + 1 }, (_, i) => (
        <mesh
          key={i}
          position={[-halfX + (i * span) / Math.round(panels / 3), 1.75, 0]}
        >
          <boxGeometry args={[0.1, 3.5, 0.1]} />
          <meshStandardMaterial color="#6b7484" metalness={0.4} roughness={0.55} />
        </mesh>
      ))}
      {Array.from({ length: panels }, (_, i) => {
        // Every fifth bay is drawn back so you can see into the cell.
        const open = i % 5 === 2
        return (
          <mesh
            key={i}
            position={[-halfX + pw / 2 + i * pw, 1.85, 0]}
            scale-x={open ? 0.25 : 1}
          >
            <planeGeometry args={[pw * 0.94, 3.1]} />
            <meshStandardMaterial
              color="#0f7f7a"
              emissive="#0b5f5c"
              emissiveIntensity={0.25}
              transparent
              opacity={0.55}
              roughness={0.7}
              side={DoubleSide}
            />
          </mesh>
        )
      })}
    </group>
  )
}

/**
 * Line-side pallet racking loaded with parts bins — the "bin field" that lines
 * the trim and assembly aisles.
 */
function BinRack({
  position,
  rotation = 0,
  bays = 3,
}: {
  position: [number, number, number]
  rotation?: number
  bays?: number
}) {
  const BAY = 2.6
  const span = bays * BAY
  const BIN_COLORS = ['#2f6fb8', '#3b7fc4', '#4a5260', '#2f6fb8']
  return (
    <group position={position} rotation-y={rotation}>
      {/* Uprights */}
      {Array.from({ length: bays + 1 }, (_, i) => -span / 2 + i * BAY).map((x) =>
        [-0.5, 0.5].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 1.35, z]} castShadow>
            <boxGeometry args={[0.12, 2.7, 0.12]} />
            <meshStandardMaterial color="#1f4e8c" metalness={0.3} roughness={0.6} />
          </mesh>
        )),
      )}
      {/* Beams */}
      {[0.75, 1.55, 2.35].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[span, 0.1, 1.15]} />
          <meshStandardMaterial color="#e07b1a" metalness={0.25} roughness={0.6} />
        </mesh>
      ))}
      {/* Bins on the lower two levels, angled toward the picker */}
      {[0.95, 1.75].map((y, li) =>
        Array.from({ length: bays * 2 }, (_, i) => {
          const x = -span / 2 + 0.65 + i * (span / (bays * 2))
          return (
            <mesh key={`${y}:${i}`} position={[x, y, 0]} rotation-x={-0.12} castShadow>
              <boxGeometry args={[1.05, 0.4, 0.85]} />
              <meshStandardMaterial
                color={BIN_COLORS[(i + li) % BIN_COLORS.length]}
                roughness={0.75}
              />
            </mesh>
          )
        }),
      )}
      {/* Cartons on the top beam */}
      {Array.from({ length: bays }, (_, i) => (
        <mesh
          key={`box-${i}`}
          position={[-span / 2 + BAY / 2 + i * BAY, 2.68, 0]}
          castShadow
        >
          <boxGeometry args={[1.9, 0.55, 1.0]} />
          <meshStandardMaterial color="#b98a54" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/** Cream portal frame straddling the body line at each weld station. */
function GantryPortal({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      {[-5.2, 5.2].map((z) => (
        <mesh key={z} position={[0, 2.25, z]} castShadow>
          <boxGeometry args={[0.42, 4.5, 0.42]} />
          <meshStandardMaterial color={CREAM} />
        </mesh>
      ))}
      <mesh position={[0, 4.55, 0]} castShadow>
        <boxGeometry args={[0.46, 0.5, 10.9]} />
        <meshStandardMaterial color={CREAM} />
      </mesh>
      <mesh position={[0, 3.7, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.3, 6]} />
        <meshStandardMaterial color="#4a5260" />
      </mesh>
    </group>
  )
}

/** Weld-cell specific dressing (gantries, cabinets, guarding) for the body hall. */
function WeldDressing({ stationXs }: { stationXs: number[] }) {
  return (
    <group>
      <SafetyFence z={6.2} halfX={49} />
      <SafetyFence z={-6.2} halfX={49} />
      {stationXs.map((x) => (
        <GantryPortal key={x} x={x} />
      ))}
      {stationXs.map((x) => (
        <ControlCabinet key={`c-${x}`} position={[x + 2.6, 0, -8.4]} />
      ))}
      {/* Weld-flash curtains screening both sides of the line */}
      <WeldCurtain z={9.4} halfX={40} />
      <WeldCurtain z={-9.4} halfX={40} />
      {/* Weld transformer banks against the south wall, feeding the guns */}
      <TransformerBank x={-26} z={-22} count={5} />
      <TransformerBank x={0} z={-22} count={5} />
      <TransformerBank x={26} z={-22} count={5} />
      {/* Station boards over the weld line */}
      {stationXs
        .filter((_, i) => i % 2 === 0)
        .map((x, i) => (
          <StationBoard
            key={`b-${x}`}
            position={[x, 6.6, 0]}
            label={`WELD ${(i + 1) * 10}`}
            lit={i === 2 ? 'call' : 'ok'}
          />
        ))}
      {/* Bin field along the north aisle serving the trim line */}
      {[-30, -18, 18, 30].map((x) => (
        <BinRack key={x} position={[x, 0, 22.5]} />
      ))}
    </group>
  )
}

/** Painted floor pad (buffer marking) at a warehouse-local position. */
function FloorPad({
  x,
  z,
  w,
  d,
  color,
}: {
  x: number
  z: number
  w: number
  d: number
  color: string
}) {
  return (
    <group position={[x, 0, z]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.016, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      {/* border strips */}
      {[
        [0, d / 2, w, 0.18],
        [0, -d / 2, w, 0.18],
        [w / 2, 0, 0.18, d],
        [-w / 2, 0, 0.18, d],
      ].map(([px, pz, pw, pd], i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[px, 0.02, pz]}>
          <planeGeometry args={[pw, pd]} />
          <meshBasicMaterial color="#f4c542" />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Warehouse-specific floor dressing: the receiving / staging / dispatch buffer
 * pads and a hazard-striped dock apron under the north door — matches the
 * logistics flow the forklifts run (warehouse local coords; centre = 0,105).
 */
function WarehouseDressing({ def }: { def: BuildingDef }) {
  // buffer world points -> warehouse-local (subtract building centre)
  const cz = def.z
  return (
    <group>
      {/* Dock apron hazard stripes just inside the north door */}
      <group position={[0, 0, def.halfD - 4]}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh
            key={i}
            rotation-x={-Math.PI / 2}
            position={[-6 + i * 2, 0.016, 0]}
          >
            <planeGeometry args={[0.9, 6]} />
            <meshBasicMaterial color={i % 2 === 0 ? '#f4c542' : '#2b3038'} />
          </mesh>
        ))}
      </group>
      {/* Receiving pile pad (world z=117) */}
      <FloorPad x={0} z={117 - cz} w={6} d={5} color="#f59e0b" />
      {/* Shelf staging pad (world z=110) */}
      <FloorPad x={0} z={110 - cz} w={7} d={4} color="#38bdf8" />
      {/* Dispatch drop pad (world z=82) */}
      <FloorPad x={0} z={82 - cz} w={6} d={4} color="#34d399" />
    </group>
  )
}

/** A pyramid stack of steel coils in the raw-material area. */
function CoilStack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[
        [-0.85, 0.8, 0],
        [0.85, 0.8, 0],
        [0, 1.55, 0],
      ].map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]} rotation-z={Math.PI / 2}>
          <mesh castShadow>
            <cylinderGeometry args={[0.8, 0.8, 1.5, 24]} />
            <meshStandardMaterial color="#7c8797" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.28, 0.28, 1.52, 16]} />
            <meshStandardMaterial color="#20242d" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Wheeled die-storage cart holding a spare press die along the wall. */
function DieCart({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[2.2, 0.5, 1.6]} />
        <meshStandardMaterial color="#4a5260" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[1.7, 0.8, 1.3]} />
        <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.5} />
      </mesh>
      {[-0.9, 0.9].map((x) =>
        [-0.6, 0.6].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.2, z]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.2, 0.2, 0.16, 12]} />
            <meshStandardMaterial color="#17191e" />
          </mesh>
        )),
      )}
    </group>
  )
}

/**
 * A press die set in storage: lower shoe, upper shoe with guide posts and
 * lifting eyes, sitting on timber blocking. These live in rows in the die
 * storage bay waiting for the next model changeover.
 */
function DieSet({
  position,
  rotation = 0,
}: {
  position: [number, number, number]
  rotation?: number
}) {
  return (
    <group position={position} rotation-y={rotation}>
      {/* Timber blocking under the die */}
      {[-1.0, 1.0].map((z) => (
        <mesh key={z} position={[0, 0.09, z]}>
          <boxGeometry args={[2.9, 0.18, 0.3]} />
          <meshStandardMaterial color="#6b5433" roughness={0.95} />
        </mesh>
      ))}
      {/* Lower shoe */}
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.7, 0.68, 2.3]} />
        <meshStandardMaterial color="#5c6470" metalness={0.55} roughness={0.45} />
      </mesh>
      {/* Upper shoe, slightly proud of the lower */}
      <mesh position={[0, 1.12, 0]} castShadow>
        <boxGeometry args={[2.5, 0.52, 2.1]} />
        <meshStandardMaterial color="#4a5260" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Guide posts at the corners */}
      {[-1.1, 1.1].map((x) =>
        [-0.9, 0.9].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 1.1, z]}>
            <cylinderGeometry args={[0.09, 0.09, 1.0, 10]} />
            <meshStandardMaterial color="#c3c9d1" metalness={0.75} roughness={0.25} />
          </mesh>
        )),
      )}
      {/* Lifting eyes */}
      {[-0.8, 0.8].map((x) => (
        <mesh key={`eye-${x}`} position={[x, 1.45, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.13, 0.04, 8, 14]} />
          <meshStandardMaterial color="#e6b800" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {/* Model tag plate on the side */}
      <mesh position={[0, 0.62, 1.17]}>
        <planeGeometry args={[0.8, 0.3]} />
        <meshBasicMaterial color="#f4c542" />
      </mesh>
    </group>
  )
}

/** Rows of stored die sets in the die bay. */
function DieField({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[0, 1].map((row) =>
        [0, 1, 2].map((col) => (
          <DieSet key={`${row}:${col}`} position={[col * 4.2, 0, row * 3.6]} />
        )),
      )}
      {/* Aisle marking round the bay */}
      <FloorPad x={4.2} z={1.8} w={14.5} d={8} color="#94a3b8" />
    </group>
  )
}

/** Steel coils laid out on timber saddles in the coil yard. */
function CoilField({ x, z }: { x: number; z: number }) {
  const rows = [0, 5.2, 10.4]
  const cols = [0, 3.6, 7.2, 10.8, 14.4]
  return (
    <group position={[x, 0, z]}>
      {rows.map((rz) => (
        <group key={rz} position={[0, 0, rz]}>
          {/* Saddle timbers running the length of the row */}
          {[-0.85, 0.85].map((dz) => (
            <mesh key={dz} position={[7.2, 0.11, dz]}>
              <boxGeometry args={[17, 0.22, 0.42]} />
              <meshStandardMaterial color="#6b5433" roughness={0.95} />
            </mesh>
          ))}
          {cols.map((cx) => (
            <group key={cx} position={[cx, 0.95, 0]} rotation-z={Math.PI / 2}>
              <mesh castShadow receiveShadow>
                <cylinderGeometry args={[0.82, 0.82, 1.5, 22]} />
                <meshStandardMaterial color="#7c8797" metalness={0.55} roughness={0.45} />
              </mesh>
              {/* Bore */}
              <mesh>
                <cylinderGeometry args={[0.3, 0.3, 1.54, 14]} />
                <meshStandardMaterial color="#1d2027" />
              </mesh>
              {/* Banding strap */}
              <mesh position={[0, 0, 0]}>
                <torusGeometry args={[0.83, 0.03, 6, 20]} />
                <meshStandardMaterial color="#2b3038" metalness={0.5} roughness={0.5} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

/**
 * Stamping-shop floor dressing: safety fencing around the press line, control
 * cabinets at each press, coil stacks in the raw area, die-storage carts along
 * the south wall, and painted zone pads (raw-in / finished / scrap). Coords are
 * local to the building centre (stamping = -150,0 world).
 */
function StampDressing() {
  const pressX = [-18, 0, 18] // local x of the three presses
  return (
    <group>
      {/* Guarding around the press-line aisle (line runs at z = -7) */}
      <SafetyFence z={-2} halfX={30} />
      <SafetyFence z={-12} halfX={30} />
      {/* Control cabinets on the operator side of each press */}
      {pressX.map((x) => (
        <ControlCabinet key={x} position={[x + 2.5, 0, 0.8]} />
      ))}
      {/* Coil stacks in the NW raw-material area */}
      <CoilStack position={[-32, 0, 14]} />
      <CoilStack position={[-27.5, 0, 17.5]} />
      {/* Coil yard under the gantry crane, decoiler end of the line */}
      <CoilField x={-40} z={9} />
      {/* Die-storage carts along the south wall */}
      {[-12, -2, 8].map((x) => (
        <DieCart key={x} position={[x, 0, -21]} />
      ))}
      {/* Die storage bay on the north side, served by the bridge crane */}
      <DieField x={-4} z={18} />
      {/* Station boards over the press line */}
      {[
        { x: -18, n: 'OP 10' },
        { x: 0, n: 'OP 20' },
        { x: 18, n: 'OP 30' },
      ].map((s) => (
        <StationBoard key={s.x} position={[s.x, 6.2, -7]} label={s.n} />
      ))}
      {/* Painted zone pads */}
      <FloorPad x={35} z={-7} w={9} d={13} color="#34d399" />
      <FloorPad x={-26} z={-14} w={7} d={4} color="#f87171" />
    </group>
  )
}

/** A line-side stillage of body panels/doors on a wheeled rack. */
function PartsRack({
  position,
  color,
}: {
  position: [number, number, number]
  color: string
}) {
  return (
    <group position={position}>
      {/* frame */}
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.7, 0]} castShadow>
          <boxGeometry args={[0.08, 1.4, 0.9]} />
          <meshStandardMaterial color="#4a5260" metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {/* stacked parts leaning in the rack */}
      {[0.3, 0.6, 0.9].map((y, i) => (
        <mesh key={y} position={[0, y, (i - 1) * 0.16]} rotation-z={Math.PI / 2} castShadow>
          <boxGeometry args={[0.9, 1.2, 0.06]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.45} />
        </mesh>
      ))}
      {/* casters */}
      {[-0.6, 0.6].map((x) =>
        [-0.35, 0.35].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.08, z]}>
            <cylinderGeometry args={[0.08, 0.08, 0.1, 8]} />
            <meshStandardMaterial color="#17191e" />
          </mesh>
        )),
      )}
    </group>
  )
}

/** A short stack of tyres on the assembly floor. */
function WheelStack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[0.18, 0.42, 0.66].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.22, 20]} />
          <meshStandardMaterial color="#17181c" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/** A simple standing operator figure (line-side worker). */
function Operator({
  position,
  color = '#f97316',
}: {
  position: [number, number, number]
  color?: string
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.7, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color="#e9c39b" roughness={0.6} />
      </mesh>
      {/* hard hat */}
      <mesh position={[0, 1.27, 0]}>
        <sphereGeometry args={[0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
    </group>
  )
}

/**
 * Final-assembly floor dressing: line-side parts racks (doors, wheels, bumpers)
 * and operators alongside the trim/final line. Coords are local to the GA
 * building centre (assembly = 420,0 world); the line runs at local z=6.
 */
function AssemblyDressing() {
  return (
    <group>
      {/* Guarding along the far side of the line */}
      <SafetyFence z={-6} halfX={34} />
      {/* Part stock sits north of the door monorail, clear of the fitment cells */}
      <PartsRack position={[-24, 0, 19]} color="#1e2f52" />
      <PartsRack position={[-10, 0, 19]} color="#7f1d1d" />
      <PartsRack position={[4, 0, 19]} color="#4b5563" />
      {/* Wheel/tyre stacks feeding the wheel station */}
      <WheelStack position={[13, 0, 19.6]} />
      <WheelStack position={[14, 0, 19.6]} />
      <WheelStack position={[13.5, 0, 18.6]} />
      {/* Bumper rack + control cabinets */}
      <PartsRack position={[24, 0, 19]} color="#12151b" />
      <ControlCabinet position={[-14, 0, -9]} />
      <ControlCabinet position={[6, 0, -9]} />
      {/* Bin field down the south aisle — the trim parts every station picks from */}
      {[-30, -19, -8, 3, 14, 25].map((x) => (
        <BinRack key={x} position={[x, 0, -13]} />
      ))}
      {/* Station boards over each fitment station (line runs at z=6) */}
      {[
        { x: -28, n: 'TRIM 1' },
        { x: -14, n: 'TRIM 2' },
        { x: 0, n: 'CHASSIS' },
        { x: 14, n: 'FINAL 1' },
        { x: 21, n: 'FINAL 2' },
      ].map((s) => (
        <StationBoard key={s.x} position={[s.x, 6.8, 6]} label={s.n} />
      ))}
      {/* Line-side operators on the walkway south of the carrier line */}
      <Operator position={[-20, 0, -2]} color="#f97316" />
      <Operator position={[-2, 0, -2.5]} color="#2563eb" />
      <Operator position={[18, 0, -2]} color="#16a34a" />
      {/* Finished-car staging pad at the east end */}
      <FloorPad x={32} z={-12} w={7} d={5} color="#34d399" />
    </group>
  )
}

/**
 * PVC strip curtain hung in a shop doorway — keeps the weather and overspray out
 * while cars and trucks drive straight through it.
 */
function DoorStripCurtain({
  x,
  width,
  height = 4.2,
}: {
  x: number
  width: number
  height?: number
}) {
  const strips = Math.round(width / 0.42)
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, height + 0.12, 0]}>
        <boxGeometry args={[0.2, 0.2, width + 0.4]} />
        <meshStandardMaterial color="#6b7484" metalness={0.4} roughness={0.5} />
      </mesh>
      {Array.from({ length: strips }, (_, i) => (
        <mesh
          key={i}
          position={[0, height / 2, -width / 2 + 0.21 + i * (width / strips)]}
          rotation-y={Math.PI / 2}
        >
          <planeGeometry args={[width / strips - 0.03, height]} />
          <meshStandardMaterial
            color="#e3eef2"
            transparent
            opacity={0.4}
            roughness={0.65}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Final-check hall dressing: the hall is a drive-through, so it gets a painted
 * drive lane down the spine instead of the usual line-side clutter, plus the
 * test-gear cabinets, a rework bay and a marshalling pad by the east exit.
 * Coords are local to the check hall centre (555,0 world).
 */
function CheckDressing() {
  return (
    <group>
      {/* Drive lane the cars follow through the hall */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.014, 0]}>
        <planeGeometry args={[84, 5.2]} />
        <meshStandardMaterial color="#3f4753" metalness={0.35} roughness={0.5} />
      </mesh>
      {Array.from({ length: 18 }, (_, i) => (
        <mesh
          key={i}
          rotation-x={-Math.PI / 2}
          position={[-40 + i * 4.7, 0.02, 2.9]}
        >
          <planeGeometry args={[2.4, 0.16]} />
          <meshBasicMaterial color="#e8edf2" />
        </mesh>
      ))}
      {/* Guarding down the north side, away from the drive lane */}
      <SafetyFence z={9} halfX={34} />
      {/* Test-gear and rework cabinets along the south wall */}
      {[-28, -10, 8, 26].map((x) => (
        <ControlCabinet key={x} position={[x, 0, -14]} />
      ))}
      {/* Rework bay pad on the north side */}
      <FloorPad x={-16} z={15} w={9} d={6} color="#f87171" />
      {/* Pass / dispatch pad, clear of the shower booth at the east end */}
      <FloorPad x={30} z={-13} w={7} d={5} color="#34d399" />
      {/* Strip curtain across the east door the cars drive out through */}
      <DoorStripCurtain x={43.4} width={7.5} />
      {/* Inspectors waiting between cars */}
      <Operator position={[-30, 0, 6]} color="#1d4ed8" />
      <Operator position={[14, 0, 6.5]} color="#0f766e" />
    </group>
  )
}

const FLOOR_TINT: Record<ShopType, string> = {
  stamping: '#c7ccd2',
  body: '#d5dadf',
  paint: '#dcdfe4',
  powertrain: '#cbd0d6',
  warehouse: '#c2c7cd',
  assembly: '#d8dce1',
  finalcheck: '#cfd4da',
}

function BuildingGroup({
  def,
  stationXs,
}: {
  def: BuildingDef
  stationXs: number[]
}) {
  const showStructure = useFactoryStore((s) => s.layers.structure)
  const showDressing = useFactoryStore((s) => s.layers.dressing)
  const concrete = useMemo(() => concreteTexture(), [])
  const isBody = def.shopType === 'body'

  const handleFloorClick = (e: ThreeEvent<MouseEvent>) => {
    const { pinMode, setPendingPin } = useFactoryStore.getState()
    if (!pinMode) return
    e.stopPropagation()
    setPendingPin({ x: e.point.x, y: 0, z: e.point.z, instanceId: null })
  }

  const w = def.halfX * 2
  const d = def.halfD * 2

  return (
    <group position={[def.x, 0, def.z]} rotation-y={def.rotationY}>
      {/* Shop floor. The hero (body) hall gets true reflections; the rest use a
          cheap glossy standard material so the campus stays performant. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={handleFloorClick}>
        <planeGeometry args={[w, d]} />
        {isBody ? (
          <MeshReflectorMaterial
            resolution={512}
            mixBlur={0.8}
            mixStrength={1.7}
            blur={[280, 110]}
            roughness={0.55}
            depthScale={1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.2}
            color={FLOOR_TINT[def.shopType]}
            metalness={0.4}
            map={concrete}
            roughnessMap={concrete}
          />
        ) : (
          <meshStandardMaterial
            color={FLOOR_TINT[def.shopType]}
            metalness={0.18}
            roughness={0.62}
            map={concrete}
          />
        )}
      </mesh>
      {isBody && (
        <Grid
          position={[0, 0.012, 0]}
          args={[w, d]}
          cellSize={2}
          cellThickness={0.4}
          cellColor="#b7bdc7"
          sectionSize={10}
          sectionThickness={0.9}
          sectionColor="#a3abb8"
          fadeDistance={190}
        />
      )}
      {showStructure &&
        (def.shopType === 'stamping' ? (
          // The press shop is a precast concrete mill building, not a clear-span
          // steel hall — different structure, so a different shell.
          <MillShell
            halfX={def.halfX}
            halfD={def.halfD}
            eavesY={def.eavesY}
            doors={def.doors}
          />
        ) : (
          <FactoryShell
            halfX={def.halfX}
            halfD={def.halfD}
            eavesY={def.eavesY}
            ridgeY={def.ridgeY}
            doors={def.doors}
          />
        ))}
      {showDressing && (
        <group>
          <FloorMarkings def={def} />
          <CeilingLights def={def} withLights={isBody} />
          {isBody && <WeldDressing stationXs={stationXs} />}
          {def.shopType === 'stamping' && <StampDressing />}
          {def.shopType === 'assembly' && <AssemblyDressing />}
          {def.shopType === 'finalcheck' && <CheckDressing />}
          {def.shopType === 'warehouse' && <WarehouseDressing def={def} />}
        </group>
      )}
    </group>
  )
}

/** The asphalt yard + link roads connecting the shop doors. */
function CampusGround() {
  const ext = useMemo(() => campusExtent(45), [])
  const roads = useMemo(() => {
    const byType: Partial<Record<ShopType, BuildingDef>> = {}
    for (const b of CAMPUS) byType[b.shopType] = b
    const segs: { x: number; z: number; w: number; d: number }[] = []
    const spine: ShopType[] = [
      'stamping',
      'body',
      'paint',
      'powertrain',
      'assembly',
      'finalcheck',
    ]
    for (let i = 0; i < spine.length - 1; i++) {
      const a = byType[spine[i]]
      const b = byType[spine[i + 1]]
      if (!a || !b) continue
      const x0 = a.x + a.halfX
      const x1 = b.x - b.halfX
      segs.push({ x: (x0 + x1) / 2, z: 0, w: x1 - x0 + 2, d: 11 })
    }
    // Storage feeds the stamping shop only: an L-shaped link road from the
    // warehouse west edge, west along the warehouse line, then south to stamping.
    const wh = byType.warehouse
    const stamp = byType.stamping
    if (wh && stamp) {
      const x0 = stamp.x
      const x1 = wh.x - wh.halfX
      // E-W leg along the warehouse line
      segs.push({ x: (x0 + x1) / 2, z: wh.z, w: x1 - x0 + 2, d: 11 })
      // N-S leg down to the stamping north wall
      const z0 = stamp.z + stamp.halfD
      const z1 = wh.z
      segs.push({ x: stamp.x, z: (z0 + z1) / 2, w: 11, d: z1 - z0 + 2 })
    }
    return segs
  }, [])

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[ext.cx, -0.06, ext.cz]} receiveShadow>
        <planeGeometry args={[ext.w, ext.d]} />
        <meshStandardMaterial color="#3f444b" roughness={0.98} />
      </mesh>
      {roads.map((r, i) => (
        <group key={i}>
          <mesh rotation-x={-Math.PI / 2} position={[r.x, -0.03, r.z]}>
            <planeGeometry args={[r.w, r.d]} />
            <meshStandardMaterial color="#53585f" roughness={0.95} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[r.x, -0.02, r.z]}>
            <planeGeometry args={[r.w > r.d ? r.w : 0.35, r.w > r.d ? 0.35 : r.d]} />
            <meshBasicMaterial color="#d9c24a" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Renders one group (floor + shell + dressing) per building node, plus the yard. */
export function Campus() {
  const twin = useFactoryStore((s) => s.twin)

  const buildings = useMemo(() => (twin ? resolveBuildings(twin) : []), [twin])

  // Weld stations = unique x positions of the weld robots in the body hall.
  const stationXs = useMemo(() => {
    if (!twin) return []
    const xs = twin.instances
      .filter((i) => categoryOf(twin, i) === 'robot' && Math.abs(i.z) < 20)
      .map((i) => i.x)
    return [...new Set(xs)].sort((a, b) => a - b)
  }, [twin])

  if (!twin) return null

  return (
    <group>
      <CampusGround />
      <SpineRail />
      <ShippingYard />
      {buildings.map((def) => (
        <BuildingGroup key={def.id} def={def} stationXs={stationXs} />
      ))}
    </group>
  )
}
