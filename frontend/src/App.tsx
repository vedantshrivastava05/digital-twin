import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useParams } from 'react-router-dom'
import { Factory } from './scene/Factory'
import { CameraControls } from './ui/CameraControls'
import { CopilotPanel } from './ui/CopilotPanel'
import { Hud } from './ui/Hud'
import { InfoPanel } from './ui/InfoPanel'
import { MachinePropertiesPanel } from './ui/MachinePropertiesPanel'
import { Minimap } from './ui/Minimap'
import { PinDialog } from './ui/PinDialog'
import { ReconstructionDialog } from './ui/ReconstructionDialog'
import { SaveLayoutDialog } from './ui/SaveLayoutDialog'
import { Sidebar } from './ui/Sidebar'
import { Timeline } from './ui/Timeline'
import { TopToolbar } from './ui/TopToolbar'
import { ZoneDialog } from './ui/ZoneDialog'
import { usePaintQueueSync } from './scene/paintQueue'
import { useFactoryStore } from './store'
import './industrial-workspace.css'

export default function App() {
  const twin = useFactoryStore((s) => s.twin)
  const loadError = useFactoryStore((s) => s.loadError)
  const loadTwin = useFactoryStore((s) => s.loadTwin)
  const editMode = useFactoryStore((s) => s.editMode)
  const { assetId } = useParams()
  const [reconstructionOpen, setReconstructionOpen] = useState(false)
  const [reconstructionFile, setReconstructionFile] = useState<File | null>(null)
  const [saveLayoutOpen, setSaveLayoutOpen] = useState(false)
  const [layoutMapOpen, setLayoutMapOpen] = useState(false)

  // Customer colours come from the order book and drive paint through dispatch.
  usePaintQueueSync()

  useEffect(() => {
    loadTwin()
  }, [loadTwin])

  // QR deep link: /asset/:id selects that machine once the twin is loaded
  useEffect(() => {
    if (!twin || !assetId) return
    if (twin.instances.some((i) => i.id === assetId)) {
      useFactoryStore.getState().select(assetId)
    }
  }, [twin, assetId])

  // Live telemetry over WebSocket + slower REST poll for orders/reconciliation
  useEffect(() => {
    if (!twin) return
    useFactoryStore.getState().connectTelemetry()
    const id = setInterval(() => useFactoryStore.getState().pollOps(), 5000)
    return () => clearInterval(id)
  }, [twin])

  if (loadError) {
    return (
      <div className="app centered">
        <div className="load-card">
          <h2>Cannot reach Factory Memory</h2>
          <p>{loadError}</p>
          <p className="dim">
            Is the backend running? <code>cd backend && .venv/bin/uvicorn app.main:app --port 8000</code>
          </p>
          <button onClick={() => loadTwin()}>Retry</button>
        </div>
      </div>
    )
  }

  if (!twin) {
    return (
      <div className="app centered">
        <div className="load-card">
          <h2>Loading twin…</h2>
          <p className="dim">Fetching site from Factory Memory</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app with-sidebar industrial-shell" data-edit-mode={editMode ? 'true' : 'false'}>
      <Sidebar />
      <div className="viewport">
        <Canvas
          shadows="percentage"
          camera={{ position: [36, 26, 40], fov: 45 }}
          onPointerMissed={() => useFactoryStore.getState().select(null)}
          onCreated={({ gl }) => {
            gl.localClippingEnabled = true
          }}
        >
          <color attach="background" args={['#dde2e9']} />
          <Factory />
        </Canvas>
        <TopToolbar
          onUploadPhoto={(file) => {
            setReconstructionFile(file)
            setReconstructionOpen(true)
          }}
          onGenerateTwin={() => {
            setReconstructionFile(null)
            setReconstructionOpen(true)
          }}
          onSaveLayout={() => setSaveLayoutOpen(true)}
        />
        <Hud />
        {editMode ? <MachinePropertiesPanel /> : <InfoPanel />}
        <CameraControls
          layoutMapOpen={layoutMapOpen}
          onToggleLayoutMap={() => setLayoutMapOpen((open) => !open)}
        />
        {layoutMapOpen ? <Minimap /> : null}
        <Timeline />
        <PinDialog />
        <ZoneDialog />
        <CopilotPanel />
        <ReconstructionDialog
          open={reconstructionOpen}
          initialFile={reconstructionFile}
          onClose={() => {
            setReconstructionOpen(false)
            setReconstructionFile(null)
          }}
        />
        <SaveLayoutDialog
          open={saveLayoutOpen}
          onClose={() => setSaveLayoutOpen(false)}
        />
      </div>
    </div>
  )
}
