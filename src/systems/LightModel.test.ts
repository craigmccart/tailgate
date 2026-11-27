import { describe, expect, it } from 'vitest';
import buildingCMapRaw from '../../public/maps/building-c.json?raw';
import dataCentreMapRaw from '../../public/maps/data-centre.json?raw';
import warehouseMapRaw from '../../public/maps/warehouse.json?raw';
import type { LightRect, ZoneRect } from '../world/BuildingMap';
import { parseMapData } from '../world/mapData';
import { LightModel } from './LightModel';
import { rectContains, type Rect } from './occlusion';

/**
 * Light stops at walls and closed doors (Phase 23). Occlusion can only make a
 * point darker, never brighter, so detection gets no new ways to catch the
 * player: the property test below proves that on all three real maps.
 */

const LEVELS = [
  ['building-c', buildingCMapRaw],
  ['data-centre', dataCentreMapRaw],
  ['warehouse', warehouseMapRaw],
] as const;

// AMBIENT_FALLBACK is 0.4 and LIGHTING.pool is { intensity: 0.9, radiusPx: 140 }.
const zone: ZoneRect = {
  name: 'unknownZone',
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  restricted: false,
  exterior: false,
};
const pool: LightRect = { id: 'p', kind: 'pool', x: 100, y: 100, width: 0, height: 0 };
const wall: Rect = { x: 150, y: 0, width: 10, height: 300 };

describe('LightModel occlusion', () => {
  it('lights the near side of a wall as before', () => {
    const model = new LightModel([zone], [pool], [wall]);
    expect(model.computeLightAt(120, 100)).toBeCloseTo(0.9 * (1 - 20 / 140));
  });

  it('gives nothing behind a wall', () => {
    expect(new LightModel([zone], [pool], [wall]).computeLightAt(170, 100)).toBeCloseTo(0.4);
    expect(
      new LightModel([zone], [pool], [wall], { occlusion: false }).computeLightAt(170, 100)
    ).toBeCloseTo(0.45);
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

  it('still lights a point in front of a guard torch with no wall in the way', () => {
    const model = new LightModel([zone], [], [wall]);
    model.setGuardTorches([{ x: 100, y: 100, facing: 0 }]);
    expect(model.computeLightAt(130, 100)).toBeGreaterThan(0.4);
  });

  // Sampled at 32 px grid corners (0, 32, 64 ...), skipping any inside a wall.
  // Every 8th sampled point also holds four guard torches, one facing each
  // way, so the torch path is checked as well as the static lights.
  it.each(LEVELS)('%s: occlusion only ever darkens', (_name, raw) => {
    const m = parseMapData(raw);
    const occluded = new LightModel(m.zones, m.lights, m.walls);
    const open = new LightModel(m.zones, m.lights, m.walls, { occlusion: false });
    occluded.setClosedDoors(m.doors);
    open.setClosedDoors(m.doors);
    const points: [number, number][] = [];
    for (let y = 0; y <= m.heightPx; y += 32) {
      for (let x = 0; x <= m.widthPx; x += 32) {
        if (!m.walls.some((w) => rectContains(w, x, y))) {
          points.push([x, y]);
        }
      }
    }
    const facings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const torches = points
      .filter((_point, i) => i % 8 === 0)
      .flatMap(([x, y]) => facings.map((facing) => ({ x, y, facing })));
    occluded.setGuardTorches(torches);
    open.setGuardTorches(torches);
    for (const [x, y] of points) {
      expect(occluded.computeLightAt(x, y)).toBeLessThanOrEqual(open.computeLightAt(x, y) + 1e-9);
    }
    expect(points.length).toBeGreaterThan(100);
    expect(torches.length).toBeGreaterThan(40);
  });

  it('data centre: every rack light inside a rack row still lights an aisle beside it', () => {
    const m = parseMapData(dataCentreMapRaw);
    const model = new LightModel(m.zones, m.lights, m.walls);
    const ambientOnly = new LightModel(m.zones, [], m.walls);
    let checked = 0;
    for (const l of m.lights) {
      const cx = l.x + l.width / 2;
      const cy = l.y + l.height / 2;
      const row = m.walls.find((w) => rectContains(w, cx, cy));
      if (!row) {
        continue;
      }
      checked++;
      const above = [cx, row.y - 16] as const;
      const below = [cx, row.y + row.height + 16] as const;
      const lit = [above, below].some(
        ([px, py]) => model.computeLightAt(px, py) > ambientOnly.computeLightAt(px, py)
      );
      expect(lit, `light ${l.id} at ${cx},${cy}`).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
