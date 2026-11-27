import { HUD } from '../config/hud';
import { LightModel } from '../systems/LightModel';
import { rectContains, type Rect } from '../systems/occlusion';
import type { LightRect, ZoneRect } from './BuildingMap';

/**
 * Cover report (Phase 23). For each zone, how much of its floor is dark enough
 * for the exposure meter to read HIDDEN, with light as it was before Phase 23
 * (ignores walls) and as it is now (stops at walls and closed doors). Pure, no
 * Phaser, so it runs in tests and in the opt-in report.
 */

export interface CoverInput {
  zones: readonly ZoneRect[];
  lights: readonly LightRect[];
  walls: readonly Rect[];
  closedDoors: readonly Rect[];
  /** Size of each sampled square, in pixels. Smaller is finer but slower. */
  cellPx: number;
}

export interface ZoneCover {
  zone: string;
  /** Share (0 to 1) of the zone's floor that was hidden before wall-aware light. */
  hiddenBefore: number;
  /** Share (0 to 1) hidden with wall-aware light. */
  hiddenAfter: number;
}

export function coverByZone(input: CoverInput): ZoneCover[] {
  const { zones, lights, walls, closedDoors, cellPx } = input;
  const before = new LightModel(zones, lights, walls, { occlusion: false });
  const after = new LightModel(zones, lights, walls, { occlusion: true });
  before.setClosedDoors(closedDoors);
  after.setClosedDoors(closedDoors);

  const counts = new Map<string, { cells: number; before: number; after: number }>();
  for (const z of zones) {
    if (!counts.has(z.name)) {
      counts.set(z.name, { cells: 0, before: 0, after: 0 });
    }
  }
  if (zones.length === 0) {
    return [];
  }

  const maxX = Math.max(...zones.map((z) => z.x + z.width));
  const maxY = Math.max(...zones.map((z) => z.y + z.height));
  const dim = HUD.exposure.dimAbove;
  for (let y = cellPx / 2; y < maxY; y += cellPx) {
    for (let x = cellPx / 2; x < maxX; x += cellPx) {
      if (walls.some((w) => rectContains(w, x, y))) {
        continue;
      }
      // Last zone containing the cell wins, the same rule LightModel uses.
      let owner: ZoneRect | undefined;
      for (const z of zones) {
        if (rectContains(z, x, y)) {
          owner = z;
        }
      }
      const c = owner ? counts.get(owner.name) : undefined;
      if (!c) {
        continue;
      }
      c.cells++;
      if (before.computeLightAt(x, y) < dim) {
        c.before++;
      }
      if (after.computeLightAt(x, y) < dim) {
        c.after++;
      }
    }
  }

  return [...counts.entries()].map(([zone, c]) => ({
    zone,
    hiddenBefore: c.cells > 0 ? c.before / c.cells : 0,
    hiddenAfter: c.cells > 0 ? c.after / c.cells : 0,
  }));
}
