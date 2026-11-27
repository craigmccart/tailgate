"""Fixed numbers for the render pipeline. Change them here, nowhere else.

The scale rule, in one line: one map tile is 32 game pixels, which the design
treats as one metre, and every asset is rendered at 96 pixels per tile. So a
rendered image has 96 pixels per metre and three render pixels per game pixel.
A 1.44 m desk comes out 138 px wide and the game draws it 46 px wide.
"""

from __future__ import annotations

import os
from pathlib import Path

# --------------------------------------------------------------------------
# Scale
# --------------------------------------------------------------------------

#: Render pixels per 32 px map tile. Decision 4 of the visual upgrade design.
RENDER_PX_PER_TILE = 96
#: Game pixels per map tile. Fixed by the maps (tilewidth 32).
GAME_PX_PER_TILE = 32
#: How many metres one tile stands for. Chosen so kit furniture at real-world
#: size fits the rooms: the Building C office is 27 by 12 tiles, so 27 by 12 m.
METRES_PER_TILE = 1.0

PX_PER_METRE = RENDER_PX_PER_TILE / METRES_PER_TILE
RENDER_PX_PER_GAME_PX = RENDER_PX_PER_TILE / GAME_PX_PER_TILE

#: Characters are rendered larger than life so they stay readable on screen.
#: 1.5 keeps a person about three quarters of a tile across the shoulders,
#: close to today's 28 px sprites, while furniture stays true to size.
CHARACTER_WORLD_SCALE = 1.5

#: How many Blender units each kit uses per metre, measured from the models
#: (a Furniture Kit wall is 1.0 wide and 1.29 tall; a Car Kit van is 1.5 wide).
#: Value is metres per kit unit, so a model's dimensions are multiplied by it.
KIT_METRES_PER_UNIT = {
    "furniture-kit": 2.0,
    "car-kit": 2.0,
    "factory-kit": 1.0,
    "mini-market": 1.5,
    "city-kit-roads": 6.0,
    "city-kit-industrial": 7.0,
    # The character rig is 3.77 units tall and stands for a 1.8 m adult.
    "animated-characters": 1.8 / 3.77,
}

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

TOOLS_RENDER_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = TOOLS_RENDER_DIR.parent.parent
CACHE_DIR = Path(os.environ.get("TAILGATE_RENDER_CACHE", TOOLS_RENDER_DIR))
KITS_DIR = CACHE_DIR / "kits"
TEXTURES_DIR = CACHE_DIR / "textures"
WORK_DIR = TOOLS_RENDER_DIR / "work"
OUTPUT_DIR = REPO_ROOT / "public" / "assets" / "rendered"
ASSETS_JSON = TOOLS_RENDER_DIR / "assets.json"
SOURCES_JSON = TOOLS_RENDER_DIR / "sources.json"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

# --------------------------------------------------------------------------
# Render quality
# --------------------------------------------------------------------------

#: Cycles samples for the colour pass. Small images, so this is cheap on a GPU.
COLOUR_SAMPLES = 160
#: Samples for the normal pass. It is an emission render, so it is almost
#: noise free at a handful of samples; the rest is anti-aliasing.
NORMAL_SAMPLES = 24
#: --quick swaps these in while iterating on a model.
QUICK_COLOUR_SAMPLES = 32
QUICK_NORMAL_SAMPLES = 8
#: Pixel filter width. Blender's 1.5 default softens small sprites; 1.0 keeps
#: edges crisp without aliasing.
FILTER_WIDTH = 1.0
#: Extra transparent margin around every prop, in metres, so soft shadows and
#: anti-aliased edges never touch the image border.
PROP_MARGIN_M = 0.06

# --------------------------------------------------------------------------
# Lighting rig (colour pass). Neutral white only: the game adds coloured light.
# --------------------------------------------------------------------------

#: Uniform white sky. This is what bakes ambient occlusion into crevices.
WORLD_STRENGTH = 0.55
#: Soft white sun from almost straight overhead. 1.4 W/m2 makes a white
#: surface read about 0.8 linear together with the sky, so Kenney's colours
#: come out at roughly their own albedo.
SUN_STRENGTH = 1.4
#: Softness of the sun's shadows, radians. Big on purpose: a large overhead
#: softbox, not a torch.
SUN_ANGLE = 0.6
#: Tilt from vertical, degrees, towards the north. Matches the game's wall
#: extrusion, which lights north faces and darkens south faces.
SUN_TILT_DEG = 12.0

# --------------------------------------------------------------------------
# Grit. The kits are clean; these dials add the wear in the kit materials.
# --------------------------------------------------------------------------

GRIT = {
    #: Edge wear: lighter, slightly desaturated paint along bevelled edges.
    #: 5 cm is about five render pixels, enough to read as a worn rim.
    "edge_radius_m": 0.05,
    "edge_strength": 0.6,
    "edge_noise_scale": 40.0,
    #: Corner dirt: darkening in concave corners and where things meet the floor.
    "dirt_distance_m": 0.35,
    "dirt_strength": 0.55,
    #: Top wear, the part a straight-down camera actually sees: soft stains
    #: and fine scratches on every surface.
    "stain_scale": 1.8,
    "stain_strength": 0.35,
    "scratch_strength": 0.3,
    #: Large-scale tonal variation so flat colours are not perfectly flat.
    "tone_noise_scale": 2.5,
    "tone_strength": 0.1,
    #: Mute: Kenney's palette is bright and cheerful; a night-time office is
    #: not. Saturation and value multipliers applied to every kit colour.
    "mute_saturation": 0.82,
    "mute_value": 0.92,
    #: Roughness is driven by a noise around these values. Metal names in the
    #: kit materials get the shinier pair.
    "roughness_matte": (0.62, 0.9),
    "roughness_metal": (0.3, 0.55),
}

#: Material recolours by kit, keyed by the kit's material name (with Blender's
#: .001 suffixes stripped). The Furniture Kit is pale beech, salmon fabric and
#: teal metal; an office at night wants laminate, charcoal and steel. Colours
#: are sRGB hex. Kits that use a colour atlas texture cannot be remapped this
#: way and rely on the mute instead.
KIT_RECOLOUR = {
    "furniture-kit": {
        "wood": "#C4A77D",
        "woodDark": "#6B4F3A",
        "metal": "#B5BABF",
        "metalLight": "#D4D8DB",
        "metalMedium": "#7D848A",
        "metalDark": "#363B41",
        "carpet": "#343A42",
        "carpetWhite": "#CFD2D5",
        "carpetBlue": "#3F5A7A",
        "carpetDarker": "#4A3F3C",
        "_defaultMat": "#D9DCDE",
        "glass": "#9FB4BC",
        "lamp": "#F2E3B0",
        "plant": "#3F7A4A",
        "fur": "#8A6E55",
    }
}

# --------------------------------------------------------------------------
# Palette (src/config/palette.ts) and the one colour that must never appear.
# --------------------------------------------------------------------------

PALETTE = {
    "base": (0x0E, 0x11, 0x16),
    "sheet": (0x15, 0x1A, 0x21),
    "text": (0xC7, 0xCD, 0xD4),
    "amber": (0xFF, 0xB0, 0x00),
}
#: Alarm red is reserved for detection and alarm states. The manifest step
#: scans every output and fails if a pixel comes close to it.
FORBIDDEN_RED = (0xFF, 0x3B, 0x30)
FORBIDDEN_RED_TOLERANCE = 28


def srgb_to_linear(c: float) -> float:
    """sRGB 0..1 to scene linear, the exact transfer curve."""
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def rgb8(r: int, g: int, b: int, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """An 8-bit sRGB colour as the linear RGBA tuple Blender sockets want."""
    return (srgb_to_linear(r / 255), srgb_to_linear(g / 255), srgb_to_linear(b / 255), alpha)


def hex_rgb(value: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    return rgb8(int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)
