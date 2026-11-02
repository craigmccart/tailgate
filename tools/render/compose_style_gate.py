r"""
Style gate: one 2560 by 1440 mock-up of the Building C office at night, built
from the rendered assets exactly as the game would draw them, but composed
here with Pillow and numpy rather than in Phaser.

It is an honest fake. Everything on screen is a rendered PNG from
public/assets/rendered/ at the scale the game will use (one tile is 120
screen pixels at 1440p with the planned 1.4 camera zoom), lit with the same
ingredients Phase 23 adds: a dark ambient per zone, light pools that stop at
walls, a guard torch cone, surface response from the rendered normal maps,
the darkness floor, and the cool night grade. The room layout follows the
Building C office in public/maps/building-c.json (two rows of desks with
chairs on the south side, the opening in the south wall to the corridor);
the glass wall and the slice of car park beyond the corridor are the
design's "car park through the window", which the current map does not have.

Run from the repo root after rendering:

  python tools/render/compose_style_gate.py

Writes docs/style-gate/building-c-office.png. Needs Pillow and numpy.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
RENDERED = REPO / "public" / "assets" / "rendered"
OUTPUT = REPO / "docs" / "style-gate" / "building-c-office.png"

WIDTH, HEIGHT = 2560, 1440
TILE = 120.0  # screen px per map tile: 2560 / 960 * 32 * 1.4 zoom, rounded
RENDER_PX_PER_TILE = 96.0
SCALE = TILE / RENDER_PX_PER_TILE

rng = random.Random(2411)

# --------------------------------------------------------------------------
# Loading rendered assets
# --------------------------------------------------------------------------

_manifest = json.loads((RENDERED / "manifest.json").read_text(encoding="utf-8"))
_by_id = {entry["id"]: entry for entry in _manifest["assets"]}


def load_pair(asset_id: str) -> tuple[Image.Image, Image.Image]:
    entry = _by_id[asset_id]
    colour = Image.open(RENDERED / entry["file"]).convert("RGBA")
    normal = Image.open(RENDERED / entry["normal"]).convert("RGBA")
    return colour, normal


def to_screen(image: Image.Image) -> Image.Image:
    return image.resize((max(1, round(image.width * SCALE)), max(1, round(image.height * SCALE))), Image.BILINEAR)


def sheet_frame(asset_id: str, index: int) -> tuple[Image.Image, Image.Image]:
    entry = _by_id[asset_id]
    colour, normal = load_pair(asset_id)
    cell_w, cell_h = entry["frame_px"]
    box = (index * cell_w, 0, (index + 1) * cell_w, cell_h)
    return colour.crop(box), normal.crop(box)


def rotate_normal(normal: Image.Image, degrees: float) -> Image.Image:
    """Rotate a normal map image and its vectors together (green is +y up)."""
    rotated = normal.rotate(degrees, resample=Image.BILINEAR, expand=True)
    arr = np.asarray(rotated).astype(np.float32)
    nx = arr[..., 0] / 255 * 2 - 1
    ny = arr[..., 1] / 255 * 2 - 1
    theta = math.radians(degrees)
    rx = nx * math.cos(theta) - ny * math.sin(theta)
    ry = nx * math.sin(theta) + ny * math.cos(theta)
    arr[..., 0] = (rx * 0.5 + 0.5) * 255
    arr[..., 1] = (ry * 0.5 + 0.5) * 255
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


# --------------------------------------------------------------------------
# Layers
# --------------------------------------------------------------------------

FLAT_NORMAL = (128, 128, 255, 255)


class Layers:
    """Albedo and normal canvases, plus the wall mask used for light occlusion."""

    def __init__(self) -> None:
        self.albedo = Image.new("RGBA", (WIDTH, HEIGHT), (10, 12, 16, 255))
        self.normal = Image.new("RGBA", (WIDTH, HEIGHT), FLAT_NORMAL)
        self.walls = Image.new("L", (WIDTH, HEIGHT), 0)
        self.glass = Image.new("L", (WIDTH, HEIGHT), 0)
        self.wet = Image.new("L", (WIDTH, HEIGHT), 0)

    def tile(self, asset_id: str, box: tuple[float, float, float, float], wet: bool = False) -> None:
        """Fill a screen-space box (tiles) with a seamless rendered tile."""
        colour, normal = load_pair(asset_id)
        colour, normal = to_screen(colour), to_screen(normal)
        x0, y0, x1, y1 = (int(round(v * TILE)) for v in box)
        for layer, source in ((self.albedo, colour), (self.normal, normal)):
            y = y0
            while y < y1:
                x = x0
                while x < x1:
                    crop = source.crop((0, 0, min(source.width, x1 - x), min(source.height, y1 - y)))
                    layer.paste(crop, (x, y))
                    x += source.width
                y += source.height
        if wet:
            ImageDraw.Draw(self.wet).rectangle((x0, y0, x1, y1), fill=255)

    def sprite(self, asset_id: str, centre: tuple[float, float], degrees: float = 0.0, frame: int | None = None, shadow: bool = True) -> None:
        """Place a prop or a character frame by its centre (tiles)."""
        if frame is None:
            colour, normal = load_pair(asset_id)
        else:
            colour, normal = sheet_frame(asset_id, frame)
        colour, normal = to_screen(colour), to_screen(normal)
        if degrees:
            colour = colour.rotate(degrees, resample=Image.BILINEAR, expand=True)
            normal = rotate_normal(normal, degrees)
        cx, cy = centre[0] * TILE, centre[1] * TILE
        pos = (int(round(cx - colour.width / 2)), int(round(cy - colour.height / 2)))
        if shadow:
            # The game's silhouette drop shadow and contact blob, in one.
            silhouette = Image.new("RGBA", colour.size, (5, 7, 9, 0))
            silhouette.putalpha(colour.getchannel("A").point(lambda a: int(a * 0.45)))
            silhouette = silhouette.filter(ImageFilter.GaussianBlur(6))
            self.albedo.alpha_composite(silhouette, (pos[0] + 12, pos[1] + 16))
        self.albedo.alpha_composite(colour, pos)
        self.normal.alpha_composite(normal, pos)

    def tile_over(self, asset_id: str, box: tuple[float, float, float, float], alpha: float = 1.0) -> None:
        """Like tile, but alpha-composited, for see-through surfaces such as glass."""
        colour, _ = load_pair(asset_id)
        colour = to_screen(colour)
        if alpha < 1.0:
            colour.putalpha(colour.getchannel("A").point(lambda a: int(a * alpha)))
        x0, y0, x1, y1 = (int(round(v * TILE)) for v in box)
        layer = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
        y = 0
        while y < layer.height:
            x = 0
            while x < layer.width:
                layer.alpha_composite(colour.crop((0, 0, min(colour.width, layer.width - x), min(colour.height, layer.height - y))), (x, y))
                x += colour.width
            y += colour.height
        self.albedo.alpha_composite(layer, (x0, y0))

    def wall(self, box: tuple[float, float, float, float], material: str = "wall_office_plaster") -> None:
        """A wall slab: rendered top face with the rendered side face along its south edge."""
        x0, y0, x1, y1 = box
        side_m = 0.3
        # Silhouette shadow to the south east at the venue profile's strength
        # (alpha 0.22, offset 5 by 6 game px), softened.
        shadow = Image.new("RGBA", self.albedo.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rectangle((x0 * TILE + 19, y0 * TILE + 22, x1 * TILE + 19, y1 * TILE + 22), fill=(5, 7, 9, 56))
        self.albedo.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(4)))
        self.tile(material + "_top", (x0, y0, x1, y1 - side_m))
        self.tile(material + "_side", (x0, y1 - side_m, x1, y1))
        draw = ImageDraw.Draw(self.albedo)
        # The lit north lip and the crease where the top face meets the side.
        draw.line((x0 * TILE, y0 * TILE, x1 * TILE, y0 * TILE), fill=(235, 238, 242, 120), width=2)
        draw.line((x0 * TILE, (y1 - side_m) * TILE, x1 * TILE, (y1 - side_m) * TILE), fill=(20, 24, 30, 140), width=2)
        draw.line((x0 * TILE, y1 * TILE - 1, x1 * TILE, y1 * TILE - 1), fill=(20, 24, 30, 160), width=2)
        ImageDraw.Draw(self.walls).rectangle((x0 * TILE, y0 * TILE, x1 * TILE - 1, y1 * TILE - 1), fill=255)
        # Contact occlusion on the floor below, soft and short.
        for i in range(8):
            alpha = int(70 * (1 - i / 8))
            draw.line((x0 * TILE, y1 * TILE + i, x1 * TILE, y1 * TILE + i), fill=(5, 7, 9, alpha))

    def glass_wall(self, box: tuple[float, float, float, float]) -> None:
        """A glass partition: the rendered glass tile, see-through, with a frame rail
        each side. Not a light occluder, so the car park lamp reaches the corridor."""
        x0, y0, x1, y1 = box
        self.tile_over("wall_glass_partition_top", box, alpha=0.9)
        draw = ImageDraw.Draw(self.albedo)
        draw.rectangle((x0 * TILE, y0 * TILE, x1 * TILE, y0 * TILE + 4), fill=(128, 134, 140, 255))
        draw.rectangle((x0 * TILE, y1 * TILE - 5, x1 * TILE, y1 * TILE), fill=(96, 102, 108, 255))
        x = x0
        while x <= x1:
            draw.rectangle((x * TILE - 3, y0 * TILE, x * TILE + 3, y1 * TILE), fill=(118, 124, 130, 255))
            x += 2.0
        ImageDraw.Draw(self.glass).rectangle((x0 * TILE, y0 * TILE, x1 * TILE, y1 * TILE), fill=255)


# --------------------------------------------------------------------------
# Decals: UK markings drawn in code, as the design says they will be
# --------------------------------------------------------------------------


def font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in (REPO / "node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff", Path("C:/Windows/Fonts/consola.ttf")):
        try:
            return ImageFont.truetype(str(candidate), size)
        except OSError:
            continue
    return ImageFont.load_default()


def decals(layers: Layers) -> None:
    draw = ImageDraw.Draw(layers.albedo)
    t = TILE
    # Worn carpet: a lighter traffic path from the opening to the desks.
    wear = Image.new("RGBA", layers.albedo.size, (0, 0, 0, 0))
    wd = ImageDraw.Draw(wear)
    wd.line((10.7 * t, 7.5 * t, 10.7 * t, 1.6 * t), fill=(190, 195, 205, 22), width=int(1.2 * t))
    wd.line((2.0 * t, 4.0 * t, 20.0 * t, 4.0 * t), fill=(190, 195, 205, 16), width=int(1.0 * t))
    layers.albedo.alpha_composite(wear.filter(ImageFilter.GaussianBlur(40)))
    # Cable tray along the office's north wall, under the desks' power.
    draw.rectangle((0.8 * t, 0.95 * t, 20.4 * t, 1.06 * t), fill=(38, 41, 46, 120))
    for x in range(1, 21):
        draw.rectangle((x * t - 3, 0.95 * t, x * t + 3, 1.06 * t), fill=(70, 74, 80, 110))
    # Corridor: a pair of pale walkway lines and a muted "keep clear" box at the office opening.
    draw.line((0, 9.65 * t, WIDTH, 9.65 * t), fill=(200, 204, 208, 45), width=4)
    draw.line((0, 8.55 * t, WIDTH, 8.55 * t), fill=(200, 204, 208, 45), width=4)
    for i in range(0, 8):
        x = 8.4 * t + i * 0.6 * t
        draw.line((x, 8.4 * t, x + 0.45 * t, 9.8 * t), fill=(160, 140, 60, 38), width=4)
    draw.rectangle((8.3 * t, 8.35 * t, 13.0 * t, 9.85 * t), outline=(160, 140, 60, 60), width=4)
    # Car park: bay lines, bay numbers, a hatched area and double yellows along the kerb.
    for i in range(0, 9):
        x = (1.5 + i * 2.6) * t
        draw.line((x, 10.75 * t, x, HEIGHT), fill=(225, 228, 230, 120), width=6)
    small = font(26)
    for i in range(0, 8):
        x = (2.8 + i * 2.6) * t
        draw.text((x, 10.95 * t), f"V-{i + 1:02d}", font=small, fill=(225, 228, 230, 110), anchor="mm")
    for i in range(0, 7):
        x = 16.2 * t + i * 0.4 * t
        draw.line((x, 10.75 * t, x + 0.9 * t, HEIGHT), fill=(225, 228, 230, 70), width=5)
    draw.line((0, 10.62 * t, WIDTH, 10.62 * t), fill=(190, 165, 55, 110), width=5)
    draw.line((0, 10.69 * t, WIDTH, 10.69 * t), fill=(190, 165, 55, 110), width=5)


def wall_signs(layers: Layers) -> None:
    """Signs sit on the wall tops, so they are drawn after the walls."""
    draw = ImageDraw.Draw(layers.albedo)
    t = TILE
    sign = font(22)
    for x, label in ((13.4, "OPEN PLAN  B"), (3.2, "FIRE EXIT  >")):
        draw.rectangle((x * t, 7.62 * t, (x + 1.65) * t, 7.92 * t), fill=(26, 30, 36, 235), outline=(120, 126, 134, 255), width=2)
        draw.text(((x + 0.825) * t, 7.77 * t), label, font=sign, fill=(199, 205, 212, 255), anchor="mm")


# --------------------------------------------------------------------------
# Lighting, the Phase 23 ingredients
# --------------------------------------------------------------------------


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def shadow_mask(walls: np.ndarray, light_xy: tuple[float, float], downscale: int = 4, samples: int = 64) -> np.ndarray:
    """1 where a pixel can see the light, 0 where a wall is in the way.

    Computed at reduced resolution by marching from each pixel towards the
    light and asking whether any step lands on a wall. Wall pixels themselves
    are left lit so top faces still catch light.
    """
    small = walls[::downscale, ::downscale] > 0
    h, w = small.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    lx, ly = light_xy[0] / downscale, light_xy[1] / downscale
    visible = np.ones((h, w), dtype=np.float32)
    for step in range(2, samples):
        t = step / samples
        sx = np.clip((xs + (lx - xs) * t).astype(np.int32), 0, w - 1)
        sy = np.clip((ys + (ly - ys) * t).astype(np.int32), 0, h - 1)
        visible = np.where(small[sy, sx], 0.0, visible)
    visible = np.where(small, 1.0, visible)
    full = np.kron(visible, np.ones((downscale, downscale), dtype=np.float32))[:HEIGHT, :WIDTH]
    blurred = Image.fromarray((full * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))
    return np.asarray(blurred).astype(np.float32) / 255


def light_pool(normal: np.ndarray, walls: np.ndarray, x: float, y: float, radius: float, height: float, colour, intensity: float, cone: tuple[float, float, float] | None = None) -> np.ndarray:
    """One light's contribution, as an HxWx3 array."""
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    dx, dy = x - xs, y - ys
    dist = np.sqrt(dx * dx + dy * dy)
    falloff = np.clip(1 - dist / radius, 0, 1) ** 1.6
    if cone is not None:
        facing, half_deg, soft_deg = cone
        angle = np.degrees(np.arctan2(dy, dx))
        delta = np.abs((angle - facing + 180) % 360 - 180)
        falloff = falloff * (1 - smoothstep(half_deg - soft_deg, half_deg + soft_deg, delta))
    d3 = np.sqrt(dx * dx + dy * dy + height * height)
    lx, ly, lz = dx / d3, dy / d3, height / d3
    nx = normal[..., 0] / 255 * 2 - 1
    ny = -(normal[..., 1] / 255 * 2 - 1)  # green is +y up; the screen's y points down
    nz = normal[..., 2] / 255 * 2 - 1
    diffuse = np.clip(nx * lx + ny * ly + nz * lz, 0, 1)
    shadow = shadow_mask(walls, (x, y))
    term = falloff * diffuse * shadow * intensity
    return term[..., None] * np.array(colour, dtype=np.float32)[None, None, :]


def wet_sheen(normal: np.ndarray, wet: np.ndarray, x: float, y: float, height: float) -> np.ndarray:
    """A cheap specular highlight for rain-wet tarmac under the lamp."""
    ys, xs = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    dx, dy = x - xs, y - ys
    d3 = np.sqrt(dx * dx + dy * dy + height * height)
    hx, hy, hz = dx / d3, dy / d3, (height / d3) + 1.0  # half vector with the straight-down view
    hn = np.sqrt(hx * hx + hy * hy + hz * hz)
    nx = normal[..., 0] / 255 * 2 - 1
    ny = -(normal[..., 1] / 255 * 2 - 1)
    nz = normal[..., 2] / 255 * 2 - 1
    spec = np.clip((nx * hx + ny * hy + nz * hz) / hn, 0, 1) ** 40
    return (spec * wet / 255 * 0.55)[..., None] * np.array((0.75, 0.82, 0.95), dtype=np.float32)


def rain(image: Image.Image, box: tuple[int, int, int, int], count: int = 900) -> None:
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = box
    for _ in range(count):
        x = rng.uniform(x0, x1)
        y = rng.uniform(y0, y1)
        length = rng.uniform(10, 26)
        draw.line((x, y, x - length * 0.25, y + length), fill=(200, 215, 235, rng.randint(14, 34)), width=1)
    image.alpha_composite(layer)


# --------------------------------------------------------------------------
# The scene
# --------------------------------------------------------------------------


def build() -> Image.Image:
    layers = Layers()
    t = TILE

    # Floors. Office carpet, corridor hard tile, a pavement strip, then tarmac.
    layers.tile("floor_carpet", (0, 0, 21.4, 8.3))
    layers.tile("floor_tile", (0, 8.3, 21.4, 10.4))
    layers.tile("floor_concrete", (0, 10.4, 21.4, 10.75))
    layers.tile("floor_tarmac", (0, 10.75, 21.4, 12.0), wet=True)

    decals(layers)

    # Props in the office: two rows of desks as the map has them, chairs south of each desk
    # facing north, monitors and keyboards on top. Storage along the walls.
    for row, (desk, y) in enumerate((("desk", 2.35), ("desk_small", 5.35))):
        for column in range(4):
            x = 2.6 + column * 4.9
            layers.sprite(desk, (x, y))
            if (row + column) % 3 == 1:
                layers.sprite("laptop", (x - 0.05, y - 0.05), degrees=-8)
            else:
                layers.sprite("monitor", (x + 0.05, y - 0.26))
                layers.sprite("keyboard", (x - 0.05, y + 0.12))
            if column in (0, 2):
                layers.sprite("desk_lamp", (x - 0.6, y - 0.2))
            if (row + column) % 2 == 0:
                layers.sprite("books", (x + 0.55, y + 0.1), degrees=12)
            else:
                layers.sprite("plant_small", (x + 0.58, y - 0.2))
            layers.sprite("chair_desk", (x + 0.05, y + 0.95), degrees=180)
    layers.sprite("cabinet", (20.2, 1.55))
    layers.sprite("cabinet", (20.2, 3.2))
    layers.sprite("cabinet", (1.0, 6.3), degrees=90)
    layers.sprite("plant", (20.6, 6.9))
    layers.sprite("plant", (1.0, 1.5))
    layers.sprite("bin", (5.0, 6.95))
    layers.sprite("bin", (14.2, 1.3))
    layers.sprite("copier", (18.6, 6.8), degrees=180)
    layers.sprite("box_closed", (19.4, 5.1), degrees=20)
    layers.sprite("box_open", (18.6, 4.6), degrees=-12)

    # Walls. North wall, the south wall with the opening to the corridor, and
    # a part-height partition on the east side (as the map's officeRight walls do).
    layers.wall((0, 0, 21.4, 0.75))
    layers.wall((0, 7.5, 8.2, 8.3))
    layers.wall((13.2, 7.5, 21.4, 8.3))
    layers.wall((17.2, 3.9, 21.4, 4.4))
    wall_signs(layers)
    # The building's south elevation: glass onto the car park.
    layers.glass_wall((0, 10.1, 21.4, 10.4))

    # Outside: bollards, a parked car, a lamp post and a skip.
    layers.sprite("bollard", (9.0, 10.9))
    layers.sprite("bollard", (10.6, 10.9))
    layers.sprite("bollard", (12.2, 10.9))
    layers.sprite("car_sedan", (6.2, 11.55), degrees=90)
    layers.sprite("car_hatchback", (3.65, 11.55), degrees=90)
    layers.sprite("lamp_post", (14.9, 10.95))
    layers.sprite("skip", (19.4, 11.5), degrees=4)

    # People. A late worker in the chair at the third desk, the guard walking the corridor with a torch.
    layers.sprite("staff_a_idle", (12.5, 3.25), degrees=90, frame=2)
    guard_xy = (6.4, 9.1)
    layers.sprite("guard_walk", guard_xy, degrees=0, frame=5)

    albedo = np.asarray(layers.albedo.convert("RGB")).astype(np.float32) / 255
    normal = np.asarray(layers.normal.convert("RGB")).astype(np.float32)
    walls = np.asarray(layers.walls)
    wet = np.asarray(layers.wet).astype(np.float32)

    # Ambient per zone (lighting.ts: office 0.3, corridor/route 0.4, car park 0.55),
    # cool at night, with the darkness floor of 0.28 underneath everything.
    ambient = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)
    ys = np.mgrid[0:HEIGHT, 0:WIDTH][0]
    office = ys < 8.3 * t
    corridor = (ys >= 8.3 * t) & (ys < 10.4 * t)
    outside = ys >= 10.4 * t
    ambient[office] = np.array((0.30, 0.32, 0.38))
    ambient[corridor] = np.array((0.33, 0.35, 0.41))
    ambient[outside] = np.array((0.44, 0.49, 0.60))
    light = np.maximum(ambient, 0.28 * np.array((0.9, 0.93, 1.0), dtype=np.float32))

    # Desk pools (warm task lamps), the office centre pool, a corridor strip light,
    # the car park lamp (cool), and the guard's torch, all occluded by walls.
    warm = (1.0, 0.86, 0.66)
    cool = (0.78, 0.86, 1.0)
    for x, y in ((2.6, 2.35), (12.4, 2.35), (2.6, 5.35), (12.4, 5.35)):
        light += light_pool(normal, walls, x * t, (y - 0.1) * t, 3.6 * t, 1.9 * t, warm, 1.35)
    light += light_pool(normal, walls, 17.6 * t, 2.4 * t, 4.2 * t, 2.6 * t, (0.9, 0.92, 0.98), 0.85)
    light += light_pool(normal, walls, 10.7 * t, 9.3 * t, 4.5 * t, 2.4 * t, (0.85, 0.9, 1.0), 0.5)
    light += light_pool(normal, walls, 14.9 * t, 10.95 * t, 7.0 * t, 4.2 * t, cool, 1.1)
    light += wet_sheen(normal, wet, 14.9 * t, 10.95 * t, 4.2 * t)
    torch_origin = ((guard_xy[0] + 0.45) * t, (guard_xy[1] + 0.05) * t)
    light += light_pool(normal, walls, torch_origin[0], torch_origin[1], 7.5 * t, 1.1 * t, (1.0, 0.95, 0.85), 1.2, cone=(0.0, 22.0, 6.0))

    lit = albedo * np.clip(light, 0, 1.7)
    # Seen through the glass: a faint cool cast over everything outside.
    lit[outside] = lit[outside] * np.array((0.9, 0.95, 1.0), dtype=np.float32) + np.array((0.02, 0.03, 0.05), dtype=np.float32)

    # Night grade: the cool tint FeedTreatment carries, a soft vignette, static grain.
    lit *= np.array((0.88, 0.93, 1.06), dtype=np.float32)
    yy, xx = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
    r = np.sqrt(((xx - WIDTH / 2) / (WIDTH / 2)) ** 2 + ((yy - HEIGHT / 2) / (HEIGHT / 2)) ** 2)
    lit *= (1 - 0.28 * np.clip(r - 0.55, 0, 1) ** 1.5)[..., None]
    grain = np.random.default_rng(7).normal(0, 0.012, (HEIGHT, WIDTH, 1)).astype(np.float32)
    lit = np.clip(lit + grain, 0, 1)

    frame = Image.fromarray((lit * 255).astype(np.uint8), "RGB").convert("RGBA")
    rain(frame, (0, int(10.4 * t), WIDTH, HEIGHT))

    # Guard torch as a visible soft beam, drawn over the top like the Phase 23 cone.
    beam = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(beam)
    ox, oy = torch_origin
    length = 7.0 * t
    polygon = [(ox, oy)]
    for deg in range(-22, 23, 2):
        polygon.append((ox + math.cos(math.radians(deg)) * length, oy + math.sin(math.radians(deg)) * length))
    bd.polygon(polygon, fill=(255, 240, 200, 26))
    beam = beam.filter(ImageFilter.GaussianBlur(18))
    beam_arr = np.asarray(beam).astype(np.float32)
    mask = shadow_mask(walls, torch_origin)
    beam_arr[..., 3] *= mask
    beam = Image.fromarray(beam_arr.astype(np.uint8), "RGBA")
    frame.alpha_composite(beam)

    # Caption, small, bottom left, in the HUD's own grey.
    draw = ImageDraw.Draw(frame)
    cap = font(24)
    draw.rectangle((24, HEIGHT - 60, 1010, HEIGHT - 20), fill=(14, 17, 22, 200))
    draw.text((40, HEIGHT - 40), "TAILGATE  /  STYLE GATE  /  BUILDING C OFFICE  /  rendered assets composed outside the engine, 1440p at 1.4x zoom", font=cap, fill=(199, 205, 212, 255), anchor="lm")
    return frame


def main() -> int:
    frame = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame.convert("RGB").save(OUTPUT, optimize=True)
    print(f"style gate written: {OUTPUT} ({frame.width}x{frame.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
