import Phaser from 'phaser';
import { ART } from '../config/art';
import { WEATHER } from '../config/weather';
import type { EffectPoint, LightRect, ZoneRect } from '../world/BuildingMap';
import { rainEmitterFor } from '../world/weatherGeometry';

/** Texture key for the shared soft radial dot every particle uses. */
const DOT_KEY = 'softDot';
const DOT_SIZE = 32;

/** Texture key for the generated rain streak. */
const RAIN_KEY = 'rainStreak';
/** How thick a rain streak is, px. */
const RAIN_STREAK_WIDTH_PX = 2;
/** Clear border round the streak, px, so smooth filtering never clips its edge. */
const RAIN_TEXTURE_PAD_PX = 1;

/**
 * Ambient atmosphere, all data-driven and all generated at runtime: dust motes
 * drift in every pool light the map authors, and the map's effects layer
 * places steam (kitchen kettle) and haze (server rack heat). Phase 22 adds rain
 * over every zone the map marks exterior, which the scene switches on and off
 * with SCREEN EFFECTS. Everything sits below the lighting veil, so darkness
 * dims the air exactly like it dims the floor. No texture files: the soft dot
 * and the rain streak are drawn onto canvases at boot, which keeps the asset
 * SBOM empty and the licence trivially CC0.
 */
export class AmbientParticles {
  /** One rain emitter per exterior zone. They start stopped. */
  private readonly rainEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private rainOn = false;

  constructor(
    scene: Phaser.Scene,
    lights: LightRect[],
    effects: EffectPoint[],
    zones: readonly ZoneRect[]
  ) {
    AmbientParticles.ensureDot(scene);
    AmbientParticles.ensureRainStreak(scene);

    for (const light of lights) {
      if (light.kind === 'pool') {
        // Tiled rect origins are top-left; centre the cloud in the lit pool,
        // exactly like LightModel centres the light itself. Point lights
        // (width and height 0) pass through unchanged.
        this.addDust(scene, light.x + light.width / 2, light.y + light.height / 2);
      }
    }
    for (const effect of effects) {
      if (effect.kind === 'steam') {
        this.addSteam(scene, effect.x, effect.y);
      } else if (effect.kind === 'haze') {
        this.addHaze(scene, effect.x, effect.y);
      }
    }
    for (const zone of zones) {
      if (zone.exterior) {
        this.addRain(scene, zone);
      }
    }
  }

  /**
   * Starts or stops every rain emitter. Safe to call every frame: it only acts
   * when the state changes. Stopping lets the streaks already falling finish,
   * so the rain clears within one streak's life rather than vanishing.
   */
  setRainEnabled(on: boolean): void {
    if (on === this.rainOn) {
      return;
    }
    this.rainOn = on;
    for (const emitter of this.rainEmitters) {
      if (on) {
        emitter.start();
      } else {
        emitter.stop();
      }
    }
  }

  /** Rain streaks scattered over one outdoor zone, falling and fading. */
  private addRain(scene: Phaser.Scene, zone: ZoneRect): void {
    const cfg = WEATHER.rain;
    const spec = rainEmitterFor(zone, cfg);
    // Each new streak starts at a random point anywhere over the zone.
    const area: Phaser.Types.GameObjects.Particles.RandomZoneSource = {
      getRandomPoint: (point) => {
        point.x = Phaser.Math.FloatBetween(spec.x, spec.x + spec.width);
        point.y = Phaser.Math.FloatBetween(spec.y, spec.y + spec.height);
      },
    };
    const emitter = scene.add
      .particles(0, 0, RAIN_KEY, {
        emitZone: { type: 'random', source: area },
        frequency: spec.frequencyMs,
        quantity: spec.quantity,
        lifespan: cfg.lifespanMs,
        speedX: cfg.driftX,
        speedY: cfg.speedY,
        // Fade in from nothing, up to the peak, down to the tail, out to
        // nothing, spread evenly over the streak's life, so it never pops.
        alpha: { values: [0, cfg.alphaPeak, cfg.alphaTail, 0], interpolation: 'linear' },
        tint: cfg.tint,
        emitting: false,
      })
      .setDepth(cfg.depth);
    this.rainEmitters.push(emitter);
  }

  /** Slow drifting motes inside a pool light's throw. */
  private addDust(scene: Phaser.Scene, x: number, y: number): void {
    const cfg = ART.particles.dust;
    scene.add
      .particles(x, y, DOT_KEY, {
        x: { min: -cfg.spreadX, max: cfg.spreadX },
        y: { min: -cfg.spreadY, max: cfg.spreadY },
        frequency: cfg.frequencyMs,
        lifespan: cfg.lifespanMs,
        speedX: { min: -cfg.driftX, max: cfg.driftX },
        speedY: { min: -cfg.riseMax, max: -cfg.riseMin },
        alpha: { start: cfg.alphaStart, end: 0 },
        scale: { start: cfg.scaleStart, end: cfg.scaleEnd },
        tint: ART.particles.tint,
      })
      .setDepth(ART.particles.depth);
  }

  /** Kettle steam: rises, fattens and fades. */
  private addSteam(scene: Phaser.Scene, x: number, y: number): void {
    const cfg = ART.particles.steam;
    scene.add
      .particles(x, y, DOT_KEY, {
        x: { min: -cfg.spawnSpreadX, max: cfg.spawnSpreadX },
        frequency: cfg.frequencyMs,
        lifespan: cfg.lifespanMs,
        speedX: { min: -cfg.driftX, max: cfg.driftX },
        speedY: { min: -cfg.riseMax, max: -cfg.riseMin },
        alpha: { start: cfg.alphaStart, end: 0 },
        scale: { start: cfg.scaleStart, end: cfg.scaleEnd },
        tint: ART.particles.tint,
      })
      .setDepth(ART.particles.depth);
  }

  /** Server room heat haze: broad, slow, sideways wisps. */
  private addHaze(scene: Phaser.Scene, x: number, y: number): void {
    const cfg = ART.particles.haze;
    scene.add
      .particles(x, y, DOT_KEY, {
        x: { min: -cfg.spawnSpreadX, max: cfg.spawnSpreadX },
        y: { min: -cfg.spawnSpreadY, max: cfg.spawnSpreadY },
        frequency: cfg.frequencyMs,
        lifespan: cfg.lifespanMs,
        speedX: { min: -cfg.driftPx, max: cfg.driftPx },
        speedY: { min: -cfg.driftY, max: cfg.driftY },
        alpha: { start: cfg.alphaStart, end: 0 },
        scale: { start: cfg.scaleStart, end: cfg.scaleEnd },
        tint: ART.particles.tint,
      })
      .setDepth(ART.particles.depth);
  }

  /** Builds the shared soft radial dot texture once (guarded for restarts). */
  private static ensureDot(scene: Phaser.Scene): void {
    if (scene.textures.exists(DOT_KEY)) {
      return;
    }
    const tex = scene.textures.createCanvas(DOT_KEY, DOT_SIZE, DOT_SIZE);
    if (!tex) {
      return;
    }
    const ctx = tex.getContext();
    const r = DOT_SIZE / 2;
    const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.4)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, DOT_SIZE, DOT_SIZE);
    tex.refresh();
  }

  /**
   * Builds the rain streak texture once (guarded for restarts): a thin line
   * leaning with the wind, so a streak falling left tilts its top to the
   * right. Drawn white, like the soft dot, so the emitter's tint alone sets
   * its colour.
   */
  private static ensureRainStreak(scene: Phaser.Scene): void {
    if (scene.textures.exists(RAIN_KEY)) {
      return;
    }
    const cfg = WEATHER.rain;
    const angle = Phaser.Math.DegToRad(cfg.streakAngleDeg);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pad = RAIN_TEXTURE_PAD_PX * 2;
    const width = Math.ceil(RAIN_STREAK_WIDTH_PX * cos + cfg.streakLengthPx * sin) + pad;
    const height = Math.ceil(cfg.streakLengthPx * cos + RAIN_STREAK_WIDTH_PX * sin) + pad;
    const tex = scene.textures.createCanvas(RAIN_KEY, width, height);
    if (!tex) {
      return;
    }
    const ctx = tex.getContext();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(
      -RAIN_STREAK_WIDTH_PX / 2,
      -cfg.streakLengthPx / 2,
      RAIN_STREAK_WIDTH_PX,
      cfg.streakLengthPx
    );
    tex.refresh();
    // Pixel textures use nearest-neighbour filtering globally. The streak's
    // slanted edge must stay smoothly filtered or it reads as a jagged step.
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}
