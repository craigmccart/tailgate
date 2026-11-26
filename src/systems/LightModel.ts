import { CONE_RANGE_PX, DETECTION } from '../config/detection';
import { AMBIENT_FALLBACK, AMBIENT_LIGHT, LIGHTING } from '../config/lighting';
import type { LightRect, ZoneRect } from '../world/BuildingMap';
import { segmentBlocked, type Rect } from './occlusion';

/** A static light source the renderer draws and the model samples. */
export interface LightSource {
  kind: 'pool' | 'flood' | 'rack';
  x: number;
  y: number;
  radiusPx: number;
  intensity: number;
}

const degToRad = (deg: number): number => (deg * Math.PI) / 180;
/** Wraps an angle into the range minus pi to pi. */
const wrapAngle = (a: number): number => {
  const twoPi = Math.PI * 2;
  return ((((a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
};
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const GUARD_HALF_FOV = degToRad(DETECTION.cone.fovDegrees) / 2;

/** A static source plus the walls that could possibly block its light. */
interface StaticSource extends LightSource {
  /** Only the walls overlapping this source's reach box, built once. */
  nearbyWalls: Rect[];
}

function overlapsReach(wall: Rect, s: LightSource): boolean {
  return (
    wall.x <= s.x + s.radiusPx &&
    wall.x + wall.width >= s.x - s.radiusPx &&
    wall.y <= s.y + s.radiusPx &&
    wall.y + wall.height >= s.y - s.radiusPx
  );
}

/**
 * The gameplay side of lighting: a pure analytic sampler of how lit a world
 * point is, 0 (dark) to 1 (bright). It is the "darkness as cover" model. The
 * scene samples it at the player each frame and passes the value into the guard,
 * which fills suspicion slower in the dark.
 *
 * It deliberately does NOT include the player's readability aura, so a player
 * standing in pitch dark still reads as concealed to guards while staying
 * visible to the human on screen. That separation is the whole point.
 *
 * Phase 23: light stops at walls and closed doors. That can only make a point
 * darker than before, never brighter, so it never adds a way to be spotted.
 * The player aura is not part of this model, so it is never occluded.
 */
export class LightModel {
  private readonly zones: ZoneRect[];
  private readonly staticSources: StaticSource[];
  private readonly walls: readonly Rect[];
  private readonly occlusion: boolean;
  /** Doors that are shut this frame; they block light like walls. */
  private closedDoors: readonly Rect[] = [];
  /** Every guard's sightline this frame. Phase 21: one per guard on site. */
  private torches: { x: number; y: number; facing: number }[] = [];

  constructor(
    zones: readonly ZoneRect[],
    lights: readonly LightRect[],
    walls: readonly Rect[],
    options: { occlusion: boolean } = { occlusion: true }
  ) {
    this.zones = [...zones];
    this.walls = walls;
    this.occlusion = options.occlusion;
    this.staticSources = lights.map((l) => {
      const source = this.toSource(l);
      return { ...source, nearbyWalls: walls.filter((w) => overlapsReach(w, source)) };
    });
  }

  /** Replaces the set of closed doors used this frame. */
  setClosedDoors(rects: readonly Rect[]): void {
    this.closedDoors = rects;
  }

  get sources(): readonly LightSource[] {
    return this.staticSources;
  }

  /** Replaces the guard sightlines for this frame. Pass an empty list for none. */
  setGuardTorches(torches: readonly { x: number; y: number; facing: number }[]): void {
    this.torches = [...torches];
  }

  /** Analytic light 0..1 at a point: the max of ambient, pools and the guard torches. */
  computeLightAt(x: number, y: number): number {
    let light = this.zoneAmbientAt(x, y);

    for (const s of this.staticSources) {
      const dist = Math.hypot(x - s.x, y - s.y);
      if (dist < s.radiusPx) {
        if (this.occlusion && this.blocked(s.x, s.y, x, y, s.nearbyWalls)) {
          continue;
        }
        const falloff = 1 - dist / s.radiusPx;
        light = Math.max(light, s.intensity * falloff);
      }
    }

    for (const torch of this.torches) {
      const dx = x - torch.x;
      const dy = y - torch.y;
      const dist = Math.hypot(dx, dy);
      if (dist < CONE_RANGE_PX && dist > 1) {
        const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - torch.facing));
        if (diff <= GUARD_HALF_FOV) {
          if (this.occlusion && this.blocked(torch.x, torch.y, x, y, this.walls)) {
            continue;
          }
          const falloff = 1 - dist / CONE_RANGE_PX;
          light = Math.max(light, LIGHTING.guardTorchIntensity * falloff);
        }
      }
    }

    return clamp(light, 0, 1);
  }

  private blocked(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    walls: readonly Rect[]
  ): boolean {
    return segmentBlocked(ax, ay, bx, by, walls) || segmentBlocked(ax, ay, bx, by, this.closedDoors);
  }

  private zoneAmbientAt(x: number, y: number): number {
    // Last match wins, mirroring render order (interior rooms over the car park).
    let ambient = AMBIENT_FALLBACK;
    for (const z of this.zones) {
      if (x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height) {
        ambient = AMBIENT_LIGHT[z.name] ?? AMBIENT_FALLBACK;
      }
    }
    return ambient;
  }

  private toSource(l: LightRect): LightSource {
    const cx = l.x + l.width / 2;
    const cy = l.y + l.height / 2;
    const kind: LightSource['kind'] =
      l.kind === 'flood' ? 'flood' : l.kind === 'rack' ? 'rack' : 'pool';
    const cfg = LIGHTING[kind];
    // A pool's reach is the larger of the configured radius and its own footprint.
    const radiusPx = Math.max(cfg.radiusPx, Math.max(l.width, l.height) / 2);
    return { kind, x: cx, y: cy, radiusPx, intensity: cfg.intensity };
  }
}
