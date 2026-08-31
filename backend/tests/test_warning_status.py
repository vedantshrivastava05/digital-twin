import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Asset, AssetInstance, DowntimeEntry, MachineState, Site
from app.routers.ops import StatusChange, set_status
from app.telemetry import MachineSim


class WarningStatusTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine, expire_on_commit=False)()
        self.db.add(Site(id="site", name="Factory", timezone="UTC"))
        self.db.add(
            Asset(
                id="machine",
                name="Machine",
                category="cnc",
                footprint_w=2,
                footprint_d=2,
                meta={},
            )
        )
        self.db.add(
            AssetInstance(
                id="instance",
                site_id="site",
                asset_id="machine",
                name="Machine 1",
            )
        )
        self.db.add(MachineState(instance_id="instance", status="running"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_warning_is_degraded_operation_not_downtime(self):
        state = set_status(
            "instance", StatusChange(status="warning", note="inspect vibration"), self.db
        )
        self.assertEqual(state.status, "warning")
        self.assertEqual(self.db.query(DowntimeEntry).count(), 0)

        sim = MachineSim("instance", "cnc")
        payload = sim.step("warning")
        self.assertEqual(payload["state"], "warning")
        self.assertGreater(payload["current"], 0)

        with self.assertRaises(HTTPException):
            set_status("instance", StatusChange(status="down"), self.db)
        self.assertEqual(self.db.query(DowntimeEntry).count(), 0)

        set_status(
            "instance",
            StatusChange(status="down", reason_code="BRK-MECH"),
            self.db,
        )
        self.assertEqual(self.db.query(DowntimeEntry).count(), 1)


if __name__ == "__main__":
    unittest.main()
