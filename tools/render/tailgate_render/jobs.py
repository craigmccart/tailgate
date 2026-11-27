"""One function per asset group. Each takes a catalogue item and yields a
manifest entry after rendering the colour and normal PNGs for it."""

from __future__ import annotations

import math
from pathlib import Path

import bpy

from . import config, manifest, studio
from .kits import find_model, import_model, place, set_smooth
from .materials import add_grit_to_objects, recolour_objects

GROUPS = ("props", "primitives", "floors", "walls", "characters")

_SOURCE_META = None


def _sources() -> dict:
    global _SOURCE_META
    if _SOURCE_META is None:
        import json

        _SOURCE_META = json.loads(config.SOURCES_JSON.read_text(encoding="utf-8"))
    return _SOURCE_META


def kit_source(slug: str, model: str) -> dict:
    for kit in _sources()["kenney_kits"]:
        if kit["slug"] == slug:
            return {
                "pack": kit["name"],
                "pack_url": kit["url"],
                "model": model,
                "author": kit["author"],
                "licence": kit["licence"],
            }
    raise KeyError(f"kit {slug} is not listed in sources.json")


def texture_source(asset_id: str) -> dict:
    meta = _sources()["ambientcg_licence"]
    return {
        "pack": "ambientCG",
        "pack_url": meta["page_pattern"].format(id=asset_id),
        "model": asset_id,
        "author": meta["author"],
        "licence": meta["licence"],
    }


def original_source(description: str) -> dict:
    return {
        "pack": "Tailgate (original, built from primitives by tools/render)",
        "pack_url": "https://github.com/craigmccart/tailgate",
        "model": description,
        "author": "CJM Labs",
        "licence": "CC0 1.0",
    }


def run_group(group: str, items: list[dict], quality: dict):
    if group == "props":
        for item in items:
            yield render_prop(item, quality)
    elif group == "primitives":
        from .primitives import render_primitive

        for item in items:
            yield render_primitive(item, quality)
    elif group == "floors":
        from .surfaces import render_floor

        for item in items:
            yield render_floor(item, quality)
    elif group == "walls":
        from .surfaces import render_wall

        for item in items:
            yield from render_wall(item, quality)
    elif group == "characters":
        from .characters import render_character

        for item in items:
            yield from render_character(item, quality)


def output_paths(kind_dir: str, asset_id: str) -> tuple[Path, Path]:
    folder = config.OUTPUT_DIR / kind_dir
    return folder / f"{asset_id}.png", folder / f"{asset_id}_n.png"


def render_subject(scene, objects, kind_dir: str, item: dict, quality: dict, low, high, source: dict, kind: str) -> dict:
    """Frame whatever is in the scene, render both passes, build the record."""
    size_x = (high.x - low.x) + 2 * config.PROP_MARGIN_M
    size_y = (high.y - low.y) + 2 * config.PROP_MARGIN_M
    width_px, height_px = studio.frame_metres(scene, size_x, size_y)
    colour_path, normal_path = output_paths(kind_dir, item["id"])
    print(f"[{kind_dir}] {item['id']} -> {width_px}x{height_px} px ({high.x - low.x:.2f} x {high.y - low.y:.2f} m, {high.z - low.z:.2f} m tall)")
    studio.render_colour(scene, colour_path, quality["colour_samples"])
    studio.render_normal(scene, normal_path, quality["normal_samples"])
    return {
        "id": item["id"],
        "kind": kind,
        "file": manifest.relative(colour_path),
        "normal": manifest.relative(normal_path),
        "px": [width_px, height_px],
        "game_px": [round(width_px / config.RENDER_PX_PER_GAME_PX, 1), round(height_px / config.RENDER_PX_PER_GAME_PX, 1)],
        "metres": [round(high.x - low.x, 3), round(high.y - low.y, 3)],
        "height_m": round(high.z - low.z, 3),
        "origin": "centre",
        "game_prop": item.get("game_prop"),
        "replaces_existing": item.get("replaces", False),
        "sites": item.get("sites", []),
        "source": source,
        "notes": item.get("notes", ""),
    }


def render_prop(item: dict, quality: dict) -> dict:
    """One kit model, straight down, colour and normal."""
    scene = studio.reset_scene()
    studio.set_ground(scene, True)
    path = find_model(item["kit"], item["model"])
    objects = import_model(path)
    metres_per_unit = item.get("metres_per_unit", config.KIT_METRES_PER_UNIT[item["kit"]])
    low, high = place(objects, metres_per_unit, item.get("rotation_deg", 0.0), item.get("scale", 1.0))
    set_smooth(objects)
    recolour = dict(config.KIT_RECOLOUR.get(item["kit"], {}))
    recolour.update(item.get("recolour", {}))
    recolour_objects(objects, recolour)
    if item.get("grit", True):
        add_grit_to_objects(objects, item.get("grit_strength", 1.0))
    source = kit_source(item["kit"], str(path.relative_to(config.KITS_DIR / item["kit"])).replace("\\", "/"))
    return render_subject(scene, objects, "props", item, quality, low, high, source, "prop")
