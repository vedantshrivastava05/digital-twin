import { useRef } from 'react'
import { useFactoryStore } from '../store'
import { IndustrialIcon } from './IndustrialIcon'

interface TopToolbarProps {
  onUploadPhoto: (file: File) => void
  onGenerateTwin: () => void
  onSaveLayout: () => void
}

export function TopToolbar({
  onUploadPhoto,
  onGenerateTwin,
  onSaveLayout,
}: TopToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const siteName = useFactoryStore((s) => s.twin?.site.name ?? 'Factory site')
  const editMode = useFactoryStore((s) => s.editMode)
  const setEditMode = useFactoryStore((s) => s.setEditMode)
  const canUndo = useFactoryStore((s) => s.canUndo)
  const canRedo = useFactoryStore((s) => s.canRedo)
  const undo = useFactoryStore((s) => s.undo)
  const redo = useFactoryStore((s) => s.redo)
  const busy = useFactoryStore((s) => s.editorBusy)
  const wsConnected = useFactoryStore((s) => s.wsConnected)

  return (
    <header className="industrial-toolbar" aria-label="Digital twin workspace toolbar">
      <input
        ref={fileInput}
        className="industrial-visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onUploadPhoto(file)
          event.currentTarget.value = ''
        }}
      />

      <div className="industrial-toolbar-context">
        <span className="industrial-workspace-mark"><IndustrialIcon name="cube" size={17} /></span>
        <div>
          <strong>{siteName}</strong>
          <span><i className={wsConnected ? 'is-live' : ''} />{wsConnected ? 'Live twin' : 'Connecting'}</span>
        </div>
      </div>

      <div className="industrial-toolbar-actions">
        <button
          className="industrial-action industrial-upload-action"
          onClick={() => fileInput.current?.click()}
          title="Upload a factory floor photo"
        >
          <IndustrialIcon name="upload" />
          <span>Upload photo</span>
        </button>
        <button
          className="industrial-action industrial-action-primary"
          onClick={onGenerateTwin}
          title="Create an editable twin from a photo"
        >
          <IndustrialIcon name="sparkles" />
          <span>Generate digital twin</span>
        </button>

        <span className="industrial-toolbar-separator" />

        <div className="industrial-mode-switch" role="group" aria-label="Workspace mode">
          <button
            className={!editMode ? 'active' : ''}
            onClick={() => setEditMode(false)}
            aria-pressed={!editMode}
          >
            <IndustrialIcon name="eye" size={16} />
            <span>View</span>
          </button>
          <button
            className={editMode ? 'active' : ''}
            onClick={() => setEditMode(true)}
            aria-pressed={editMode}
          >
            <IndustrialIcon name="edit" size={16} />
            <span>Edit layout</span>
          </button>
        </div>

        <button
          className="industrial-action"
          onClick={onSaveLayout}
          disabled={busy}
          title="Save this layout as a restorable version"
        >
          <IndustrialIcon name="save" />
          <span>Save layout</span>
        </button>

        <div className="industrial-icon-group" role="group" aria-label="Layout history">
          <button onClick={undo} disabled={!canUndo || busy} title="Undo last layout change">
            <IndustrialIcon name="undo" />
          </button>
          <button onClick={redo} disabled={!canRedo || busy} title="Redo layout change">
            <IndustrialIcon name="redo" />
          </button>
        </div>
      </div>
    </header>
  )
}
