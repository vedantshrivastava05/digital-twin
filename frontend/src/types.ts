export type MachineCategory =
  | 'robot'
  | 'bodyline'
  | 'trimline'
  | 'press'
  | 'cnc'
  | 'conveyor'
  | 'rack'
  | 'tank'
  | 'panel'
  // campus shop families
  | 'stamping'
  | 'diptank'
  | 'paintrobot'
  | 'oven'
  | 'cncmill'
  | 'asrs'
  | 'agv'
  | 'forklift'
  | 'paintline'
  | 'inboundrail'
  | 'blanking'
  | 'transferrobot'
  | 'diecrane'
  | 'panelrack'
  | 'scrapconv'
  | 'coilcrane'
  | 'galine'
  | 'marriage'
  | 'qcgate'
  | 'framing'
  | 'framecell'
  // general-assembly fitment stations
  | 'doorline'
  | 'wheelstn'
  | 'glassstn'
  | 'seatstn'
  | 'fluidfill'
  // final check / inspection shop
  | 'rollertest'
  | 'lampaim'
  | 'inspectpit'
  | 'lighttunnel'
  | 'showertest'
/** Operational state shown consistently in the 3D scene and editor. */
export type MachineStatus = 'running' | 'idle' | 'warning' | 'down'

export interface SiteDto {
  id: string
  name: string
  timezone: string
}

export interface HierarchyNodeDto {
  id: string
  site_id: string
  parent_id: string | null
  name: string
  level: 'site' | 'building' | 'area' | 'line' | 'machine'
  sort_order: number
  /** Placement/geometry for building nodes (footprint, doors, shopType). */
  meta?: Record<string, unknown> | null
}

export interface AssetDto {
  id: string
  name: string
  category: MachineCategory
  footprint_w: number
  footprint_d: number
  meta: Record<string, unknown>
}

export interface AssetInstanceDto {
  id: string
  site_id: string
  asset_id: string
  node_id: string | null
  name: string
  x: number
  y: number
  z: number
  rotation_y: number
  source: string
}

export interface ZoneDto {
  id: string
  site_id: string
  name: string
  x: number
  z: number
  w: number
  d: number
  color: string
}

export interface LayoutVersionDto {
  id: string
  site_id: string
  label: string
  created_at: string
}

export interface TwinDto {
  site: SiteDto
  nodes: HierarchyNodeDto[]
  assets: AssetDto[]
  instances: AssetInstanceDto[]
  zones: ZoneDto[]
}

export interface DocumentDto {
  id: string
  site_id: string
  instance_id: string
  filename: string
  content_type: string
  size: number
  uploaded_at: string
}

export interface DocumentSearchHitDto {
  document: DocumentDto
  instance_id: string
  instance_name: string
  snippet: string | null
}

export interface ComponentDto {
  id: string
  instance_id: string
  parent_id: string | null
  name: string
  note: string
}

export interface LabelDto {
  id: string
  name: string
  asset_name: string
  category: string
}

export interface MachineStateDto {
  instance_id: string
  status: MachineStatus
  since: string
  reason_code: string | null
  note: string
}

export interface ReasonCodeDto {
  code: string
  label: string
}

export interface DowntimeEntryDto {
  id: string
  instance_id: string
  reason_code: string
  note: string
  started_at: string
  ended_at: string | null
}

export interface ProductionLogDto {
  id: string
  instance_id: string
  shift_date: string
  shift: string
  good: number
  reject: number
  order_id: string | null
  logged_at: string
}

export interface OeeDto {
  instance_id: string
  window_hours: number
  availability: number
  performance: number
  quality: number
  oee: number
  good: number
  reject: number
  downtime_minutes: number
}

export interface ProductDto {
  id: string
  sku: string
  name: string
  uom: string
}

export type OrderStatus = 'queued' | 'running' | 'qc' | 'done'

export interface OrderDto {
  id: string
  product_id: string
  product_sku: string
  product_name: string
  qty: number
  produced: number
  status: OrderStatus
  machine_id: string | null
  machine_name: string | null
  due_date: string | null
  /** Customer paint spec this order is built in (hex + marketing name). */
  color: string | null
  color_name: string | null
  created_at: string
  late: boolean
}

export interface ParetoRowDto {
  reason_code: string
  reason: string
  minutes: number
}

export interface DashboardDto {
  date: string
  good_today: number
  reject_today: number
  machines_total: number
  machines_down: {
    instance_id: string
    name: string
    reason_code: string | null
    reason: string | null
    since: string
  }[]
  late_orders: OrderDto[]
  order_counts: Record<OrderStatus, number>
  trend: { date: string; good: number; reject: number }[]
  pareto: ParetoRowDto[]
}

export interface MorningReportDto {
  date: string
  total_good: number
  total_reject: number
  downtime_minutes: number
  plant_availability: number
  plant_quality: number
  machines: { instance_id: string; name: string; good: number; reject: number }[]
  top_reasons: { reason_code: string; reason: string; minutes: number }[]
  downtime_per_machine: { instance_id: string; name: string; minutes: number }[]
  machines_down_now: {
    instance_id: string
    name: string
    reason_code: string | null
    reason: string | null
    since: string
  }[]
}

export interface AnnotationDto {
  id: string
  site_id: string
  instance_id: string | null
  x: number
  y: number
  z: number
  text: string
  author: string
  created_at: string
}

// ---------- RTLS / logistics ----------

export type TagKind = 'forklift' | 'agv' | 'tugger' | 'operator'

export interface TrackTagDto {
  id: string
  kind: TagKind
  name: string
  x: number
  z: number
  online: boolean
}

export interface PositionsDto {
  tags: TrackTagDto[]
  online: number
  total: number
}

export interface TrackDto {
  id: string
  kind: TagKind
  name: string
  points: [number, number][]
}

export interface TracksDto {
  tracks: TrackDto[]
}

export interface HeatCellDto {
  c: number
  r: number
  v: number
}

export interface HeatmapDto {
  cell: number
  minX: number
  minZ: number
  cols: number
  rows: number
  max: number
  cells: HeatCellDto[]
}

export interface FrameTagDto {
  id: string
  kind: TagKind
  x: number
  z: number
  online: boolean
}

export interface FrameDto {
  ts: string
  tags: FrameTagDto[]
}

export interface FramesDto {
  frames: FrameDto[]
}

export interface OeePointDto {
  t: string
  oee: number
  availability: number
  performance: number
  quality: number
  good: number
  reject: number
}

export type TelemetryHistoryDto = Record<string, { ts: string; value: number }[]>
