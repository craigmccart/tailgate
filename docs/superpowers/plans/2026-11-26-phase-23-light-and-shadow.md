# Phase 23: Light and Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light stops at walls and closed doors, for what the player sees and for what guards use, with static lights baked once per level, guard torches drawn as soft beams, glowing rack LEDs, and a measured Light2D seam ready for Phase 24's normal maps.

**Architecture:** One pure occlusion module (lifted from `VisionCone.ts`) answers "does this segment cross a wall or closed door" and "how far does this ray travel". `LightModel` (detection) becomes pure and uses it, so the analytic light can only get darker. The renderer bakes each static light once into its own small occluded texture and erases those from the veil each frame (keeping the breathe), rebaking only lights near a door that changes state, with a short crossfade. Guard torches become a per-frame triangle fan clipped by the same rays. A Light2D spike sits behind a dev-only key so its frame cost is measured, not shipped.

**Tech Stack:** Phaser 3.90, TypeScript strict, Vite 8, Vitest (node environment, no DOM), ESLint. Branch `phase-23-light-and-shadow`, cut from `phase-22-frame-and-feel` (Phase 22, PR #25, is not merged yet).

**Spec:** `docs/superpowers/specs/2026-11-01-visual-upgrade-design.html` (Decision 5 "Light and shadow", Decision 7's Phase 23 row, Non-goals, Anti-goals, Accessibility rules, Risks).

## Global Constraints

- UK English in code comments, copy, docs and commits. No em dashes anywhere. Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm run typecheck`, `npm run lint` and `npx vitest run` must pass before every commit. No `any`.
- Palette is fixed: base `#0E1116`, amber `#FFB000`, text `#C7CDD4`. Use `PALETTE` / `PALETTE_HEX` from `src/config/palette.ts`, never literals. Alarm red `#FF3B30` appears only in detection and alarm states: never in a light, glow or beam.
- Every tunable number lives in a `src/config/*.ts` file with a comment Craig can read.
- Detection changes in exactly one way: light becomes wall-aware, which can only make a point darker, never brighter (spec Non-goals and Decision 5). Guard behaviour, `VisionCone.canSee`, door schedules and level layout do not change.
- The darkness floor (`LIGHTING.visibilityFloorGlobal`), `extraBrightness` and the player aura keep working exactly as today. The aura is not occluded: it is a readability aid, never counted for detection.
- All atmosphere motion sits behind `getSettings().screenEffects` (the existing light breathe). Off means off. The camera never snaps, nothing flashes, and no new effect has a period under 2.5 seconds.
- No new runtime dependencies and no texture files: every texture is generated at runtime, so `CREDITS.md` does not change.
- Frame budget: 60 fps at 1440p on Craig's PC, and at least 30 fps at RENDER SCALE 50 percent with Chrome's CPU throttled 4x (the integrated-GPU laptop stand-in Phase 22 used). Below about 24 fps a known watchdog bug slows guards, so the budget is a gameplay issue.
- The branch's PR targets `main` once PR #25 is merged; until then it is opened against `phase-22-frame-and-feel` and says so.

## Review Focus

1. A light whose centre sits inside a wall rectangle: eight data-centre rack lights do. They must still light the aisles beside them, for the eye and for guards. Tests in Task 1 (`segmentBlocked` ignores a rect containing either end), Task 2 (real data-centre racks) and Task 4 (bake).
2. A door that opens and closes on a schedule: the light through it must not pop on and off. The visible change crossfades over `LIGHTING.bake.crossfadeMs` (300); detection changes the same frame, because it must be truthful. Test in Task 4 (`crossfadeAlpha`), manual check in Task 9.
3. Occlusion only ever darkens: on all three maps, at every sampled floor point, the occluded light is less than or equal to the unoccluded light. Property test in Task 2.
4. The darkest occluded spot (behind a wall, far from any light) at `extraBrightness` 0 and at its maximum: floor texture and wall silhouettes still read. The veil's fill maths is unchanged; manual check in Task 9.
5. Detain restarts and resizes: baked textures are made once per life and removed on shutdown (no growth across three detains), and a canvas resize or RENDER SCALE change does not rebake. Manual check in Task 9 (texture count before and after three detains and one render-scale change).

---

### Task 1: Shared occlusion maths

**Files:**
- Create: `src/systems/occlusion.ts`
- Test: `src/systems/occlusion.test.ts`
- Modify: `src/systems/VisionCone.ts` (delete its private `rayToSegment`; `rayDistance` delegates to `rayDistanceToRects`)

**Interfaces:**
- Produces (pure, no Phaser import):
  - `interface Rect { x: number; y: number; width: number; height: number }`
  - `rayToSegment(ox, oy, dx, dy, ax, ay, bx, by): number` (moved verbatim from `VisionCone.ts`: distance along the unit ray to the segment, or `Infinity`)
  - `rayDistanceToRects(ox: number, oy: number, dx: number, dy: number, rects: readonly Rect[], maxDist: number): number` (nearest hit on any rect edge, capped at `maxDist`; the same loop as `VisionCone.rayDistance`)
  - `rectContains(rect: Rect, x: number, y: number): boolean` (edges inclusive)
  - `segmentBlocked(ax: number, ay: number, bx: number, by: number, rects: readonly Rect[]): boolean`: true when the segment touches any rect that contains neither end. Touching an edge or a corner counts as blocked.

`segmentBlocked` uses a slab (Liang-Barsky) clip of the segment against each rect, so it needs no Phaser geometry. `VisionCone.canSee` is not changed: it keeps `Phaser.Geom.Intersects.LineToRectangle`, so guard sight is byte-for-byte what it was.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { rayDistanceToRects, rayToSegment, rectContains, segmentBlocked } from './occlusion';

const wall = { x: 10, y: -5, width: 4, height: 10 };

describe('rayToSegment', () => {
  it('measures the distance to a segment ahead', () => {
    expect(rayToSegment(0, 0, 1, 0, 10, -5, 10, 5)).toBeCloseTo(10);
  });
  it('misses a parallel segment and one behind the origin', () => {
    expect(rayToSegment(0, 0, 1, 0, 0, 5, 10, 5)).toBe(Infinity);
    expect(rayToSegment(0, 0, 1, 0, -10, -5, -10, 5)).toBe(Infinity);
  });
});

describe('rayDistanceToRects', () => {
  it('stops at the nearest rect edge', () => {
    expect(rayDistanceToRects(0, 0, 1, 0, [wall], 100)).toBeCloseTo(10);
  });
  it('is capped at the maximum distance', () => {
    expect(rayDistanceToRects(0, 0, 1, 0, [], 100)).toBe(100);
    expect(rayDistanceToRects(0, 0, 1, 0, [{ ...wall, x: 200 }], 100)).toBe(100);
  });
});

describe('segmentBlocked', () => {
  it('is blocked by a wall between the ends', () => {
    expect(segmentBlocked(0, 0, 30, 0, [wall])).toBe(true);
  });
  it('is clear when the segment passes beside the wall', () => {
    expect(segmentBlocked(0, 20, 30, 20, [wall])).toBe(false);
  });
  it('ignores a rect that contains the start (a light inside a rack row)', () => {
    expect(segmentBlocked(12, 0, 40, 0, [wall])).toBe(false);
  });
  it('ignores a rect that contains the end (light landing on a wall)', () => {
    expect(segmentBlocked(-20, 0, 12, 0, [wall])).toBe(false);
  });
  it('counts touching a corner as blocked', () => {
    expect(segmentBlocked(0, -15, 20, 5, [{ x: 10, y: -5, width: 4, height: 10 }])).toBe(true);
  });
});

describe('rectContains', () => {
  it('includes the edges', () => {
    expect(rectContains(wall, 10, -5)).toBe(true);
    expect(rectContains(wall, 9.9, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/systems/occlusion.test.ts`
Expected: FAIL, module `./occlusion` not found.

- [ ] **Step 3: Implement `src/systems/occlusion.ts`, then make `VisionCone.ts` import `rayToSegment` and `rayDistanceToRects` and delete its own copies**

- [ ] **Step 4: Run the tests and the full suite**

Run: `npx vitest run src/systems/occlusion.test.ts` then `npx vitest run`
Expected: PASS, and every existing test still passes (the cone behaviour is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/systems/occlusion.ts src/systems/occlusion.test.ts src/systems/VisionCone.ts
git commit -m "refactor: share the wall raycast between vision cones and lighting"
```

---

### Task 2: Wall-aware detection light

**Files:**
- Modify: `src/systems/LightModel.ts` (drop the Phaser import; constructor gains walls and an options object; new `setClosedDoors`)
- Modify: `src/scenes/BuildingScene.ts` (construct with `map.walls`; call `setClosedDoors(closedDoors)` before `computeLightAt` each frame, around lines 539 to 550)
- Test: `src/systems/LightModel.test.ts`

**Interfaces:**
- Consumes: `Rect`, `segmentBlocked` from Task 1.
- Produces:
  - `new LightModel(zones: readonly ZoneRect[], lights: readonly LightRect[], walls: readonly Rect[], options: { occlusion: boolean } = { occlusion: true })`
  - `setClosedDoors(rects: readonly Rect[]): void` (replaces the set used for this frame)
  - `computeLightAt`, `setGuardTorches` and `get sources()` keep their signatures.

With `occlusion: true`, a static source contributes at a point only when `segmentBlocked(source, point, walls + closed doors)` is false, and a guard torch only when `segmentBlocked(guard, point, walls + closed doors)` is false. Everything else (ambient, falloff, torch cone, clamp) is unchanged. `Phaser.Math` calls are replaced by local one-line helpers (degrees to radians, angle wrap to the range minus pi to pi, clamp) so the file runs under Vitest. To keep it cheap, each static source keeps the list of walls that overlap its reach box, built once in the constructor.

- [ ] **Step 1: Write the failing tests**

Helper in the test: `loadMap(raw)` parses the Tiled JSON (the same approach as `src/systems/guardRoutes.test.ts`, with `?raw` imports of the three maps) into `zones` (with `restricted` and `exterior` read from object properties, default false), `lights` (`kind` from the object's `type` or `class`) and `walls`.

```ts
const zone = { name: 'unknownZone', x: 0, y: 0, width: 400, height: 300, restricted: false, exterior: false };
const pool = { id: 'p', kind: 'pool', x: 100, y: 100, width: 0, height: 0 };
const wall = { x: 150, y: 0, width: 10, height: 300 };
// AMBIENT_FALLBACK is 0.4 and LIGHTING.pool is { intensity: 0.9, radiusPx: 140 }.

it('lights the near side of a wall as before', () => {
  const model = new LightModel([zone], [pool], [wall]);
  expect(model.computeLightAt(120, 100)).toBeCloseTo(0.9 * (1 - 20 / 140));
});
it('gives nothing behind a wall', () => {
  expect(new LightModel([zone], [pool], [wall]).computeLightAt(170, 100)).toBeCloseTo(0.4);
  expect(new LightModel([zone], [pool], [wall], { occlusion: false }).computeLightAt(170, 100)).toBeCloseTo(0.45);
});
it('is blocked by a closed door and passes an open one', () => {
  const model = new LightModel([zone], [pool], []);
  model.setClosedDoors([wall]);
  expect(model.computeLightAt(170, 100)).toBeCloseTo(0.4);
  model.setClosedDoors([]);
  expect(model.computeLightAt(170, 100)).toBeCloseTo(0.45);
});
it("stops a guard's torch at a wall", () => {
  const model = new LightModel([zone], [], [wall]);
  model.setGuardTorches([{ x: 100, y: 100, facing: 0 }]);
  expect(model.computeLightAt(170, 100)).toBeCloseTo(0.4);
});
it.each(LEVELS)('%s: occlusion only ever darkens', (_name, raw) => {
  // Every 32 px grid point not inside a wall, all doors closed:
  // occluded <= unoccluded + 1e-9.
});
it('data centre: every rack light inside a rack row still lights an aisle beside it', () => {
  // For each data-centre light whose centre is inside a wall rect R: sample
  // (cx, R.y - 16) and (cx, R.y + R.height + 16); at least one is brighter
  // than its zone's ambient.
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/systems/LightModel.test.ts`
Expected: FAIL (the constructor takes no walls yet, or Phaser cannot load under node).

- [ ] **Step 3: Implement the pure, wall-aware `LightModel` and wire `BuildingScene` (pass `map.walls`; `this.lightModel.setClosedDoors(closedDoors)` straight after `closedDoors` is computed)**

- [ ] **Step 4: Run the tests and the full suite**

Run: `npx vitest run src/systems/LightModel.test.ts` then `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/LightModel.ts src/systems/LightModel.test.ts src/scenes/BuildingScene.ts
git commit -m "feat: the light guards use stops at walls and closed doors"
```

---

### Task 3: Cover report

**Files:**
- Create: `src/world/coverReport.ts`, test `src/world/coverReport.test.ts`

**Interfaces:**
- Consumes: `LightModel` (Task 2), `HUD.exposure.dimAbove` (0.34, the meter's HIDDEN threshold) from `src/config/hud.ts`.
- Produces: `coverByZone(input: { zones: readonly ZoneRect[]; lights: readonly LightRect[]; walls: readonly Rect[]; closedDoors: readonly Rect[]; cellPx: number }): { zone: string; hiddenBefore: number; hiddenAfter: number }[]`, where hidden is the share (0 to 1) of cell centres in that zone, outside every wall, whose light is below `HUD.exposure.dimAbove`; "before" uses `occlusion: false`, "after" `occlusion: true`; a cell belongs to the last zone that contains it (the `LightModel` rule). No guard torches.

- [ ] **Step 1: Write the failing tests**

A one-zone, one-pool, one-wall synthetic case with `cellPx: 20`: `hiddenAfter >= hiddenBefore`, and a cell behind the wall within the pool's reach is counted hidden only after. Then, for each real map with every door closed: every zone's `hiddenAfter >= hiddenBefore`.

Add one opt-in report, silent in normal runs:

```ts
it.runIf(process.env.COVER_REPORT === '1')('prints the per-site cover table', () => {
  // console.table per site: zone, hidden before %, hidden after %, change in points
});
```

- [ ] **Step 2: Run them to verify they fail** (`npx vitest run src/world/coverReport.test.ts`, module not found)

- [ ] **Step 3: Implement `coverByZone`**

- [ ] **Step 4: Run the tests** (PASS; the report test is skipped)

- [ ] **Step 5: Commit**

```bash
git add src/world/coverReport.ts src/world/coverReport.test.ts
git commit -m "test: measure how much cover wall-aware light adds per room"
```

---

### Task 4: Baked static lights with occlusion

**Files:**
- Create: `src/systems/lightBake.ts` (pure), test `src/systems/lightBake.test.ts`
- Create: `src/systems/LightBakeCache.ts` (Phaser: textures, door rebakes, crossfade)
- Modify: `src/systems/LightingRenderer.ts` (static lights are erased from their baked textures instead of the radial brush; the brush stays for the aura)
- Modify: `src/config/lighting.ts` (add `bake: { texelPx: 2, crossfadeMs: 300 }` with comments)
- Modify: `src/scenes/BuildingScene.ts` (build the cache after `LightModel`, pass it to `LightingRenderer`, call `setClosedDoors(closedDoors, now)` each frame, destroy on SHUTDOWN)

**Interfaces:**
- Consumes: `Rect`, `segmentBlocked` (Task 1); `LightSource` from `LightModel`.
- Produces:
  - `lightFalloff(t: number): number`: the existing brush's gradient as a function of distance over radius: 1 at 0, 0.65 at 0.55, 0 at 1 and beyond, linear between.
  - `bakeLight(input: { x: number; y: number; radiusPx: number; occluders: readonly Rect[]; texelPx: number }): { originX: number; originY: number; sizeTexels: number; alpha: Uint8ClampedArray }`: a square of `sizeTexels = ceil(2 * radiusPx / texelPx)` texels whose world top-left is `(x - sizeTexels * texelPx / 2, y - same)`; each texel's alpha is `round(255 * lightFalloff(dist / radiusPx))` at its centre, or 0 when `segmentBlocked(source, texel centre, occluders)`. Intensity is not baked in: the renderer applies it with the breathe, as today.
  - `crossfadeAlpha(elapsedMs: number, durationMs: number): number`: clamp of elapsed over duration to 0..1 (1 when duration is 0).
  - `LightingRenderer` changes to `new LightingRenderer(scene: Phaser.Scene, bakes: LightBakeCache)` and `update(cam, player, guards)`: the `sources` argument goes, because the cache supplies the static lights.
  - `class LightBakeCache { constructor(scene: Phaser.Scene, sources: readonly LightSource[], walls: readonly Rect[]); setClosedDoors(rects: readonly Rect[], nowMs: number): void; entries(nowMs: number): readonly BakeEntry[]; destroy(): void }`, with `BakeEntry = { source: LightSource; key: string; worldX: number; worldY: number; worldSize: number; fade: number }`. Each source's occluders are the walls and closed doors overlapping its reach box. `setClosedDoors` compares the new closed set with the previous one and rebakes only sources whose reach box overlaps a door that changed. The old texture stays in `entries` with `fade = 1 - crossfadeAlpha(...)` and the new one with `fade = crossfadeAlpha(...)` until the crossfade ends, then the old texture is removed. Texture keys are unique per cache instance (a module counter), canvas textures, LINEAR filtered.

`LightingRenderer.draw` erases each entry with one reusable image brush (`setTexture(key)`, origin 0, placed with `veilErasePoint(worldX, worldY, origin, zoom)`, scaled `point.scale * texelPx`), alpha `clamp(intensity * breathe * fade, 0, 1)` where `breathe` is today's `breatheFactor` (1 when SCREEN EFFECTS is off). The guard torch and aura erases stay as they are in this task (Task 5 replaces the torch).

- [ ] **Step 1: Write the failing tests**

```ts
describe('lightFalloff', () => {
  it('matches the old brush', () => {
    expect(lightFalloff(0)).toBe(1);
    expect(lightFalloff(0.55)).toBeCloseTo(0.65);
    expect(lightFalloff(1)).toBe(0);
    expect(lightFalloff(1.5)).toBe(0);
  });
});
describe('bakeLight', () => {
  // The alpha of the texel under a world point, for texelPx 2.
  const at = (b: ReturnType<typeof bakeLight>, wx: number, wy: number): number =>
    b.alpha[Math.floor((wy - b.originY) / 2) * b.sizeTexels + Math.floor((wx - b.originX) / 2)];
  it('is full at the centre and empty past the reach', () => {
    const b = bakeLight({ x: 100, y: 100, radiusPx: 40, occluders: [], texelPx: 2 });
    expect(b.sizeTexels).toBe(40);
    expect(at(b, 100, 100)).toBeGreaterThan(240);
    expect(at(b, 61, 61)).toBe(0);
  });
  it('is dark behind a wall', () => {
    const b = bakeLight({ x: 100, y: 100, radiusPx: 40, occluders: [{ x: 110, y: 60, width: 4, height: 80 }], texelPx: 2 });
    expect(at(b, 120, 100)).toBe(0);
    expect(at(b, 90, 100)).toBeGreaterThan(0);
  });
  it('still shines out of a wall that contains the light', () => {
    const b = bakeLight({ x: 100, y: 100, radiusPx: 40, occluders: [{ x: 90, y: 96, width: 20, height: 8 }], texelPx: 2 });
    expect(at(b, 100, 116)).toBeGreaterThan(0);
  });
});
describe('crossfadeAlpha', () => {
  it('ramps from 0 to 1 over the duration', () => {
    expect(crossfadeAlpha(0, 300)).toBe(0);
    expect(crossfadeAlpha(150, 300)).toBeCloseTo(0.5);
    expect(crossfadeAlpha(900, 300)).toBe(1);
    expect(crossfadeAlpha(0, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail** (module not found)
- [ ] **Step 3: Implement `lightBake.ts`, `LightBakeCache.ts`, the config, the renderer change and the scene wiring**
- [ ] **Step 4: Run the tests and the full suite** (PASS)
- [ ] **Step 5: Build and commit** (`npm run build` succeeds)

```bash
git add src/systems/lightBake.ts src/systems/lightBake.test.ts src/systems/LightBakeCache.ts src/systems/LightingRenderer.ts src/config/lighting.ts src/scenes/BuildingScene.ts
git commit -m "feat: static lights are baked with wall shadows and crossfade when a door moves"
```

---

### Task 5: Guard torch beams

**Files:**
- Create: `src/systems/torchBeam.ts` (pure), test `src/systems/torchBeam.test.ts`
- Modify: `src/systems/LightingRenderer.ts` (replace the radial guard erase with the beam)
- Modify: `src/config/lighting.ts` (add `torchBeam: { intensity: 0.525, edgeFeatherDeg: 8 }`; 0.525 is today's `guardTorchIntensity * 0.7`, so the beam is as bright as the current glow)
- Modify: `src/scenes/BuildingScene.ts` (pass the walls and this frame's closed doors into the renderer's update)

**Interfaces:**
- Consumes: `rayDistanceToRects` and `Rect` (Task 1); `CONE_RANGE_PX`, `DETECTION.cone.fovDegrees`, `DETECTION.cone.renderRays` from `src/config/detection.ts`.
- Changes: `LightingRenderer.update(cam, player, guards, beamOccluders: readonly Rect[])`, where `beamOccluders` is the walls plus this frame's closed doors.
- Produces: `torchBeamTriangles(input: { x: number; y: number; facing: number; halfFovRad: number; rangePx: number; rays: number; intensity: number; edgeFeatherRad: number; occluders: readonly Rect[] }): BeamTriangle[]` with `BeamTriangle = { ax: number; ay: number; aAlpha: number; bx: number; by: number; bAlpha: number; cx: number; cy: number; cAlpha: number }`. There are `rays - 1` triangles, each from the guard to two neighbouring rim points. A rim point lies at `rayDistanceToRects(...)` along its ray (the cone's own clipping). Its alpha is `intensity * (1 - dist / rangePx) * feather`. The origin alpha of each triangle is `intensity * min(featherB, featherC)`. Here `feather = clamp(angleFromNearestConeEdge / edgeFeatherRad, 0, 1)`.

The renderer draws the triangles into a free Graphics (`scene.make.graphics({}, false)`) in veil coordinates (each vertex through `veilErasePoint`), with `fillGradientStyle` giving the three vertex alphas (white), then `rt.erase(graphics)`. Behind SCREEN EFFECTS: no; the beam is gameplay information and does not move on its own.

- [ ] **Step 1: Write the failing tests**

```ts
const base = { x: 0, y: 0, facing: 0, halfFovRad: (35 * Math.PI) / 180, rangePx: 200, rays: 9, intensity: 0.5, edgeFeatherRad: (8 * Math.PI) / 180, occluders: [] };

it('makes one triangle per gap between rays', () => {
  expect(torchBeamTriangles(base)).toHaveLength(8);
});
it('fades to nothing at full range in the open', () => {
  for (const t of torchBeamTriangles(base)) {
    expect(t.bAlpha).toBeCloseTo(0);
    expect(t.cAlpha).toBeCloseTo(0);
  }
});
it('pools light on a wall at half range', () => {
  const tris = torchBeamTriangles({ ...base, occluders: [{ x: 100, y: -300, width: 10, height: 600 }] });
  const middle = tris[3];
  expect(middle.bx).toBeCloseTo(100, 0);
  expect(middle.bAlpha).toBeGreaterThan(0.2);
});
it('feathers the cone edges', () => {
  const tris = torchBeamTriangles(base);
  expect(tris[0].aAlpha).toBeLessThan(tris[3].aAlpha);
  expect(tris[3].aAlpha).toBeCloseTo(0.5);
});
```

- [ ] **Step 2: Run them to verify they fail**
- [ ] **Step 3: Implement `torchBeamTriangles` and the renderer change**
- [ ] **Step 4: Check the per-vertex alpha in a browser**

In Building C (dev server, the hidden-pane loop trick from the project memory), watch one guard: the beam should fade along its length and at its edges and stop at walls. If Phaser 3.90 draws the triangles flat (one alpha per triangle), stop and report BLOCKED with a full-resolution capture. Do not substitute another method without a ruling.

- [ ] **Step 5: Run the full suite and commit**

```bash
git add src/systems/torchBeam.ts src/systems/torchBeam.test.ts src/systems/LightingRenderer.ts src/config/lighting.ts src/scenes/BuildingScene.ts
git commit -m "feat: guard torches are soft beams that stop at walls"
```

---

### Task 6: Rack LED glows

**Files:**
- Create: `src/systems/rackGlows.ts` (pure colour choice plus a small Phaser builder), test `src/systems/rackGlows.test.ts`
- Modify: `src/config/lighting.ts` (add `rackGlow: { radiusPx: 9, alpha: 0.6, depth: 25.5 }`)
- Modify: `src/scenes/BuildingScene.ts` (build the glows once in `create`)

**Interfaces:**
- Produces: `rackGlowColour(x: number, y: number): 'amber' | 'white'` (stable for a position: the same light is always the same colour, across restarts) and `addRackGlows(scene: Phaser.Scene, sources: readonly LightSource[]): void` (one additive image per `kind === 'rack'` source, from a generated soft-dot texture, LINEAR, tinted `PALETTE_HEX.amber` or `PALETTE_HEX.text`, at depth 25.5, above the veil and below the cones at 26, so the LEDs glow in the dark).

- [ ] **Step 1: Write the failing tests**: the same position always gives the same colour; across the data-centre map's rack lights both colours appear.
- [ ] **Step 2: Run them to verify they fail**
- [ ] **Step 3: Implement and wire**
- [ ] **Step 4: Run the full suite and commit**

```bash
git add src/systems/rackGlows.ts src/systems/rackGlows.test.ts src/config/lighting.ts src/scenes/BuildingScene.ts
git commit -m "feat: server rack LEDs glow amber and white"
```

---

### Task 7: Surface light spike (dev only)

**Files:**
- Create: `src/systems/surfaceLight.ts`
- Modify: `src/world/WorldRenderer.ts` (expose `get surfaceObjects(): readonly Phaser.GameObjects.GameObject[]`: the floor, wall and prop tile sprites and images it creates)
- Modify: `src/scenes/BuildingScene.ts` (dev builds only: key `K` toggles it, beside G, H and L)
- Modify: `src/config/lighting.ts` (add `surfaceLight: { ambient: PALETTE_HEX.text, intensityScale: 1 }` with a comment saying it is off in shipped builds until Phase 24's normal maps)

**Interfaces:**
- Produces: `class SurfaceLight { constructor(scene: Phaser.Scene, sources: readonly LightSource[], objects: readonly Phaser.GameObjects.GameObject[]); setEnabled(on: boolean): void }`. On: `scene.lights.enable()`, the ambient colour from config, one Light2D light per static source (radius `radiusPx`, white, intensity times `intensityScale`), and `setPipeline('Light2D')` on every object that supports it (skip any that do not). Off: `resetPipeline()` on the same objects and `scene.lights.disable()`.

Decision 5's Light2D layer only earns its place with normal maps, which arrive in Phase 24. With flat normals it duplicates the veil's falloff and leaks through walls, because Light2D lights are not occluded. So this phase proves its cost (Decision 7: "proves the frame budget before art arrives") without shipping it. Phase 24 decides how it combines with the occluded veil.

- [ ] **Step 1: Implement `SurfaceLight`, the `surfaceObjects` getter and the dev key**
- [ ] **Step 2: Typecheck, lint, tests, build**; confirm the production bundle does not reference the K key path (`import.meta.env.DEV` guards it like G, H and L)
- [ ] **Step 3: Commit**

```bash
git add src/systems/surfaceLight.ts src/world/WorldRenderer.ts src/scenes/BuildingScene.ts src/config/lighting.ts
git commit -m "feat: dev-only Light2D surface light to measure its frame cost"
```

---

### Task 8: The phase record

**Files:**
- Modify: `GAME_DESIGN.md` (append to the v4 section after the Phase 22 entry, in the same format: a bold `**Phase 23, light and shadow.**` lead-in, one plain-English paragraph, then a `Done when:` line)

Done when: light stops at walls and closed doors for both the eye and the guards, and tests prove that this can only darken a spot; each static light is baked once per level and only lights near a door that moves are rebaked, with a short crossfade; guard torches are soft beams that stop at walls; rack LEDs glow amber and white, never red; the darkness floor, the aura and extra brightness work as before; the PR reports each site's change in hidden floor and any ambient retune; 60 fps at 1440p on Craig's PC and at least 30 fps at render scale 50 percent with the CPU throttled 4x, measured with the surface light both off and on.

- [ ] **Step 1: Add the entry**
- [ ] **Step 2: Commit** (`git add GAME_DESIGN.md`, `docs: record Phase 23`)

---

### Task 9: Verification and the pull request

**Files:** `src/config/lighting.ts` only if the cover rule below fires.

- [ ] **Step 1: Full checks.** `npm run typecheck && npm run lint && npx vitest run && npm run build`, all clean (the usual Phaser chunk-size warning only).
- [ ] **Step 2: Cover report.** Run `COVER_REPORT=1 npx vitest run src/world/coverReport.test.ts`. If any zone's hidden share rises by more than 20 percentage points, raise that zone's `AMBIENT_LIGHT` value in `src/config/lighting.ts` until the rise is 20 points or less, rerun, and commit (`fix: retune ambient where walls added too much cover`). Put the final table and every retune in the PR.
- [ ] **Step 3: Play all three sites** (dev server). Check:
  - lamp light stops at walls, and the data-centre halls are lit along their rack rows;
  - a scheduled door's light crossfades rather than pops;
  - torch beams fade at their edges and stop at walls and closed doors;
  - rack LEDs glow and none is red;
  - SCREEN EFFECTS off stops the breathe;
  - `extraBrightness` at 0 and at its maximum keeps floors and wall outlines readable in the darkest spot;
  - the HUD exposure meter reads HIDDEN behind a wall next to a lit lamp;
  - the texture count is unchanged after three detains and one RENDER SCALE change;
  - the CCTV feed shows the baked light in its picture.
- [ ] **Step 4: Frame times.** Use the DevTools-launched Chrome, emulating 1463 by 823 at 1.75 scale, with `bringToFront` before each run, 30 seconds per run on the warehouse and the data centre. Measure 100 percent render scale, and 50 percent with 4x CPU throttling, each with the surface light off and then on (key K). Put all eight runs in the PR.
- [ ] **Step 5: Screenshots.** Capture full-resolution frames of the README "moment of play" view: the player near a guard's beam in a lit office with a doorway into the rack room. Save them to `output/playwright/phase23-*.png` for the PR.
- [ ] **Step 6: Open the PR.** Push `phase-23-light-and-shadow`. Open the PR against `main` if PR #25 is merged, otherwise against `phase-22-frame-and-feel` with a line saying so. Write the description in plain English for Craig, as for Phase 22:
  - what a PR is and what merging does;
  - what changed;
  - a ten-minute numbered playtest;
  - the cover table;
  - the frame times;
  - the surface-light finding for Phase 24;
  - every ruling made during the build.

  End with the Claude Code attribution line.
