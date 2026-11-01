# Tailgate render pipeline

This folder turns Kenney's free 3D kits into the top-down sprites, floor
textures, wall faces and character sheets that Phase 24 puts into the game.
Blender does the rendering. Nothing here touches the game code: the output
is a folder of PNGs plus a manifest that the game-side swap reads later.

Everything is CC0. Every source and every output is listed in CREDITS.md.

## What you need

- Blender 5.2 (already installed at `C:\Program Files\Blender Foundation\Blender 5.2`).
- Python 3 on the PATH (you have 3.13). The style-gate mock-up also needs
  Pillow and numpy: `pip install pillow numpy`.
- About 400 MB of disk for the downloaded kits and textures.

## One command

From the repo root:

```bash
python tools/render/render_all.py --style-gate
```

That does four things, in order:

1. Downloads the Kenney kits and ambientCG textures if they are missing (see
   "Downloading the sources" below for where they go).
2. Runs Blender headless with `tools/render/render_assets.py`, which renders
   every asset in `tools/render/assets.json`.
3. Writes `public/assets/rendered/manifest.json`.
4. Composes `docs/style-gate/building-c-office.png`, the 1440p mock-up.

A full run takes about a minute on your PC. Add `--quick` for a rough pass in
a few seconds while you are changing something. Then run
`python tools/render/update_credits.py` so CREDITS.md matches the manifest.

## Downloading the sources

`python tools/render/fetch_sources.py` downloads everything listed in
`tools/render/sources.json`:

- Kenney kits unzip into `tools/render/kits/<kit-name>/`, one folder each.
- ambientCG textures unzip into `tools/render/textures/<TextureId>/`.

Both folders are gitignored (see `tools/render/.gitignore`), so nothing
downloaded is ever committed. If you would rather keep them off the repo
drive, set the environment variable `TAILGATE_RENDER_CACHE` to another
folder before running anything; the kits and textures go there instead.

The script writes `tools/render/sources.lock.json` with the URL, size and
SHA-256 of each archive it fetched. That file is committed as the provenance
trail. Kenney's site hands out a short-lived signed link per download, so the
script asks the asset page for one each time rather than hard-coding URLs.

To add a kit or texture: add it to `sources.json`, run the fetch script, then
add the models you want to `assets.json`.

## The scale rule

- One map tile is 32 game pixels and stands for one metre.
- Every asset is rendered at 96 pixels per tile, so 96 pixels per metre and
  three render pixels per game pixel. The game draws a rendered image at a
  third of its pixel size.
- Example: the Furniture Kit desk is 1.44 m wide, renders 138 px wide, and
  the game shows it 46 px wide (just under one and a half tiles).
- Characters are rendered 1.5 times larger than life on purpose, so a person
  is about three quarters of a tile across the shoulders, close to today's
  sprites. The manifest records this as `character_world_scale`.
- Each Kenney kit uses its own unit. `tailgate_render/config.py` holds the
  metres-per-unit for each kit, measured from the models (a Furniture Kit wall
  is 1 unit wide and stands for 2 m).

## What comes out

`public/assets/rendered/`

| Folder | Contents |
| --- | --- |
| `props/` | One PNG per prop (`desk.png`) and its normal map (`desk_n.png`). Kit models and the props modelled from primitives. |
| `floors/` | Seamless floor tiles per material: carpet, hard tile, concrete, tarmac, raised floor. |
| `walls/` | Per wall material, a seamless top face (`_top`) and a side face strip (`_side`) for the wall's visible south face. |
| `characters/` | Sprite sheets: `<name>_walk.png` (16 frames) and `<name>_idle.png` (8 frames), each with a normal sheet. Guard, two staff, hi-vis worker. |
| `manifest.json` | Every file above with pixel size, metres, the game prop name it replaces or adds, and its source pack, model, author and licence. |

Normal maps are in the sprite's own tangent space, OpenGL convention: red is
screen right, green is screen up (north), blue is towards the viewer, and
(128, 128, 255) is a flat floor. If the game samples them with its y axis
pointing down, flip the green channel or invert the light's y.

Characters face right (+x) at rotation 0, which is Phaser's zero angle.

## How the rendering works

`tools/render/tailgate_render/` is a small Python package that only runs
inside Blender:

- `studio.py` builds the fixed scene: an orthographic camera looking straight
  down, a white sky (which bakes ambient occlusion into crevices), and one
  soft white sun tilted 12 degrees towards the north so top faces are lit and
  south faces fall off, matching the game's wall extrusion. No coloured light
  is baked in; the game adds light at runtime. Each asset renders twice: a
  colour pass, and a normal pass where every material is swapped for a shader
  that prints the camera-space normal.
- `materials.py` adds the grit. Kenney's kits are clean flat colours, so each
  material gets edge wear (lighter, chipped paint on bevelled edges), corner
  dirt (darkening where surfaces meet), stains and fine scratches on top
  faces, a few percent of tonal noise, noisy roughness and a mute towards
  night-time saturation. The Furniture Kit's beech, salmon fabric and teal
  metal are remapped to laminate, charcoal and steel in `config.py`.
  ambientCG textures become full PBR materials (colour, roughness, normal)
  for floors, walls and the brushed-steel props.
- `kits.py` imports a kit model, scales it to metres, sets its base on the
  floor and centres it.
- `primitives.py` models what the kits lack from boxes and cylinders in the
  same studio: two server racks with amber and white status LEDs along the
  top front edge, a roller shutter, a dock leveller with hazard stripes, a
  reception desk, a bollard, a skip, a palisade fence bay, a copier.
- `surfaces.py` renders the floor tiles and wall faces.
- `characters.py` loads Kenney's character rig, applies a skin texture,
  retargets an animation onto it and renders each frame into a sheet.
- `manifest.py` writes the manifest and scans every output for alarm red
  (#FF3B30, the colour reserved for detection). A hit fails the run.

## Characters: what the packs contain

Checked on 1 November 2026. Kenney's Animated Characters Protagonists,
Survivors and Retro packs all ship the same `characterMedium.fbx` rig and
the same three animations: idle, jump and run. None of them has a walk.

The walk sheets therefore use the run cycle (16 frames). Played at a walking
step rate from above it reads as a brisk walk. If a true walk is wanted
later it has to come from another CC0 source or be keyed by hand.

One rig, four skins. The Retro pack's `humanMaleA` and `humanFemaleA` skins
are recoloured in `characters.py` (a dark uniform for the guard, a pale shirt
for the second staff member, a hi-vis vest for the worker) and written to
`tools/render/work/skins/` before rendering.

Why the retarget: the animation files carry their own copy of the skeleton in
a different rest pose from the mesh file, so the keys cannot be assigned to
the rig directly (the arms end up half way to a T-pose). The pipeline copies
each bone's animated transform across instead.

## Rendering just one thing

```bash
python tools/render/render_all.py --only desk,chair_desk --quick
python tools/render/render_all.py --group floors,walls
```

Groups are `props`, `primitives`, `floors`, `walls`, `characters`. A partial
run merges into the existing manifest. To see the catalogue:

```bash
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P tools/render/render_assets.py -- --list
```

## Changing the look

- Lighting, scale and grit dials: `tools/render/tailgate_render/config.py`.
- Which models render and what they are called in the game: `tools/render/assets.json`.
- Which textures are used for which floor and wall: the `floors` and `walls`
  entries in `assets.json` (texture id, tint, how many metres one repeat covers).
- Furniture Kit colours: `KIT_RECOLOUR` in `config.py`.

Renders are deterministic (fixed seeds, adaptive sampling off), so re-running
without changes reproduces the same pixels.

## Style gate

`docs/style-gate/building-c-office.png` is built by
`tools/render/compose_style_gate.py` from the rendered assets at the size the
game will draw them (120 screen pixels per tile at 1440p with the planned 1.4
camera zoom). It is lit the way Phase 23 will light the game: dark ambient per
zone, light pools that stop at walls, a guard torch, surface response from the
normal maps, the darkness floor and the cool night grade. It is a mock-up made
outside the engine, not a screenshot.
