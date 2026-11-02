# Phase 22: Frame and Feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tailgate renders at the display's native resolution with a closer, pointer-led camera, a night grade, rain on the car parks, an evening clock, and a render-scale setting, with every meta screen looking exactly as it does today, only sharp.

**Architecture:** The 960 by 540 layout unit stays. The canvas becomes device-pixel sized and every scene fits a non-scrolling "UI camera" (zoom = canvasWidth / 960) over that 960 by 540 box, so no layout code changes. The building's screen-fixed HUD moves into a new overlay scene with its own UI camera, which frees the building's main camera to zoom in on the world. The lighting veil becomes a camera-following world-space texture. Everything else is config numbers and two small pure-geometry modules.

**Tech Stack:** Phaser 3.90, TypeScript strict, Vite 8, Vitest (node environment, no DOM), ESLint. Branch `phase-22-frame-and-feel`, one PR to `main`.

**Spec:** `docs/superpowers/specs/2026-11-01-visual-upgrade-design.html` (Decisions 3, 6, the evening paragraph of Decision 4, Constraints, Anti-goals).

## Global Constraints

- UK English in code comments, copy, docs and commits. No em dashes anywhere. Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- `npm run typecheck`, `npm run lint` and `npx vitest run` must pass before every commit.
- Palette is fixed: base `#0E1116`, amber `#FFB000`, text `#C7CDD4`, sheet `#151A21`. Alarm red `#FF3B30` appears only in detection and alarm states. Use `PALETTE` / `PALETTE_HEX` from `src/config/palette.ts`, never literals.
- Every tunable number lives in a `src/config/*.ts` file with a comment Craig can read.
- All new motion that is not the player, a guard or a door sits behind `getSettings().screenEffects`: rain, pointer lookahead, grade. Off means off.
- The camera never snaps. Nothing flashes. No new effect has a period under 2.5 seconds.
- Detection maths (`LightModel.ts`, `VisionCone.ts`, guard code) is not touched in this phase.
- `pixelArt: true` stays in the game config this phase (my call: the current art is pixel art and linear filtering would blur it; Phase 24 flips it when rendered art lands). Generated gradient textures keep setting `LINEAR` on themselves.
- No new runtime dependencies.
- The spec's "aim line only while aiming" item is already true on `main`: `AimDisplayState` fades the trace 650 ms after the pointer stops, the trace is dotted, and `ThrowController.computeAim` clamps it to throw range. No task touches it; Task 10's playtest confirms it still behaves at the new zoom.
- Every meta screen (kiosk, schedule, briefing, report, pause, settings, hijack) must look the same as on `main` today, only sharper. Compare screenshots before merging.

## Review Focus

1. A window narrower or shorter than 16:9, or tiny: the canvas must never drop below 960 by 540 and must letterbox, not distort. Test in Task 1.
2. Render scale changed from the pause menu mid-run: the world zoom, the veil and every UI camera must re-fit without a restart. Pure part tested in Task 1 (`uiZoomFor`), manual check in Task 5.
3. Screen effects switched off mid-run: rain stops and the pointer lookahead eases back to zero rather than jumping. Test in Task 4 (zero target when off), Task 7 (emitter stops).
4. A right-stick player: stick direction drives the lookahead and the pointer is ignored, so aiming and framing agree. Test in Task 4.
5. A detain restart: the overlay scene must be stopped and rebuilt once, never duplicated. Manual check in Task 3 (detain twice, one HUD).

---

### Task 1: Viewport maths

**Files:**
- Create: `src/ui/viewport.ts`
- Test: `src/ui/viewport.test.ts`

**Interfaces:**
- Produces:
  - `UI_WIDTH = 960`, `UI_HEIGHT = 540`, `MAX_CANVAS_HEIGHT = 1440`
  - `interface CanvasSizeInput { innerWidth: number; innerHeight: number; devicePixelRatio: number; renderScale: number }`
  - `canvasSizeFor(input: CanvasSizeInput): { width: number; height: number }`
  - `uiZoomFor(canvasWidth: number): number` (canvasWidth / UI_WIDTH)
  - `uiZoomOf(scene: Phaser.Scene): number` (uiZoomFor(scene.scale.width))
  - `fitUiCamera(scene: Phaser.Scene): number` sets `scene.cameras.main.setZoom(z)` and `centerOn(UI_WIDTH / 2, UI_HEIGHT / 2)`, re-fits on `scene.scale.on('resize')`, removes the listener on the scene's `SHUTDOWN`, returns z
  - `installTextResolution(): void` wraps `Phaser.GameObjects.GameObjectFactory.prototype.text` once so a style without `resolution` gets `resolution: uiZoomOf(this.scene)`; a style that sets its own resolution wins
  - `applyRenderScale(game: Phaser.Game): void` calls `game.scale.resize(w, h)` with `canvasSizeFor` from `window` and `getSettings().renderScale` (added in Task 5; until then read `1`)

`canvasSizeFor` algorithm: box = inner size times devicePixelRatio; h = min(box height, box width times 9/16); h = h times renderScale; h = min(h, MAX_CANVAS_HEIGHT); h = max(h, UI_HEIGHT); w = h times 16/9 computed from the unrounded h; then each of w and h is rounded to an even integer with `2 * Math.round(v / 2)`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { canvasSizeFor, uiZoomFor } from './viewport';

describe('canvasSizeFor', () => {
  it('fills a 1440p monitor at 175 percent scaling', () => {
    expect(canvasSizeFor({ innerWidth: 1463, innerHeight: 823, devicePixelRatio: 1.75, renderScale: 1 }))
      .toEqual({ width: 2560, height: 1440 });
  });
  it('is exactly 1080p on a 1080p window', () => {
    expect(canvasSizeFor({ innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, renderScale: 1 }))
      .toEqual({ width: 1920, height: 1080 });
  });
  it('caps a 4K display at 1440p', () => {
    expect(canvasSizeFor({ innerWidth: 3840, innerHeight: 2160, devicePixelRatio: 2, renderScale: 1 }))
      .toEqual({ width: 2560, height: 1440 });
  });
  it('halves with render scale 0.5', () => {
    expect(canvasSizeFor({ innerWidth: 1463, innerHeight: 823, devicePixelRatio: 1.75, renderScale: 0.5 }))
      .toEqual({ width: 1280, height: 720 });
  });
  it('never drops below the 960 by 540 layout unit', () => {
    expect(canvasSizeFor({ innerWidth: 800, innerHeight: 400, devicePixelRatio: 1, renderScale: 1 }))
      .toEqual({ width: 960, height: 540 });
  });
  it('letterboxes a tall window by width', () => {
    expect(canvasSizeFor({ innerWidth: 1000, innerHeight: 2000, devicePixelRatio: 2, renderScale: 1 }))
      .toEqual({ width: 2000, height: 1126 });
  });
});

describe('uiZoomFor', () => {
  it('maps the canvas width onto the 960 unit box', () => {
    expect(uiZoomFor(2560)).toBeCloseTo(2.6667, 3);
    expect(uiZoomFor(960)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/viewport.test.ts`
Expected: FAIL, module `./viewport` not found.

- [ ] **Step 3: Implement `src/ui/viewport.ts`**

The pure functions first. `fitUiCamera`, `uiZoomOf`, `installTextResolution` and `applyRenderScale` need Phaser; keep them in the same file but import Phaser normally (vitest only imports the pure functions through this module, and Phaser's package import is safe in node because `main.ts` is not pulled in). `installTextResolution` keeps a module flag so a second call is a no-op.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/viewport.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/viewport.ts src/ui/viewport.test.ts
git commit -m "feat: viewport maths for a device-pixel canvas over the 960 by 540 layout"
```

---

### Task 2: Native-resolution canvas and sharp meta screens

**Files:**
- Modify: `src/main.ts` (lines 17 to 18 and the `new Phaser.Game` config)
- Modify: `src/scenes/MenuScene.ts`, `src/scenes/ContractSelectScene.ts`, `src/scenes/BriefingScene.ts`, `src/scenes/ReportScene.ts`, `src/scenes/PauseScene.ts`, `src/scenes/SettingsScene.ts`, `src/scenes/HijackScene.ts` (first line of each `create`)
- Modify: `src/ui/MenuController.ts:203,216,234` (remove `setScrollFactor(0)`)
- Modify: `src/scenes/BriefingScene.ts:54-57`, `src/scenes/ReportScene.ts:110-114,406,459`, `src/scenes/HijackScene.ts:154-155` (replace `this.scale.width` / `this.scale.height` with `UI_WIDTH` / `UI_HEIGHT`)

**Interfaces:**
- Consumes: `canvasSizeFor`, `fitUiCamera`, `installTextResolution`, `UI_WIDTH`, `UI_HEIGHT` from Task 1.
- Produces: every scene except `building` is laid out in 960 by 540 units and rendered by a fitted, non-scrolling camera.

Why `setScrollFactor(0)` must go: under a zoomed camera a scroll-factor-zero object is drawn at `(x - originX) * zoom + originX`, which is only right at zoom 1. The UI cameras never scroll, so scroll factor 1 is both correct and simpler.

- [ ] **Step 1: Replace the fixed canvas size in `src/main.ts`**

Delete `GAME_WIDTH` and `GAME_HEIGHT` (nothing else imports them). In `boot()`, compute `const { width, height } = canvasSizeFor({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, devicePixelRatio: window.devicePixelRatio, renderScale: 1 })` and pass them as `width` and `height`. Keep `Scale.FIT`, `CENTER_BOTH`, `pixelArt: true`, `roundPixels: true`. Call `installTextResolution()` immediately after `new Phaser.Game(...)`.

- [ ] **Step 2: Fit the UI camera in every meta scene**

Add `fitUiCamera(this);` as the first statement of `create()` in the seven scenes listed. `fadeIn` in `src/ui/transitions.ts` still works because it only fades the main camera.

- [ ] **Step 3: Remove the three `setScrollFactor(0)` calls in `MenuController` and swap the `scale` reads**

Replace every `this.scale.width` / `this.scale.height` in `BriefingScene`, `ReportScene` and `HijackScene` with `UI_WIDTH` / `UI_HEIGHT`. Leave `BuildingScene`, `FeedTreatment`, `HintSystem`, `AlertBanner`, `FieldHud` and `LightingRenderer` for Task 3.

- [ ] **Step 4: Typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all clean, 153 tests (146 plus Task 1's 7).

- [ ] **Step 5: Visual check of every meta screen**

Run `npm run dev`. Open the kiosk, schedule, briefing, pause (start Building C, press Esc), settings and the report (quit to the report from pause, or finish a run). Each must match its `main` layout exactly, only sharper. Confirm in DevTools that the canvas element's `width` attribute equals the window's device-pixel width (2560 on Craig's monitor) and that text edges are crisp at 200 percent zoom in the DevTools screenshot. Building C itself will look wrong at this point (HUD mispositioned); that is Task 3.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/scenes src/ui/MenuController.ts
git commit -m "feat: device-pixel canvas with a fitted UI camera on every meta screen"
```

---

### Task 3: Field overlay scene and a zoomable world camera

**Files:**
- Create: `src/scenes/FieldOverlayScene.ts`
- Modify: `src/scenes/BuildingScene.ts` (lines 292 to 326 construction, 309 to 318 prompt, 564 to 588 update, 740 to 768 feed camera, 1130 to 1195 detain, the SHUTDOWN handlers at 326 and 334, and the `super('building')` scene list in `src/main.ts`)
- Modify: `src/ui/FieldHud.ts:65,90,210` (use `UI_WIDTH`, drop every `setScrollFactor(0)`), `src/ui/AlertBanner.ts:45`, `src/ui/ScreenEdgeMarkers.ts`, `src/systems/HintSystem.ts:29`, `src/systems/FeedTreatment.ts:62-63` (same two changes in each)
- Modify: `src/systems/LightingRenderer.ts`
- Modify: `src/config/juice.ts` (add `camera.worldZoom`)
- Create: `src/systems/veilGeometry.ts`, test `src/systems/veilGeometry.test.ts`

**Interfaces:**
- Consumes: `fitUiCamera`, `uiZoomOf`, `UI_WIDTH`, `UI_HEIGHT` from Task 1.
- Produces:
  - `class FieldOverlayScene extends Phaser.Scene` with key `'fieldOverlay'`, created with `{ levelId: string; hints: readonly LevelHint[] }`, exposing `hud: FieldHud`, `alertBanner: AlertBanner`, `edgeMarkers: ScreenEdgeMarkers`, `hintSystem: HintSystem`, `promptText: Phaser.GameObjects.Text`, `feedTreatment: FeedTreatment`, and `showDetained(cause: string, resumeAt: string): void` which draws the alarm vignette, the base card and the DETAINED text block exactly as `BuildingScene` draws them today (same sizes, depths 1999 to 2001, same tween).
  - `BuildingScene.attachOverlay(overlay: FieldOverlayScene): void`, called by the overlay from its `create`.
  - `JUICE.camera.worldZoom: 1` in this task (Task 4 raises it).
  - `LightingRenderer.resize(): void` rebuilds the veil for a new canvas size.
  - `veilErasePoint(worldX: number, worldY: number, worldView: { x: number; y: number }, zoom: number): { x: number; y: number; scale: number }` where x and y are `(world - worldView) * zoom` and `scale` is `zoom` (the brush radius multiplier).

How the overlay works: `BuildingScene.create` finishes its own setup, then `this.scene.launch('fieldOverlay', { levelId, hints })`. The overlay's `create` calls `fitUiCamera(this)`, builds the six objects, then `(this.scene.get('building') as BuildingScene).attachOverlay(this)`. `attachOverlay` stores the references the existing fields use (`this.hud = overlay.hud` and so on) and sets `this.overlayReady = true`. `BuildingScene.update` returns early until `overlayReady`. The building's SHUTDOWN handler calls `this.scene.stop('fieldOverlay')`; the overlay's own SHUTDOWN destroys `feedTreatment`. The pause, settings and hijack scenes are launched later than the overlay, so they draw above it with no ordering code.

The veil: the render texture is allocated at `scene.scale.width` by `scene.scale.height` (canvas pixels), origin 0, scroll factor 1, depth 25 as today. Each frame it is positioned at `cam.worldView.x, cam.worldView.y` and scaled by `1 / cam.zoom`, so it covers exactly the view. Every erase uses `veilErasePoint`, and `eraseLight` multiplies the radius by `scale`. The feed camera ignores the veil as today.

The feed camera: viewport `HIJACK.feed` scaled by `uiZoomOf(this)` in all four numbers, then `setZoom(uiZoomOf(this))` so it shows the same world area as today. Its ignore list shrinks to the veil, `guardDebug`, `noiseRings.gameObject` and `playerRing` (the screen objects now live in the overlay and are never seen by building cameras).

The world camera: after `startFollow`, `this.cameras.main.setZoom(uiZoomOf(this) * JUICE.camera.worldZoom)`. On `this.scale.on('resize')`, re-apply the zoom and call `lightingRenderer.resize()`; remove the listener on SHUTDOWN.

- [ ] **Step 1: Write the failing veil geometry test**

```ts
import { describe, expect, it } from 'vitest';
import { veilErasePoint } from './veilGeometry';

describe('veilErasePoint', () => {
  it('is identity at zoom 1 with the view at the origin', () => {
    expect(veilErasePoint(100, 50, { x: 0, y: 0 }, 1)).toEqual({ x: 100, y: 50, scale: 1 });
  });
  it('maps world to veil pixels under zoom and scroll', () => {
    expect(veilErasePoint(700, 400, { x: 200, y: 100 }, 2.5)).toEqual({ x: 1250, y: 750, scale: 2.5 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/systems/veilGeometry.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `veilGeometry.ts` and rework `LightingRenderer.ts` as described**

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/systems/veilGeometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `FieldOverlayScene.ts`, register it in `src/main.ts` after `BuildingScene`, and move the six UI objects plus the detained card into it**

Delete the moved construction and the detain drawing from `BuildingScene`. Replace `this.scale.width / height` in the five UI files with `UI_WIDTH / UI_HEIGHT` and delete every `setScrollFactor(0)` in them. The `screenObjects` getters on `FieldHud` and `AlertBanner` can stay but are no longer passed to the feed camera.

- [ ] **Step 6: Wire the world camera zoom, the resize handler and the feed camera as described**

- [ ] **Step 7: Typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: all clean, 155 tests.

- [ ] **Step 8: Play Building C and check each of these**

HUD chips top left and top right in the same place as `main`; the objective diamond on the screen edge; the prompt line bottom centre; an alert banner (let a guard see you) in the same place; the hint text; the feed treatment tint still present; the hijack console feed shows the world in the same 600 by 320 box; pause then resume keeps the HUD; get detained twice in a row and confirm one HUD and one DETAINED card each time; quit to schedule from pause and start again. Then set `JUICE.camera.worldZoom` to `2` temporarily and confirm the world is closer while the HUD stays put and the veil's lights still sit on their lamps; set it back to `1`.

- [ ] **Step 9: Commit**

```bash
git add src/scenes src/ui src/systems src/config/juice.ts src/main.ts
git commit -m "feat: field overlay scene so the world camera can zoom under a fixed HUD"
```

---

### Task 4: Closer camera and pointer lookahead

**Files:**
- Modify: `src/config/juice.ts` (`camera.worldZoom` to `1.4`, add `pointerLookAheadPx: 56`, `pointerLookAheadLerp: 0.04`)
- Create: `src/systems/cameraLookAhead.ts`, test `src/systems/cameraLookAhead.test.ts`
- Modify: `src/scenes/BuildingScene.ts` (the lookahead block at lines 590 to 597)

**Interfaces:**
- Produces: `pointerLookAhead(input: { pointerUi: { x: number; y: number } | null; stick: { x: number; y: number } | null; enabled: boolean; maxPx: number }): { x: number; y: number }`.
  - `enabled` false returns `{ x: 0, y: 0 }`.
  - A non-null `stick` wins: it is a unit-ish direction and the result is `stick normalised times maxPx`. A stick shorter than 0.25 counts as null (the caller already applies `THROW.aimDeadzone`; the function clamps anyway).
  - Otherwise the vector from the UI centre `(480, 270)` to `pointerUi`, scaled by `maxPx / 270`, then clamped to length `maxPx`.
  - Null pointer and null stick returns zero.

`BuildingScene` keeps its travel lookahead and adds a second eased offset for the pointer: `pointerOffset` lerps toward the function's result with `pointerLookAheadLerp` each frame, and the follow offset becomes the sum of both. The pointer position in UI units is `pointer.x / uiZoomOf(this)`, `pointer.y / uiZoomOf(this)`. `enabled` is `getSettings().screenEffects`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { pointerLookAhead } from './cameraLookAhead';

const centre = { x: 480, y: 270 };

describe('pointerLookAhead', () => {
  it('is zero when screen effects are off', () => {
    expect(pointerLookAhead({ pointerUi: { x: 900, y: 50 }, stick: null, enabled: false, maxPx: 56 }))
      .toEqual({ x: 0, y: 0 });
  });
  it('is zero with the pointer at the centre', () => {
    expect(pointerLookAhead({ pointerUi: centre, stick: null, enabled: true, maxPx: 56 }))
      .toEqual({ x: 0, y: 0 });
  });
  it('scales a pointer at the top edge to the full lookahead', () => {
    const r = pointerLookAhead({ pointerUi: { x: 480, y: 0 }, stick: null, enabled: true, maxPx: 56 });
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(-56);
  });
  it('clamps a far corner pointer to the maximum length', () => {
    const r = pointerLookAhead({ pointerUi: { x: 960, y: 540 }, stick: null, enabled: true, maxPx: 56 });
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(56);
  });
  it('lets the right stick win over the pointer', () => {
    const r = pointerLookAhead({ pointerUi: { x: 0, y: 0 }, stick: { x: 1, y: 0 }, enabled: true, maxPx: 56 });
    expect(r).toEqual({ x: 56, y: 0 });
  });
  it('ignores a stick inside the deadzone', () => {
    const r = pointerLookAhead({ pointerUi: null, stick: { x: 0.1, y: 0 }, enabled: true, maxPx: 56 });
    expect(r).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/systems/cameraLookAhead.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `pointerLookAhead` and wire it into `BuildingScene` as described; set `worldZoom` to `1.4`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/systems/cameraLookAhead.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Play and check**

Building C at 1.4: the first guard's approach is still visible from the start position; moving the mouse to a screen edge drifts the view about a sixth of the way and eases back; with screen effects off the view no longer follows the mouse and the change is a slow ease, not a jump; an Xbox right stick pushes the view the same way. Confirm the throw reticle still lands where the pointer is.

- [ ] **Step 6: Commit**

```bash
git add src/config/juice.ts src/systems/cameraLookAhead.ts src/systems/cameraLookAhead.test.ts src/scenes/BuildingScene.ts
git commit -m "feat: closer world camera with an eased pointer and stick lookahead"
```

---

### Task 5: Render scale setting

**Files:**
- Modify: `src/state/settings.ts` (add `renderScale: number`, default `1`, and `setRenderScale(v: number)` which rounds to the nearest 0.25 and clamps to `[0.5, 1]`)
- Modify: `src/scenes/SettingsScene.ts:60-120` (new row `RENDER SCALE`, display `${Math.round(v * 100)}%`, adjust `d * 0.25`, then `applyRenderScale(this.game)`; menu geometry becomes `{ x: 480, top: 180, rowHeight: 30, width: 420, labelSize: 17, valueSize: 16 }` so nine rows fit the card)
- Modify: `src/ui/viewport.ts` (`applyRenderScale` now reads `getSettings().renderScale`; `main.ts` boot passes it too)

**Interfaces:**
- Consumes: `applyRenderScale` from Task 1, `LightingRenderer.resize` and the building resize handler from Task 3.
- Produces: `getSettings().renderScale`, `setRenderScale`.

- [ ] **Step 1: Add the setting and setter, then the settings row and geometry**

- [ ] **Step 2: Typecheck, lint, tests**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: clean.

- [ ] **Step 3: Manual check**

From the kiosk, open settings, set RENDER SCALE to 50 percent: the canvas `width` attribute halves and the screen looks the same but softer. Start Building C, pause, settings, change back to 100 percent, resume: the HUD, the veil and the world zoom are all correct with no restart. Reload the page: the setting persists.

- [ ] **Step 4: Commit**

```bash
git add src/state/settings.ts src/scenes/SettingsScene.ts src/ui/viewport.ts src/main.ts
git commit -m "feat: render scale setting for slower machines"
```

---

### Task 6: Night grade

**Files:**
- Modify: `src/config/feed.ts`

No new layer. Change `cast` to `{ colour: 0x6f86a8, alpha: 0.06 }` and the vignette alphas to `calmAlpha: 0.2, cautiousAlpha: 0.22, lockdownAlpha: 0.28`. Leave `grain` as it is: at 4 percent with a 150 ms step it has shipped since Phase 10 with no complaint from Craig; the PR asks him to say if it reads as flicker at the new zoom, and if so `stepMs` goes to 400 before anything else is tried.

- [ ] **Step 1: Change the numbers and update the comments above them to say these are the Phase 22 evening values**

- [ ] **Step 2: Play Building C and the warehouse**

The picture reads cooler and the corners darker, the amber HUD reads warmer by contrast, and the floor is still readable in the darkest rooms with the visibility floor at its default. If the server room floor is lost, lower `calmAlpha` to `0.17` and stop there.

- [ ] **Step 3: Commit**

```bash
git add src/config/feed.ts
git commit -m "feat: evening grade on the security-feed treatment"
```

---

### Task 7: Rain and wet tarmac on exterior zones

**Files:**
- Create: `src/config/weather.ts`
- Create: `src/world/weatherGeometry.ts`, test `src/world/weatherGeometry.test.ts`
- Modify: `src/systems/AmbientParticles.ts` (add rain emitters and `setRainEnabled`)
- Modify: `src/world/WorldRenderer.ts` (call `drawWetSheen` after the decals)
- Modify: `src/scenes/BuildingScene.ts:278` (keep the `AmbientParticles` instance and call `setRainEnabled(getSettings().screenEffects)` each update)

**Interfaces:**
- Consumes: `ZoneRect` (`exterior` flag) and `LightRect` from `src/world/BuildingMap.ts`.
- Produces:
  - `WEATHER = { rain: { depth: 21, streakLengthPx: 7, streakAngleDeg: 8, alpha: 0.14, speedY: 420, driftX: -40, lifespanMs: 420, dropsPerSecondPer10kPx2: 0.6, tint: 0xc7cdd4 }, wetSheen: { depth: 2.5, alpha: 0.05, widthFactor: 0.9, heightFactor: 1.6, offsetYFactor: 0.35, tint: 0xc7cdd4 } } as const`
  - `rainEmitterFor(zone: ZoneRect, cfg: typeof WEATHER.rain): { x: number; y: number; width: number; height: number; frequencyMs: number }` where `frequencyMs = max(8, 1000 / ((width * height / 10000) * dropsPerSecondPer10kPx2))`
  - `wetSheenEllipsesFor(zones: readonly ZoneRect[], lights: readonly LightRect[], cfg: typeof WEATHER.wetSheen): { x: number; y: number; width: number; height: number }[]` for each light whose centre lies inside an exterior zone: centre x, centre y plus `radius * offsetYFactor`, width `radius * 2 * widthFactor`, height `radius * 2 * heightFactor`, with `radius = max(light.width, light.height) / 2`
  - `AmbientParticles.setRainEnabled(on: boolean): void` (starts or stops every rain emitter; idempotent)
  - `drawWetSheen(scene: Phaser.Scene, zones: readonly ZoneRect[], lights: readonly LightRect[]): void` in `weatherGeometry.ts`'s sibling `src/world/wetSurface.ts` (one `Graphics` at `WEATHER.wetSheen.depth`, `fillStyle(tint, alpha)`, `fillEllipse` per entry)

The rain texture is generated once: a 2 by `streakLengthPx` line of `tint` rotated by `streakAngleDeg`, drawn onto a small canvas texture, `LINEAR` filtered. Emitters use `emitZone` of type `random` over the zone rectangle, `speedY`, `speedX: driftX`, `lifespan`, `alpha: { start: alpha, end: 0 }`, no scale change, `depth` as configured, so the veil dims rain in the dark.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { WEATHER } from '../config/weather';
import { rainEmitterFor, wetSheenEllipsesFor } from './weatherGeometry';

const carPark = { name: 'carPark', x: 0, y: 800, width: 1000, height: 500, restricted: false, exterior: true };
const office = { name: 'office', x: 0, y: 0, width: 1000, height: 500, restricted: false, exterior: false };

describe('rainEmitterFor', () => {
  it('covers the zone and scales frequency with area', () => {
    const e = rainEmitterFor(carPark, WEATHER.rain);
    expect(e).toMatchObject({ x: 0, y: 800, width: 1000, height: 500 });
    expect(e.frequencyMs).toBeCloseTo(1000 / (50 * 0.6), 3);
  });
  it('never emits faster than every 8 ms', () => {
    const huge = { ...carPark, width: 10000, height: 10000 };
    expect(rainEmitterFor(huge, WEATHER.rain).frequencyMs).toBe(8);
  });
});

describe('wetSheenEllipsesFor', () => {
  it('draws one sheen per exterior light and none indoors', () => {
    const lights = [
      { id: 'flood', kind: 'flood', x: 400, y: 900, width: 200, height: 200 },
      { id: 'desk', kind: 'pool', x: 400, y: 100, width: 100, height: 100 },
    ];
    const sheen = wetSheenEllipsesFor([carPark, office], lights, WEATHER.wetSheen);
    expect(sheen).toEqual([{ x: 500, y: 1035, width: 180, height: 320 }]);
  });
  it('returns nothing when a site has no exterior zone', () => {
    expect(wetSheenEllipsesFor([office], [{ id: 'a', kind: 'pool', x: 0, y: 0, width: 50, height: 50 }], WEATHER.wetSheen)).toEqual([]);
  });
});
```

Note the first sheen expectation: the light's centre is `(500, 1000)`, radius `100`, so y is `1000 + 100 * 0.35`, width `100 * 2 * 0.9`, height `100 * 2 * 1.6`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/world/weatherGeometry.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `weather.ts`, `weatherGeometry.ts`, `wetSurface.ts`, the emitters in `AmbientParticles`, the `WorldRenderer` call and the `BuildingScene` toggle**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/world/weatherGeometry.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Play all three sites**

Rain falls only over the car parks and the loading dock apron, at a slight angle, dimmed in the dark; indoors there is none. Each exterior lamp has a faint vertical smear below it on the tarmac. Turn SCREEN EFFECTS off in pause: rain stops within a second, the sheen (static) stays. Watch the frame rate in DevTools on the warehouse for 60 seconds: no drop below 60 on Craig's PC.

- [ ] **Step 6: Commit**

```bash
git add src/config/weather.ts src/world src/systems/AmbientParticles.ts src/scenes/BuildingScene.ts
git commit -m "feat: rain and wet tarmac over the exterior zones"
```

---

### Task 8: The evening engagement

**Files:**
- Modify: `src/config/objectives.ts:23` (`reportClockStart: { hour: 18, minute: 40 }`)
- Modify: `src/config/engagement.ts` (add `attendance: '18:30, AFTER HOURS'`)
- Modify: `src/scenes/BriefingScene.ts:76-82` (a third header row)
- Modify: `src/report/generateReport.ts:70` (export `stampClock`)
- Modify: `public/data/levels.json` (four intel lines)
- Test: `src/report/stampClock.test.ts`

**Interfaces:**
- Produces: `export function stampClock(elapsedMs: number): string` (same body, now exported).

Briefing header: after the `SITE` / `DATE` row, add `y += 15;` then `this.mono(left + 440, y, \`ATTEND: ${ENGAGEMENT.attendance}\`, 11, PALETTE.text);` before the existing `y += 24;`.

Copy edits in `public/data/levels.json`, exact strings:
- building-c intel[0]: `Late staff prop the south fire door open on smoking breaks. Its lamp shows green while it stands open.`
- building-c intel[2]: `The last deliveries of the evening leave the dock shutter unattended in repeating windows.`
- building-c intel[3]: `Site CCTV reports to a security office console that is rarely watched after hours.`
- warehouse intel[0]: `Heavy staff traffic on the floor through the evening shift. Contractor hi-vis is accepted at a distance without question.`

The data centre copy already describes a dark building and stays as it is.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { stampClock } from './generateReport';

describe('stampClock', () => {
  it('starts the evening engagement at 18:40', () => {
    expect(stampClock(0)).toBe('18:40');
  });
  it('adds elapsed play time', () => {
    expect(stampClock(25 * 60000)).toBe('19:05');
  });
  it('wraps past midnight', () => {
    expect(stampClock(6 * 3600000)).toBe('00:40');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/report/stampClock.test.ts`
Expected: FAIL, `stampClock` is not exported, or the clock reads 09:31.

- [ ] **Step 3: Make the config, export, briefing and copy changes**

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/report/stampClock.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Check the briefing and the report**

The briefing shows `ATTEND: 18:30, AFTER HOURS` under the date on the right and nothing overlaps the SCOPE heading. A finished run's report stamps its first finding at or after 18:40.

- [ ] **Step 6: Commit**

```bash
git add src/config/objectives.ts src/config/engagement.ts src/scenes/BriefingScene.ts src/report public/data/levels.json
git commit -m "feat: the engagement runs after hours, from 18:40"
```

---

### Task 9: Project rules and the phase record

**Files:**
- Modify: `AGENTS.md` ("Asset and licence rules" approved sources; "How to work" rule 1)
- Modify: `GAME_DESIGN.md` ("v3 build phases" section, append after the last phase entry in the same format)

- [ ] **Step 1: Update `AGENTS.md`**

Approved sources gain two bullets: `ambientCG and Poly Haven (CC0 surface textures)` and `Images generated through Craig's own ChatGPT account, credited in CREDITS.md as his own work`. Rule 1 of "How to work" gains one sentence: `Exception agreed on 1 November 2026: the Phase 24 Blender render pipeline runs alongside Phases 22 and 23, because it touches only tools/ and rendered output until the swap.`

- [ ] **Step 2: Add Phase 22 to `GAME_DESIGN.md`**

Title `Phase 22: frame and feel`. Done when: the canvas is device-pixel sized and capped at 1440p; every meta screen matches Phase 21 only sharper; the building has a field overlay scene and a 1.4 world zoom with pointer and stick lookahead behind SCREEN EFFECTS; a RENDER SCALE setting; the evening grade; rain and wet tarmac on exterior zones behind SCREEN EFFECTS; the clock starts at 18:40 with the briefing attendance line; 60 fps on Craig's PC at 1440p and at least 30 fps at render scale 50 percent with DevTools CPU throttling at 4x.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md GAME_DESIGN.md
git commit -m "docs: record Phase 22 and the agreed rule changes"
```

---

### Task 10: Verification and the pull request

**Files:** none new.

- [ ] **Step 1: Full checks**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`
Expected: clean; the build warns only about chunk size as it does on `main`.

- [ ] **Step 2: Screenshot comparison**

With `npm run preview` (the production build), capture the kiosk, schedule, briefing, pause, settings, report and hijack screens, and Building C, the data centre and the warehouse at the start position. Put them in `output/playwright/phase22-*.png` (gitignored folder). Compare the meta screens against the `main` captures already in `output/playwright/`: same layout, sharper text.

- [ ] **Step 3: Frame times**

In Chrome DevTools Performance, record 30 seconds of the warehouse at render scale 100 percent on Craig's PC: no frame over 16.7 ms outside scene starts. Repeat at 50 percent with CPU throttling 4x: no frame over 33 ms. Write both numbers into the PR.

- [ ] **Step 4: Open the PR**

Push `phase-22-frame-and-feel` and open a PR to `main`. The description, in plain English for Craig: what a PR is and what merging does (one short paragraph, as the Phase 21 PR did), what was built in each of Tasks 1 to 9, a numbered playtest list he can follow in ten minutes, the two frame-time numbers, and the one open question: does the static read as flicker at the new zoom. End with the Claude Code attribution line.

- [ ] **Step 5: Hand back**

Report to Craig in chat: the PR link, the playtest list, and what he is being asked to judge.
