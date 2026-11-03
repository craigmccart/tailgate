import type { WEATHER } from '../config/weather';
import type { ZoneRect } from './BuildingMap';

/** A rectangle in world pixels. */
export interface WeatherRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where one zone's rain emitter scatters streaks, and how often. */
export interface RainEmitterSpec extends WeatherRect {
  /** Time between emits, ms. Never under 8 ms. */
  frequencyMs: number;
  /** Streaks per emit. More than 1 only when a zone needs more than 125 a second. */
  quantity: number;
}

/** One wet-shine oval on the ground, and the zone rectangle it is cut off at. */
export interface WetSheenEllipse extends WeatherRect {
  clip: WeatherRect;
}

/** The fields of a resolved light this module reads (LightModel's LightSource has them). */
export interface SheenLight {
  x: number;
  y: number;
  radiusPx: number;
}

/**
 * The rain settings' shape with plain numbers in place of the shipped values,
 * so a test can try another density without a cast. WEATHER.rain fits it.
 */
export type RainConfig = { readonly [K in keyof typeof WEATHER.rain]: number };

/** The fastest an emitter fires, ms: about once a frame at 120 Hz. */
const MIN_EMIT_INTERVAL_MS = 8;

/**
 * The rain emitter for one zone: it covers the zone rectangle, and fires
 * often enough to give the configured density for the zone's area. A zone so
 * big that it would need to fire faster than every 8 ms fires every 8 ms with
 * several streaks per emit instead, so it still gets its full density.
 */
export function rainEmitterFor(zone: ZoneRect, cfg: RainConfig): RainEmitterSpec {
  const { x, y, width, height } = zone;
  const dropsPerSecond = ((width * height) / 10000) * cfg.dropsPerSecondPer10kPx2;
  const raw = 1000 / dropsPerSecond;
  if (raw >= MIN_EMIT_INTERVAL_MS) {
    return { x, y, width, height, frequencyMs: raw, quantity: 1 };
  }
  return {
    x,
    y,
    width,
    height,
    frequencyMs: MIN_EMIT_INTERVAL_MS,
    quantity: Math.max(1, Math.round(MIN_EMIT_INTERVAL_MS / raw)),
  };
}

/**
 * The wet-shine ovals: one for every light whose reach touches an exterior
 * zone, centred under the light and cut off at that zone's edge. Indoor zones
 * never get one. A light reaches a zone when the closest point of the zone's
 * rectangle is nearer to the light than its radius.
 */
export function wetSheenEllipsesFor(
  zones: readonly ZoneRect[],
  sources: readonly SheenLight[],
  cfg: typeof WEATHER.wetSheen
): WetSheenEllipse[] {
  const ellipses: WetSheenEllipse[] = [];
  for (const zone of zones) {
    if (!zone.exterior) {
      continue;
    }
    for (const source of sources) {
      if (distanceToRect(source.x, source.y, zone) >= source.radiusPx) {
        continue;
      }
      const r = source.radiusPx;
      ellipses.push({
        x: source.x,
        y: source.y + r * cfg.offsetYFactor,
        width: r * 2 * cfg.widthFactor,
        height: r * 2 * cfg.heightFactor,
        clip: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
      });
    }
  }
  return ellipses;
}

/** Distance from a point to the nearest point of a rectangle (0 when inside). */
function distanceToRect(px: number, py: number, rect: WeatherRect): number {
  const nearestX = Math.min(Math.max(px, rect.x), rect.x + rect.width);
  const nearestY = Math.min(Math.max(py, rect.y), rect.y + rect.height);
  return Math.hypot(px - nearestX, py - nearestY);
}
