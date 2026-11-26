import Phaser from 'phaser';
import { CONE_RANGE_PX, DETECTION } from '../config/detection';
import { FEED } from '../config/feed';
import { LIGHTING } from '../config/lighting';
import { PALETTE_HEX } from '../config/palette';
import { getSettings } from '../state/settings';
import type { Guard } from '../entities/Guard';
import type { Player } from '../entities/Player';
import type { LightBakeCache } from './LightBakeCache';
import type { LightSource } from './LightModel';
import { FALLOFF_KNEE_LEVEL, FALLOFF_KNEE_T } from './lightBake';
import type { Rect } from './occlusion';
import { easeAngle, torchBeamTriangles } from './torchBeam';
import { veilErasePoint, veilOriginFor } from './veilGeometry';

/** Size of the soft radial light-mask texture used as an erase brush. */
const MASK_SIZE = 256;
const MASK_KEY = 'lightMask';

const degToRad = (deg: number): number => deg * (Math.PI / 180);
/** The torch beam fills the vision cone, so it shares the cone's shape. */
const BEAM_HALF_FOV_RAD = degToRad(DETECTION.cone.fovDegrees) / 2;
const BEAM_EDGE_FEATHER_RAD = degToRad(LIGHTING.torchBeam.edgeFeatherDeg);
/**
 * Erasing only reads alpha, so the beam's fill colour never shows on screen.
 * White matches the round brush, which is white too. It must stay white:
 * Phaser's Canvas renderer misreads gradient fill commands, and a tint that is
 * not white can corrupt its command buffer.
 */
const ERASE_TINT = 0xffffff;

/** What the veil was last drawn from, so a resize can redraw the same picture. */
interface VeilFrame {
  cam: Phaser.Cameras.Scene2D.Camera;
  player: Player;
  guards: readonly Guard[];
  /** The walls plus the doors that were closed, which stop the torch beams. */
  beamOccluders: readonly Rect[];
}

/**
 * The visual side of lighting. A RenderTexture is filled with a dark veil each
 * frame, then soft lights are ERASED out of it, punching holes where the world
 * shows through: room pools, a harsh loading-dock flood, tight server rack
 * LEDs, plus a soft aura that always follows the player so the character and
 * nearby walls are never lost (the accessibility floor).
 *
 * Phase 23: the static lights come from LightBakeCache, baked pictures with
 * their wall and closed-door shadows already drawn in, so the light on screen
 * stops where the guards' light does. Each guard's torch is a soft beam the
 * shape of its vision cone, stopped by the same walls and closed doors, fading
 * along its length and just past its edges. The player aura still uses the
 * plain round brush, and the aura is never shaded.
 *
 * The veil lives in the world, not on the screen, so the world camera can
 * zoom. It holds one texel per canvas pixel, covers the camera's view plus a
 * small margin on every side, and is moved over the view and shrunk by the
 * zoom each frame. Lights are placed with veilErasePoint, so a lamp's pool
 * sits on its lamp at any zoom.
 *
 * The veil sits at depth 25, above the world and cones-are-lifted-above-it, so
 * floors, walls and props dim in the dark while the player, guard and vision
 * cones stay fully readable (the HUD is a separate scene on top). Detection
 * light is computed separately in LightModel; this renderer is purely what the
 * human sees, which is why the static lights can breathe here without
 * touching what a guard can spot.
 */
export class LightingRenderer {
  private readonly scene: Phaser.Scene;
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly brush: Phaser.GameObjects.Image;
  /** A second free brush that takes on each baked light's texture in turn. */
  private readonly bakeBrush: Phaser.GameObjects.Image;
  /** A free Graphics the torch beams are drawn into each frame, then erased with. */
  private readonly beamGfx: Phaser.GameObjects.Graphics;
  private readonly bakes: LightBakeCache;
  private lastFrame: VeilFrame | null = null;
  /**
   * The facing each guard's beam is drawn at. It swings toward the guard's
   * true facing over LIGHTING.torchBeam.turnEaseMs, so a guard turning on the
   * spot never flashes the floor bright in one frame. Render only: detection
   * and the vision cone always use the true facing.
   */
  private readonly beamFacings = new WeakMap<Guard, number>();
  /** The scene time the beams were last drawn at, or null before the first draw. */
  private lastBeamMs: number | null = null;

  constructor(scene: Phaser.Scene, bakes: LightBakeCache) {
    this.scene = scene;
    this.bakes = bakes;
    LightingRenderer.ensureMask(scene);

    const size = this.veilSize();
    this.rt = scene.add.renderTexture(0, 0, size.width, size.height).setOrigin(0, 0).setDepth(25);

    // A free brush (not on the display list), reused for every erased light.
    this.brush = scene.make.image({ x: 0, y: 0, key: MASK_KEY, add: false }).setOrigin(0.5);
    // Baked pictures are placed by their top-left corner, so this one keeps origin 0.
    this.bakeBrush = scene.make.image({ x: 0, y: 0, key: MASK_KEY, add: false }).setOrigin(0);
    // Not on the display list either. It sits at 0,0 and is drawn in veil pixels.
    this.beamGfx = scene.make.graphics({}, false);
  }

  /**
   * Redraws the veil and erases the current lights. Called last each frame.
   * beamOccluders is the walls plus this frame's closed doors.
   */
  update(
    cam: Phaser.Cameras.Scene2D.Camera,
    player: Player,
    guards: readonly Guard[],
    beamOccluders: readonly Rect[]
  ): void {
    this.lastFrame = { cam, player, guards, beamOccluders };
    this.draw(this.lastFrame);
  }

  /**
   * Rebuilds the veil for a new canvas size. The same texture object is
   * resized rather than replaced, so the CCTV feed camera's ignore list still
   * points at it. The last frame is redrawn straight away, so a resize while
   * the game is paused never leaves the building unlit behind the pause badge.
   */
  resize(): void {
    const size = this.veilSize();
    this.rt.resize(size.width, size.height);
    if (this.lastFrame) {
      this.draw(this.lastFrame);
    }
  }

  setVisible(visible: boolean): void {
    this.rt.setVisible(visible);
  }

  /** The veil texture, so secondary feed cameras can ignore it. */
  get veil(): Phaser.GameObjects.RenderTexture {
    return this.rt;
  }

  private draw({ cam, player, guards, beamOccluders }: VeilFrame): void {
    const settings = getSettings();
    const veil = Phaser.Math.Clamp(
      1 - LIGHTING.visibilityFloorGlobal - settings.extraBrightness,
      0,
      1
    );

    // Lay the veil over the camera's view with the margin spare on every side,
    // shrunk by the zoom so each texel covers exactly one canvas pixel. The
    // corner comes from the camera's centre, which a resize re-centre sets at
    // once; the camera's world view only catches up when it next draws.
    const zoom = cam.zoom;
    const origin = veilOriginFor(cam.midPoint, cam.width, cam.height, zoom, LIGHTING.veilMarginPx);
    this.rt.setPosition(origin.x, origin.y).setScale(1 / zoom);

    this.rt.clear();
    this.rt.fill(PALETTE_HEX.base, veil);

    const nowMs = this.scene.time.now;
    const at = (worldX: number, worldY: number) => veilErasePoint(worldX, worldY, origin, zoom);

    for (const entry of this.bakes.entries(nowMs)) {
      // The breathe is atmosphere, so it rides on the screen-effects setting.
      // The source's own intensity is never written to: LightModel hands out a
      // readonly list and detection must keep seeing the authored numbers.
      const breathe = settings.screenEffects ? this.breatheFactor(entry.source, nowMs) : 1;
      this.eraseBaked(
        at(entry.worldX, entry.worldY),
        entry.key,
        entry.source.intensity * breathe * entry.fade
      );
    }

    // Each guard's torch lights its own vision cone, up to the first wall.
    this.eraseBeams(guards, beamOccluders, at, nowMs);

    // The player is always lit. Render only, never fed to detection.
    this.eraseLight(at(player.x, player.y), LIGHTING.playerAuraRadiusPx, LIGHTING.playerAuraStrength);
  }

  /** The veil's size in canvas pixels: the whole canvas plus the margin on every side. */
  private veilSize(): { width: number; height: number } {
    const margin = LIGHTING.veilMarginPx;
    return {
      width: this.scene.scale.width + 2 * margin,
      height: this.scene.scale.height + 2 * margin,
    };
  }

  /**
   * Presentation-only breathe on one static light: a slow, tiny swell in
   * brightness whose phase and period come from where the light sits, so no two
   * lights in the building are ever in step and the place reads as occupied
   * rather than animated. Room pools and the dock flood share one set of
   * numbers, server rack LEDs get their own slightly quicker shimmer. Both are
   * far too slow and far too small to register as a flicker.
   */
  private breatheFactor(s: LightSource, nowMs: number): number {
    const cfg = s.kind === 'rack' ? FEED.lights.rack : FEED.lights.pool;
    // A stable 0..1 spread from the light's position: the same light always
    // breathes the same way, across a detain restart as well as across frames.
    const seed = s.x * 0.0137 + s.y * 0.0219;
    const spread = seed - Math.floor(seed);
    const periodMs = cfg.minPeriodMs + spread * (cfg.maxPeriodMs - cfg.minPeriodMs);
    return 1 + cfg.amplitude * Math.sin((nowMs / periodMs) * Math.PI * 2 + seed);
  }

  /** Erases one soft light at a veil point, its brush grown by the point's scale. */
  private eraseLight(
    point: { x: number; y: number; scale: number },
    radiusPx: number,
    intensity: number
  ): void {
    this.brush.setScale(((radiusPx * 2) / MASK_SIZE) * point.scale);
    this.brush.setAlpha(Phaser.Math.Clamp(intensity, 0, 1));
    this.rt.erase(this.brush, point.x, point.y);
  }

  /**
   * Erases every guard's torch beam in one go. Each triangle's corners are
   * moved from world to veil pixels, and the gradient fill gives each corner
   * its own alpha. Along the beam's length the fade is smooth; across the
   * soft edge just outside the cone it steps down one ray at a time.
   */
  private eraseBeams(
    guards: readonly Guard[],
    occluders: readonly Rect[],
    at: (worldX: number, worldY: number) => { x: number; y: number; scale: number },
    nowMs: number
  ): void {
    // The real time since the last draw. A redraw with no time passed, such
    // as a resize, leaves every beam where it was.
    const dtMs = this.lastBeamMs === null ? 0 : Math.max(0, nowMs - this.lastBeamMs);
    this.lastBeamMs = nowMs;
    this.beamGfx.clear();
    if (guards.length === 0) {
      return;
    }
    for (const guard of guards) {
      const facing = this.beamFacing(guard, dtMs);
      const triangles = torchBeamTriangles({
        x: guard.x,
        y: guard.y,
        facing,
        halfFovRad: BEAM_HALF_FOV_RAD,
        rangePx: CONE_RANGE_PX,
        rays: DETECTION.cone.renderRays,
        intensity: LIGHTING.torchBeam.intensity,
        edgeFeatherRad: BEAM_EDGE_FEATHER_RAD,
        occluders,
      });
      for (const t of triangles) {
        const a = at(t.ax, t.ay);
        const b = at(t.bx, t.by);
        const c = at(t.cx, t.cy);
        const aAlpha = Phaser.Math.Clamp(t.aAlpha, 0, 1);
        const bAlpha = Phaser.Math.Clamp(t.bAlpha, 0, 1);
        const cAlpha = Phaser.Math.Clamp(t.cAlpha, 0, 1);
        // Phaser colours a filled triangle's first, second and third corners
        // from the top-left, top-right and bottom-left gradient values.
        this.beamGfx.fillGradientStyle(
          ERASE_TINT,
          ERASE_TINT,
          ERASE_TINT,
          ERASE_TINT,
          aAlpha,
          bAlpha,
          cAlpha,
          cAlpha
        );
        this.beamGfx.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
      }
    }
    this.rt.erase(this.beamGfx);
  }

  /**
   * Swings one guard's drawn beam toward the guard's true facing, the short
   * way round, and returns where it now points. A guard seen for the first
   * time starts at its true facing.
   */
  private beamFacing(guard: Guard, dtMs: number): number {
    const target = guard.facingAngle;
    const shown = this.beamFacings.get(guard);
    const next =
      shown === undefined ? target : easeAngle(shown, target, dtMs, LIGHTING.torchBeam.turnEaseMs);
    this.beamFacings.set(guard, next);
    return next;
  }

  /**
   * Erases one baked light, its top-left corner at a veil point. Each texel of
   * the picture covers LIGHTING.bake.texelPx world pixels, grown by the zoom.
   */
  private eraseBaked(
    point: { x: number; y: number; scale: number },
    key: string,
    alpha: number
  ): void {
    this.bakeBrush.setTexture(key);
    this.bakeBrush.setScale(point.scale * LIGHTING.bake.texelPx);
    this.bakeBrush.setAlpha(Phaser.Math.Clamp(alpha, 0, 1));
    this.rt.erase(this.bakeBrush, point.x, point.y);
  }

  /** Builds the soft radial gradient brush texture once (guarded for restart). */
  private static ensureMask(scene: Phaser.Scene): void {
    if (scene.textures.exists(MASK_KEY)) {
      return;
    }
    const tex = scene.textures.createCanvas(MASK_KEY, MASK_SIZE, MASK_SIZE);
    if (!tex) {
      return;
    }
    const ctx = tex.getContext();
    const r = MASK_SIZE / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    // The knee is shared with lightFalloff, so baked lights fade off the same way.
    gradient.addColorStop(FALLOFF_KNEE_T, `rgba(255,255,255,${FALLOFF_KNEE_LEVEL})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
    tex.refresh();
    // Pixel textures use nearest-neighbour filtering globally. This generated
    // gradient is the exception, its soft falloff must stay smoothly filtered.
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}
