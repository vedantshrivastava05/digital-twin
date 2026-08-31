import { useEffect, useRef, useState } from 'react'
import {
  Billboard,
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
  Text,
} from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useFactoryStore, categoryOf, snapCoordinate } from '../store'
import type { AssetDto, AssetInstanceDto, TwinDto } from '../types'
import { AssemblyLine } from './machines/AssemblyLine'
import { GenericMachine } from './machines/GenericMachine'
import { RobotArm } from './machines/RobotArm'
import { TrimLine } from './machines/TrimLine'
import { StampingPress } from './machines/StampingPress'
import { DipTank } from './machines/DipTank'
import { PaintRobot } from './machines/PaintRobot'
import { PaintLine } from './machines/PaintLine'
import { OvenTunnel } from './machines/OvenTunnel'
import { CNCMachine } from './machines/CNCMachine'
import { ASRSRack } from './machines/ASRSRack'
import { AGV } from './machines/AGV'
import { Forklift } from './machines/Forklift'
import { InboundRail } from './machines/InboundRail'
import { Conveyor } from './machines/Conveyor'
import { BlankingLine } from './machines/BlankingLine'
import { TransferRobot } from './machines/TransferRobot'
import { DieCrane } from './machines/DieCrane'
import { PanelRack } from './machines/PanelRack'
import { ScrapConveyor } from './machines/ScrapConveyor'
import { CoilCrane } from './machines/CoilCrane'
import { FinalAssemblyLine } from './machines/FinalAssemblyLine'
import { MarriageStation } from './machines/MarriageStation'
import { QCGate } from './machines/QCGate'
import { FramingStation } from './machines/FramingStation'
import { BodyFramingCell } from './machines/BodyFramingCell'
import { DoorLine } from './machines/DoorLine'
import { WheelStation } from './machines/WheelStation'
import { GlassStation } from './machines/GlassStation'
import { SeatStation } from './machines/SeatStation'
import { FluidFill } from './machines/FluidFill'
import { RollerTestBed } from './machines/RollerTestBed'
import { LampAimRig } from './machines/LampAimRig'
import { InspectionPit } from './machines/InspectionPit'
import { LightTunnel } from './machines/LightTunnel'
import { ShowerTest } from './machines/ShowerTest'
import { Campus } from './Campus'
import { MaterialFlow } from './MaterialFlow'
import { WarehouseBoxes } from './WarehouseBoxes'
import { TrackLines } from './TrackLines'
import { Heatmap } from './Heatmap'
import { campusExtent, focusFrame } from './campusLayout'
import { plantFlow } from './lineClock'
import { Pins } from './Pins'
import { WalkControls } from './WalkControls'

function Machine({
  twin,
  instance,
}: {
  twin: TwinDto
  instance: AssetInstanceDto
}) {
  const asset = twin.assets.find((a) => a.id === instance.asset_id) as AssetDto
  switch (asset.category) {
    case 'robot':
      return <RobotArm instance={instance} asset={asset} />
    case 'paintrobot':
      return <PaintRobot instance={instance} asset={asset} />
    case 'paintline':
      return <PaintLine instance={instance} asset={asset} />
    case 'bodyline':
      return <AssemblyLine instance={instance} asset={asset} />
    case 'trimline':
      return <TrimLine instance={instance} asset={asset} />
    case 'stamping':
      return <StampingPress instance={instance} asset={asset} />
    case 'blanking':
      return <BlankingLine instance={instance} asset={asset} />
    case 'transferrobot':
      return <TransferRobot instance={instance} asset={asset} />
    case 'diecrane':
      return <DieCrane instance={instance} asset={asset} />
    case 'panelrack':
      return <PanelRack instance={instance} asset={asset} />
    case 'scrapconv':
      return <ScrapConveyor instance={instance} asset={asset} />
    case 'coilcrane':
      return <CoilCrane instance={instance} asset={asset} />
    case 'galine':
      return <FinalAssemblyLine instance={instance} asset={asset} />
    case 'marriage':
      return <MarriageStation instance={instance} asset={asset} />
    case 'qcgate':
      return <QCGate instance={instance} asset={asset} />
    case 'framing':
      return <FramingStation instance={instance} asset={asset} />
    case 'framecell':
      return <BodyFramingCell instance={instance} asset={asset} />
    case 'doorline':
      return <DoorLine instance={instance} asset={asset} />
    case 'wheelstn':
      return <WheelStation instance={instance} asset={asset} />
    case 'glassstn':
      return <GlassStation instance={instance} asset={asset} />
    case 'seatstn':
      return <SeatStation instance={instance} asset={asset} />
    case 'fluidfill':
      return <FluidFill instance={instance} asset={asset} />
    case 'rollertest':
      return <RollerTestBed instance={instance} asset={asset} />
    case 'lampaim':
      return <LampAimRig instance={instance} asset={asset} />
    case 'inspectpit':
      return <InspectionPit instance={instance} asset={asset} />
    case 'lighttunnel':
      return <LightTunnel instance={instance} asset={asset} />
    case 'showertest':
      return <ShowerTest instance={instance} asset={asset} />
    case 'diptank':
      return <DipTank instance={instance} asset={asset} />
    case 'oven':
      return <OvenTunnel instance={instance} asset={asset} />
    case 'cncmill':
      return <CNCMachine instance={instance} asset={asset} />
    case 'asrs':
      return <ASRSRack instance={instance} asset={asset} />
    case 'agv':
      return <AGV instance={instance} asset={asset} />
    case 'forklift':
      return <Forklift instance={instance} asset={asset} />
    case 'inboundrail':
      return <InboundRail instance={instance} asset={asset} />
    case 'conveyor':
      return <Conveyor instance={instance} asset={asset} />
    default:
      return <GenericMachine instance={instance} asset={asset} />
  }
}

function Zones({ twin }: { twin: TwinDto }) {
  return (
    <group>
      {twin.zones.map((zone) => (
        <group key={zone.id} position={[zone.x, 0, zone.z]}>
          <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
            <planeGeometry args={[zone.w, zone.d]} />
            <meshBasicMaterial color={zone.color} transparent opacity={0.18} />
          </mesh>
          <Billboard position={[0, 0.6, 0]}>
            <Text fontSize={0.6} color="#334155" outlineWidth={0.03} outlineColor="#ffffff">
              {zone.name}
            </Text>
          </Billboard>
        </group>
      ))}
    </group>
  )
}

/** Advances the global cross-shop material-flow clock. */
function PlantClock() {
  useFrame((_, dt) => {
    plantFlow.t += dt
  })
  return null
}

/** Advances the replay frame index while playing (time-travel of tag movement). */
function ReplayClock() {
  const acc = useRef(0)
  useFrame((_, dt) => {
    const st = useFactoryStore.getState()
    if (!st.replayMode || !st.playing || !st.frames || st.frames.length === 0) return
    acc.current += dt * st.replaySpeed
    const stepT = 1 / 8 // base 8 frames/sec at speed 1
    let idx = st.frameIndex
    while (acc.current >= stepT) {
      acc.current -= stepT
      idx = (idx + 1) % st.frames.length
    }
    if (idx !== st.frameIndex) st.setFrameIndex(idx)
  })
  return null
}

/** Desktop-grade editor shortcuts without stealing keystrokes from form fields. */
function EditorShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT'
      ) {
        return
      }
      const state = useFactoryStore.getState()
      if (!state.editMode) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
      } else if (event.key === 'Escape') {
        if (state.draggingId) state.cancelDrag()
        else if (state.placingAssetId) state.setPlacingAsset(null)
        else if (state.zoneDrawMode) state.setZoneDrawMode(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  return null
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

interface FocusAnim {
  fromPos: Vector3
  fromTgt: Vector3
  fromUp: Vector3
  toPos: Vector3
  toTgt: Vector3
  toUp: Vector3
  t: number
}

/**
 * Flies the orbit camera to frame the selected plant (or the whole campus).
 * Keeps the user's current viewing direction, just repositions + retargets so
 * they can immediately orbit/zoom the chosen building.
 */
function CameraFocus() {
  const focusedId = useFactoryStore((s) => s.focusedBuildingId)
  const nonce = useFactoryStore((s) => s.focusNonce)
  const cameraRequest = useFactoryStore((s) => s.cameraRequest)
  const selectedId = useFactoryStore((s) => s.selectedId)
  const twin = useFactoryStore((s) => s.twin)
  const walkMode = useFactoryStore((s) => s.walkMode)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as
    | { target: Vector3; update: () => void }
    | null
  const anim = useRef<FocusAnim | null>(null)

  const animateTo = (toPos: Vector3, toTgt: Vector3, toUp = new Vector3(0, 1, 0)) => {
    if (!controls?.target) return
    anim.current = {
      fromPos: camera.position.clone(),
      fromTgt: controls.target.clone(),
      fromUp: camera.up.clone(),
      toPos,
      toTgt,
      toUp,
      t: 0,
    }
  }

  useEffect(() => {
    if (nonce === 0 || walkMode || !controls?.target) return
    const { cx, cz, dist } = focusFrame(focusedId)
    const toTgt = new Vector3(cx, 1.5, cz)
    const dir = new Vector3().subVectors(camera.position, controls.target)
    if (dir.lengthSq() < 1e-4) dir.set(0.6, 0.55, 0.6)
    dir.normalize()
    if (dir.y < 0.28) {
      dir.y = 0.4
      dir.normalize()
    }
    animateTo(toTgt.clone().add(dir.multiplyScalar(dist)), toTgt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, controls, walkMode])

  useEffect(() => {
    if (cameraRequest.nonce === 0 || walkMode || !controls?.target || !twin) return

    const requestedId = cameraRequest.targetId ?? selectedId
    const instance =
      cameraRequest.preset === 'focus'
        ? twin.instances.find((item) => item.id === requestedId)
        : undefined
    const asset = instance
      ? twin.assets.find((item) => item.id === instance.asset_id)
      : undefined

    let frame = focusFrame(cameraRequest.preset === 'reset' ? null : focusedId)
    let target = new Vector3(frame.cx, 1.5, frame.cz)
    let distance = frame.dist
    if (instance) {
      target = new Vector3(instance.x, Math.max(1, instance.y + 1), instance.z)
      distance = Math.max(
        12,
        Math.max(asset?.footprint_w ?? 3, asset?.footprint_d ?? 3) * 4.5,
      )
    }

    let position: Vector3
    let up = new Vector3(0, 1, 0)
    if (cameraRequest.preset === 'top') {
      position = target.clone().add(new Vector3(0, distance, 0.001))
      up = new Vector3(0, 0, -1)
    } else if (cameraRequest.preset === 'front') {
      position = target.clone().add(new Vector3(0, distance * 0.12, distance))
    } else if (
      cameraRequest.preset === 'isometric' ||
      cameraRequest.preset === 'reset'
    ) {
      position = target
        .clone()
        .add(new Vector3(distance * 0.68, distance * 0.5, distance * 0.68))
    } else {
      const direction = new Vector3().subVectors(camera.position, controls.target)
      if (direction.lengthSq() < 1e-4) direction.set(0.7, 0.55, 0.7)
      direction.normalize()
      if (direction.y < 0.25) {
        direction.y = 0.35
        direction.normalize()
      }
      position = target.clone().add(direction.multiplyScalar(distance))
    }
    animateTo(position, target, up)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraRequest.nonce, controls, walkMode])

  useFrame((_, dt) => {
    const a = anim.current
    if (!a || !controls?.target) return
    a.t = Math.min(1, a.t + dt * 1.5)
    const e = easeInOut(a.t)
    camera.position.lerpVectors(a.fromPos, a.toPos, e)
    controls.target.lerpVectors(a.fromTgt, a.toTgt, e)
    camera.up.lerpVectors(a.fromUp, a.toUp, e).normalize()
    controls.update()
    if (a.t >= 1) {
      camera.up.copy(a.toUp)
      anim.current = null
    }
  })

  return null
}

/** Invisible plane that captures pointer events for placement, zone drawing, and dragging */
function BuilderOverlay({ twin }: { twin: TwinDto }) {
  const placingAssetId = useFactoryStore((s) => s.placingAssetId)
  const zoneDrawMode = useFactoryStore((s) => s.zoneDrawMode)
  const zoneDraft = useFactoryStore((s) => s.zoneDraft)
  const draggingId = useFactoryStore((s) => s.draggingId)
  const gridSize = useFactoryStore((s) => s.gridSize)
  const [ghostPos, setGhostPos] = useState<{ x: number; z: number } | null>(null)

  const ext = campusExtent(45)
  const active = Boolean(placingAssetId || zoneDrawMode || draggingId)
  const placingAsset = twin.assets.find((a) => a.id === placingAssetId)

  useEffect(() => {
    if (!draggingId) return
    const finishDrag = () => {
      const state = useFactoryStore.getState()
      if (state.draggingId) state.commitMove(state.draggingId)
    }
    const cancelDrag = () => useFactoryStore.getState().cancelDrag()
    window.addEventListener('pointerup', finishDrag)
    window.addEventListener('pointercancel', cancelDrag)
    return () => {
      window.removeEventListener('pointerup', finishDrag)
      window.removeEventListener('pointercancel', cancelDrag)
    }
  }, [draggingId])

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const state = useFactoryStore.getState()
    if (state.draggingId) {
      state.moveInstanceLocal(state.draggingId, e.point.x, e.point.z)
    } else if (state.placingAssetId) {
      setGhostPos({
        x: snapCoordinate(e.point.x, state.snapEnabled, state.gridSize),
        z: snapCoordinate(e.point.z, state.snapEnabled, state.gridSize),
      })
    } else if (state.zoneDrawMode && state.zoneDraft && !state.zoneDraft.done) {
      state.setZoneDraft({
        ...state.zoneDraft,
        x1: snapCoordinate(e.point.x, state.snapEnabled, state.gridSize),
        z1: snapCoordinate(e.point.z, state.snapEnabled, state.gridSize),
      })
    }
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const state = useFactoryStore.getState()
    if (state.zoneDrawMode && !state.zoneDraft) {
      e.stopPropagation()
      state.setZoneDraft({
        x0: snapCoordinate(e.point.x, state.snapEnabled, state.gridSize),
        z0: snapCoordinate(e.point.z, state.snapEnabled, state.gridSize),
        x1: snapCoordinate(e.point.x, state.snapEnabled, state.gridSize),
        z1: snapCoordinate(e.point.z, state.snapEnabled, state.gridSize),
        done: false,
      })
    }
  }

  const onPointerUp = () => {
    const state = useFactoryStore.getState()
    if (state.draggingId) {
      state.commitMove(state.draggingId)
    } else if (state.zoneDrawMode && state.zoneDraft && !state.zoneDraft.done) {
      state.setZoneDraft({ ...state.zoneDraft, done: true })
    }
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const state = useFactoryStore.getState()
    if (state.placingAssetId) {
      e.stopPropagation()
      state.placeInstance(e.point.x, e.point.z)
      setGhostPos(null)
    }
  }

  const draft = zoneDraft
  return (
    <>
      {active && (
        <Grid
          args={[ext.w, ext.d]}
          position={[ext.cx, 0.03, ext.cz]}
          cellSize={gridSize}
          cellThickness={0.55}
          cellColor="#94a3b8"
          sectionSize={gridSize * 10}
          sectionThickness={1.1}
          sectionColor="#38bdf8"
          fadeDistance={Math.max(ext.w, ext.d)}
          fadeStrength={0.7}
        />
      )}
      {active && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[ext.cx, 0.04, ext.cz]}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onClick={onClick}
        >
          <planeGeometry args={[ext.w, ext.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {placingAsset && ghostPos && (
        <mesh position={[ghostPos.x, 0.8, ghostPos.z]}>
          <boxGeometry args={[placingAsset.footprint_w, 1.6, placingAsset.footprint_d]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.35} />
        </mesh>
      )}
      {draft && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[(draft.x0 + draft.x1) / 2, 0.03, (draft.z0 + draft.z1) / 2]}
        >
          <planeGeometry
            args={[
              Math.max(0.1, Math.abs(draft.x1 - draft.x0)),
              Math.max(0.1, Math.abs(draft.z1 - draft.z0)),
            ]}
          />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.3} />
        </mesh>
      )}
    </>
  )
}

export function Factory() {
  const twin = useFactoryStore((s) => s.twin)
  const layers = useFactoryStore((s) => s.layers)
  const walkMode = useFactoryStore((s) => s.walkMode)
  const interacting = useFactoryStore((s) =>
    Boolean(s.placingAssetId || s.zoneDrawMode || s.draggingId),
  )

  if (!twin) return null

  const visible = (inst: AssetInstanceDto) => {
    const category = categoryOf(twin, inst)
    if (category === 'robot' || category === 'paintrobot') return layers.robots
    if (category === 'bodyline' || category === 'trimline' || category === 'paintline')
      return layers.lines
    return layers.machines
  }

  return (
    <>
      <PlantClock />
      <EditorShortcuts />
      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#ffffff', '#9aa3b2', 0.55]} />
      <directionalLight
        position={[60, 70, 40]}
        intensity={1.35}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
      />
      {/* Soft studio reflections for metal + polished floor (built locally, no HDRI download) */}
      <Environment resolution={256} frames={1}>
        <Lightformer
          intensity={1.3}
          position={[0, 14, 0]}
          rotation-x={Math.PI / 2}
          scale={[50, 30, 1]}
          color="#ffffff"
        />
        <Lightformer
          intensity={0.7}
          position={[-24, 8, 12]}
          scale={[14, 14, 1]}
          color="#cfe0ff"
        />
        <Lightformer
          intensity={0.7}
          position={[24, 8, -12]}
          scale={[14, 14, 1]}
          color="#ffe6cf"
        />
      </Environment>
      <CameraFocus />
      <ReplayClock />
      <Campus />
      {twin.instances.filter(visible).map((inst) => (
        <Machine key={inst.id} twin={twin} instance={inst} />
      ))}
      {layers.machines && <MaterialFlow twin={twin} />}
      {layers.machines && <WarehouseBoxes />}
      <Heatmap />
      <TrackLines />
      <Zones twin={twin} />
      <BuilderOverlay twin={twin} />
      {layers.annotations && <Pins />}
      {walkMode ? (
        <WalkControls />
      ) : (
        <OrbitControls
          makeDefault
          enabled={!interacting}
          target={[0, 1, 0]}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={8}
          maxDistance={800}
        />
      )}
    </>
  )
}
