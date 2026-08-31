from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .routers import (
    brain,
    copilot,
    documents,
    live,
    maintenance,
    ops,
    orders,
    reconstruction,
    twin,
)
from .routers.brain import seed_brain_spares
from .seed import ensure_catalog, seed_if_empty
from .telemetry import plant, seed_alert_rules, seed_tag_mappings


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        if seed_if_empty(db):
            ops.generate_demo_data(days=7, db=db)
            print("Factory Memory seeded with demo site + 7 days of ops history")
        else:
            ensure_catalog(db)
    seed_tag_mappings()
    seed_alert_rules()
    seed_brain_spares()
    plant.ensure_started()
    yield


app = FastAPI(title="AI Factory Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(twin.router, prefix="/api", tags=["twin"])
app.include_router(documents.router, prefix="/api", tags=["documents"])
app.include_router(ops.router, prefix="/api", tags=["ops"])
app.include_router(orders.router, prefix="/api", tags=["orders"])
app.include_router(maintenance.router, prefix="/api", tags=["maintenance"])
app.include_router(live.router, prefix="/api", tags=["live"])
app.include_router(live.ws_router, tags=["ws"])  # /ws/telemetry
app.include_router(brain.router, prefix="/api", tags=["brain"])
app.include_router(copilot.router, prefix="/api", tags=["copilot"])
app.include_router(reconstruction.router, prefix="/api", tags=["reconstruction"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
