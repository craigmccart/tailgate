"""Character sprite sheets from Kenney's animated characters.

What the packs contain (checked 1 November 2026): Animated Characters
Protagonists, Survivors and Retro all ship the same characterMedium.fbx rig
(58 bones, 804 vertices, one "skin" material that takes a texture from the
Skins folder) and three animation files each: idle, jump and run. There is
no walk cycle in any of them. The walk sheet therefore uses the run cycle,
which at a walking step rate reads as a brisk walk from above; the manifest
says so on each sheet.

One rig, texture swaps. Every character here is the Retro pack's rig with a
different skin: guard, two staff and a hi-vis worker are the humanMaleA and
humanFemaleA skins, recoloured in a small numpy step (the uniform, a pale
shirt, the vest) and written to tools/render/work/skins/.

Each sheet is one row of frames. Every frame is the same cell size, worked
out from the union of the animation's bounding boxes, and the rig's origin
sits at the same place in every cell, so the game can rotate about the cell
centre. The character faces +x (screen right) at rotation 0.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

from . import config, manifest, studio
from .jobs import kit_source, output_paths
from .kits import kit_dir
from .materials import ensure_nodes

_FACING_FIX_DEG = 90.0  # the rig faces -y after import; +90 about z turns it to +x


# --------------------------------------------------------------------------
# Skins
# --------------------------------------------------------------------------


def _load_rgba(path: Path) -> np.ndarray:
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        width, height = image.size
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
    finally:
        bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)  # row 0 is the bottom of the image


def _save_rgba(path: Path, rgba: np.ndarray) -> None:
    height, width, _ = rgba.shape
    image = bpy.data.images.new(path.stem, width, height, alpha=True, float_buffer=False)
    image.pixels.foreach_set(np.ascontiguousarray(rgba, dtype=np.float32).ravel())
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save()
    bpy.data.images.remove(image)


def _region(rgba: np.ndarray, left: float, top: float, right: float, bottom: float):
    """Slice by fractions of the image measured from the top-left corner."""
    height, width, _ = rgba.shape
    rows = slice(int((1 - bottom) * height), int((1 - top) * height))
    cols = slice(int(left * width), int(right * width))
    return rows, cols


def _tint_region(rgba: np.ndarray, region, colour, strength: float = 1.0) -> None:
    rows, cols = region
    block = rgba[rows, cols, :3]
    luma = block @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    target = luma[..., None] * np.array(colour, dtype=np.float32)[None, None, :]
    rgba[rows, cols, :3] = block * (1 - strength) + target * strength


def recolour_skin(source: Path, variant: str, target: Path) -> Path:
    """Write a recoloured copy of a Retro-pack skin. Regions are the UV
    blocks of that pack's layout: shirt bottom-left, trousers bottom-right."""
    rgba = _load_rgba(source)
    shirt = _region(rgba, 0.0, 0.47, 0.59, 1.0)
    trousers = _region(rgba, 0.59, 0.72, 1.0, 1.0)
    if variant == "guard":
        _tint_region(rgba, shirt, (0.16, 0.19, 0.28))  # dark navy uniform shirt
        _tint_region(rgba, trousers, (0.12, 0.13, 0.16))  # near-black trousers
        # Epaulette-style pale band at the top of the shirt block (shoulders).
        rows, cols = _region(rgba, 0.0, 0.47, 0.59, 0.52)
        rgba[rows, cols, :3] = rgba[rows, cols, :3] * 0.4 + 0.6 * np.array([0.75, 0.78, 0.82], dtype=np.float32)
    elif variant == "staff_b":
        _tint_region(rgba, shirt, (0.68, 0.78, 0.9))  # pale blue shirt
        _tint_region(rgba, trousers, (0.3, 0.3, 0.33))
    elif variant == "hivis":
        _tint_region(rgba, shirt, (0.9, 0.96, 0.12), 0.92)  # EN ISO 20471 yellow
        # Two reflective bands across the torso.
        for band_top in (0.64, 0.8):
            rows, cols = _region(rgba, 0.04, band_top, 0.55, band_top + 0.045)
            rgba[rows, cols, :3] = np.array([0.8, 0.82, 0.85], dtype=np.float32)
        _tint_region(rgba, trousers, (0.25, 0.27, 0.3))
    _save_rgba(target, rgba)
    return target


# --------------------------------------------------------------------------
# Rig and animation
# --------------------------------------------------------------------------


def _import_fbx(path: Path) -> list:
    before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True, ignore_leaf_bones=True, automatic_bone_orientation=False)
    objects = [obj for obj in bpy.data.objects if obj not in before]
    actions = [action for action in bpy.data.actions if action not in actions_before]
    return objects, actions


def _apply_skin(mesh_obj: bpy.types.Object, skin_path: Path) -> None:
    material = mesh_obj.material_slots[0].material if mesh_obj.material_slots else None
    if material is None:
        material = bpy.data.materials.new("skin")
        mesh_obj.data.materials.append(material)
    tree = ensure_nodes(material)
    principled = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    texture = tree.nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(skin_path), check_existing=False)
    texture.image.colorspace_settings.name = "sRGB"
    texture.interpolation = "Linear"
    for link in list(principled.inputs["Base Color"].links):
        tree.links.remove(link)
    tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    principled.inputs["Roughness"].default_value = 0.85
    principled.inputs["Specular IOR Level"].default_value = 0.2
    # The FBX material arrives with Alpha 0, which would make the whole
    # character invisible. Kenney's skins are opaque.
    for link in list(principled.inputs["Alpha"].links):
        tree.links.remove(link)
    principled.inputs["Alpha"].default_value = 1.0
    material.surface_render_method = "DITHERED"


def _assign_action(armature: bpy.types.Object, action: bpy.types.Action) -> None:
    if armature.animation_data is None:
        armature.animation_data_create()
    adt = armature.animation_data
    adt.action = action
    # Blender 4.4+ slotted actions: pick the first slot if assignment left it unset.
    if hasattr(adt, "action_slot") and getattr(action, "slots", None):
        try:
            if adt.action_slot is None:
                adt.action_slot = action.slots[0]
        except (TypeError, AttributeError):
            pass


def _rest_relative(pose_bone: bpy.types.PoseBone) -> Matrix:
    """A bone's rest transform relative to its parent bone (armature space)."""
    rest = pose_bone.bone.matrix_local
    if pose_bone.parent is not None:
        return pose_bone.parent.bone.matrix_local.inverted() @ rest
    return rest.copy()


def _retarget_pose(source: bpy.types.Object, target: bpy.types.Object) -> None:
    """Copy the current pose from the animation file's armature onto the rig.

    Why not just assign the action? Kenney's animation FBX files carry their
    own copy of the skeleton, and its rest pose is not the T-pose the mesh
    was bound in. The imported keys are relative to that other rest pose, so
    played directly on the rig they leave the arms half way to a T-pose.

    The FBX node transforms are the same skeleton in both files, so the
    animated parent-relative transform of each bone is what carries across:
    L = rest_rel_source @ basis_source, then basis_target = rest_rel_target^-1 @ L.
    """
    for target_bone in target.pose.bones:
        source_bone = source.pose.bones.get(target_bone.name)
        if source_bone is None:
            continue
        local = _rest_relative(source_bone) @ source_bone.matrix_basis
        target_bone.matrix_basis = _rest_relative(target_bone).inverted() @ local


def _evaluated_bounds(mesh_obj: bpy.types.Object) -> tuple[Vector, Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh_obj.evaluated_get(depsgraph)
    low = Vector((math.inf, math.inf, math.inf))
    high = Vector((-math.inf, -math.inf, -math.inf))
    for corner in evaluated.bound_box:
        point = evaluated.matrix_world @ Vector(corner)
        low.x, low.y, low.z = min(low.x, point.x), min(low.y, point.y), min(low.z, point.z)
        high.x, high.y, high.z = max(high.x, point.x), max(high.y, point.y), max(high.z, point.z)
    return low, high


def _frame_list(action: bpy.types.Action, count: int) -> list[int]:
    """Evenly spaced frames across the loop. The last keyed frame repeats
    the first, so the loop proper runs from start up to (not including) end."""
    start, end = action.frame_range
    span = max(1.0, end - start)
    return [int(math.floor(start + span * index / count)) for index in range(count)]


def _mount(armature: bpy.types.Object, transform: Matrix) -> bpy.types.Object:
    """Parent the rig to an empty that carries scale and facing.

    The imported action also keys the armature object's own transform, so
    writing matrix_world on the armature is undone at every frame change.
    An empty above it is never animated, so its transform sticks.
    """
    mount = bpy.data.objects.new("CharacterMount", None)
    bpy.context.scene.collection.objects.link(mount)
    mount.matrix_world = transform
    armature.parent = mount
    armature.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    return mount


# --------------------------------------------------------------------------
# Sheet assembly
# --------------------------------------------------------------------------


def _assemble_sheet(frame_paths: list[Path], cell: tuple[int, int], target: Path) -> None:
    width, height = cell
    sheet = np.zeros((height, width * len(frame_paths), 4), dtype=np.float32)
    for index, path in enumerate(frame_paths):
        frame = _load_rgba(path)
        frame_height, frame_width, _ = frame.shape
        sheet[:frame_height, index * width : index * width + frame_width] = frame
    _save_rgba(target, sheet)


# --------------------------------------------------------------------------
# Entry
# --------------------------------------------------------------------------


def render_character(item: dict, quality: dict):
    """Yields one record per animation sheet (walk, idle)."""
    catalogue_animations = _animations_from_catalogue()
    kit = item["kit"]
    folder = kit_dir(kit)
    skin_source = folder / "Skins" / (item["skin"] + ".png")
    if item.get("recolour"):
        skin_path = recolour_skin(skin_source, item["recolour"], config.WORK_DIR / "skins" / f"{item['id']}.png")
    else:
        skin_path = skin_source

    for animation_name, spec in catalogue_animations.items():
        scene = studio.reset_scene()
        rig_objects, _ = _import_fbx(folder / "Model" / "characterMedium.fbx")
        armature = next(obj for obj in rig_objects if obj.type == "ARMATURE")
        mesh_obj = next(obj for obj in rig_objects if obj.type == "MESH")
        _apply_skin(mesh_obj, skin_path)
        for polygon in mesh_obj.data.polygons:
            polygon.use_smooth = True

        animation_objects, actions = _import_fbx(folder / spec["file"])
        action = next((a for a in actions if spec["action_contains"].lower() in a.name.lower()), None)
        if action is None:
            raise RuntimeError(f"no action containing {spec['action_contains']!r} in {spec['file']}: {[a.name for a in actions]}")
        source_armature = next(obj for obj in animation_objects if obj.type == "ARMATURE")
        _assign_action(source_armature, action)
        source_armature.hide_render = True
        studio.remove_objects([obj for obj in animation_objects if obj is not source_armature])

        scale = config.KIT_METRES_PER_UNIT["animated-characters"] * config.CHARACTER_WORLD_SCALE * item.get("scale", 1.0)
        _mount(armature, Matrix.Rotation(math.radians(_FACING_FIX_DEG + item.get("rotation_deg", 0.0)), 4, "Z") @ Matrix.Scale(scale, 4))

        def pose_frame(frame: int) -> None:
            scene.frame_set(frame)
            _retarget_pose(source_armature, armature)
            bpy.context.view_layer.update()

        frames = _frame_list(action, spec["frames"])
        # Pass 1: the cell that holds every frame, centred on the rig origin.
        reach = 0.0
        for frame in frames:
            pose_frame(frame)
            low, high = _evaluated_bounds(mesh_obj)
            reach = max(reach, abs(low.x), abs(high.x), abs(low.y), abs(high.y))
        cell_m = 2 * (reach + config.PROP_MARGIN_M)
        cell_px = int(math.ceil(cell_m * config.PX_PER_METRE / 4.0) * 4)
        cell_m = cell_px / config.PX_PER_METRE
        studio.frame_metres(scene, cell_m, cell_m)
        print(f"[characters] {item['id']} {animation_name}: {len(frames)} frames of {cell_px}x{cell_px} px from {action.name}")

        # Pass 2: render every frame twice.
        work = config.WORK_DIR / "frames" / item["id"] / animation_name
        colour_frames, normal_frames = [], []
        for index, frame in enumerate(frames):
            pose_frame(frame)
            colour_path = work / f"c{index:02d}.png"
            normal_path = work / f"n{index:02d}.png"
            studio.render_colour(scene, colour_path, quality["colour_samples"])
            studio.render_normal(scene, normal_path, quality["normal_samples"])
            colour_frames.append(colour_path)
            normal_frames.append(normal_path)

        sheet_path, normal_sheet_path = output_paths("characters", f"{item['id']}_{animation_name}")
        _assemble_sheet(colour_frames, (cell_px, cell_px), sheet_path)
        _assemble_sheet(normal_frames, (cell_px, cell_px), normal_sheet_path)
        yield {
            "id": f"{item['id']}_{animation_name}",
            "kind": "character_sheet",
            "file": manifest.relative(sheet_path),
            "normal": manifest.relative(normal_sheet_path),
            "px": [cell_px * len(frames), cell_px],
            "frame_px": [cell_px, cell_px],
            "frames": len(frames),
            "game_frame_px": round(cell_px / config.RENDER_PX_PER_GAME_PX, 1),
            "animation": animation_name,
            "source_animation": f"{spec['file']} ({action.name})",
            "fps_suggested": 12 if animation_name == "walk" else 6,
            "loop": True,
            "origin": "centre",
            "facing": "+x",
            "world_scale": config.CHARACTER_WORLD_SCALE,
            "game_sprite": item.get("game_sprite"),
            "replaces_existing": item.get("replaces", False),
            "skin": item["skin"] + (f" recoloured ({item['recolour']})" if item.get("recolour") else ""),
            "source": kit_source(kit, f"Model/characterMedium.fbx + {spec['file']} + Skins/{item['skin']}.png"),
            "notes": (item.get("notes", "") + " " + ("Walk uses the pack's run cycle: no walk exists in any Kenney animated pack." if animation_name == "walk" else "")).strip(),
        }


def _animations_from_catalogue() -> dict:
    import json

    catalogue = json.loads(config.ASSETS_JSON.read_text(encoding="utf-8"))
    animations = catalogue.get("character_animations", {})
    return {name: spec for name, spec in animations.items() if not name.startswith("_")}
