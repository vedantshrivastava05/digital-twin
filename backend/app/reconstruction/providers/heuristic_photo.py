from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

from ..contracts import (
    CatalogAsset,
    ReconstructionInput,
    ReconstructionOptions,
)


@dataclass(frozen=True)
class _VisualCue:
    x: float
    y: float
    w: float
    h: float
    edge: float
    variance: float
    saturation: float
    score: float


class HeuristicPhotoProvider:
    """Local CV prototype that proposes editable primitives from a single image.

    This deliberately does not claim metric accuracy or semantic certainty. It uses
    coarse local visual features and perspective assumptions, then matches the
    proposals to the existing machine catalog. The provider boundary lets a learned
    detector/depth model replace it later without changing the API or twin editor.
    """

    name = "local-heuristic-photo-v1"
    supported_source_kinds = frozenset({"photo"})

    _semantic_cycle = (
        "cnc_machine",
        "robot_cell",
        "conveyor",
        "assembly_station",
        "storage_rack",
        "workstation",
    )

    _catalog_terms = {
        "cnc_machine": ("cnc", "mill", "machining"),
        "robot_cell": ("robot", "paintrobot", "transferrobot", "weld"),
        "conveyor": ("conveyor", "conv", "line", "monorail"),
        "assembly_station": (
            "assembly",
            "station",
            "marriage",
            "door",
            "seat",
            "wheel",
            "glass",
        ),
        "storage_rack": ("rack", "asrs", "stillage", "storage"),
        "workstation": ("workstation", "inspection", "qc", "gate", "test"),
    }

    _height_by_type = {
        "cnc_machine": 2.5,
        "robot_cell": 3.2,
        "conveyor": 1.2,
        "assembly_station": 2.2,
        "storage_rack": 4.2,
        "workstation": 1.7,
    }

    def reconstruct(
        self,
        source: ReconstructionInput,
        catalog: list[CatalogAsset],
        options: ReconstructionOptions,
    ) -> dict:
        aspect = source.width_px / max(source.height_px, 1)
        floor_width = options.floor_width_m or _clamp(22 + aspect * 18, 24, 90)
        floor_depth = options.floor_depth_m or _clamp(floor_width * 0.62, 18, 64)
        cues, analysis_mode = self._extract_visual_cues(source, options.max_objects)

        objects: list[dict] = []
        for index, cue in enumerate(cues):
            semantic = self._classify(index, cue)
            matched = self._match_catalog(catalog, semantic, index)
            footprint_w = matched.footprint_w if matched else self._default_width(semantic)
            footprint_d = matched.footprint_d if matched else self._default_depth(semantic)
            # Avoid a complete production line consuming the entire inferred floor.
            width = min(max(0.8, footprint_w), floor_width * 0.42)
            depth = min(max(0.7, footprint_d), floor_depth * 0.3)
            height = self._height_by_type[semantic]

            center_x = cue.x + cue.w / 2
            bottom_y = cue.y + cue.h
            x = _snap((center_x - 0.5) * floor_width * 0.88, 0.5)
            # The top quarter is treated as a rough horizon: bottom pixels are near.
            depth_fraction = _clamp((bottom_y - 0.24) / 0.72, 0.05, 0.95)
            z = _snap((-floor_depth / 2) + depth_fraction * floor_depth, 0.5)
            x = _clamp(x, -floor_width / 2 + width / 2, floor_width / 2 - width / 2)
            z = _clamp(z, -floor_depth / 2 + depth / 2, floor_depth / 2 - depth / 2)
            rotation_y = math.pi / 2 if cue.w / max(cue.h, 0.001) > 1.8 else 0.0

            visual_quality = cue.score if analysis_mode == "coarse_cv" else 0.18
            confidence = 0.28 + visual_quality * 0.25 + (0.12 if matched else 0)
            confidence = round(_clamp(confidence, 0.25, 0.68), 2)
            number = index + 1
            asset_name = matched.name if matched else semantic.replace("_", " ").title()
            objects.append(
                {
                    "id": f"obj-{source.job_id.removeprefix('rec-')[:8]}-{number:03d}",
                    "name": f"{asset_name} {number}",
                    "kind": "machine",
                    "detected_type": semantic,
                    "asset_id": matched.id if matched else None,
                    "asset_name": matched.name if matched else None,
                    "asset_category": matched.category if matched else semantic,
                    "confidence": confidence,
                    "editable": True,
                    "status": "idle",
                    "bounding_box": {
                        "x": round(cue.x, 4),
                        "y": round(cue.y, 4),
                        "width": round(cue.w, 4),
                        "height": round(cue.h, 4),
                        "coordinate_space": "normalized_image",
                    },
                    "dimensions": {
                        "width": round(width, 2),
                        "height": height,
                        "depth": round(depth, 2),
                    },
                    "transform": {
                        "position": {"x": round(x, 2), "y": 0.0, "z": round(z, 2)},
                        "rotation": {"x": 0.0, "y": round(rotation_y, 5), "z": 0.0},
                        "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                    },
                    "metadata": {
                        "review_required": True,
                        "position_estimation": "single-view perspective heuristic",
                        "depth_metric": False,
                        "catalog_match": "rule-based category/name similarity",
                        "visual_feature_score": round(cue.score, 3),
                    },
                }
            )

        floor = self._floor(source, floor_width, floor_depth)
        walls = self._walls(source, floor_width, floor_depth)
        boundaries = self._boundaries(source, floor_width, floor_depth)
        mean_edge = sum(c.edge for c in cues) / len(cues) if cues else 0.0
        mean_variance = sum(c.variance for c in cues) / len(cues) if cues else 0.0

        return {
            "schema_version": "1.0",
            "job_id": source.job_id,
            "approximate": True,
            "engineering_accurate": False,
            "accuracy_notice": (
                "Single-photo reconstruction is an approximate, non-metric proposal. "
                "Verify dimensions, object identity, depth, clearances, and safety aisles "
                "before operational or engineering use."
            ),
            "units": "metres",
            "coordinate_system": {
                "handedness": "right",
                "up_axis": "Y",
                "floor_axes": ["X", "Z"],
                "rotation_units": "radians",
                "origin": "estimated floor centre",
            },
            "provider": {
                "name": self.name,
                "mode": analysis_mode,
                "external_ai_service": False,
                "method": "coarse visual features, perspective heuristics, catalog rules",
            },
            "input": {
                "source_kind": source.source_kind,
                "filename": source.original_filename,
                "content_type": source.content_type,
                "sha256": source.sha256,
                "width_px": source.width_px,
                "height_px": source.height_px,
                "analysis_hint": options.analysis_hint,
            },
            "analysis": {
                "object_proposals": len(objects),
                "mean_edge_strength": round(mean_edge, 3),
                "mean_visual_variance": round(mean_variance, 3),
                "manual_review_required": True,
            },
            "floor": floor,
            "walls": walls,
            "boundaries": boundaries,
            "objects": objects,
            "layers": {
                "structure": [floor["id"], *[wall["id"] for wall in walls]],
                "machines": [item["id"] for item in objects],
                "aisles": [item["id"] for item in boundaries],
            },
            "suggested_camera": {
                "target": {"x": 0.0, "y": 0.0, "z": 0.0},
                "position": {
                    "x": round(floor_width * 0.62, 2),
                    "y": round(max(floor_width, floor_depth) * 0.58, 2),
                    "z": round(floor_depth * 0.7, 2),
                },
                "near": 0.1,
                "far": round(max(floor_width, floor_depth) * 8, 1),
            },
            "future_inputs": ["multiple_photos", "video", "lidar", "cad"],
        }

    def _extract_visual_cues(
        self, source: ReconstructionInput, max_objects: int
    ) -> tuple[list[_VisualCue], str]:
        try:
            from PIL import Image, ImageFilter, ImageOps, ImageStat
        except ImportError:
            return self._fallback_cues(source, max_objects), "geometry_fallback"

        try:
            with Image.open(source.file_path) as opened:
                image = ImageOps.exif_transpose(opened).convert("RGB")
                image.thumbnail((300, 220))
                gray = image.convert("L")
                edges = gray.filter(ImageFilter.FIND_EDGES)
                width, height = image.size
                cols, rows = 6, 3
                horizon = int(height * 0.24)
                usable_h = max(1, int(height * 0.72))
                cues: list[_VisualCue] = []
                for row in range(rows):
                    y0 = horizon + (usable_h * row) // rows
                    y1 = min(height, horizon + (usable_h * (row + 1)) // rows)
                    for col in range(cols):
                        x0 = (width * col) // cols
                        x1 = (width * (col + 1)) // cols
                        box = (x0, y0, max(x0 + 1, x1), max(y0 + 1, y1))
                        edge = ImageStat.Stat(edges.crop(box)).mean[0] / 255
                        variance = min(1.0, ImageStat.Stat(gray.crop(box)).var[0] / 3200)
                        saturation = ImageStat.Stat(image.crop(box).convert("HSV")).mean[1] / 255
                        score = _clamp(edge * 0.57 + variance * 0.3 + saturation * 0.13, 0, 1)
                        cues.append(
                            _VisualCue(
                                x=x0 / width,
                                y=y0 / height,
                                w=(x1 - x0) / width,
                                h=(y1 - y0) / height,
                                edge=edge,
                                variance=variance,
                                saturation=saturation,
                                score=score,
                            )
                        )
                average = sum(c.score for c in cues) / max(len(cues), 1)
                desired = min(max_objects, max(6, int(round(6 + average * 14))))
                return sorted(cues, key=lambda cue: cue.score, reverse=True)[:desired], "coarse_cv"
        except Exception:
            # Upload validation already verified decodability when Pillow exists. This
            # fallback still leaves the job usable if a particular codec is unavailable.
            return self._fallback_cues(source, max_objects), "geometry_fallback"

    def _fallback_cues(
        self, source: ReconstructionInput, max_objects: int
    ) -> list[_VisualCue]:
        seed = hashlib.sha256(
            f"{source.sha256}:{source.width_px}:{source.height_px}".encode()
        ).digest()
        count = min(max_objects, max(6, 7 + seed[0] % 4))
        cues = []
        for index in range(count):
            col = index % 4
            row = index // 4
            jitter_x = (seed[(index * 2 + 1) % len(seed)] / 255 - 0.5) * 0.04
            jitter_y = (seed[(index * 2 + 2) % len(seed)] / 255 - 0.5) * 0.035
            cues.append(
                _VisualCue(
                    x=_clamp(0.07 + col * 0.225 + jitter_x, 0.02, 0.85),
                    y=_clamp(0.34 + row * 0.25 + jitter_y, 0.25, 0.83),
                    w=0.14 + (0.06 if index % 3 == 2 else 0),
                    h=0.18,
                    edge=0.12,
                    variance=0.15,
                    saturation=0.1,
                    score=0.18,
                )
            )
        return cues

    def _classify(self, index: int, cue: _VisualCue) -> str:
        # Preserve coverage of the factory object library, then use visual cues to
        # influence later proposals. These are hypotheses, not asserted detections.
        if index < len(self._semantic_cycle):
            return self._semantic_cycle[index]
        if cue.w / max(cue.h, 0.001) > 1.4:
            return "conveyor"
        if cue.edge > 0.28 and cue.saturation < 0.22:
            return "storage_rack"
        if cue.saturation > 0.35:
            return "robot_cell"
        return self._semantic_cycle[index % len(self._semantic_cycle)]

    def _match_catalog(
        self, catalog: list[CatalogAsset], semantic: str, index: int
    ) -> CatalogAsset | None:
        terms = self._catalog_terms[semantic]
        ranked: list[tuple[int, float, str, CatalogAsset]] = []
        for asset in catalog:
            haystack = f"{asset.category} {asset.name}".lower()
            score = sum(3 if term in asset.category.lower() else 1 for term in terms if term in haystack)
            if score:
                # For ordinary object proposals prefer machine-sized catalog entries.
                oversize = max(0.0, asset.footprint_w - 18) + max(0.0, asset.footprint_d - 10)
                ranked.append((score, -oversize, asset.id, asset))
        if not ranked:
            compact = [a for a in catalog if a.footprint_w <= 10 and a.footprint_d <= 8]
            if not compact:
                return catalog[0] if catalog else None
            return compact[index % len(compact)]
        ranked.sort(key=lambda item: (-item[0], -item[1], item[2]))
        # Rotate among equally plausible top matches so repeated proposals are useful.
        best_score = ranked[0][0]
        peers = [item[3] for item in ranked if item[0] == best_score][:4]
        return peers[index % len(peers)]

    @staticmethod
    def _default_width(semantic: str) -> float:
        return 5.0 if semantic == "conveyor" else 3.6 if semantic == "storage_rack" else 2.8

    @staticmethod
    def _default_depth(semantic: str) -> float:
        return 1.5 if semantic in {"conveyor", "storage_rack"} else 2.5

    @staticmethod
    def _floor(source: ReconstructionInput, width: float, depth: float) -> dict:
        return {
            "id": f"floor-{source.job_id.removeprefix('rec-')[:8]}",
            "name": "Reconstructed factory floor",
            "kind": "floor",
            "confidence": 0.58,
            "editable": True,
            "dimensions": {"width": round(width, 2), "height": 0.2, "depth": round(depth, 2)},
            "transform": {
                "position": {"x": 0.0, "y": -0.1, "z": 0.0},
                "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
                "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
            },
            "metadata": {"metric_depth": False, "review_required": True},
        }

    @staticmethod
    def _walls(source: ReconstructionInput, width: float, depth: float) -> list[dict]:
        wall_height, thickness = 6.0, 0.25
        token = source.job_id.removeprefix("rec-")[:8]
        specs = (
            ("north", width, thickness, 0.0, -depth / 2, 0.0),
            ("south", width, thickness, 0.0, depth / 2, 0.0),
            ("west", depth, thickness, -width / 2, 0.0, math.pi / 2),
            ("east", depth, thickness, width / 2, 0.0, math.pi / 2),
        )
        return [
            {
                "id": f"wall-{token}-{name}",
                "name": f"Estimated {name} boundary wall",
                "kind": "wall",
                "confidence": 0.43,
                "editable": True,
                "dimensions": {"width": round(length, 2), "height": wall_height, "depth": thickness},
                "transform": {
                    "position": {"x": round(x, 2), "y": wall_height / 2, "z": round(z, 2)},
                    "rotation": {"x": 0.0, "y": round(rotation, 5), "z": 0.0},
                    "scale": {"x": 1.0, "y": 1.0, "z": 1.0},
                },
                "metadata": {"inferred_boundary": True, "review_required": True},
            }
            for name, length, thickness, x, z, rotation in specs
        ]

    @staticmethod
    def _boundaries(source: ReconstructionInput, width: float, depth: float) -> list[dict]:
        token = source.job_id.removeprefix("rec-")[:8]
        aisle_width = min(4.0, max(2.0, width * 0.08))
        return [
            {
                "id": f"boundary-{token}-perimeter",
                "name": "Estimated usable floor boundary",
                "kind": "boundary",
                "confidence": 0.52,
                "editable": True,
                "closed": True,
                "points": [
                    {"x": -width / 2, "z": -depth / 2},
                    {"x": width / 2, "z": -depth / 2},
                    {"x": width / 2, "z": depth / 2},
                    {"x": -width / 2, "z": depth / 2},
                ],
            },
            {
                "id": f"aisle-{token}-centre",
                "name": "Proposed central aisle",
                "kind": "walkway",
                "confidence": 0.34,
                "editable": True,
                "closed": True,
                "points": [
                    {"x": -width * 0.44, "z": -aisle_width / 2},
                    {"x": width * 0.44, "z": -aisle_width / 2},
                    {"x": width * 0.44, "z": aisle_width / 2},
                    {"x": -width * 0.44, "z": aisle_width / 2},
                ],
                "metadata": {"safety_validated": False, "review_required": True},
            },
        ]


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _snap(value: float, increment: float) -> float:
    return round(value / increment) * increment
