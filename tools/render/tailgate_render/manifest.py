"""The manifest: one JSON record per rendered file, plus the palette check.

public/assets/rendered/manifest.json is what Phase 24's game-side swap reads.
It is rebuilt from scratch every full run, and a partial run (--only) merges
its entries into the existing file so nothing already rendered is lost.
"""

from __future__ import annotations

import json
from pathlib import Path

import bpy
import numpy as np

from . import config


def header() -> dict:
    return {
        "version": 1,
        "generated_by": "tools/render/render_assets.py (Blender " + bpy.app.version_string + ")",
        "scale": {
            "render_px_per_tile": config.RENDER_PX_PER_TILE,
            "game_px_per_tile": config.GAME_PX_PER_TILE,
            "metres_per_tile": config.METRES_PER_TILE,
            "px_per_metre": config.PX_PER_METRE,
            "render_px_per_game_px": config.RENDER_PX_PER_GAME_PX,
            "character_world_scale": config.CHARACTER_WORLD_SCALE,
            "note": "Draw a prop at displayWidth = px[0] / render_px_per_game_px game pixels. Characters are rendered character_world_scale times larger than life on purpose.",
        },
        "normal_maps": {
            "suffix": "_n",
            "space": "camera space, which for a straight-down camera is the sprite's tangent space",
            "convention": "OpenGL: red = +x (screen right), green = +y (screen up, north), blue = towards the viewer. (128, 128, 255) is a flat upward face.",
            "note": "If the game's y axis points down (Phaser), flip the green channel or invert the light's y when sampling.",
        },
        "facing": "Characters face +x (screen right) at frame rotation 0, matching Phaser's zero angle. Props keep the kit's own orientation unless rotation_deg says otherwise.",
        "lighting": "Colour passes use a neutral white sky and a soft white sun 12 degrees north of vertical, with ambient occlusion baked in. No coloured light is baked; the game adds it.",
        "licence_note": "Every source is CC0 1.0. CREDITS.md carries the same provenance in the repo's SBOM format.",
        "assets": [],
    }


def load_existing() -> dict:
    if config.MANIFEST_PATH.is_file():
        try:
            return json.loads(config.MANIFEST_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return header()


def write(entries: list[dict], merge: bool) -> None:
    data = header()
    if merge:
        existing = load_existing()
        kept = [entry for entry in existing.get("assets", []) if entry["id"] not in {e["id"] for e in entries}]
        data["assets"] = kept + entries
    else:
        data["assets"] = entries
    data["assets"].sort(key=lambda entry: (entry["kind"], entry["id"]))
    config.MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    config.MANIFEST_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"[manifest] {len(data['assets'])} assets -> {config.MANIFEST_PATH}")


def relative(path: Path) -> str:
    return path.relative_to(config.OUTPUT_DIR).as_posix()


def check_no_alarm_red(path: Path) -> int:
    """Count opaque pixels within tolerance of alarm red. Zero is the only pass."""
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        width, height = image.size
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
    finally:
        bpy.data.images.remove(image)
    rgba = pixels.reshape(-1, 4)
    # Blender gives the file's stored (sRGB) values back as floats here.
    rgb = np.clip(rgba[:, :3] * 255.0, 0, 255)
    alpha = rgba[:, 3]
    target = np.array(config.FORBIDDEN_RED, dtype=np.float32)
    distance = np.sqrt(((rgb - target) ** 2).sum(axis=1))
    hits = int(((distance < config.FORBIDDEN_RED_TOLERANCE) & (alpha > 0.5)).sum())
    return hits
