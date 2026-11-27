import Phaser from 'phaser';
import { CONE_RANGE_PX } from '../config/detection';
import { FEED } from '../config/feed';
import { LIGHTING } from '../config/lighting';
import { PALETTE_HEX } from '../config/palette';
import { getSettings } from '../state/settings';
import type { Guard } from '../entities/Guard';
import type { Player } from '../entities/Player';
import type { LightSource } from './LightModel';
import { veilErasePoint, veilOriginFor } from './veilGeometry';

/** Size of the soft radial light-mask texture used as an erase brush. */
const MASK_SIZE = 256;
const MASK_KEY = 'lightMask';

/** What the veil was last drawn from, so a resize can redraw the same picture. */
interface VeilFrame {
  cam: Phaser.Cameras.Scene2D.Camera;
  player: Player;
  guards: readonly Guard[];
  sources: readonly LightSource[];
}

/**
 * The visual side of lighting. A RenderTexture is filled with a dark veil each
 * frame, then soft radial lights are ERASED out of it, punching holes where
 * the world shows through: room pools, a harsh loading-dock flood, tight
 * server rack LEDs, plus a soft aura that always follows the player so the
 * character and nearby walls are never lost (the accessibility floor).
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
  private lastFrame: VeilFrame | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    LightingRenderer.ensureMask(scene);

    const size = this.veilSize();
    this.rt = scene.add.renderTexture(0, 0, size.width, size.height).setOrigin(0, 0).setDepth(25);

    // A free brush (not on the display list), reused for every erased light.
    this.brush = scene.make.image({ x: 0, y: 0, key: MASK_KEY, add: false }).setOrigin(0.5);
  }

  /** Redraws the veil and erases the current lights. Called last each frame. */
  update(
    cam: Phaser.Cameras.Scene2D.Camera,
    player: Player,
    guards: readonly Guard[],
    sources: readonly LightSource[]
  ): void {
    this.lastFrame = { cam, player, guards, sources };
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

  private draw({ cam, player, guards, sources }: VeilFrame): void {
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

    for (const s of sources) {
      // The breathe is atmosphere, so it rides on the screen-effects setting.
      // The source's own intensity is never written to: LightModel hands out a
      // readonly list and detection must keep seeing the authored numbers.
      const intensity = settings.screenEffects
        ? s.intensity * this.breatheFactor(s, nowMs)
        : s.intensity;
      this.eraseLight(at(s.x, s.y), s.radiusPx, intensity);
    }

    // Each guard's own sightline glows softly, so its cone reads as a torch beam.
    for (const guard of guards) {
      this.eraseLight(at(guard.x, guard.y), CONE_RANGE_PX * 0.6, LIGHTING.guardTorchIntensity * 0.7);
    }

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
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.65)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
    tex.refresh();
    // Pixel textures use nearest-neighbour filtering globally. This generated
    // gradient is the exception, its soft falloff must stay smoothly filtered.
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}
