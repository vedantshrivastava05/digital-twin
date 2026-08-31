# AI Factory Platform

AI Factory Platform is a full-stack industrial digital-twin prototype. It combines an interactive 3D automotive factory, an editable layout builder, photo-to-layout reconstruction, factory operations, simulated live telemetry, maintenance, quality, and rule-based diagnostics around one persistent Factory Memory database.

Its primary workflow is:

```text
Upload factory photo
  → validate and inspect the image
  → generate an approximate scene proposal
  → match proposals to the machine catalog
  → review confidence and dimensions
  → create separate editable factory objects
  → move, rotate, rename, retype, duplicate, or delete machines
  → save and restore layout versions
```

## Accuracy boundary

Single-photo reconstruction is visually approximate and non-metric. A photograph does not provide reliable hidden geometry, absolute scale, safety clearances, or unambiguous machine identity.

The generated result must not be treated as engineering, construction, compliance, or safety evidence. Users must review and correct dimensions, depth, object type, machine position, aisles, and boundaries before operational use.

The current local provider is a coarse computer-vision prototype, not a trained semantic vision model and not photogrammetry. It uses image features, perspective assumptions, and rule-based matching against the existing asset catalog. No external AI service or API key is required.

## Technology stack

- `frontend/`: React 19, TypeScript, Vite, Three.js, React Three Fiber, React Three Drei, Zustand, and React Router.
- `backend/`: Python 3.12, FastAPI, SQLAlchemy, Pydantic, Pillow, Uvicorn, and SQLite.
- Live data: FastAPI WebSockets plus an asyncio virtual plant that emits machine telemetry every two seconds.
- Persistence: `backend/factory.db` stores the factory hierarchy, asset catalog, placed instances, operations data, layout versions, and reconstruction jobs/results.
- Uploaded reconstruction sources: `backend/uploads/reconstructions/`.

During development, Vite serves the frontend on port 5173 and proxies `/api` and `/ws` to FastAPI on port 8000.

## Photo-to-editable-digital-twin workflow

From the main viewer, choose **Upload Photo** or **Generate Digital Twin**.

1. Select or drop a JPEG, PNG, or WebP factory photograph.
2. Optionally enter an approximate floor width/depth, maximum object count, and analysis guidance.
3. The backend validates the real file signature, dimensions, pixel count, and size before storing it under a generated filename.
4. The local reconstruction provider extracts coarse visual cues, estimates a floor footprint and perspective positions, and proposes common factory object types.
5. Each proposal is matched to an existing asset catalog entry such as a CNC machine, robot, conveyor, assembly station, rack, or inspection workstation.
6. The review screen shows the separate objects, estimated dimensions, match confidence, and the non-engineering warning.
7. **Create editable twin** applies the proposal to Factory Memory and opens Edit Layout mode.

The provider result is a scene graph rather than one baked model. It contains:

- An editable floor proposal.
- Four estimated boundary-wall objects.
- A usable-floor perimeter and proposed walkway metadata.
- Separate machine proposals with normalized image bounding boxes.
- Catalog asset IDs, categories, confidence values, and review metadata.
- Individual position, rotation, scale, and dimensions for every proposed machine.
- Suggested camera placement and explicit coordinate-system/units metadata.

Applying a result currently materializes catalog-matched machines as ordinary `AssetInstance` records, creates idle machine states and hierarchy nodes, adds an estimated floor zone, and optionally saves a layout version. Wall and boundary proposals remain in the persisted reconstruction result for later structural rendering/editing work. Applying is explicit: uploading or generating a preview does not replace the current factory layout.

### Upload safeguards

- Accepted now: JPEG, PNG, and WebP photos.
- Maximum upload size: 20 MB.
- Minimum dimensions: 64 × 64 pixels.
- Maximum dimension: 16,384 pixels; maximum total size: 50 million pixels.
- The backend trusts the detected file signature, not the browser-provided filename or MIME type.
- Original names are sanitized; stored names are generated IDs.
- Pillow verifies that supported files can be decoded before reconstruction.

## Current 3D editor capabilities

The main viewer supports separate **View** and **Edit Layout** modes.

In View mode:

- Orbit, pan, and zoom around the factory campus.
- Switch between top, front, isometric, reset, and first-person walkthrough views.
- Select a machine directly in 3D or through the left-side ISA-95 hierarchy.
- Focus the camera automatically when a machine or hierarchy entry is selected.
- Inspect machine ID, name, catalog type, status, source, position, rotation, telemetry, and related operational information.
- Search the hierarchy and toggle scene layers.

In Edit Layout mode:

- Drag machines on the factory floor.
- Edit X, Y, and Z coordinates and Y rotation precisely.
- Enable/disable floor snapping and choose the grid increment.
- Rename a machine or change its catalog type.
- Add assets from the machine library.
- Duplicate or delete machines.
- Draw and remove floor zones.
- Undo and redo layout mutations, including keyboard shortcuts.
- Save an immutable named layout version and restore an older version.

Machine status supports `running`, `idle`, `warning`, and `down`. `warning` is simulated as degraded-but-operating and does not create downtime. A transition to `down` requires a reason code and creates a downtime entry.

## Reconstruction API

All endpoints are under `/api`.

- `GET /reconstruction/capabilities` returns installed providers, current input limits, accuracy notice, and planned input families.
- `POST /sites/{site_id}/reconstructions` accepts multipart field `file`, with optional `source_kind` and `provider`, then returns a persisted upload job.
- `GET /sites/{site_id}/reconstructions` lists reconstruction history. Optional query parameters are `status` and `limit`.
- `GET /reconstructions/{job_id}` returns job status and metadata for polling.
- `GET /reconstructions/{job_id}/source` returns the validated source image inline.
- `POST /reconstructions/{job_id}/generate` runs the selected provider and returns `{ "job": ..., "result": ... }`.
- `GET /reconstructions/{job_id}/result` returns the persisted result after generation.
- `POST /reconstructions/{job_id}/apply` creates normal editable twin objects from a completed result.

Generation accepts an optional JSON body:

```json
{
  "floor_width_m": 54,
  "floor_depth_m": 34,
  "max_objects": 40,
  "analysis_hint": "Prioritize the CNC row and central conveyor"
}
```

Apply accepts:

```json
{
  "parent_node_id": null,
  "replace_previous": false,
  "layout_label": "Proposed Layout"
}
```

`replace_previous` only replaces objects previously applied by that reconstruction job; it does not wipe the whole site. Repeating apply without replacement is idempotent.

Typical job states are `uploaded`, `processing`, `completed`, `failed`, and `applied`. Every single-photo result returns `approximate: true` and `engineering_accurate: false`.

## Modular reconstruction architecture

Reconstruction is isolated from the viewer and factory operations code:

- `backend/app/reconstruction/contracts.py` defines provider input, catalog, options, and provider protocol contracts.
- `backend/app/reconstruction/service.py` owns provider registration and capability discovery.
- `backend/app/reconstruction/providers/heuristic_photo.py` implements the current local photo provider.
- `backend/app/reconstruction/media.py` owns signature inspection, image validation, and safe display filenames.
- `backend/app/routers/reconstruction.py` owns upload, job, result, source, history, generation, and apply APIs.
- `ReconstructionJob.input_manifest` and the provider-neutral JSON result preserve source/result history independently of editable `AssetInstance` records.

A future provider can be implemented and registered without changing the 3D editor or Factory Memory instance model. The intended accuracy roadmap is:

- Multiple overlapping photos for better coverage and scale constraints.
- Factory video with frame selection, tracking, and multi-view reconstruction.
- LiDAR/point clouds for metric floor, wall, and clearance geometry.
- CAD/BIM/layout imports for authoritative dimensions and object placement.
- Learned detection/depth providers or hosted vision services behind the same provider contract.

These input paths are architectural extension points; only single-photo JPEG/PNG/WebP reconstruction is implemented today.

## Run locally

Requirements:

- Python 3.12
- Node.js 20.19+ or 22.12+ and npm (the requirement declared by Vite 8)

Start the backend from the repository root:

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

On Windows PowerShell, use `.venv\Scripts\python` in place of `.venv/bin/python`.

Start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

- Application: [http://localhost:5173](http://localhost:5173)
- FastAPI documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- Backend health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

The first backend start creates missing tables and seeds the automotive demo campus plus operational history. Existing databases are preserved; new reconstruction tables are added by SQLAlchemy metadata creation.

## Verify and test

Run backend tests from the repository root after installing backend dependencies:

```bash
PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests -v
```

The focused suite covers secure image handling, upload → generation → apply, separate editable proposals, catalog matching, layout-version creation, apply idempotency, and warning status behavior without downtime.

Compile the backend and validate imports:

```bash
backend/.venv/bin/python -m compileall -q backend/app
```

Type-check and build the frontend:

```bash
cd frontend
npm run build
```

## Other platform capabilities

- Factory Memory using an ISA-95-style `Site → Building → Area → Production Line → Machine` hierarchy.
- Procedural multi-building automotive 3D campus and broad machine library.
- Asset documents, component trees, search, QR labels, and `/asset/:id` deep links.
- Products, production orders, CSV import, operator UI, owner dashboard, morning reports, output trends, OEE, and downtime Pareto.
- Shift handovers, defect/scrap logging, work orders, PM schedules, spare parts, and notifications.
- Simulated PLC telemetry for state, temperature, current, cycles, and energy over WebSocket.
- Tag mapping, alert rules, alarm acknowledgement, machine Gantt history, RTLS movement, heatmaps, and replay.
- Health scoring, anomaly detection, fault-tree diagnosis, risk-ranked maintenance, and predicted-versus-actual tracking.
- Deterministic Factory Memory copilot and discrete-event production what-if simulation; neither requires an LLM key.

## Demo reset and limitations

- One robot (`robot-s5r`) develops a simulated bearing-heating fault for the Factory Brain demo.
- Two robots begin with selected unmapped tags for the Tag Mapper workflow.
- Deleting `backend/factory.db` permanently removes local Factory Memory data; the next backend start creates and reseeds it.
- Uploaded source files are local prototype storage, not a production object store.
- The prototype has no authentication/authorization, production database migrations, real PLC/SCADA connection, or high-accuracy reconstruction provider yet.
