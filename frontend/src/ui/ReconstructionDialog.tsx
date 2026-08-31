import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useFactoryStore } from '../store'
import { IndustrialIcon } from './IndustrialIcon'

interface ReconstructionJob {
  id: string
  site_id: string
  original_filename: string
  content_type: string
  size_bytes: number
  width_px: number | null
  height_px: number | null
  status: string
  provider: string
  approximate: boolean
  object_count: number
  error: string | null
}

interface ReconstructionObject {
  id: string
  name: string
  kind: string
  detected_type: string
  asset_id: string | null
  asset_name: string | null
  asset_category: string | null
  confidence: number
  editable: boolean
  dimensions?: Record<string, number> | number[]
  transform?: {
    position?: Record<string, number> | number[]
    rotation?: Record<string, number> | number[]
    scale?: Record<string, number> | number[]
  }
}

interface ReconstructionResult {
  schema_version: string
  approximate: boolean
  accuracy_notice: string
  units: string
  coordinate_system: string
  provider: string
  floor?: Record<string, unknown>
  walls?: unknown[]
  boundaries?: unknown[]
  objects: ReconstructionObject[]
}

interface GenerateResponse {
  job: ReconstructionJob
  result: ReconstructionResult
}

interface ApplyResponse {
  created_instance_ids?: string[]
  instance_ids?: string[]
  created_instances?: unknown[]
  object_count?: number
}

type ReconstructionStep = 'source' | 'analyzing' | 'review' | 'applying' | 'done'

interface ReconstructionDialogProps {
  open: boolean
  initialFile?: File | null
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function percent(value: number): string {
  return `${Math.round((value <= 1 ? value : value / 100) * 100)}%`
}

function dimensionText(value?: Record<string, number> | number[]): string {
  if (!value) return 'Estimated dimensions'
  const vals = Array.isArray(value)
    ? value
    : [value.width, value.height, value.depth].filter((v) => typeof v === 'number')
  if (!vals.length) return 'Estimated dimensions'
  return vals.slice(0, 3).map((v) => `${Number(v).toFixed(1)} m`).join(' × ')
}

export function ReconstructionDialog({
  open,
  initialFile = null,
  onClose,
}: ReconstructionDialogProps) {
  const twin = useFactoryStore((s) => s.twin)
  const loadTwin = useFactoryStore((s) => s.loadTwin)
  const setEditMode = useFactoryStore((s) => s.setEditMode)
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [step, setStep] = useState<ReconstructionStep>('source')
  const [job, setJob] = useState<ReconstructionJob | null>(null)
  const [result, setResult] = useState<ReconstructionResult | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [floorWidth, setFloorWidth] = useState('')
  const [floorDepth, setFloorDepth] = useState('')
  const [maxObjects, setMaxObjects] = useState('40')
  const [analysisHint, setAnalysisHint] = useState('')
  const [layoutLabel, setLayoutLabel] = useState('AI reconstructed layout')
  const [createdCount, setCreatedCount] = useState(0)

  const busy = step === 'analyzing' || step === 'applying'

  const chooseFile = (next: File | null) => {
    if (!next) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) {
      setError('Choose a JPEG, PNG, or WebP factory photograph.')
      return
    }
    setError('')
    setFile(next)
    setStep('source')
    setJob(null)
    setResult(null)
    setCreatedCount(0)
  }

  useEffect(() => {
    if (!open) return
    setError('')
    setStep('source')
    setJob(null)
    setResult(null)
    setCreatedCount(0)
    if (initialFile) chooseFile(initialFile)
    else setFile(null)
    // `initialFile` intentionally controls each newly opened session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile])

  useEffect(() => {
    if (!file) {
      setPreviewUrl('')
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose, open])

  const objectGroups = useMemo(() => {
    const groups = new Map<string, number>()
    for (const object of result?.objects ?? []) {
      const key = object.detected_type || object.kind || 'Factory object'
      groups.set(key, (groups.get(key) ?? 0) + 1)
    }
    return [...groups.entries()].sort((a, b) => b[1] - a[1])
  }, [result])

  const averageConfidence = useMemo(() => {
    const objects = result?.objects ?? []
    if (!objects.length) return 0
    return objects.reduce((sum, object) => sum + object.confidence, 0) / objects.length
  }, [result])

  const structuralCount = useMemo(() => {
    if (!result) return 0
    return (result.floor ? 1 : 0) + (result.walls?.length ?? 0) + (result.boundaries?.length ?? 0)
  }, [result])

  const generate = async () => {
    if (!file || !twin) return
    if (
      (floorWidth && (Number(floorWidth) < 4 || Number(floorWidth) > 500)) ||
      (floorDepth && (Number(floorDepth) < 4 || Number(floorDepth) > 500))
    ) {
      setError('Optional floor dimensions must be between 4 m and 500 m.')
      return
    }
    setError('')
    setStep('analyzing')
    try {
      const form = new FormData()
      form.append('file', file)
      const uploadResponse = await fetch(`/api/sites/${twin.site.id}/reconstructions`, {
        method: 'POST',
        body: form,
      })
      if (!uploadResponse.ok) {
        const message = await uploadResponse.text()
        throw new Error(message || `Photo upload failed (${uploadResponse.status})`)
      }
      const uploaded = (await uploadResponse.json()) as ReconstructionJob
      setJob(uploaded)

      const body: Record<string, unknown> = {}
      if (floorWidth && Number(floorWidth) > 0) body.floor_width_m = Number(floorWidth)
      if (floorDepth && Number(floorDepth) > 0) body.floor_depth_m = Number(floorDepth)
      if (maxObjects && Number(maxObjects) > 0) body.max_objects = Number(maxObjects)
      if (analysisHint.trim()) body.analysis_hint = analysisHint.trim()

      const generateResponse = await fetch(`/api/reconstructions/${uploaded.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!generateResponse.ok) {
        const message = await generateResponse.text()
        throw new Error(message || `Image analysis failed (${generateResponse.status})`)
      }
      const payload = (await generateResponse.json()) as GenerateResponse
      setJob(payload.job)
      setResult(payload.result)
      setStep('review')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStep('source')
    }
  }

  const apply = async () => {
    if (!job) return
    setError('')
    setStep('applying')
    try {
      const response = await fetch(`/api/reconstructions/${job.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replace_previous: false,
          layout_label: layoutLabel.trim() || 'AI reconstructed layout',
        }),
      })
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || `Could not create the editable layout (${response.status})`)
      }
      const payload = (await response.json()) as ApplyResponse
      const count =
        payload.created_instance_ids?.length ??
        payload.instance_ids?.length ??
        payload.created_instances?.length ??
        payload.object_count ??
        result?.objects.length ??
        0
      setCreatedCount(count)
      await loadTwin()
      setEditMode(true)
      setStep('done')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setStep('review')
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    chooseFile(event.dataTransfer.files?.[0] ?? null)
  }

  if (!open) return null

  const activeIndex = step === 'source' ? 0 : step === 'analyzing' ? 1 : step === 'review' ? 2 : 3

  return (
    <div className="reconstruction-backdrop" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !busy) onClose()
    }}>
      <section className="reconstruction-dialog" role="dialog" aria-modal="true" aria-labelledby="reconstruction-title">
        <header className="reconstruction-header">
          <div className="reconstruction-title">
            <span><IndustrialIcon name="scan" size={22} /></span>
            <div>
              <p>AI reconstruction workspace</p>
              <h2 id="reconstruction-title">Photo to editable digital twin</h2>
            </div>
          </div>
          <button className="industrial-close-button" onClick={onClose} disabled={busy} aria-label="Close reconstruction workspace">
            <IndustrialIcon name="close" />
          </button>
        </header>

        <div className="reconstruction-steps" aria-label="Reconstruction progress">
          {[
            ['1', 'Source photo', 'Upload factory imagery'],
            ['2', 'AI analysis', 'Detect objects & depth'],
            ['3', 'Review', 'Validate reconstruction'],
            ['4', 'Create twin', 'Apply editable objects'],
          ].map(([number, label, detail], index) => (
            <div key={label} className={`${index < activeIndex ? 'complete' : ''}${index === activeIndex ? ' active' : ''}`}>
              <span>{index < activeIndex || step === 'done' ? <IndustrialIcon name="check" size={15} /> : number}</span>
              <p><strong>{label}</strong><small>{detail}</small></p>
            </div>
          ))}
        </div>

        <div className="reconstruction-body">
          {step === 'source' && (
            <div className="reconstruction-source-grid">
              <div>
                <input
                  ref={fileInput}
                  className="industrial-visually-hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                />
                {!file ? (
                  <div
                    className={`photo-dropzone${dragging ? ' dragging' : ''}`}
                    onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                  >
                    <span className="photo-dropzone-icon"><IndustrialIcon name="photo" size={30} /></span>
                    <h3>Drop a factory photograph here</h3>
                    <p>Floor areas, machine layouts, production lines, or workshop images</p>
                    <button className="industrial-solid-button" onClick={() => fileInput.current?.click()}>
                      <IndustrialIcon name="upload" size={16} /> Choose photo
                    </button>
                    <small>JPEG, PNG, or WebP · perspective images work best</small>
                  </div>
                ) : (
                  <div className="photo-preview-card">
                    {previewUrl && <img src={previewUrl} alt="Factory source preview" />}
                    <div className="photo-preview-meta">
                      <span><IndustrialIcon name="photo" size={16} /></span>
                      <p><strong>{file.name}</strong><small>{formatBytes(file.size)} · {file.type.replace('image/', '').toUpperCase()}</small></p>
                      <button onClick={() => fileInput.current?.click()}>Replace</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="reconstruction-settings">
                <div className="reconstruction-section-heading">
                  <span>Reconstruction setup</span>
                  <small>Optional calibration</small>
                </div>
                <label>
                  Approximate floor size
                  <div className="reconstruction-inline-fields">
                    <span><input type="number" min="4" max="500" placeholder="Width" value={floorWidth} onChange={(e) => setFloorWidth(e.target.value)} /><i>m</i></span>
                    <b>×</b>
                    <span><input type="number" min="4" max="500" placeholder="Depth" value={floorDepth} onChange={(e) => setFloorDepth(e.target.value)} /><i>m</i></span>
                  </div>
                </label>
                <label>
                  Maximum detected objects
                  <select value={maxObjects} onChange={(e) => setMaxObjects(e.target.value)}>
                    <option value="20">20 objects</option>
                    <option value="40">40 objects</option>
                    <option value="60">60 objects</option>
                    <option value="100">100 objects</option>
                  </select>
                </label>
                <label>
                  Analysis guidance
                  <textarea
                    rows={3}
                    placeholder="Example: prioritize the CNC row and central conveyor"
                    value={analysisHint}
                    onChange={(e) => setAnalysisHint(e.target.value)}
                  />
                </label>
                <div className="reconstruction-notice">
                  <IndustrialIcon name="warning" size={17} />
                  <p><strong>Approximate by design</strong><span>A single photo cannot produce engineering-accurate geometry. You will be able to correct every detected object in Edit Layout mode.</span></p>
                </div>
              </div>
            </div>
          )}

          {step === 'analyzing' && (
            <div className="reconstruction-processing">
              <div className="reconstruction-scanner">
                {previewUrl && <img src={previewUrl} alt="Photo being analyzed" />}
                <i />
                <span><IndustrialIcon name="scan" size={30} /></span>
              </div>
              <div>
                <p className="eyebrow">Computer vision pipeline</p>
                <h3>Building the scene graph…</h3>
                <p>Detecting floors, boundaries, equipment footprints, depth cues, and compatible library assets.</p>
                <ul>
                  <li className="complete"><IndustrialIcon name="check" size={15} /> Image validated and normalized</li>
                  <li className="active"><span /> Segmenting factory objects</li>
                  <li><span /> Estimating scale and transforms</li>
                  <li><span /> Matching editable 3D assets</li>
                </ul>
              </div>
            </div>
          )}

          {(step === 'review' || step === 'applying') && result && (
            <div className="reconstruction-review-grid">
              <div className="reconstruction-review-source">
                <div className="photo-preview-card compact">
                  {previewUrl && <img src={previewUrl} alt="Analyzed factory photograph" />}
                  <span className="reconstruction-overlay-badge"><IndustrialIcon name="scan" size={15} /> {result.objects.length} editable machines</span>
                </div>
                <div className="reconstruction-metrics">
                  <div><span>Machines</span><strong>{result.objects.length}</strong></div>
                  <div><span>Structure</span><strong>{structuralCount}</strong></div>
                  <div><span>Confidence</span><strong>{percent(averageConfidence)}</strong></div>
                  <div><span>Mode</span><strong>Editable</strong></div>
                </div>
                <div className="reconstruction-detected-types">
                  <h4>Detected scene</h4>
                  {result.floor && <span>factory floor <b>1</b></span>}
                  {!!result.walls?.length && <span>walls <b>{result.walls.length}</b></span>}
                  {!!result.boundaries?.length && <span>aisles / boundaries <b>{result.boundaries.length}</b></span>}
                  {objectGroups.slice(0, 8).map(([name, count]) => (
                    <span key={name}>{name.replaceAll('_', ' ')} <b>{count}</b></span>
                  ))}
                </div>
                <label className="reconstruction-layout-label">
                  Layout version name
                  <input value={layoutLabel} onChange={(e) => setLayoutLabel(e.target.value)} />
                </label>
              </div>

              <div className="reconstruction-object-review">
                <div className="reconstruction-section-heading">
                  <span>Reconstructed objects</span>
                  <small>Mapped to separate scene objects</small>
                </div>
                <div className="reconstruction-object-list">
                  {result.objects.map((object, index) => (
                    <div key={object.id || `${object.name}-${index}`} className="reconstruction-object-row">
                      <span className={`object-kind object-kind-${object.asset_category ?? object.kind}`}><IndustrialIcon name="box" size={17} /></span>
                      <p><strong>{object.name}</strong><small>{object.asset_name ?? object.detected_type ?? object.kind} · {dimensionText(object.dimensions)}</small></p>
                      <span className="confidence-chip">{percent(object.confidence)}</span>
                      <span className="editable-chip"><IndustrialIcon name="edit" size={12} /> Editable</span>
                    </div>
                  ))}
                </div>
                <div className="reconstruction-accuracy-note">
                  <IndustrialIcon name="warning" size={17} />
                  <p><strong>Review before operational use</strong><span>{result.accuracy_notice || 'Positions and dimensions are visual estimates from one photograph.'}</span></p>
                </div>
              </div>
              {step === 'applying' && (
                <div className="reconstruction-applying-overlay">
                  <span className="industrial-spinner" />
                  <h3>Creating editable scene objects</h3>
                  <p>Writing machines, transforms, and the layout version to Factory Memory…</p>
                </div>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="reconstruction-complete">
              <span><IndustrialIcon name="check" size={34} /></span>
              <p className="eyebrow">Digital twin created</p>
              <h3>{createdCount} editable objects are ready</h3>
              <p>The generated layout is now open in Edit Layout mode. Drag machines to correct their positions, change types, duplicate equipment, or add assets from the library.</p>
              <div>
                <span><IndustrialIcon name="cursor" size={18} /> Drag to move</span>
                <span><IndustrialIcon name="rotate" size={18} /> Rotate precisely</span>
                <span><IndustrialIcon name="grid" size={18} /> Snap to grid</span>
              </div>
            </div>
          )}

          {error && <div className="reconstruction-error"><IndustrialIcon name="warning" size={17} /><span>{error}</span></div>}
        </div>

        <footer className="reconstruction-footer">
          <p><IndustrialIcon name="grid" size={15} /> Output remains editable in the 3D layout editor</p>
          <div>
            {step === 'source' && <button className="industrial-secondary-button" onClick={onClose}>Cancel</button>}
            {step === 'source' && <button className="industrial-solid-button" disabled={!file} onClick={generate}><IndustrialIcon name="sparkles" size={16} /> Analyze & generate</button>}
            {step === 'review' && <button className="industrial-secondary-button" onClick={() => setStep('source')}>Change source</button>}
            {step === 'review' && <button className="industrial-solid-button" onClick={apply}><IndustrialIcon name="box" size={16} /> Create editable twin</button>}
            {step === 'done' && <button className="industrial-solid-button" onClick={onClose}>Open layout editor <IndustrialIcon name="chevron" size={16} /></button>}
          </div>
        </footer>
      </section>
    </div>
  )
}
