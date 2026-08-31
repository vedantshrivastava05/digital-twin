import asyncio
import io
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    Asset,
    DowntimeEntry,
    HierarchyNode,
    MachineState,
    Site,
)
from app.reconstruction.media import inspect_image, safe_display_filename
from app.reconstruction.schemas import (
    ReconstructionApplyRequest,
    ReconstructionGenerateRequest,
)
from app.routers import reconstruction as routes


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    checksum = zlib.crc32(kind)
    checksum = zlib.crc32(payload, checksum) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)


def make_png(width: int = 320, height: int = 200) -> bytes:
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            block = ((x // 40) + (y // 35)) % 2
            row.extend((55 + block * 120, 75 + block * 55, 90 + block * 20))
        rows.append(bytes(row))
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(b"".join(rows)))
        + _png_chunk(b"IEND", b"")
    )


class ReconstructionWorkflowTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine, expire_on_commit=False)()
        self.db.add(Site(id="test-site", name="Test Factory", timezone="UTC"))
        self.db.add(
            HierarchyNode(
                id="test-line",
                site_id="test-site",
                parent_id=None,
                name="Photo reconstruction",
                level="line",
                sort_order=1,
            )
        )
        assets = (
            ("cnc", "CNC mill", "cnc", 3.0, 2.6),
            ("robot", "Weld robot", "robot", 2.4, 2.4),
            ("conv", "Belt conveyor", "conveyor", 5.0, 1.5),
            ("station", "Assembly station", "marriage", 4.0, 3.0),
            ("rack", "Pallet rack", "rack", 4.0, 1.3),
            ("qc", "Inspection gate", "qcgate", 3.0, 2.0),
        )
        for asset_id, name, category, width, depth in assets:
            self.db.add(
                Asset(
                    id=asset_id,
                    name=name,
                    category=category,
                    footprint_w=width,
                    footprint_d=depth,
                    meta={},
                )
            )
        self.db.commit()
        self.tempdir = tempfile.TemporaryDirectory()
        self.original_upload_dir = routes.UPLOAD_DIR
        routes.UPLOAD_DIR = Path(self.tempdir.name)

    def tearDown(self):
        routes.UPLOAD_DIR = self.original_upload_dir
        self.db.close()
        self.tempdir.cleanup()

    def test_upload_generate_apply_is_editable_and_idempotent(self):
        upload = UploadFile(
            filename="../../Factory Floor.PNG",
            file=io.BytesIO(make_png()),
        )
        job = asyncio.run(
            routes.upload_reconstruction_source(
                "test-site",
                upload,
                source_kind="photo",
                provider="local-heuristic-photo-v1",
                db=self.db,
            )
        )
        self.assertEqual(job.status, "uploaded")
        self.assertEqual(job.original_filename, "Factory Floor.png")
        self.assertNotIn("..", job.stored_filename)

        envelope = routes.generate_reconstruction(
            job.id,
            ReconstructionGenerateRequest(max_objects=8),
            db=self.db,
        )
        result = envelope.result
        self.assertTrue(result["approximate"])
        self.assertFalse(result["engineering_accurate"])
        self.assertGreaterEqual(len(result["objects"]), 6)
        self.assertEqual(len(result["walls"]), 4)
        self.assertTrue(all(item["editable"] for item in result["objects"]))
        self.assertTrue(all(item["asset_id"] for item in result["objects"]))

        applied = routes.apply_reconstruction(
            job.id,
            ReconstructionApplyRequest(
                parent_node_id="test-line", layout_label="AI proposal"
            ),
            db=self.db,
        )
        self.assertEqual(len(applied.instances), len(result["objects"]))
        self.assertTrue(applied.zone)
        self.assertTrue(applied.layout_version)
        self.assertEqual({item.source for item in applied.instances}, {"ai_reconstruction"})
        states = (
            self.db.query(MachineState)
            .filter(MachineState.instance_id.in_(applied.created_instance_ids))
            .all()
        )
        self.assertEqual({state.status for state in states}, {"idle"})

        second = routes.apply_reconstruction(job.id, None, db=self.db)
        self.assertEqual(set(second.created_instance_ids), set(applied.created_instance_ids))

    def test_image_header_and_display_filename(self):
        info = inspect_image(make_png(128, 96))
        self.assertEqual((info.width, info.height), (128, 96))
        self.assertEqual(info.content_type, "image/png")
        self.assertEqual(safe_display_filename("..\\bad/<name>.jpg", "png"), "name.png")


if __name__ == "__main__":
    unittest.main()
