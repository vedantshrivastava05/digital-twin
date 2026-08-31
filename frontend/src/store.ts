import { create } from 'zustand'
import {
  apiCreateInstance,
  apiCreateZone,
  apiDeleteInstance,
  apiDeleteZone,
  apiRestoreLayoutVersion,
  apiSaveLayoutVersion,
  apiSetStatus,
  apiUpdateInstance,
  createAnnotation,
  deleteAnnotation,
  fetchAnnotations,
  fetchLayoutVersions,
  fetchOpsState,
  fetchTwin,
} from './api'
import { fetchFrames, fetchOrders } from './api'
import type {
  AnnotationDto,
  AssetInstanceDto,
  FrameDto,
  LayoutVersionDto,
  MachineCategory,
  MachineStatus,
  OrderDto,
  TrackTagDto,
  TwinDto,
  ZoneDto,
} from './types'

/** Live status of a machine, as logged in Factory Memory (no more random sim) */
export interface MachineRuntime {
  status: MachineStatus
  sinceMs: number
  reasonCode: string | null
}

export interface TelemetryValues {
  temperature?: number
  current?: number
  cycle_count?: number
  energy?: number
}

export type LayerKey =
  | 'structure'
  | 'dressing'
  | 'robots'
  | 'lines'
  | 'machines'
  | 'people'
  | 'tracks'
  | 'heatmap'
  | 'labels'
  | 'orders'
  | 'annotations'

export interface PendingPin {
  x: number
  y: number
  z: number
  instanceId: string | null
}

export interface ZoneDraft {
  x0: number
  z0: number
  x1: number
  z1: number
  done: boolean
}

export type CameraPreset = 'top' | 'front' | 'isometric' | 'reset' | 'focus'

export interface CameraRequest {
  preset: CameraPreset
  /** Only used by the focus preset. Null means the currently selected machine. */
  targetId: string | null
  /** Repeated requests are observable because this value always increments. */
  nonce: number
}

export type InstanceEditorPatch = Partial<
  Pick<AssetInstanceDto, 'asset_id' | 'name' | 'x' | 'y' | 'z' | 'rotation_y'>
>

interface InstanceHistoryEntry {
  kind: 'update-instance'
  label: string
  instanceId: string
  before: InstanceEditorPatch
  after: InstanceEditorPatch
}

interface InstanceLifecycleHistoryEntryBase {
  label: string
  instance: AssetInstanceDto
  parentNodeId: string | null
}

interface CreateInstanceHistoryEntry extends InstanceLifecycleHistoryEntryBase {
  kind: 'create-instance'
}

interface DeleteInstanceHistoryEntry extends InstanceLifecycleHistoryEntryBase {
  kind: 'delete-instance'
}

type InstanceLifecycleHistoryEntry =
  | CreateInstanceHistoryEntry
  | DeleteInstanceHistoryEntry

interface ZoneHistoryEntryBase {
  label: string
  zone: ZoneDto
}

interface CreateZoneHistoryEntry extends ZoneHistoryEntryBase {
  kind: 'create-zone'
}

interface DeleteZoneHistoryEntry extends ZoneHistoryEntryBase {
  kind: 'delete-zone'
}

type ZoneHistoryEntry = CreateZoneHistoryEntry | DeleteZoneHistoryEntry

interface StatusHistoryEntry {
  kind: 'update-status'
  label: string
  instanceId: string
  before: { status: MachineStatus; reasonCode: string | null }
  after: { status: MachineStatus; reasonCode: string | null }
}

export type EditorHistoryEntry =
  | InstanceHistoryEntry
  | InstanceLifecycleHistoryEntry
  | ZoneHistoryEntry
  | StatusHistoryEntry

interface DragOrigin {
  id: string
  x: number
  z: number
}

/**
 * Public editor contract consumed by the toolbar, hierarchy, properties panel,
 * and Three scene. Fields prefixed with `_` are implementation details and
 * should not be selected by UI components.
 */
export interface FactoryState {
  twin: TwinDto | null
  loadError: string | null
  machines: Record<string, MachineRuntime>
  orders: OrderDto[]
  telemetry: Record<string, TelemetryValues>
  wsConnected: boolean
  selectedId: string | null
  highlightedIds: string[]

  // RTLS: live movable tags + online counters
  positions: Record<string, TrackTagDto>
  deviceOnline: number
  deviceTotal: number

  // Time-travel replay of tag movement
  replayMode: boolean
  replayMinutes: number
  frames: FrameDto[] | null
  frameIndex: number
  playing: boolean
  replaySpeed: number
  enterReplay: (minutes?: number) => Promise<void>
  exitReplay: () => void
  setFrameIndex: (i: number) => void
  setPlaying: (b: boolean) => void
  setReplaySpeed: (s: number) => void

  connectTelemetry: () => void
  setHighlighted: (ids: string[]) => void

  // Camera focus: which building the view is framed on (null = whole campus).
  // focusNonce bumps on every request so re-selecting the same plant re-zooms.
  focusedBuildingId: string | null
  focusNonce: number
  focusBuilding: (id: string | null) => void

  // Camera commands are declarative so UI controls do not need Three.js refs.
  cameraRequest: CameraRequest
  requestCameraPreset: (preset: CameraPreset, targetId?: string | null) => void
  focusMachine: (id: string) => void

  layers: Record<LayerKey, boolean>
  walkMode: boolean
  pinMode: boolean
  annotations: AnnotationDto[]
  pendingPin: PendingPin | null
  selectedAnnotationId: string | null

  // Manual builder
  editMode: boolean
  placingAssetId: string | null
  zoneDrawMode: boolean
  zoneDraft: ZoneDraft | null
  draggingId: string | null
  layoutVersions: LayoutVersionDto[]

  // Layout editor state. History is bounded and only records committed edits.
  snapEnabled: boolean
  gridSize: number
  canUndo: boolean
  canRedo: boolean
  layoutDirty: boolean
  editorBusy: boolean
  editorError: string | null
  lastSavedAt: string | null
  activeLayoutVersionId: string | null
  _undoStack: EditorHistoryEntry[]
  _redoStack: EditorHistoryEntry[]
  _dragOrigin: DragOrigin | null

  // Info panel tab (documents tab is opened from search results)
  infoTab: 'overview' | 'documents' | 'components'
  setInfoTab: (tab: 'overview' | 'documents' | 'components') => void

  loadTwin: (options?: { preserveHistory?: boolean }) => Promise<void>
  pollOps: () => Promise<void>
  setStatus: (
    id: string,
    status: MachineStatus,
    reasonCode?: string,
    note?: string,
  ) => Promise<void>
  select: (id: string | null) => void

  toggleLayer: (key: LayerKey) => void
  setWalkMode: (on: boolean) => void
  setPinMode: (on: boolean) => void
  setPendingPin: (pin: PendingPin | null) => void
  savePendingPin: (text: string) => Promise<void>
  removeAnnotation: (id: string) => Promise<void>
  selectAnnotation: (id: string | null) => void

  setEditMode: (on: boolean) => void
  toggleSnap: () => void
  setSnapEnabled: (on: boolean) => void
  setGridSize: (size: number) => void
  setPlacingAsset: (assetId: string | null) => void
  placeInstance: (x: number, z: number) => Promise<void>
  setDragging: (id: string | null) => void
  moveInstanceLocal: (id: string, x: number, z: number) => void
  commitMove: (id: string) => Promise<void>
  cancelDrag: () => void
  updateInstanceTransform: (
    id: string,
    patch: Partial<Pick<AssetInstanceDto, 'x' | 'y' | 'z' | 'rotation_y'>>,
  ) => Promise<void>
  rotateInstance: (id: string, radians?: number) => Promise<void>
  renameInstance: (id: string, name: string) => Promise<void>
  changeInstanceType: (id: string, assetId: string) => Promise<void>
  duplicateInstance: (id?: string) => Promise<void>
  removeInstance: (id: string) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  clearEditorError: () => void
  setZoneDrawMode: (on: boolean) => void
  setZoneDraft: (draft: ZoneDraft | null) => void
  saveZoneDraft: (name: string) => Promise<void>
  removeZone: (id: string) => Promise<void>
  loadLayoutVersions: () => Promise<void>
  saveLayoutVersion: (label: string) => Promise<void>
  restoreLayoutVersion: (id: string) => Promise<void>
}

const HISTORY_LIMIT = 60
const TAU = Math.PI * 2
let telemetrySocket: WebSocket | null = null
let telemetryPingTimer: number | undefined
let telemetryReconnectTimer: number | undefined

function editorErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizedRotation(value: number): number {
  const normalized = value % TAU
  return normalized < 0 ? normalized + TAU : normalized
}

export function snapCoordinate(value: number, enabled: boolean, size: number): number {
  if (!enabled || size <= 0) return value
  return Math.round(value / size) * size
}

function sameNumber(a: number | undefined, b: number | undefined): boolean {
  if (a == null || b == null) return a === b
  return Math.abs(a - b) < 1e-6
}

function patchesEqual(a: InstanceEditorPatch, b: InstanceEditorPatch): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<
    keyof InstanceEditorPatch
  >
  for (const key of keys) {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'number' && typeof bv === 'number') {
      if (!sameNumber(av, bv)) return false
    } else if (av !== bv) return false
  }
  return true
}

function patchTwinInstance(
  twin: TwinDto | null,
  id: string,
  patch: InstanceEditorPatch,
): TwinDto | null {
  if (!twin) return null
  const current = twin.instances.find((instance) => instance.id === id)
  if (!current) return twin
  const name = patch.name
  return {
    ...twin,
    instances: twin.instances.map((instance) =>
      instance.id === id ? { ...instance, ...patch } : instance,
    ),
    nodes:
      name === undefined || !current.node_id
        ? twin.nodes
        : twin.nodes.map((node) =>
            node.id === current.node_id && node.level === 'machine'
              ? { ...node, name }
              : node,
          ),
  }
}

function parentNodeIdFor(twin: TwinDto, instance: AssetInstanceDto): string | null {
  if (!instance.node_id) return null
  return twin.nodes.find((node) => node.id === instance.node_id)?.parent_id ?? null
}

function defaultParentNodeId(twin: TwinDto): string | null {
  return (
    twin.nodes.find((node) => node.level === 'line')?.id ??
    twin.nodes.find((node) => node.level === 'area')?.id ??
    twin.nodes.find((node) => node.level === 'building')?.id ??
    null
  )
}

function pushedHistory(
  state: FactoryState,
  entry: EditorHistoryEntry,
): Partial<FactoryState> {
  const _undoStack = [...state._undoStack, entry].slice(-HISTORY_LIMIT)
  return {
    _undoStack,
    _redoStack: [],
    canUndo: true,
    canRedo: false,
    layoutDirty: true,
  }
}

function instanceCreateBody(
  instance: AssetInstanceDto,
  parentNodeId: string | null,
): Parameters<typeof apiCreateInstance>[1] {
  return {
    asset_id: instance.asset_id,
    name: instance.name,
    x: instance.x,
    y: instance.y,
    z: instance.z,
    rotation_y: instance.rotation_y,
    source: instance.source,
    ...(parentNodeId ? { parent_node_id: parentNodeId } : {}),
  }
}

export const useFactoryStore = create<FactoryState>((set, get) => ({
  twin: null,
  loadError: null,
  machines: {},
  orders: [],
  telemetry: {},
  wsConnected: false,
  selectedId: null,
  highlightedIds: [],

  positions: {},
  deviceOnline: 0,
  deviceTotal: 0,

  replayMode: false,
  replayMinutes: 15,
  frames: null,
  frameIndex: 0,
  playing: false,
  replaySpeed: 4,

  focusedBuildingId: null,
  focusNonce: 0,
  focusBuilding: (id) =>
    set((state) => ({
      focusedBuildingId: id,
      focusNonce: state.focusNonce + 1,
      walkMode: false,
    })),

  cameraRequest: { preset: 'reset', targetId: null, nonce: 0 },
  requestCameraPreset: (preset, targetId) =>
    set((state) => ({
      cameraRequest: {
        preset,
        targetId: targetId ?? null,
        nonce: state.cameraRequest.nonce + 1,
      },
      walkMode: false,
    })),
  focusMachine: (id) =>
    set((state) => ({
      selectedId: id,
      selectedAnnotationId: null,
      walkMode: false,
      cameraRequest: {
        preset: 'focus',
        targetId: id,
        nonce: state.cameraRequest.nonce + 1,
      },
    })),

  layers: {
    structure: true,
    dressing: true,
    robots: true,
    lines: true,
    machines: true,
    people: true,
    tracks: false,
    heatmap: false,
    labels: false,
    orders: true,
    annotations: true,
  },
  walkMode: false,
  pinMode: false,
  annotations: [],
  pendingPin: null,
  selectedAnnotationId: null,

  editMode: false,
  placingAssetId: null,
  zoneDrawMode: false,
  zoneDraft: null,
  draggingId: null,
  layoutVersions: [],

  snapEnabled: true,
  gridSize: 1,
  canUndo: false,
  canRedo: false,
  layoutDirty: false,
  editorBusy: false,
  editorError: null,
  lastSavedAt: null,
  activeLayoutVersionId: null,
  _undoStack: [],
  _redoStack: [],
  _dragOrigin: null,

  infoTab: 'overview',
  setInfoTab: (tab) => set({ infoTab: tab }),

  loadTwin: async (options) => {
    try {
      const twin = await fetchTwin()
      const annotations = await fetchAnnotations(twin.site.id)
      set((state) => ({
        twin,
        annotations,
        loadError: null,
        ...(!options?.preserveHistory
          ? {
              _undoStack: [],
              _redoStack: [],
              canUndo: false,
              canRedo: false,
              layoutDirty: false,
              _dragOrigin: null,
              draggingId: null,
            }
          : {}),
        selectedId:
          state.selectedId && twin.instances.some((i) => i.id === state.selectedId)
            ? state.selectedId
            : null,
      }))
      await get().pollOps()
    } catch (err) {
      set({ loadError: err instanceof Error ? err.message : String(err) })
    }
  },

  pollOps: async () => {
    try {
      const [states, orders] = await Promise.all([fetchOpsState(), fetchOrders()])
      const machines: Record<string, MachineRuntime> = {}
      for (const s of states) {
        machines[s.instance_id] = {
          status: s.status,
          sinceMs: new Date(s.since).getTime(),
          reasonCode: s.reason_code,
        }
      }
      set({ machines, orders })
    } catch {
      // Backend hiccup during polling; keep last known state
    }
  },

  setStatus: async (id, status, reasonCode, note) => {
    const previous = get().machines[id] ?? {
      status: 'running' as MachineStatus,
      sinceMs: Date.now(),
      reasonCode: null,
    }
    if (previous.status === status) return
    const effectiveReasonCode = status === 'down' ? (reasonCode ?? 'OTHER') : reasonCode
    set({ editorBusy: true, editorError: null })
    try {
      await apiSetStatus(id, status, effectiveReasonCode, note)
      await get().pollOps()
      const entry: StatusHistoryEntry = {
        kind: 'update-status',
        label: `Set status to ${status}`,
        instanceId: id,
        before: { status: previous.status, reasonCode: previous.reasonCode },
        after: { status, reasonCode: effectiveReasonCode ?? null },
      }
      set((state) => ({ ...pushedHistory(state, entry), editorBusy: false }))
    } catch (error) {
      set({ editorBusy: false, editorError: editorErrorMessage(error) })
    }
  },

  connectTelemetry: () => {
    if (
      telemetrySocket?.readyState === WebSocket.OPEN ||
      telemetrySocket?.readyState === WebSocket.CONNECTING
    ) {
      return
    }
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'

    const open = () => {
      if (
        telemetrySocket?.readyState === WebSocket.OPEN ||
        telemetrySocket?.readyState === WebSocket.CONNECTING
      ) {
        return
      }
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/telemetry`)
      telemetrySocket = ws
      ws.onopen = () => {
        set({ wsConnected: true })
        if (telemetryPingTimer !== undefined) window.clearInterval(telemetryPingTimer)
        telemetryPingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping')
        }, 20000)
      }
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as {
          mapped: { instance_id: string; semantic: string; value: number | string }[]
          positions?: TrackTagDto[]
        }
        const now = Date.now()
        set((state) => {
          const machines = { ...state.machines }
          const telemetry = { ...state.telemetry }
          let posPatch: Partial<FactoryState> = {}
          if (msg.positions) {
            const positions: Record<string, TrackTagDto> = {}
            let online = 0
            for (const t of msg.positions) {
              positions[t.id] = t
              if (t.online) online++
            }
            posPatch = {
              positions,
              deviceOnline: online,
              deviceTotal: msg.positions.length,
            }
          }
          for (const item of msg.mapped) {
            if (item.semantic === 'state') {
              const status = item.value as MachineStatus
              const prev = machines[item.instance_id]
              if (!prev || prev.status !== status) {
                machines[item.instance_id] = {
                  status,
                  sinceMs: prev && prev.status === status ? prev.sinceMs : now,
                  reasonCode: prev?.reasonCode ?? null,
                }
              }
            } else {
              telemetry[item.instance_id] = {
                ...telemetry[item.instance_id],
                [item.semantic]: item.value as number,
              }
            }
          }
          return { machines, telemetry, ...posPatch }
        })
      }
      ws.onclose = () => {
        if (telemetrySocket === ws) telemetrySocket = null
        set({ wsConnected: false })
        if (telemetryPingTimer !== undefined) {
          window.clearInterval(telemetryPingTimer)
          telemetryPingTimer = undefined
        }
        if (telemetryReconnectTimer !== undefined) {
          window.clearTimeout(telemetryReconnectTimer)
        }
        telemetryReconnectTimer = window.setTimeout(open, 3000)
      }
      ws.onerror = () => ws.close()
    }
    open()
  },

  enterReplay: async (minutes) => {
    const mins = minutes ?? get().replayMinutes
    try {
      const { frames } = await fetchFrames(mins)
      set({
        replayMode: true,
        replayMinutes: mins,
        frames,
        frameIndex: Math.max(0, frames.length - 1),
        playing: false,
      })
    } catch {
      // leave live mode intact on failure
    }
  },

  exitReplay: () => set({ replayMode: false, playing: false }),

  setFrameIndex: (i) => set({ frameIndex: i }),

  setPlaying: (b) => set({ playing: b }),

  setReplaySpeed: (s) => set({ replaySpeed: s }),

  select: (id) => set({ selectedId: id, selectedAnnotationId: null }),

  setHighlighted: (ids) => set({ highlightedIds: ids }),

  toggleLayer: (key) =>
    set((state) => ({ layers: { ...state.layers, [key]: !state.layers[key] } })),

  setWalkMode: (on) => set({ walkMode: on, pinMode: false }),

  setPinMode: (on) => set({ pinMode: on, pendingPin: null }),

  setPendingPin: (pin) => set({ pendingPin: pin }),

  savePendingPin: async (text) => {
    const { twin, pendingPin } = get()
    if (!twin || !pendingPin || !text.trim()) {
      set({ pendingPin: null, pinMode: false })
      return
    }
    const ann = await createAnnotation(twin.site.id, {
      x: pendingPin.x,
      y: pendingPin.y,
      z: pendingPin.z,
      text: text.trim(),
      instance_id: pendingPin.instanceId,
    })
    set((state) => ({
      annotations: [ann, ...state.annotations],
      pendingPin: null,
      pinMode: false,
    }))
  },

  removeAnnotation: async (id) => {
    await deleteAnnotation(id)
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
      selectedAnnotationId: null,
    }))
  },

  selectAnnotation: (id) => set({ selectedAnnotationId: id, selectedId: null }),

  // ---------- Manual builder ----------

  setEditMode: (on) =>
    set({
      editMode: on,
      placingAssetId: null,
      zoneDrawMode: false,
      zoneDraft: null,
      draggingId: null,
      walkMode: false,
      pinMode: false,
    }),

  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),

  setSnapEnabled: (on) => set({ snapEnabled: on }),

  setGridSize: (size) => {
    if (!Number.isFinite(size)) return
    set({ gridSize: Math.min(20, Math.max(0.1, size)) })
  },

  setPlacingAsset: (assetId) =>
    set({ placingAssetId: assetId, zoneDrawMode: false, zoneDraft: null }),

  placeInstance: async (x, z) => {
    const { twin, placingAssetId, snapEnabled, gridSize, editorBusy } = get()
    if (!twin || !placingAssetId || editorBusy) return
    const asset = twin.assets.find((a) => a.id === placingAssetId)
    if (!asset) return
    const count = twin.instances.filter((i) => i.asset_id === asset.id).length
    const parentNodeId = defaultParentNodeId(twin)
    set({ editorBusy: true, editorError: null })
    try {
      const instance = await apiCreateInstance(twin.site.id, {
        asset_id: asset.id,
        name: `${asset.name} ${count + 1}`,
        x: snapCoordinate(x, snapEnabled, gridSize),
        z: snapCoordinate(z, snapEnabled, gridSize),
        ...(parentNodeId ? { parent_node_id: parentNodeId } : {}),
      })
      await get().loadTwin({ preserveHistory: true })
      const entry: InstanceLifecycleHistoryEntry = {
        kind: 'create-instance',
        label: `Add ${instance.name}`,
        instance,
        parentNodeId,
      }
      set((state) => ({
        ...pushedHistory(state, entry),
        selectedId: instance.id,
        editorBusy: false,
      }))
    } catch (error) {
      set({ editorBusy: false, editorError: editorErrorMessage(error) })
    }
  },

  setDragging: (id) => {
    if (id === null) {
      set({ draggingId: null, _dragOrigin: null })
      return
    }
    const instance = get().twin?.instances.find((item) => item.id === id)
    if (!instance || get().editorBusy) return
    set({
      draggingId: id,
      selectedId: id,
      selectedAnnotationId: null,
      _dragOrigin: { id, x: instance.x, z: instance.z },
      editorError: null,
    })
  },

  moveInstanceLocal: (id, x, z) =>
    set((state) => {
      if (!state.twin) return {}
      const nextX = snapCoordinate(x, state.snapEnabled, state.gridSize)
      const nextZ = snapCoordinate(z, state.snapEnabled, state.gridSize)
      return {
        twin: patchTwinInstance(state.twin, id, { x: nextX, z: nextZ }),
      }
    }),

  commitMove: async (id) => {
    const { twin, _dragOrigin: origin } = get()
    const instance = twin?.instances.find((item) => item.id === id)
    set({ draggingId: null, _dragOrigin: null })
    if (!instance || !origin || origin.id !== id) return
    const before = { x: origin.x, z: origin.z }
    const after = { x: instance.x, z: instance.z }
    if (patchesEqual(before, after)) return
    set({ editorBusy: true, editorError: null })
    try {
      await apiUpdateInstance(id, after)
      const entry: InstanceHistoryEntry = {
        kind: 'update-instance',
        label: `Move ${instance.name}`,
        instanceId: id,
        before,
        after,
      }
      set((state) => ({ ...pushedHistory(state, entry), editorBusy: false }))
    } catch (error) {
      set((state) => ({
        twin: patchTwinInstance(state.twin, id, before),
        editorBusy: false,
        editorError: editorErrorMessage(error),
      }))
    }
  },

  cancelDrag: () => {
    const origin = get()._dragOrigin
    if (!origin) {
      set({ draggingId: null })
      return
    }
    set((state) => ({
      twin: patchTwinInstance(state.twin, origin.id, {
        x: origin.x,
        z: origin.z,
      }),
      draggingId: null,
      _dragOrigin: null,
    }))
  },

  updateInstanceTransform: async (id, rawPatch) => {
    const state = get()
    const instance = state.twin?.instances.find((item) => item.id === id)
    if (!instance || state.editorBusy) return
    const patch: InstanceEditorPatch = {}
    if (rawPatch.x != null && Number.isFinite(rawPatch.x)) {
      patch.x = snapCoordinate(rawPatch.x, state.snapEnabled, state.gridSize)
    }
    if (rawPatch.y != null && Number.isFinite(rawPatch.y)) patch.y = rawPatch.y
    if (rawPatch.z != null && Number.isFinite(rawPatch.z)) {
      patch.z = snapCoordinate(rawPatch.z, state.snapEnabled, state.gridSize)
    }
    if (rawPatch.rotation_y != null && Number.isFinite(rawPatch.rotation_y)) {
      patch.rotation_y = normalizedRotation(rawPatch.rotation_y)
    }
    const before: InstanceEditorPatch = {}
    for (const key of Object.keys(patch) as (keyof InstanceEditorPatch)[]) {
      if (key === 'asset_id' || key === 'name') continue
      ;(before as Record<string, unknown>)[key] = instance[key]
    }
    if (Object.keys(patch).length === 0 || patchesEqual(before, patch)) return
    set((current) => ({
      twin: patchTwinInstance(current.twin, id, patch),
      editorBusy: true,
      editorError: null,
    }))
    try {
      await apiUpdateInstance(id, patch)
      const entry: InstanceHistoryEntry = {
        kind: 'update-instance',
        label: `Update transform · ${instance.name}`,
        instanceId: id,
        before,
        after: patch,
      }
      set((current) => ({ ...pushedHistory(current, entry), editorBusy: false }))
    } catch (error) {
      set((current) => ({
        twin: patchTwinInstance(current.twin, id, before),
        editorBusy: false,
        editorError: editorErrorMessage(error),
      }))
    }
  },

  rotateInstance: async (id, radians = Math.PI / 2) => {
    const instance = get().twin?.instances.find((item) => item.id === id)
    if (!instance) return
    await get().updateInstanceTransform(id, {
      rotation_y: instance.rotation_y + radians,
    })
  },

  renameInstance: async (id, name) => {
    const state = get()
    const instance = state.twin?.instances.find((item) => item.id === id)
    const nextName = name.trim()
    if (!instance || !nextName || nextName === instance.name || state.editorBusy) return
    const before = { name: instance.name }
    const after = { name: nextName }
    set((current) => ({
      twin: patchTwinInstance(current.twin, id, after),
      editorBusy: true,
      editorError: null,
    }))
    try {
      await apiUpdateInstance(id, after)
      const entry: InstanceHistoryEntry = {
        kind: 'update-instance',
        label: `Rename ${instance.name}`,
        instanceId: id,
        before,
        after,
      }
      set((current) => ({ ...pushedHistory(current, entry), editorBusy: false }))
    } catch (error) {
      set((current) => ({
        twin: patchTwinInstance(current.twin, id, before),
        editorBusy: false,
        editorError: editorErrorMessage(error),
      }))
    }
  },

  changeInstanceType: async (id, assetId) => {
    const state = get()
    const instance = state.twin?.instances.find((item) => item.id === id)
    if (
      !instance ||
      instance.asset_id === assetId ||
      !state.twin?.assets.some((asset) => asset.id === assetId) ||
      state.editorBusy
    ) {
      return
    }
    const before = { asset_id: instance.asset_id }
    const after = { asset_id: assetId }
    set((current) => ({
      twin: patchTwinInstance(current.twin, id, after),
      editorBusy: true,
      editorError: null,
    }))
    try {
      await apiUpdateInstance(id, after)
      const entry: InstanceHistoryEntry = {
        kind: 'update-instance',
        label: `Change type · ${instance.name}`,
        instanceId: id,
        before,
        after,
      }
      set((current) => ({ ...pushedHistory(current, entry), editorBusy: false }))
    } catch (error) {
      set((current) => ({
        twin: patchTwinInstance(current.twin, id, before),
        editorBusy: false,
        editorError: editorErrorMessage(error),
      }))
    }
  },

  duplicateInstance: async (requestedId) => {
    const state = get()
    const id = requestedId ?? state.selectedId
    const source = state.twin?.instances.find((item) => item.id === id)
    if (!state.twin || !source || state.editorBusy) return
    const asset = state.twin.assets.find((item) => item.id === source.asset_id)
    const parentNodeId = parentNodeIdFor(state.twin, source)
    const offset = Math.max(state.gridSize, (asset?.footprint_w ?? 2) + state.gridSize)
    set({ editorBusy: true, editorError: null })
    try {
      const instance = await apiCreateInstance(state.twin.site.id, {
        ...instanceCreateBody(
          {
            ...source,
            name: `${source.name} Copy`,
            x: snapCoordinate(source.x + offset, state.snapEnabled, state.gridSize),
          },
          parentNodeId,
        ),
      })
      await get().loadTwin({ preserveHistory: true })
      const entry: InstanceLifecycleHistoryEntry = {
        kind: 'create-instance',
        label: `Duplicate ${source.name}`,
        instance,
        parentNodeId,
      }
      set((current) => ({
        ...pushedHistory(current, entry),
        selectedId: instance.id,
        editorBusy: false,
      }))
    } catch (error) {
      set({ editorBusy: false, editorError: editorErrorMessage(error) })
    }
  },

  removeInstance: async (id) => {
    const state = get()
    const instance = state.twin?.instances.find((item) => item.id === id)
    if (!state.twin || !instance || state.editorBusy) return
    const parentNodeId = parentNodeIdFor(state.twin, instance)
    set({ editorBusy: true, editorError: null })
    try {
      await apiDeleteInstance(id)
      await get().loadTwin({ preserveHistory: true })
      const entry: InstanceLifecycleHistoryEntry = {
        kind: 'delete-instance',
        label: `Delete ${instance.name}`,
        instance,
        parentNodeId,
      }
      set((current) => ({
        ...pushedHistory(current, entry),
        selectedId: null,
        editorBusy: false,
      }))
    } catch (error) {
      set({ editorBusy: false, editorError: editorErrorMessage(error) })
    }
  },

  undo: async () => {
    const state = get()
    const entry = state._undoStack.at(-1)
    if (!entry || state.editorBusy || !state.twin) return
    set({ editorBusy: true, editorError: null, draggingId: null, _dragOrigin: null })
    try {
      let nextEntry: EditorHistoryEntry = entry
      if (entry.kind === 'update-instance') {
        await apiUpdateInstance(entry.instanceId, entry.before)
        set((current) => ({
          twin: patchTwinInstance(current.twin, entry.instanceId, entry.before),
        }))
      } else if (entry.kind === 'update-status') {
        await apiSetStatus(
          entry.instanceId,
          entry.before.status,
          entry.before.status === 'down'
            ? (entry.before.reasonCode ?? 'OTHER')
            : undefined,
        )
        await get().pollOps()
      } else if (entry.kind === 'create-instance') {
        await apiDeleteInstance(entry.instance.id)
        await get().loadTwin({ preserveHistory: true })
        if (get().selectedId === entry.instance.id) set({ selectedId: null })
      } else if (entry.kind === 'delete-instance') {
        const instance = await apiCreateInstance(
          state.twin.site.id,
          instanceCreateBody(entry.instance, entry.parentNodeId),
        )
        nextEntry = { ...entry, instance }
        await get().loadTwin({ preserveHistory: true })
        set({ selectedId: instance.id })
      } else if (entry.kind === 'create-zone') {
        await apiDeleteZone(entry.zone.id)
        await get().loadTwin({ preserveHistory: true })
      } else {
        const zone = await apiCreateZone(state.twin.site.id, {
          name: entry.zone.name,
          x: entry.zone.x,
          z: entry.zone.z,
          w: entry.zone.w,
          d: entry.zone.d,
          color: entry.zone.color,
        })
        nextEntry = { ...entry, zone }
        await get().loadTwin({ preserveHistory: true })
      }
      set((current) => {
        const _undoStack = current._undoStack.slice(0, -1)
        const _redoStack = [...current._redoStack, nextEntry].slice(-HISTORY_LIMIT)
        return {
          _undoStack,
          _redoStack,
          canUndo: _undoStack.length > 0,
          canRedo: true,
          layoutDirty: true,
          editorBusy: false,
        }
      })
    } catch (error) {
      set({ editorBusy: false, editorError: editorErrorMessage(error) })
    }
  },

  redo: async () => {
    const state = get()
    const entry = state._redoStack.at(-1)
    if (!entry || state.editorBusy || !state.twin) return
    set({ editorBusy: true, editorError: null, draggingId: null, _dragOrigin: null })
    try {
      let nextEntry: EditorHistoryEntry = entry
      if (entry.kind === 'update-instance') {
        await apiUpdateInstance(entry.instanceId, entry.after)
        set((current) => ({
          twin: patchTwinInstance(current.twin, entry.instanceId, entry.after),
        }))
      } else if (entry.kind === 'update-status') {
        await apiSetStatus(
          entry.instanceId,
          entry.after.status,
          entry.after.status === 'down' ? (entry.after.reasonCode ?? 'OTHER') : undefined,
        )
        await get().pollOps()
      } else if (entry.kind === 'create-instance') {
        const instance = await apiCreateInstance(
          state.twin.site.id,
          instanceCreateBody(entry.instance, entry.parentNodeId),
        )
        nextEntry = { ...entry, instance }
        await get().loadTwin({ preserveHistory: true })
        set({ selectedId: instance.id })
      } else if (entry.kind === 'delete-instance') {
        await apiDeleteInstance(entry.instance.id)
        await get().loadTwin({ preserveHistory: true })
        if (get().selectedId === entry.instance.id) set({ selectedId: null })
      } else if (entry.kind === 'create-zone') {
        const zone = await apiCreateZone(state.twin.site.id, {
          name: entry.zone.name,
          x: entry.zone.x,
          z: entry.zone.z,
          w: entry.zone.w,
          d: entry.zone.d,
          color: entry.zone.color,
        })
        nextEntry = { ...entry, zone }
        await get().loadTwin({ preserveHistory: true })
      } else {
        await apiDeleteZone(entry.zone.id)
        await get().loadTwin({ preserveHistory: true })
      }
      set((current) => {
        const _redoStack = current._redoStack.slice(0, -1)
        const _undoStack = [...current._undoStack, nextEntry].slice(-HISTORY_LIMIT)
        return {
          _undoStack,
          _redoStack,
          canUndo: true,
          canRedo: _redoStack.length > 0,
          layoutDirty: true,
          editorBusy: false,
        }
      })
    } catch (error) {
      set({ editorBusy: false, editorError: editorErrorMessage(error) })
    }
  },

  clearEditorError: () => set({ editorError: null }),

  setZoneDrawMode: (on) =>
    set({ zoneDrawMode: on, placingAssetId: null, zoneDraft: null }),

  setZoneDraft: (draft) => set({ zoneDraft: draft }),

  saveZoneDraft: async (name) => {
    const { twin, zoneDraft, snapEnabled, gridSize, editorBusy } = get()
    if (!twin || !zoneDraft || editorBusy) return
    const x0 = snapCoordinate(zoneDraft.x0, snapEnabled, gridSize)
    const x1 = snapCoordinate(zoneDraft.x1, snapEnabled, gridSize)
    const z0 = snapCoordinate(zoneDraft.z0, snapEnabled, gridSize)
    const z1 = snapCoordinate(zoneDraft.z1, snapEnabled, gridSize)
    const x = (x0 + x1) / 2
    const z = (z0 + z1) / 2
    const w = Math.abs(x1 - x0)
    const d = Math.abs(z1 - z0)
    set({ zoneDraft: null, zoneDrawMode: false })
    if (w < 1 || d < 1 || !name.trim()) return
    set({ editorBusy: true, editorError: null })
    try {
      const zone = await apiCreateZone(twin.site.id, {
        name: name.trim(),
        x,
        z,
        w,
        d,
      })
      await get().loadTwin({ preserveHistory: true })
      const entry: ZoneHistoryEntry = {
        kind: 'create-zone',
        label: `Add zone ${zone.name}`,
        zone,
      }
      set((state) => ({ ...pushedHistory(state, entry), editorBusy: false }))
    } catch (error) {
      set({ editorBusy: false, editorError: editorErrorMessage(error) })
    }
  },

  removeZone: async (id) => {
    const state = get()
    const zone = state.twin?.zones.find((item) => item.id === id)
    if (!zone || state.editorBusy) return
    set({ editorBusy: true, editorError: null })
    try {
      await apiDeleteZone(id)
      await get().loadTwin({ preserveHistory: true })
      const entry: ZoneHistoryEntry = {
        kind: 'delete-zone',
        label: `Delete zone ${zone.name}`,
        zone,
      }
      set((current) => ({ ...pushedHistory(current, entry), editorBusy: false }))
    } catch (error) {
      set({ editorBusy: false, editorError: editorErrorMessage(error) })
    }
  },

  loadLayoutVersions: async () => {
    const twin = get().twin
    if (!twin) return
    try {
      set({ layoutVersions: await fetchLayoutVersions(twin.site.id) })
    } catch (error) {
      set({ editorError: editorErrorMessage(error) })
    }
  },

  saveLayoutVersion: async (label) => {
    const state = get()
    if (!state.twin || state.editorBusy) return
    const cleanLabel = label.trim() || 'Current Layout'
    set({ editorBusy: true, editorError: null })
    try {
      const version = await apiSaveLayoutVersion(state.twin.site.id, cleanLabel)
      await get().loadLayoutVersions()
      set({
        activeLayoutVersionId: version.id,
        lastSavedAt: version.created_at,
        layoutDirty: false,
        editorBusy: false,
      })
    } catch (error) {
      set({ editorBusy: false, editorError: editorErrorMessage(error) })
    }
  },

  restoreLayoutVersion: async (id) => {
    if (get().editorBusy) return
    set({ editorBusy: true, editorError: null })
    try {
      const version = await apiRestoreLayoutVersion(id)
      await get().loadTwin({ preserveHistory: true })
      set({
        selectedId: null,
        activeLayoutVersionId: version.id,
        lastSavedAt: version.created_at,
        layoutDirty: false,
        _undoStack: [],
        _redoStack: [],
        canUndo: false,
        canRedo: false,
        editorBusy: false,
      })
    } catch (error) {
      set({ editorBusy: false, editorError: editorErrorMessage(error) })
    }
  },
}))

/** Category of an instance (via its catalog asset) */
export function categoryOf(twin: TwinDto, inst: AssetInstanceDto): MachineCategory {
  return twin.assets.find((a) => a.id === inst.asset_id)?.category ?? 'robot'
}

/**
 * The line instance a machine serves: a weld/paint robot's hierarchy node hangs
 * under its line node, whose own instance is the line. Used so each robot reads
 * its OWN line's clock + status instead of a single global body line.
 */
export function lineOf(
  twin: TwinDto,
  inst: AssetInstanceDto,
): AssetInstanceDto | undefined {
  const node = twin.nodes.find((n) => n.id === inst.node_id)
  const lineNodeId = node?.parent_id
  if (!lineNodeId) return undefined
  return twin.instances.find((i) => i.node_id === lineNodeId)
}

/** Animation speed multiplier for a status (freezes machines that are down) */
export function statusSpeed(status: MachineStatus): number {
  if (status === 'running') return 1
  if (status === 'warning') return 0.55
  if (status === 'idle') return 0.25
  return 0
}

export function useMachineRuntime(id: string): MachineRuntime | undefined {
  return useFactoryStore((s) => s.machines[id])
}
