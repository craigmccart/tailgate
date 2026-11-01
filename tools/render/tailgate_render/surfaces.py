"""Floors and walls: seamless tiles rendered from ambientCG CC0 surfaces.

Floors. A square plane exactly one texture repeat across, lit by the studio
rig. The texture tiles, the normal map tiles, and the sun is a directional
light that is the same everywhere on a flat plane, so the render tiles too.
Nothing procedural that would break at the seam is added here: the game
already paints its blotches and colour wash on top.

Walls. Two images per material. The top face is a 1 m square tile the game
can lay along a wall of any length and thickness. The side face is a strip
of the material as it would be seen on the south face of the wall: the top
is lit, the bottom darkens where it meets the floor, and its normal map
leans south so runtime lights treat it as a vertical face.
"""

from __future__ import annotations

import math

import bpy

from . import config, manifest, studio
from .jobs import original_source, output_paths, texture_source
from .materials import ambientcg_material, ensure_nodes, glass_material, use_normal_output


def _plane(name: str, width_m: float, depth_m: float, z: float = 0.0) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    hx, hy = width_m / 2, depth_m / 2
    mesh.from_pydata([(-hx, -hy, z), (hx, -hy, z), (hx, hy, z), (-hx, hy, z)], [], [(0, 1, 2, 3)])
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for loop_index, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[loop_index].uv = (u, v)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _material_for(item: dict, name: str) -> bpy.types.Material:
    tint = config.hex_rgb(item["tint"]) if item.get("tint") else None
    return ambientcg_material(
        name,
        item["texture"],
        repeat_m=item["repeat_m"],
        tint=tint,
        tint_amount=item.get("tint_amount", 0.0),
        roughness_scale=item.get("roughness_scale", 1.0),
        normal_strength=item.get("normal_strength", 1.0),
        metallic=item.get("metallic", 0.0),
        seams=item.get("seams"),
    )


def _render_two_pass(scene, material, colour_path, normal_path, quality) -> None:
    use_normal_output(material, False)
    studio.render_colour(scene, colour_path, quality["colour_samples"])
    use_normal_output(material, True)
    studio.render_normal(scene, normal_path, quality["normal_samples"], override=False)
    use_normal_output(material, False)


def render_floor(item: dict, quality: dict) -> dict:
    scene = studio.reset_scene()
    size = float(item["repeat_m"])
    plane = _plane("Floor", size, size)
    material = _material_for(item, f"Floor_{item['id']}")
    plane.data.materials.append(material)
    width_px, height_px = studio.frame_metres(scene, size, size)
    colour_path, normal_path = output_paths("floors", item["id"])
    print(f"[floors] {item['id']}: {item['texture']} over {size} m -> {width_px}x{height_px} px, seamless")
    _render_two_pass(scene, material, colour_path, normal_path, quality)
    return {
        "id": item["id"],
        "kind": "floor",
        "file": manifest.relative(colour_path),
        "normal": manifest.relative(normal_path),
        "px": [width_px, height_px],
        "game_px": [round(width_px / config.RENDER_PX_PER_GAME_PX, 1), round(height_px / config.RENDER_PX_PER_GAME_PX, 1)],
        "metres": [size, size],
        "seamless": True,
        "material": item["material"],
        "game_floor_kind": item.get("game_floor_kind"),
        "source": texture_source(item["texture"]),
        "notes": item.get("notes", ""),
    }


def _glass_top_material(name: str) -> bpy.types.Material:
    """Frosted glass with an aluminium mullion through the middle of each axis,
    so a 1 m tile shows a frame line every metre along a wall in either direction."""
    material = glass_material(name, tint=(0.62, 0.72, 0.76, 1.0), alpha=0.55)
    tree = material.node_tree
    nodes, links = tree.nodes, tree.links
    principled = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    coords = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], separate.inputs["Vector"])
    # |x| < 0.02 or |y| < 0.02 -> frame
    ax = nodes.new("ShaderNodeMath")
    ax.operation = "ABSOLUTE"
    links.new(separate.outputs["X"], ax.inputs[0])
    ay = nodes.new("ShaderNodeMath")
    ay.operation = "ABSOLUTE"
    links.new(separate.outputs["Y"], ay.inputs[0])
    fx = nodes.new("ShaderNodeMath")
    fx.operation = "LESS_THAN"
    fx.inputs[1].default_value = 0.02
    links.new(ax.outputs[0], fx.inputs[0])
    fy = nodes.new("ShaderNodeMath")
    fy.operation = "LESS_THAN"
    fy.inputs[1].default_value = 0.02
    links.new(ay.outputs[0], fy.inputs[0])
    frame = nodes.new("ShaderNodeMath")
    frame.operation = "MAXIMUM"
    links.new(fx.outputs[0], frame.inputs[0])
    links.new(fy.outputs[0], frame.inputs[1])
    colour = nodes.new("ShaderNodeMix")
    colour.data_type = "RGBA"
    colour.inputs[6].default_value = (0.62, 0.72, 0.76, 1.0)
    colour.inputs[7].default_value = config.hex_rgb("#A9AFB5")
    links.new(frame.outputs[0], colour.inputs[0])
    links.new(colour.outputs[2], principled.inputs["Base Color"])
    alpha = nodes.new("ShaderNodeMath")
    alpha.operation = "MAXIMUM"
    alpha.inputs[0].default_value = 0.55
    links.new(frame.outputs[0], alpha.inputs[1])
    links.new(alpha.outputs[0], principled.inputs["Alpha"])
    rough = nodes.new("ShaderNodeMath")
    rough.operation = "MULTIPLY_ADD"
    rough.inputs[1].default_value = 0.5
    rough.inputs[2].default_value = 0.1
    links.new(frame.outputs[0], rough.inputs[0])
    links.new(rough.outputs[0], principled.inputs["Roughness"])
    _add_normal_output(material, None)
    return material


def _add_normal_output(material: bpy.types.Material, normal_socket, lean_south: float = 0.0) -> None:
    """Give a hand-built material the second (normal) output that
    ambientcg_material builds for itself."""
    tree = material.node_tree
    nodes, links = tree.nodes, tree.links
    output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL" and n.name != "TailgateNormalOutput")
    output.name = "TailgateColourOutput"
    if normal_socket is None:
        geometry = nodes.new("ShaderNodeNewGeometry")
        normal_socket = geometry.outputs["Normal"]
    if lean_south:
        lean = nodes.new("ShaderNodeVectorMath")
        lean.operation = "ADD"
        lean.inputs[1].default_value = (0.0, -lean_south, 0.0)
        links.new(normal_socket, lean.inputs[0])
        normalise = nodes.new("ShaderNodeVectorMath")
        normalise.operation = "NORMALIZE"
        links.new(lean.outputs["Vector"], normalise.inputs[0])
        normal_socket = normalise.outputs["Vector"]
    normal_output = nodes.new("ShaderNodeOutputMaterial")
    normal_output.name = "TailgateNormalOutput"
    normal_output.is_active_output = False
    emission = nodes.new("ShaderNodeEmission")
    links.new(studio.encode_normal_nodes(tree, normal_socket), emission.inputs["Color"])
    links.new(emission.outputs["Emission"], normal_output.inputs["Surface"])
    output.is_active_output = True


def _side_face_material(item: dict, name: str, height_m: float) -> bpy.types.Material:
    """The material darkened towards the floor, with normals leaning south."""
    if item.get("texture"):
        material = _material_for(item, name)
        tree = material.node_tree
        nodes, links = tree.nodes, tree.links
        principled = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
        base_link = principled.inputs["Base Color"].links[0]
        base_socket = base_link.from_socket
        normal_in = principled.inputs["Normal"]
        texture_normal = normal_in.links[0].from_socket if normal_in.is_linked else None
    else:
        material = glass_material(name, tint=(0.62, 0.72, 0.76, 1.0), alpha=0.5)
        tree = material.node_tree
        nodes, links = tree.nodes, tree.links
        principled = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
        rgb = nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = (0.62, 0.72, 0.76, 1.0)
        base_socket = rgb.outputs[0]
        texture_normal = None
        # Rails top and bottom of the glass, which also give it an edge.
        coords = nodes.new("ShaderNodeTexCoord")
        separate = nodes.new("ShaderNodeSeparateXYZ")
        links.new(coords.outputs["Object"], separate.inputs["Vector"])
        ay = nodes.new("ShaderNodeMath")
        ay.operation = "ABSOLUTE"
        links.new(separate.outputs["Y"], ay.inputs[0])
        rail = nodes.new("ShaderNodeMath")
        rail.operation = "GREATER_THAN"
        rail.inputs[1].default_value = height_m / 2 - 0.04
        links.new(ay.outputs[0], rail.inputs[0])
        colour = nodes.new("ShaderNodeMix")
        colour.data_type = "RGBA"
        colour.inputs[7].default_value = config.hex_rgb("#A9AFB5")
        links.new(rail.outputs[0], colour.inputs[0])
        links.new(base_socket, colour.inputs[6])
        base_socket = colour.outputs[2]
        alpha = nodes.new("ShaderNodeMath")
        alpha.operation = "MAXIMUM"
        alpha.inputs[0].default_value = 0.5
        links.new(rail.outputs[0], alpha.inputs[1])
        links.new(alpha.outputs[0], principled.inputs["Alpha"])

    # Darken towards the bottom (south, -y) of the strip.
    coords = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], separate.inputs["Vector"])
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = -height_m / 2
    ramp.inputs["From Max"].default_value = height_m / 2
    ramp.inputs["To Min"].default_value = 0.62
    ramp.inputs["To Max"].default_value = 1.0
    links.new(separate.outputs["Y"], ramp.inputs["Value"])
    shade = nodes.new("ShaderNodeMix")
    shade.data_type = "RGBA"
    shade.blend_type = "MULTIPLY"
    shade.inputs[0].default_value = 1.0
    links.new(base_socket, shade.inputs[6])
    links.new(ramp.outputs["Result"], shade.inputs[7])
    for link in list(principled.inputs["Base Color"].links):
        links.remove(link)
    links.new(shade.outputs[2], principled.inputs["Base Color"])

    # Rebuild the normal output with the southward lean.
    old = tree.nodes.get("TailgateNormalOutput")
    if old:
        tree.nodes.remove(old)
    _add_normal_output(material, texture_normal, lean_south=0.8)
    return material


def render_wall(item: dict, quality: dict):
    """Yields two records: the top tile and the side strip."""
    scene = studio.reset_scene()
    repeat = float(item["repeat_m"])
    source = texture_source(item["texture"]) if item.get("texture") else original_source("procedural glass partition")

    # Top face: a 1 m square (or the texture repeat, if larger) tile.
    size = max(1.0, repeat)
    plane = _plane("WallTop", size, size)
    if item.get("texture"):
        material = _material_for(item, f"WallTop_{item['id']}")
    else:
        material = _glass_top_material(f"WallTop_{item['id']}")
    plane.data.materials.append(material)
    width_px, height_px = studio.frame_metres(scene, size, size)
    colour_path, normal_path = output_paths("walls", item["id"] + "_top")
    print(f"[walls] {item['id']} top -> {width_px}x{height_px} px, seamless")
    _render_two_pass(scene, material, colour_path, normal_path, quality)
    yield {
        "id": item["id"] + "_top",
        "kind": "wall_top",
        "file": manifest.relative(colour_path),
        "normal": manifest.relative(normal_path),
        "px": [width_px, height_px],
        "game_px": [round(width_px / config.RENDER_PX_PER_GAME_PX, 1), round(height_px / config.RENDER_PX_PER_GAME_PX, 1)],
        "metres": [size, size],
        "seamless": True,
        "material": item["material"],
        "game_wall_material": item.get("game_wall_material"),
        "source": source,
        "notes": item.get("notes", ""),
    }

    # Side face: a strip one tile wide, lit at the top and dark at the floor.
    studio.clear_subject(scene)
    height = float(item.get("side_height_m", 0.34))
    strip = _plane("WallSide", 1.0, height)
    side_material = _side_face_material(item, f"WallSide_{item['id']}", height)
    strip.data.materials.append(side_material)
    width_px, height_px = studio.frame_metres(scene, 1.0, height)
    colour_path, normal_path = output_paths("walls", item["id"] + "_side")
    print(f"[walls] {item['id']} side -> {width_px}x{height_px} px, seamless along x")
    _render_two_pass(scene, side_material, colour_path, normal_path, quality)
    yield {
        "id": item["id"] + "_side",
        "kind": "wall_side",
        "file": manifest.relative(colour_path),
        "normal": manifest.relative(normal_path),
        "px": [width_px, height_px],
        "game_px": [round(width_px / config.RENDER_PX_PER_GAME_PX, 1), round(height_px / config.RENDER_PX_PER_GAME_PX, 1)],
        "metres": [1.0, height],
        "seamless": "x",
        "material": item["material"],
        "game_wall_material": item.get("game_wall_material"),
        "source": source,
        "notes": "Draw under the wall's south edge as the visible side face, in place of the extrusion band. Normals lean south.",
    }
