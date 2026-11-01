"""Materials: the grit layer for kit models, PBR surfaces from ambientCG
textures, and a few procedural materials for the modelled props.

Grit, in plain words. Kenney's kits are clean flat colours. Three things are
added inside each material so the colour pass comes out worn:

  edge wear    a Bevel node samples a rounded version of the surface normal;
               where it disagrees with the flat normal there is an edge, and
               there the paint is lightened and desaturated through a noise
               so it looks chipped and handled rather than outlined.
  corner dirt  an Ambient Occlusion node finds concave corners and the base
               of the object; the colour is darkened there, as grime settles.
  tone         a slow noise nudges the colour up and down a few percent so
               a big flat panel is not one perfect value.

Roughness is also driven by a noise so highlights break up. None of this
adds any hue: it only lightens, darkens and desaturates what the kit already
had, so a palette check on the kit is a palette check on the output.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy

from . import config
from .studio import encode_normal_nodes, ensure_nodes


# --------------------------------------------------------------------------
# Small node helpers. ShaderNodeMix has one socket per data type; for colours
# the inputs are 0 (Factor), 6 (A) and 7 (B) and the output is 2.
# --------------------------------------------------------------------------


def _mix(tree, blend: str, factor, a, b):
    node = tree.nodes.new("ShaderNodeMix")
    node.data_type = "RGBA"
    node.blend_type = blend
    node.clamp_factor = True
    node.clamp_result = True
    _plug(tree, factor, node.inputs[0])
    _plug(tree, a, node.inputs[6])
    _plug(tree, b, node.inputs[7])
    return node.outputs[2]


def _plug(tree, value, socket) -> None:
    """Connect a socket, or set a constant, into an input."""
    if isinstance(value, bpy.types.NodeSocket):
        tree.links.new(value, socket)
    elif isinstance(value, (int, float)):
        if socket.type == "RGBA":
            socket.default_value = (value, value, value, 1.0)
        else:
            socket.default_value = value
    else:
        socket.default_value = value


def _math(tree, operation: str, a, b=None, clamp: bool = True):
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = operation
    node.use_clamp = clamp
    _plug(tree, a, node.inputs[0])
    if b is not None:
        _plug(tree, b, node.inputs[1])
    return node.outputs[0]


def _noise(tree, scale: float, detail: float = 2.0, roughness: float = 0.5):
    node = tree.nodes.new("ShaderNodeTexNoise")
    node.noise_dimensions = "3D"
    node.inputs["Scale"].default_value = scale
    node.inputs["Detail"].default_value = detail
    node.inputs["Roughness"].default_value = roughness
    return node.outputs["Fac"]


def _smoothstep(tree, value, low: float, high: float):
    """0 below low, 1 above high, smooth in between (clamped Map Range)."""
    node = tree.nodes.new("ShaderNodeMapRange")
    node.interpolation_type = "SMOOTHSTEP"
    node.clamp = True
    node.inputs["From Min"].default_value = low
    node.inputs["From Max"].default_value = high
    node.inputs["To Min"].default_value = 0.0
    node.inputs["To Max"].default_value = 1.0
    _plug(tree, value, node.inputs["Value"])
    return node.outputs["Result"]


def _principled(tree):
    for node in tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def base_name(material_name: str) -> str:
    """'metalDark.003' -> 'metalDark'."""
    stem, dot, suffix = material_name.rpartition(".")
    if dot and suffix.isdigit():
        return stem
    return material_name


def recolour_objects(objects, mapping: dict[str, str]) -> None:
    """Set flat base colours by kit material name (sRGB hex). Materials that
    draw from a texture atlas are left alone."""
    if not mapping:
        return
    seen = set()
    for obj in objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            material = slot.material
            if material is None or material.name in seen:
                continue
            seen.add(material.name)
            colour = mapping.get(base_name(material.name))
            if colour is None:
                continue
            tree = ensure_nodes(material)
            principled = _principled(tree)
            if principled is None or principled.inputs["Base Color"].is_linked:
                continue
            principled.inputs["Base Color"].default_value = config.hex_rgb(colour)


# --------------------------------------------------------------------------
# Grit for kit materials
# --------------------------------------------------------------------------


def add_grit(material: bpy.types.Material, strength: float = 1.0) -> None:
    """Wrap a kit material's base colour in edge wear, corner dirt and tone.

    Works whether the base colour is a flat value (Furniture Kit) or a texture
    atlas (Car Kit, City Kits): whatever fed Base Color before now feeds the
    grit chain, and the chain feeds Base Color.
    """
    if material is None or material.get("tailgate_grit"):
        return
    tree = ensure_nodes(material)
    principled = _principled(tree)
    if principled is None:
        return
    material["tailgate_grit"] = True
    g = config.GRIT
    base_in = principled.inputs["Base Color"]

    if base_in.is_linked:
        source = base_in.links[0].from_socket
    else:
        constant = tree.nodes.new("ShaderNodeRGB")
        constant.outputs[0].default_value = tuple(base_in.default_value)
        source = constant.outputs[0]
    for link in list(base_in.links):
        tree.links.remove(link)

    # Mute first, so every later step works on the night-time version.
    mute = tree.nodes.new("ShaderNodeHueSaturation")
    mute.inputs["Saturation"].default_value = g["mute_saturation"]
    mute.inputs["Value"].default_value = g["mute_value"]
    tree.links.new(source, mute.inputs["Color"])
    source = mute.outputs["Color"]

    # No red in the world: alarm red belongs to detection alone, and the kits'
    # brake lights and red paint would read as alarm cues. Anything with a
    # saturated red hue is pulled to a dark grey of the same brightness.
    hsv = tree.nodes.new("ShaderNodeSeparateColor")
    hsv.mode = "HSV"
    tree.links.new(source, hsv.inputs["Color"])
    hue_distance = _math(tree, "MINIMUM", hsv.outputs["Red"], _math(tree, "SUBTRACT", 1.0, hsv.outputs["Red"]))
    red_hue = _math(tree, "SUBTRACT", 1.0, _smoothstep(tree, hue_distance, 0.035, 0.09))
    red_mask = _math(tree, "MULTIPLY", red_hue, _smoothstep(tree, hsv.outputs["Green"], 0.25, 0.5))
    greyed = tree.nodes.new("ShaderNodeHueSaturation")
    greyed.inputs["Saturation"].default_value = 0.12
    greyed.inputs["Value"].default_value = 0.75
    tree.links.new(source, greyed.inputs["Color"])
    source = _mix(tree, "MIX", red_mask, source, greyed.outputs["Color"])

    # Edge wear mask: 1 where the bevelled normal departs from the true one.
    bevel = tree.nodes.new("ShaderNodeBevel")
    bevel.samples = 6
    bevel.inputs["Radius"].default_value = g["edge_radius_m"]
    geometry = tree.nodes.new("ShaderNodeNewGeometry")
    dot = tree.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    tree.links.new(bevel.outputs["Normal"], dot.inputs[0])
    tree.links.new(geometry.outputs["Normal"], dot.inputs[1])
    edge_raw = _math(tree, "SUBTRACT", 1.0, dot.outputs["Value"])
    edge_gain = _math(tree, "MULTIPLY", edge_raw, 10.0)
    edge_noise = _math(tree, "MULTIPLY", _noise(tree, g["edge_noise_scale"], 3.0, 0.6), 1.6)
    edge_mask = _math(tree, "MULTIPLY", _math(tree, "MULTIPLY", edge_gain, edge_noise), g["edge_strength"] * strength)

    # Worn colour: lighter and a little greyer than the paint around it.
    desaturate = tree.nodes.new("ShaderNodeHueSaturation")
    desaturate.inputs["Saturation"].default_value = 0.6
    desaturate.inputs["Value"].default_value = 1.0
    tree.links.new(source, desaturate.inputs["Color"])
    worn = _mix(tree, "MIX", 0.35, desaturate.outputs["Color"], (0.9, 0.9, 0.9, 1.0))
    with_edges = _mix(tree, "MIX", edge_mask, source, worn)

    # Top wear: soft stains and fine scratches, the wear a top-down view sees.
    stain_noise = _noise(tree, g["stain_scale"], 4.0, 0.6)
    stain_mask = _math(tree, "MULTIPLY", _smoothstep(tree, stain_noise, 0.52, 0.72), g["stain_strength"] * strength)
    stained = _mix(tree, "MULTIPLY", 1.0, with_edges, (0.78, 0.76, 0.74, 1.0))
    with_edges = _mix(tree, "MIX", stain_mask, with_edges, stained)
    scratch_coords = tree.nodes.new("ShaderNodeMapping")
    scratch_coords.vector_type = "POINT"
    scratch_coords.inputs["Scale"].default_value = (90.0, 7.0, 40.0)
    scratch_coords.inputs["Rotation"].default_value = (0.0, 0.0, 0.5)
    tree.links.new(geometry.outputs["Position"], scratch_coords.inputs["Vector"])
    scratch_tex = tree.nodes.new("ShaderNodeTexNoise")
    scratch_tex.inputs["Scale"].default_value = 1.0
    scratch_tex.inputs["Detail"].default_value = 1.0
    tree.links.new(scratch_coords.outputs["Vector"], scratch_tex.inputs["Vector"])
    scratch_mask = _math(tree, "MULTIPLY", _math(tree, "GREATER_THAN", scratch_tex.outputs["Fac"], 0.74), g["scratch_strength"] * strength)
    scratched = _mix(tree, "MIX", 0.3, with_edges, (0.92, 0.92, 0.92, 1.0))
    with_edges = _mix(tree, "MIX", scratch_mask, with_edges, scratched)

    # Corner dirt: darken where the AO node finds cover.
    ao = tree.nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 8
    ao.inside = False
    ao.only_local = False
    ao.inputs["Distance"].default_value = g["dirt_distance_m"]
    occlusion = _math(tree, "SUBTRACT", 1.0, ao.outputs["AO"])
    dirt_mask = _math(tree, "MULTIPLY", _math(tree, "POWER", occlusion, 1.4), g["dirt_strength"] * strength)
    dirty = _mix(tree, "MULTIPLY", 1.0, with_edges, (0.42, 0.4, 0.38, 1.0))
    with_dirt = _mix(tree, "MIX", dirt_mask, with_edges, dirty)

    # Tone: slow noise, centred on zero, scaled to a few percent.
    tone = _math(tree, "SUBTRACT", _noise(tree, g["tone_noise_scale"], 1.5, 0.5), 0.5, clamp=False)
    tone_amount = _math(tree, "MULTIPLY", tone, 2.0 * g["tone_strength"] * strength, clamp=False)
    lighter = _mix(tree, "MIX", 0.5, with_dirt, (1.0, 1.0, 1.0, 1.0))
    darker = _mix(tree, "MIX", 0.5, with_dirt, (0.0, 0.0, 0.0, 1.0))
    tone_pos = _math(tree, "MAXIMUM", tone_amount, 0.0)
    tone_neg = _math(tree, "MAXIMUM", _math(tree, "MULTIPLY", tone_amount, -1.0, clamp=False), 0.0)
    toned = _mix(tree, "MIX", tone_neg, _mix(tree, "MIX", tone_pos, with_dirt, lighter), darker)
    tree.links.new(toned, base_in)

    # Roughness: noisy, matte for most things, shinier for metal.
    name = material.name.lower()
    low, high = g["roughness_metal"] if "metal" in name or "chrome" in name or "steel" in name else g["roughness_matte"]
    rough_noise = _noise(tree, 25.0, 2.0, 0.5)
    roughness = _math(tree, "MULTIPLY_ADD", rough_noise, high - low, clamp=False)
    rough_node = roughness.node
    rough_node.inputs[2].default_value = low
    rough_in = principled.inputs["Roughness"]
    for link in list(rough_in.links):
        tree.links.remove(link)
    tree.links.new(roughness, rough_in)
    if "metal" in name or "chrome" in name or "steel" in name:
        principled.inputs["Metallic"].default_value = max(principled.inputs["Metallic"].default_value, 0.6)
    principled.inputs["Specular IOR Level"].default_value = 0.4


def add_grit_to_objects(objects, strength: float = 1.0) -> None:
    seen = set()
    for obj in objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            if slot.material and slot.material.name not in seen:
                seen.add(slot.material.name)
                add_grit(slot.material, strength)


# --------------------------------------------------------------------------
# ambientCG PBR surfaces
# --------------------------------------------------------------------------


def _find_map(folder: Path, suffix: str) -> Path | None:
    for candidate in sorted(folder.glob(f"*_{suffix}.*")):
        if candidate.suffix.lower() in (".jpg", ".jpeg", ".png"):
            return candidate
    return None


def _image(path: Path, non_colour: bool) -> bpy.types.Image:
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = "Non-Color" if non_colour else "sRGB"
    return image


def ambientcg_material(
    name: str,
    asset_id: str,
    repeat_m: float,
    tint: tuple[float, float, float, float] | None = None,
    tint_amount: float = 0.0,
    roughness_scale: float = 1.0,
    normal_strength: float = 1.0,
    metallic: float = 0.0,
    seams: dict | None = None,
) -> bpy.types.Material:
    """A Principled material from an ambientCG texture folder.

    `repeat_m` is how many metres one copy of the texture covers. The planes
    rendered for floors are an integer number of repeats across, which is
    what makes the output tile. `seams` adds a procedural grid of dark joints
    (raised floor panels, wall panels): pitch_m, width_m, depth.

    The material stores two output nodes. The default is the colour shader;
    `use_normal_output` swaps to an emission of the camera-space normal with
    the texture's normal map folded in, for the normal pass.
    """
    folder = config.TEXTURES_DIR / asset_id
    if not folder.is_dir():
        raise FileNotFoundError(f"texture folder missing: {folder}. Run tools/render/fetch_sources.py")
    material = bpy.data.materials.new(name)
    tree = ensure_nodes(material)
    nodes, links = tree.nodes, tree.links
    principled = _principled(tree)
    output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")

    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.vector_type = "POINT"
    mapping.inputs["Scale"].default_value = (1.0 / repeat_m, 1.0 / repeat_m, 1.0)
    links.new(coords.outputs["Object"], mapping.inputs["Vector"])

    def tex(suffix: str, non_colour: bool):
        path = _find_map(folder, suffix)
        if path is None:
            return None
        node = nodes.new("ShaderNodeTexImage")
        node.image = _image(path, non_colour)
        node.interpolation = "Cubic"
        node.extension = "REPEAT"
        node.projection = "FLAT"
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        return node

    colour = tex("Color", False)
    roughness = tex("Roughness", True)
    normal = tex("NormalGL", True)
    occlusion = tex("AmbientOcclusion", True)

    base = colour.outputs["Color"] if colour else (0.5, 0.5, 0.5, 1.0)
    if occlusion:
        base = _mix(tree, "MULTIPLY", 0.7, base, occlusion.outputs["Color"])
    if tint is not None and tint_amount > 0:
        base = _mix(tree, "MIX", tint_amount, base, tint)
    if seams:
        base, seam_bump = _seam_grid(tree, mapping, base, repeat_m, seams)
    else:
        seam_bump = None
    tree.links.new(base, principled.inputs["Base Color"]) if isinstance(base, bpy.types.NodeSocket) else None
    if roughness:
        rough = _math(tree, "MULTIPLY", roughness.outputs["Color"], roughness_scale)
        links.new(rough, principled.inputs["Roughness"])
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Specular IOR Level"].default_value = 0.35

    normal_socket = None
    if normal:
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.space = "TANGENT"
        normal_map.inputs["Strength"].default_value = normal_strength
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        normal_socket = normal_map.outputs["Normal"]
    if seam_bump is not None:
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.6
        bump.inputs["Distance"].default_value = 0.01
        links.new(seam_bump, bump.inputs["Height"])
        if normal_socket is not None:
            links.new(normal_socket, bump.inputs["Normal"])
        normal_socket = bump.outputs["Normal"]
    if normal_socket is not None:
        links.new(normal_socket, principled.inputs["Normal"])
    else:
        geometry = nodes.new("ShaderNodeNewGeometry")
        normal_socket = geometry.outputs["Normal"]

    # Second output: the encoded normal, selected for the normal pass.
    normal_output = nodes.new("ShaderNodeOutputMaterial")
    normal_output.name = "TailgateNormalOutput"
    normal_output.is_active_output = False
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    links.new(encode_normal_nodes(tree, normal_socket), emission.inputs["Color"])
    links.new(emission.outputs["Emission"], normal_output.inputs["Surface"])
    output.name = "TailgateColourOutput"
    output.is_active_output = True
    return material


def _seam_grid(tree, mapping, base, repeat_m: float, seams: dict):
    """Dark joint lines on a grid, returned as (colour socket, height socket)."""
    nodes = tree.nodes
    brick = nodes.new("ShaderNodeTexBrick")
    pitch = seams["pitch_m"] / repeat_m  # in texture repeats
    brick.inputs["Scale"].default_value = 1.0 / pitch
    brick.inputs["Mortar Size"].default_value = seams["width_m"] / seams["pitch_m"] * 0.5
    brick.inputs["Mortar Smooth"].default_value = 0.1
    brick.inputs["Bias"].default_value = 0.0
    brick.inputs["Brick Width"].default_value = 1.0
    brick.inputs["Row Height"].default_value = 1.0
    brick.offset = 0.0
    brick.offset_frequency = 1
    brick.inputs["Color1"].default_value = (1.0, 1.0, 1.0, 1.0)
    brick.inputs["Color2"].default_value = (1.0, 1.0, 1.0, 1.0)
    brick.inputs["Mortar"].default_value = (0.0, 0.0, 0.0, 1.0)
    tree.links.new(mapping.outputs["Vector"], brick.inputs["Vector"])
    joint = brick.outputs["Fac"]  # 1 in the mortar
    darkened = _mix(tree, "MULTIPLY", 1.0, base, (1.0 - seams["depth"],) * 3 + (1.0,))
    colour = _mix(tree, "MIX", joint, base, darkened)
    height = _math(tree, "SUBTRACT", 1.0, joint)
    return colour, height


def use_normal_output(material: bpy.types.Material, enabled: bool) -> None:
    """Swap a two-output material between its colour and normal outputs."""
    tree = material.node_tree
    colour = tree.nodes.get("TailgateColourOutput")
    normal = tree.nodes.get("TailgateNormalOutput")
    if colour and normal:
        colour.is_active_output = not enabled
        normal.is_active_output = enabled


# --------------------------------------------------------------------------
# Procedural materials for the modelled props
# --------------------------------------------------------------------------


def flat_material(name: str, colour, roughness: float = 0.7, metallic: float = 0.0, grit: bool = True) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    tree = ensure_nodes(material)
    principled = _principled(tree)
    principled.inputs["Base Color"].default_value = colour
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if grit:
        add_grit(material)
    return material


def emission_material(name: str, colour, strength: float = 6.0) -> bpy.types.Material:
    """A light-emitting surface (rack LEDs). Not gritted: a lit LED is clean."""
    material = bpy.data.materials.new(name)
    tree = ensure_nodes(material)
    principled = _principled(tree)
    principled.inputs["Base Color"].default_value = colour
    principled.inputs["Emission Color"].default_value = colour
    principled.inputs["Emission Strength"].default_value = strength
    return material


def glass_material(name: str, tint=(0.75, 0.86, 0.9, 1.0), alpha: float = 0.45) -> bpy.types.Material:
    """Glass partition: seen from above it is a faint, slightly cool sheet."""
    material = bpy.data.materials.new(name)
    tree = ensure_nodes(material)
    principled = _principled(tree)
    principled.inputs["Base Color"].default_value = tint
    principled.inputs["Roughness"].default_value = 0.08
    principled.inputs["Alpha"].default_value = alpha
    principled.inputs["Specular IOR Level"].default_value = 0.6
    material.surface_render_method = "BLENDED"
    return material


def hazard_stripe_material(name: str, pitch_m: float = 0.12, angle_deg: float = 45.0) -> bpy.types.Material:
    """Yellow and black chevrons for dock edges. Yellow is a safety colour and
    nothing like alarm red; the palette check still runs on the output."""
    material = bpy.data.materials.new(name)
    tree = ensure_nodes(material)
    nodes = tree.nodes
    principled = _principled(tree)
    geometry = nodes.new("ShaderNodeNewGeometry")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(angle_deg))
    mapping.inputs["Scale"].default_value = (1.0 / pitch_m, 1.0 / pitch_m, 1.0)
    tree.links.new(geometry.outputs["Position"], mapping.inputs["Vector"])
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.wave_profile = "SAW"
    wave.inputs["Scale"].default_value = 1.0
    tree.links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    step = _math(tree, "GREATER_THAN", wave.outputs["Fac"], 0.5)
    colour = _mix(tree, "MIX", step, config.hex_rgb("#E0B400"), config.hex_rgb("#1B1D20"))
    tree.links.new(colour, principled.inputs["Base Color"])
    principled.inputs["Roughness"].default_value = 0.65
    add_grit(material, 0.8)
    return material


def chequer_plate_material(name: str, base=(0.52, 0.54, 0.56, 1.0)) -> bpy.types.Material:
    """Steel chequer plate for the dock leveller: brushed metal with a bump grid."""
    material = ambientcg_material(name, "Metal009", repeat_m=0.6, tint=base, tint_amount=0.35, roughness_scale=0.9, metallic=0.85)
    tree = material.node_tree
    nodes = tree.nodes
    principled = _principled(tree)
    coords = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (22.0, 22.0, 1.0)
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(45.0))
    tree.links.new(coords.outputs["Object"], mapping.inputs["Vector"])
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.wave_profile = "SIN"
    tree.links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.004
    tree.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    normal_in = principled.inputs["Normal"]
    if normal_in.is_linked:
        tree.links.new(normal_in.links[0].from_socket, bump.inputs["Normal"])
    tree.links.new(bump.outputs["Normal"], normal_in)
    return material
