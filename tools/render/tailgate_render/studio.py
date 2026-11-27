"""The fixed render scene: camera, lights, colour management and the two passes.

Everything renders in one "studio": an orthographic camera looking straight
down the Z axis, a white sky, and one soft white sun almost overhead. The
subject is placed with its base on the floor (z = 0) and centred on the
origin. Each asset renders twice:

  colour pass   Cycles, the studio lights, ambient occlusion from the sky,
                saved as sRGB PNG with alpha.
  normal pass   every material swapped for an emission shader that prints
                the surface normal in camera space, saved as a Raw PNG so the
                bytes are the normal, not a colour-managed picture of it.

Camera space for a straight-down camera is the sprite's own tangent space:
red = +x (screen right), green = +y (screen up, north), blue = towards the
viewer. That is the OpenGL normal-map convention Phaser's Light2D expects,
with (128, 128, 255) meaning a flat, upward-facing surface.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

from . import config

_CAMERA_NAME = "TailgateCamera"
_SUN_NAME = "TailgateSun"
_GROUND_NAME = "TailgateGround"
_NORMAL_MATERIAL_NAME = "TailgateNormalPass"


def reset_scene() -> bpy.types.Scene:
    """Build the studio once and return it. Later calls just clear the subject.

    Keeping one scene for the whole run matters for speed: Cycles only has to
    load its GPU kernels once, and the camera, sun and sky never change.
    """
    scene = bpy.context.scene
    if scene.name == "TailgateStudio" and scene.camera is not None:
        clear_subject(scene)
        return scene
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "TailgateStudio"
    _configure_cycles(scene)
    _build_world(scene)
    _build_sun(scene)
    _build_camera(scene)
    _build_ground(scene)
    return scene


def clear_subject(scene: bpy.types.Scene) -> None:
    """Remove everything that is not part of the studio, and reset the lights."""
    keep = {_CAMERA_NAME, _SUN_NAME, _GROUND_NAME}
    remove_objects([obj for obj in scene.objects if obj.name not in keep])
    set_lighting(scene, sun=True, world_strength=config.WORLD_STRENGTH)
    set_ground(scene, False)
    scene.frame_set(1)
    scene.view_layers[0].material_override = None


def set_ground(scene: bpy.types.Scene, enabled: bool) -> None:
    ground = scene.objects.get(_GROUND_NAME)
    if ground:
        ground.hide_render = not enabled
        ground.hide_viewport = not enabled


def _configure_cycles(scene: bpy.types.Scene) -> None:
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    chosen = "CPU"
    for backend in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.refresh_devices()
        gpus = [d for d in prefs.devices if d.type == backend]
        if gpus:
            for device in prefs.devices:
                device.use = device.type == backend
            chosen = backend
            break
    scene.cycles.device = "GPU" if chosen != "CPU" else "CPU"
    print(f"[studio] Cycles on {chosen}")

    cycles = scene.cycles
    cycles.use_adaptive_sampling = False
    cycles.seed = 7
    cycles.use_animated_seed = False
    cycles.max_bounces = 4
    cycles.diffuse_bounces = 3
    cycles.glossy_bounces = 2
    cycles.transmission_bounces = 4
    cycles.transparent_max_bounces = 8
    cycles.caustics_reflective = False
    cycles.caustics_refractive = False
    scene.render.film_transparent = True
    scene.render.filter_size = config.FILTER_WIDTH
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1
    scene.render.pixel_aspect_y = 1
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 50
    scene.render.use_compositing = False
    scene.render.use_sequencer = False
    scene.render.dither_intensity = 0.0
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def _build_world(scene: bpy.types.Scene) -> None:
    world = bpy.data.worlds.new("TailgateSky")
    scene.world = world
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    background.inputs["Strength"].default_value = config.WORLD_STRENGTH
    output = nodes.new("ShaderNodeOutputWorld")
    links.new(background.outputs["Background"], output.inputs["Surface"])


def _build_sun(scene: bpy.types.Scene) -> None:
    light = bpy.data.lights.new(_SUN_NAME, "SUN")
    light.color = (1.0, 1.0, 1.0)
    light.energy = config.SUN_STRENGTH
    light.angle = config.SUN_ANGLE
    sun = bpy.data.objects.new(_SUN_NAME, light)
    scene.collection.objects.link(sun)
    # A sun points down its own -Z. Tilt it so the light arrives from the
    # north (+Y), which is the side the game's wall extrusion treats as lit.
    sun.rotation_euler = (math.radians(config.SUN_TILT_DEG), 0.0, 0.0)
    sun.location = (0.0, 0.0, 10.0)


def _build_camera(scene: bpy.types.Scene) -> None:
    data = bpy.data.cameras.new(_CAMERA_NAME)
    data.type = "ORTHO"
    data.clip_start = 0.01
    data.clip_end = 100.0
    camera = bpy.data.objects.new(_CAMERA_NAME, data)
    scene.collection.objects.link(camera)
    camera.location = (0.0, 0.0, 20.0)
    camera.rotation_euler = (0.0, 0.0, 0.0)
    scene.camera = camera


def set_lighting(scene: bpy.types.Scene, sun: bool = True, world_strength: float | None = None) -> None:
    """Turn the sun on or off and optionally override the sky strength."""
    sun_object = scene.objects.get(_SUN_NAME)
    if sun_object:
        sun_object.hide_render = not sun
    if world_strength is not None:
        background = scene.world.node_tree.nodes["Background"]
        background.inputs["Strength"].default_value = world_strength


def _build_ground(scene: bpy.types.Scene, size_m: float = 40.0, albedo: float = 0.45) -> bpy.types.Object:
    """A floor the camera cannot see but the lighting can.

    It gives the ambient occlusion something to meet at the base of a prop
    (the corner dirt and contact shading) and bounces a little light back
    up, without ever appearing in the image: the film is transparent and the
    plane is hidden from camera rays only. Off by default; set_ground turns
    it on for props.
    """
    mesh = bpy.data.meshes.new(_GROUND_NAME)
    half = size_m / 2
    mesh.from_pydata(
        [(-half, -half, 0.0), (half, -half, 0.0), (half, half, 0.0), (-half, half, 0.0)],
        [],
        [(0, 1, 2, 3)],
    )
    mesh.update()
    ground = bpy.data.objects.new(_GROUND_NAME, mesh)
    scene.collection.objects.link(ground)
    material = bpy.data.materials.new("TailgateGroundMat")
    ensure_nodes(material)
    principled = material.node_tree.nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (albedo, albedo, albedo, 1.0)
    principled.inputs["Roughness"].default_value = 0.9
    mesh.materials.append(material)
    ground.visible_camera = False
    ground.visible_glossy = False
    ground.visible_transmission = False
    ground.visible_volume_scatter = False
    ground.hide_render = True
    return ground


def ensure_nodes(material: bpy.types.Material) -> bpy.types.NodeTree:
    """Blender 5 materials come with a node tree; older ones need use_nodes."""
    if material.node_tree is None:
        material.use_nodes = True  # noqa: B018 (still needed on some versions)
    return material.node_tree


def frame_metres(scene: bpy.types.Scene, width_m: float, height_m: float, centre=(0.0, 0.0)) -> tuple[int, int]:
    """Point the camera at a width by height rectangle (metres) and size the image.

    Returns the pixel size. Pixel counts are rounded up to whole pixels and the
    camera covers exactly that many metres, so one metre is always exactly
    config.PX_PER_METRE pixels and nothing is resampled.
    """
    width_px = max(1, math.ceil(width_m * config.PX_PER_METRE))
    height_px = max(1, math.ceil(height_m * config.PX_PER_METRE))
    camera = scene.camera
    camera.location = (centre[0], centre[1], 20.0)
    # ortho_scale spans the larger image dimension in world units.
    larger_px = max(width_px, height_px)
    camera.data.ortho_scale = larger_px / config.PX_PER_METRE
    scene.render.resolution_x = width_px
    scene.render.resolution_y = height_px
    return width_px, height_px


def bounds(objects) -> tuple[Vector, Vector]:
    """World-space bounding box over every mesh in the list."""
    low = Vector((math.inf, math.inf, math.inf))
    high = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            low.x, low.y, low.z = min(low.x, point.x), min(low.y, point.y), min(low.z, point.z)
            high.x, high.y, high.z = max(high.x, point.x), max(high.y, point.y), max(high.z, point.z)
    return low, high


def normal_pass_material() -> bpy.types.Material:
    """Emission shader that prints the camera-space normal as a colour.

    The shading normal is transformed from world to camera space, mapped from
    -1..1 to 0..1 and emitted at strength 1. Rendered with the Raw view
    transform, the saved bytes are exactly (n * 0.5 + 0.5) * 255.
    """
    existing = bpy.data.materials.get(_NORMAL_MATERIAL_NAME)
    if existing:
        return existing
    material = bpy.data.materials.new(_NORMAL_MATERIAL_NAME)
    tree = ensure_nodes(material)
    nodes, links = tree.nodes, tree.links
    nodes.clear()
    geometry = nodes.new("ShaderNodeNewGeometry")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(encode_normal_nodes(tree, geometry.outputs["Normal"]), emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def encode_normal_nodes(tree: bpy.types.NodeTree, normal_socket) -> bpy.types.NodeSocket:
    """Wire a world-space normal socket through the same camera-space encoding
    used by normal_pass_material, returning the colour socket to emit.

    Used by materials that carry their own normal map (floors and walls), so
    their normal pass includes the texture detail rather than a flat plane.

    Cycles' camera space looks down +Z (the opposite of Blender's camera
    object), so a surface facing the camera has z = -1 there. The blue
    channel is therefore encoded from -z, which was checked by rendering a
    flat top and two tilted planes and reading the pixels back.
    """
    nodes, links = tree.nodes, tree.links
    transform = nodes.new("ShaderNodeVectorTransform")
    transform.vector_type = "NORMAL"
    transform.convert_from = "WORLD"
    transform.convert_to = "CAMERA"
    encode = nodes.new("ShaderNodeVectorMath")
    encode.operation = "MULTIPLY_ADD"
    encode.inputs[1].default_value = (0.5, 0.5, -0.5)
    encode.inputs[2].default_value = (0.5, 0.5, 0.5)
    links.new(normal_socket, transform.inputs["Vector"])
    links.new(transform.outputs["Vector"], encode.inputs[0])
    return encode.outputs["Vector"]


def render_colour(scene: bpy.types.Scene, path: Path, samples: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    view_layer = scene.view_layers[0]
    view_layer.material_override = None
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPTIX" if scene.cycles.device == "GPU" else "OPENIMAGEDENOISE"
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def render_normal(scene: bpy.types.Scene, path: Path, samples: int, override: bool = True) -> None:
    """Normal pass. With override on, every material becomes the emission
    shader. Materials that have their own "normal output" variant (floors,
    walls) call this with override off after swapping themselves."""
    path.parent.mkdir(parents=True, exist_ok=True)
    view_layer = scene.view_layers[0]
    view_layer.material_override = normal_pass_material() if override else None
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.view_settings.view_transform = "Raw"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    view_layer.material_override = None
    scene.view_settings.view_transform = "Standard"


def remove_objects(objects) -> None:
    """Delete objects and the data blocks they leave behind."""
    for obj in list(objects):
        try:
            bpy.data.objects.remove(obj, do_unlink=True)
        except ReferenceError:
            pass
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures, bpy.data.actions):
        for block in list(collection):
            if block.users == 0 and block.name not in (_NORMAL_MATERIAL_NAME,):
                try:
                    collection.remove(block)
                except (ReferenceError, RuntimeError):
                    pass
