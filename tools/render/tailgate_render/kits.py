"""Importing Kenney kit models and placing them in the studio."""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

from . import config
from .studio import bounds

_MODEL_SUBDIRS = ("Models/GLB format", "Models/GLTF format", "Models/glTF", "Models")


def kit_dir(slug: str) -> Path:
    folder = config.KITS_DIR / slug
    if not folder.is_dir():
        raise FileNotFoundError(f"kit {slug} is not downloaded at {folder}. Run tools/render/fetch_sources.py")
    return folder


def find_model(slug: str, model: str) -> Path:
    """Resolve 'desk' or 'desk.glb' inside a kit's model folders."""
    folder = kit_dir(slug)
    names = [model] if model.lower().endswith((".glb", ".gltf", ".obj", ".fbx")) else [model + ".glb", model + ".gltf", model + ".obj"]
    for sub in _MODEL_SUBDIRS:
        for name in names:
            candidate = folder / sub / name
            if candidate.is_file():
                return candidate
    raise FileNotFoundError(f"model {model!r} not found in kit {slug}")


def import_model(path: Path) -> list[bpy.types.Object]:
    """Import a glb/gltf/obj and return the new objects."""
    before = set(bpy.data.objects)
    suffix = path.suffix.lower()
    if suffix in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(path), import_shading="NORMALS")
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    else:
        raise ValueError(f"unsupported model format: {path}")
    return [obj for obj in bpy.data.objects if obj not in before]


def place(objects, metres_per_unit: float, rotation_deg: float = 0.0, extra_scale: float = 1.0) -> tuple[Vector, Vector]:
    """Scale to metres, rotate about Z, drop onto the floor, centre on the origin.

    Everything is done through a single parent transform on the top-level
    objects, so the kit's own hierarchy is untouched. Returns the world bounds.
    """
    # Objects built from primitives set scale and location as properties;
    # matrix_world only catches up after an update, so force one first.
    bpy.context.view_layer.update()
    roots = [obj for obj in objects if obj.parent is None or obj.parent not in objects]
    scale = metres_per_unit * extra_scale
    transform = Matrix.Rotation(math.radians(rotation_deg), 4, "Z") @ Matrix.Scale(scale, 4)
    for root in roots:
        root.matrix_world = transform @ root.matrix_world
    bpy.context.view_layer.update()
    low, high = bounds(objects)
    centre = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    for root in roots:
        root.matrix_world = Matrix.Translation(-centre) @ root.matrix_world
    bpy.context.view_layer.update()
    return bounds(objects)


def set_smooth(objects, angle_deg: float = 35.0) -> None:
    """Kenney meshes are flat shaded; auto smooth keeps hard edges but stops
    the normal pass from faceting curved parts like chair backs and wheels."""
    for obj in objects:
        if obj.type != "MESH":
            continue
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        try:
            with bpy.context.temp_override(object=obj, selected_editable_objects=[obj]):
                bpy.ops.object.shade_auto_smooth(angle=math.radians(angle_deg))
        except (RuntimeError, TypeError):
            pass
