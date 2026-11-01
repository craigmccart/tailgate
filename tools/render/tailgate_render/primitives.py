"""Props the kits do not have, built from boxes and cylinders in the same
studio with the same grit, so they sit next to the Kenney pieces without a
style break. All sizes are metres. Every builder returns the objects it made,
placed with their base on the floor and centred on the origin.

Colour rule: nothing here is red. The LEDs are amber and white, the hazard
stripes are yellow and near-black, and the skip is dark green.
"""

from __future__ import annotations

import math
import random

import bpy
from mathutils import Vector

from . import config, studio
from .jobs import original_source, render_subject
from .kits import place, set_smooth
from .materials import (
    ambientcg_material,
    chequer_plate_material,
    emission_material,
    flat_material,
    hazard_stripe_material,
    use_normal_output,
)

_rng = random.Random(1101)


def _box(name: str, size, location, material, rotation=(0.0, 0.0, 0.0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    obj.data.materials.append(material)
    return obj


def _cylinder(name: str, radius: float, depth: float, location, material, vertices: int = 32, rotation=(0.0, 0.0, 0.0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def _bevel(obj: bpy.types.Object, width: float = 0.01, segments: int = 2) -> None:
    modifier = obj.modifiers.new("Bevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"


def _steel(name: str, tint: str, repeat: float = 0.5, metallic: float = 0.8, rough: float = 1.0) -> bpy.types.Material:
    return ambientcg_material(name, "Metal009", repeat_m=repeat, tint=config.hex_rgb(tint), tint_amount=0.55, roughness_scale=rough, metallic=metallic)


# --------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------


def build_server_rack(variant: str = "a") -> list:
    body = flat_material("RackBody", config.hex_rgb("#2A2F36"), roughness=0.55)
    trim = flat_material("RackTrim", config.hex_rgb("#4A5058"), roughness=0.5, metallic=0.4)
    grille = flat_material("RackGrille", config.hex_rgb("#1A1D22"), roughness=0.8)
    amber = emission_material("RackLedAmber", config.hex_rgb("#FFB000"), strength=10.0)
    white = emission_material("RackLedWhite", (0.95, 0.97, 1.0, 1.0), strength=8.0)
    objects = []
    w, d, h = 0.6, 1.0, 2.0
    objects.append(_box("rack_body", (w, d, h), (0, 0, h / 2), body))
    _bevel(objects[-1], 0.012)
    # Top frame lip and a recessed vent grille in the top panel.
    objects.append(_box("rack_lip", (w + 0.02, d + 0.02, 0.03), (0, 0, h + 0.015), trim))
    objects.append(_box("rack_vent", (w - 0.14, d * 0.45, 0.012), (0, 0.12 if variant == "a" else -0.05, h + 0.03), grille))
    # Vent slats across the grille.
    slats = 9 if variant == "a" else 7
    for index in range(slats):
        y = (0.12 if variant == "a" else -0.05) + (index - (slats - 1) / 2) * (d * 0.45 / slats)
        objects.append(_box(f"rack_slat{index}", (w - 0.18, 0.012, 0.008), (0, y, h + 0.04), trim))
    # Cable grommet at the rear.
    objects.append(_cylinder("rack_grommet", 0.06, 0.02, (0.12, -0.38 if variant == "a" else 0.4, h + 0.04), grille, 24))
    # Status LED bar along the front (south) top edge.
    bar_y = -d / 2 + 0.05
    objects.append(_box("rack_led_bar", (w - 0.1, 0.05, 0.02), (0, bar_y, h + 0.04), grille))
    pattern = ["amber", "white", "white", "amber", "white", "white", "white", "amber"] if variant == "a" else ["white", "amber", "white", "white", "amber", "white"]
    for index, colour in enumerate(pattern):
        x = (index - (len(pattern) - 1) / 2) * ((w - 0.16) / (len(pattern) - 1))
        objects.append(_box(f"rack_led{index}", (0.035, 0.035, 0.012), (x, bar_y, h + 0.055), amber if colour == "amber" else white))
    return objects


def build_roller_shutter() -> list:
    galv = _steel("ShutterSteel", "#8E979E", repeat=0.6)
    housing = flat_material("ShutterHousing", config.hex_rgb("#4D545B"), roughness=0.6, metallic=0.5)
    rail = flat_material("ShutterRail", config.hex_rgb("#3B4147"), roughness=0.6, metallic=0.5)
    objects = []
    width = 3.0
    # Housing (the roll) along the north edge.
    objects.append(_cylinder("shutter_roll", 0.2, width, (0, 0.5, 0.2), housing, 32, rotation=(0, math.pi / 2, 0)))
    # Flattened curtain: slats laid in plan so the sprite reads as a shutter.
    slat_count = 13
    pitch = 0.075
    for index in range(slat_count):
        y = 0.3 - index * pitch
        z = 0.03 + (0.006 if index % 2 else 0.0)
        objects.append(_box(f"shutter_slat{index}", (width - 0.16, pitch - 0.008, 0.02), (0, y, z), galv))
    # Guide rails each side and a bottom bar.
    objects.append(_box("shutter_rail_l", (0.08, 1.4, 0.08), (-width / 2 + 0.04, -0.2, 0.04), rail))
    objects.append(_box("shutter_rail_r", (0.08, 1.4, 0.08), (width / 2 - 0.04, -0.2, 0.04), rail))
    objects.append(_box("shutter_bottom", (width - 0.16, 0.06, 0.05), (0, 0.3 - (slat_count - 1) * pitch - 0.05, 0.03), rail))
    return objects


def build_dock_leveller() -> list:
    plate = chequer_plate_material("LevellerPlate")
    frame = flat_material("LevellerFrame", config.hex_rgb("#2E3338"), roughness=0.7, metallic=0.3)
    hazard = hazard_stripe_material("LevellerHazard")
    objects = []
    w, d = 2.0, 2.4
    objects.append(_box("leveller_pit", (w + 0.16, d + 0.16, 0.04), (0, 0, 0.02), frame))
    objects.append(_box("leveller_plate", (w, d - 0.4, 0.05), (0, 0.2, 0.065), plate))
    # Hinged lip at the south end, dropped a touch so it reads as a flap.
    objects.append(_box("leveller_lip", (w, 0.38, 0.04), (0, -1.0, 0.055), plate, rotation=(math.radians(4), 0, 0)))
    for side in (-1, 1):
        objects.append(_box(f"leveller_stripe{side}", (0.14, d + 0.16, 0.012), (side * (w / 2 + 0.01), 0, 0.046), hazard))
    return objects


def build_reception_desk() -> list:
    top = flat_material("ReceptionTop", config.hex_rgb("#CFC8BC"), roughness=0.4)
    front = flat_material("ReceptionFront", config.hex_rgb("#4B3B2F"), roughness=0.6)
    dark = flat_material("ReceptionDark", config.hex_rgb("#2A2E33"), roughness=0.5)
    objects = []
    # Main run, west to east, with the visitor side to the south.
    objects.append(_box("reception_main", (2.4, 0.8, 0.75), (0, 0, 0.375), top))
    objects.append(_box("reception_front_panel", (2.4, 0.06, 1.1), (0, -0.43, 0.55), front))
    objects.append(_box("reception_counter_top", (2.5, 0.32, 0.05), (0, -0.3, 1.125), top))
    # Return at the west end running north.
    objects.append(_box("reception_return", (0.8, 1.3, 0.75), (-0.8, 0.95, 0.375), top))
    objects.append(_box("reception_return_panel", (0.06, 1.3, 1.1), (-1.23, 0.95, 0.55), front))
    # A monitor and keyboard on the staff side.
    objects.append(_box("reception_monitor", (0.5, 0.04, 0.32), (0.5, 0.12, 0.93), dark))
    objects.append(_box("reception_monitor_foot", (0.18, 0.16, 0.02), (0.5, 0.08, 0.76), dark))
    objects.append(_box("reception_keyboard", (0.42, 0.14, 0.02), (0.5, -0.1, 0.76), dark))
    objects.append(_box("reception_tray", (0.3, 0.22, 0.03), (-0.6, 0.05, 0.765), dark))
    for obj in objects[:5]:
        _bevel(obj, 0.012)
    return objects


def build_bollard() -> list:
    steel = flat_material("BollardSteel", config.hex_rgb("#33383E"), roughness=0.5, metallic=0.7)
    band = flat_material("BollardBand", config.hex_rgb("#E3CF5C"), roughness=0.5, grit=True)
    objects = [
        _cylinder("bollard_post", 0.09, 1.0, (0, 0, 0.5), steel, 32),
        _cylinder("bollard_band", 0.092, 0.1, (0, 0, 0.8), band, 32),
        _cylinder("bollard_cap", 0.095, 0.04, (0, 0, 1.02), steel, 32),
        _cylinder("bollard_base", 0.14, 0.02, (0, 0, 0.01), steel, 32),
    ]
    return objects


def build_skip() -> list:
    paint = flat_material("SkipPaint", config.hex_rgb("#3C5A42"), roughness=0.7)
    inner = flat_material("SkipInner", config.hex_rgb("#1E2226"), roughness=0.9)
    rubble_dark = flat_material("SkipRubbleDark", config.hex_rgb("#2E3136"), roughness=0.9)
    rubble_pale = flat_material("SkipRubblePale", config.hex_rgb("#A79F8E"), roughness=0.9)
    objects = []
    # Hull: a box with its top edge pushed outward on the long axis and the
    # top face removed, so the camera sees into it.
    hull = _box("skip_hull", (1.8, 1.5, 1.2), (0, 0, 0.6), paint)
    mesh = hull.data
    for vertex in mesh.vertices:
        if vertex.co.z > 0:
            vertex.co.x *= 1.25
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(mesh)
    top_faces = [face for face in bm.faces if face.normal.z > 0.5]
    bmesh.ops.delete(bm, geom=top_faces, context="FACES_ONLY")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    solid = hull.modifiers.new("Solidify", "SOLIDIFY")
    solid.thickness = 0.04
    solid.offset = -1.0
    objects.append(hull)
    # Open top: an inner dark floor and some rubble.
    objects.append(_box("skip_inner", (1.95, 1.3, 0.02), (0, 0, 0.5), inner))
    for index in range(7):
        x = _rng.uniform(-0.8, 0.8)
        y = _rng.uniform(-0.5, 0.5)
        size = _rng.uniform(0.18, 0.42)
        material = rubble_pale if index % 3 == 0 else rubble_dark
        objects.append(_box(f"skip_rubble{index}", (size, size * _rng.uniform(0.6, 1.4), size * 0.5), (x, y, 0.52 + size * 0.25), material, rotation=(0, 0, _rng.uniform(0, math.pi))))
    # Lifting lugs on each end.
    for side in (-1, 1):
        objects.append(_box(f"skip_lug{side}", (0.08, 0.3, 0.2), (side * 1.16, 0, 1.0), paint))
    # Rim.
    objects.append(_box("skip_rim_n", (2.3, 0.06, 0.06), (0, 0.75, 1.2), paint))
    objects.append(_box("skip_rim_s", (2.3, 0.06, 0.06), (0, -0.75, 1.2), paint))
    return objects


def build_palisade_fence() -> list:
    galv = _steel("PalisadeSteel", "#9AA3AA", repeat=0.4)
    objects = []
    bay = 2.75
    for side in (-1, 1):
        objects.append(_box(f"palisade_post{side}", (0.1, 0.1, 2.4), (side * bay / 2, 0, 1.2), galv))
    for z in (0.45, 2.0):
        objects.append(_box(f"palisade_rail{z}", (bay, 0.05, 0.06), (0, 0, z), galv))
    count = 17
    for index in range(count):
        x = -bay / 2 + 0.16 + index * ((bay - 0.32) / (count - 1))
        # Each pale is a shallow W: two angled blades, so it reads as a profile from above.
        for angle in (-0.6, 0.6):
            objects.append(_box(f"palisade_pale{index}_{angle}", (0.045, 0.012, 2.3), (x + 0.018 * (1 if angle > 0 else -1), 0.012 * (1 if angle > 0 else -1), 1.15), galv, rotation=(0, 0, angle)))
    return objects


def build_copier() -> list:
    shell = flat_material("CopierShell", config.hex_rgb("#D3D5D6"), roughness=0.5)
    dark = flat_material("CopierDark", config.hex_rgb("#2A2E33"), roughness=0.5)
    glass = flat_material("CopierGlass", config.hex_rgb("#5C6A74"), roughness=0.1, grit=False)
    objects = []
    objects.append(_box("copier_body", (0.62, 0.64, 0.95), (0, 0, 0.475), shell))
    _bevel(objects[-1], 0.015)
    objects.append(_box("copier_lid", (0.56, 0.5, 0.03), (0, -0.04, 0.965), shell))
    objects.append(_box("copier_feeder", (0.5, 0.18, 0.08), (0, 0.22, 1.0), dark))
    objects.append(_box("copier_panel", (0.46, 0.1, 0.02), (0, -0.32, 0.97), dark))
    objects.append(_box("copier_screen", (0.16, 0.06, 0.004), (-0.1, -0.32, 0.982), glass))
    objects.append(_box("copier_tray", (0.42, 0.26, 0.02), (0.52, 0.0, 0.5), shell))
    objects.append(_box("copier_paper", (0.3, 0.2, 0.01), (0.52, 0.0, 0.515), flat_material("CopierPaper", (0.9, 0.9, 0.9, 1.0), grit=False)))
    return objects


BUILDERS = {
    "server_rack": lambda: build_server_rack("a"),
    "server_rack_alt": lambda: build_server_rack("b"),
    "roller_shutter": build_roller_shutter,
    "dock_leveller": build_dock_leveller,
    "reception_desk": build_reception_desk,
    "bollard": build_bollard,
    "skip": build_skip,
    "palisade_fence": build_palisade_fence,
    "copier": build_copier,
}


def render_primitive(item: dict, quality: dict) -> dict:
    scene = studio.reset_scene()
    studio.set_ground(scene, True)
    builder = BUILDERS[item["id"]]
    objects = builder()
    # Bake the box scales into the meshes so texture coordinates, bevel widths
    # and the ambientCG repeats all work in metres.
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj in objects)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for obj in objects:
        obj.select_set(False)
    low, high = place(objects, 1.0, item.get("rotation_deg", 0.0))
    set_smooth(objects, 40.0)
    source = original_source(f"{item['id']} modelled from primitives in tools/render/tailgate_render/primitives.py")
    record = render_subject(scene, objects, "props", item, quality, low, high, source, "prop")
    record["original_work"] = True
    return record
