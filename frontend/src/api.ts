import type {
  AnnotationDto,
  AssetInstanceDto,
  ComponentDto,
  DashboardDto,
  DocumentDto,
  DocumentSearchHitDto,
  DowntimeEntryDto,
  FramesDto,
  HeatmapDto,
  LabelDto,
  LayoutVersionDto,
  MachineStateDto,
  MachineStatus,
  MorningReportDto,
  OeeDto,
  OeePointDto,
  OrderDto,
  OrderStatus,
  PositionsDto,
  ProductDto,
  ProductionLogDto,
  ReasonCodeDto,
  SiteDto,
  TelemetryHistoryDto,
  TracksDto,
  TwinDto,
  ZoneDto,
} from './types'

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`)
  return res.json() as Promise<T>
}

async function send<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`)
  return (res.status === 204 ? undefined : res.json()) as Promise<T>
}

export async function fetchTwin(): Promise<TwinDto> {
  const sites = await get<SiteDto[]>('/api/sites')
  if (sites.length === 0) throw new Error('no sites in Factory Memory')
  return get<TwinDto>(`/api/sites/${sites[0].id}/twin`)
}

export function fetchAnnotations(siteId: string): Promise<AnnotationDto[]> {
  return get(`/api/sites/${siteId}/annotations`)
}

export function createAnnotation(
  siteId: string,
  body: { x: number; y: number; z: number; text: string; instance_id?: string | null },
): Promise<AnnotationDto> {
  return send('POST', `/api/sites/${siteId}/annotations`, body)
}

export function deleteAnnotation(id: string): Promise<void> {
  return send('DELETE', `/api/annotations/${id}`)
}

// ---------- Manual builder ----------

export function apiCreateInstance(
  siteId: string,
  body: {
    asset_id: string
    name: string
    x: number
    y?: number
    z: number
    rotation_y?: number
    node_id?: string | null
    parent_node_id?: string
    source?: string
  },
): Promise<AssetInstanceDto> {
  return send('POST', `/api/sites/${siteId}/instances`, body)
}

export function apiUpdateInstance(
  id: string,
  body: Partial<
    Pick<
      AssetInstanceDto,
      'asset_id' | 'name' | 'node_id' | 'x' | 'y' | 'z' | 'rotation_y'
    >
  >,
): Promise<AssetInstanceDto> {
  return send('PATCH', `/api/instances/${id}`, body)
}

export function apiDeleteInstance(id: string): Promise<void> {
  return send('DELETE', `/api/instances/${id}`)
}

export function apiCreateZone(
  siteId: string,
  body: { name: string; x: number; z: number; w: number; d: number; color?: string },
): Promise<ZoneDto> {
  return send('POST', `/api/sites/${siteId}/zones`, body)
}

export function apiDeleteZone(id: string): Promise<void> {
  return send('DELETE', `/api/zones/${id}`)
}

export function fetchLayoutVersions(siteId: string): Promise<LayoutVersionDto[]> {
  return get(`/api/sites/${siteId}/layout-versions`)
}

export function apiSaveLayoutVersion(
  siteId: string,
  label: string,
): Promise<LayoutVersionDto> {
  return send('POST', `/api/sites/${siteId}/layout-versions`, { label })
}

export function apiRestoreLayoutVersion(versionId: string): Promise<LayoutVersionDto> {
  return send('POST', `/api/layout-versions/${versionId}/restore`)
}

// ---------- Documents & components ----------

export function fetchDocuments(instanceId: string): Promise<DocumentDto[]> {
  return get(`/api/instances/${instanceId}/documents`)
}

export async function apiUploadDocument(
  instanceId: string,
  file: File,
): Promise<DocumentDto> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/instances/${instanceId}/documents`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`upload failed: ${res.status}`)
  return res.json()
}

export function apiDeleteDocument(id: string): Promise<void> {
  return send('DELETE', `/api/documents/${id}`)
}

export function searchDocuments(
  siteId: string,
  q: string,
): Promise<DocumentSearchHitDto[]> {
  return get(`/api/sites/${siteId}/documents/search?q=${encodeURIComponent(q)}`)
}

export function fetchComponents(instanceId: string): Promise<ComponentDto[]> {
  return get(`/api/instances/${instanceId}/components`)
}

export function apiCreateComponent(
  instanceId: string,
  body: { name: string; note?: string; parent_id?: string | null },
): Promise<ComponentDto> {
  return send('POST', `/api/instances/${instanceId}/components`, body)
}

export function apiDeleteComponent(id: string): Promise<void> {
  return send('DELETE', `/api/components/${id}`)
}

export function fetchLabels(siteId: string): Promise<LabelDto[]> {
  return get(`/api/sites/${siteId}/labels`)
}

// ---------- Ops Lite ----------

export function fetchOpsState(): Promise<MachineStateDto[]> {
  return get('/api/ops/state')
}

export function fetchReasonCodes(): Promise<ReasonCodeDto[]> {
  return get('/api/ops/reason-codes')
}

export function apiSetStatus(
  instanceId: string,
  status: MachineStatus,
  reasonCode?: string,
  note?: string,
): Promise<MachineStateDto> {
  return send('POST', `/api/ops/machines/${instanceId}/status`, {
    status,
    reason_code: reasonCode ?? null,
    note: note ?? '',
  })
}

export function apiLogProduction(
  instanceId: string,
  good: number,
  reject: number,
  orderId?: string,
): Promise<ProductionLogDto> {
  return send('POST', `/api/ops/machines/${instanceId}/production`, {
    good,
    reject,
    order_id: orderId ?? null,
  })
}

export function fetchOee(instanceId: string, hours = 24): Promise<OeeDto> {
  return get(`/api/ops/machines/${instanceId}/oee?hours=${hours}`)
}

export function fetchDowntime(instanceId: string): Promise<DowntimeEntryDto[]> {
  return get(`/api/ops/machines/${instanceId}/downtime`)
}

export function fetchMorningReport(date?: string): Promise<MorningReportDto> {
  return get(`/api/ops/morning-report${date ? `?date=${date}` : ''}`)
}

// ---------- Factory Ops v1 ----------

export function fetchProducts(): Promise<ProductDto[]> {
  return get('/api/products')
}

export function apiCreateProduct(body: {
  sku: string
  name: string
  uom?: string
}): Promise<ProductDto> {
  return send('POST', '/api/products', body)
}

export function fetchOrders(): Promise<OrderDto[]> {
  return get('/api/orders')
}

export function apiCreateOrder(body: {
  product_id: string
  qty: number
  machine_id?: string | null
  due_date?: string | null
}): Promise<OrderDto> {
  return send('POST', '/api/orders', body)
}

export function apiUpdateOrder(
  id: string,
  body: Partial<{
    status: OrderStatus
    machine_id: string | null
    due_date: string | null
    qty: number
  }>,
): Promise<OrderDto> {
  return send('PATCH', `/api/orders/${id}`, body)
}

export async function apiImportOrdersCsv(
  file: File,
): Promise<{ created: number; errors: string[] }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/orders/import-csv', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`import failed: ${res.status}`)
  return res.json()
}

export function fetchDashboard(): Promise<DashboardDto> {
  return get('/api/ops/dashboard')
}

// ---------- RTLS / logistics ----------

export function fetchPositions(): Promise<PositionsDto> {
  return get('/api/live/positions')
}

export function fetchTracks(minutes = 15, kind?: string): Promise<TracksDto> {
  return get(
    `/api/logistics/tracks?minutes=${minutes}${kind ? `&kind=${kind}` : ''}`,
  )
}

export function fetchHeatmap(minutes = 30, cell = 4): Promise<HeatmapDto> {
  return get(`/api/logistics/heatmap?minutes=${minutes}&cell=${cell}`)
}

export function fetchFrames(minutes = 15): Promise<FramesDto> {
  return get(`/api/logistics/frames?minutes=${minutes}`)
}

export function fetchOeeSeries(
  instanceId: string,
  hours = 24,
  buckets = 24,
): Promise<OeePointDto[]> {
  return get(
    `/api/ops/machines/${instanceId}/oee-series?hours=${hours}&buckets=${buckets}`,
  )
}

export function fetchTelemetryHistory(
  instanceId: string,
): Promise<TelemetryHistoryDto> {
  return get(`/api/telemetry/history/${instanceId}`)
}
