import { describe, expect, it } from 'vitest';
import buildingCMapRaw from '../../public/maps/building-c.json?raw';
import dataCentreMapRaw from '../../public/maps/data-centre.json?raw';
import warehouseMapRaw from '../../public/maps/warehouse.json?raw';
import type { LightRect, ZoneRect } from '../world/BuildingMap';
import { LightModel } from './LightModel';
import { rectContains, type Rect } from './occlusion';

/**
 * Light stops at walls and closed doors (Phase 23). Occlusion can only make a
 * point darker, never brighter, so detection gets no new ways to catch the
 * player: the property test below proves that on all three real maps.
 */

interface TiledProperty {
  name: string;
  value: unknown;
}

interface TiledObject {
  name?: string;
  type?: string;
  class?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: TiledProperty[];
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: { name: string; objects?: TiledObject[] }[];
}

interface LoadedMap {
  zones: ZoneRect[];
  lights: LightRect[];
  walls: Rect[];
  doors: Rect[];
  widthPx: number;
  heightPx: number;
}

const LEVELS = [
  ['building-c', buildingCMapRaw],
  ['data-centre', dataCentreMapRaw],
  ['warehouse', warehouseMapRaw],
] as const;

/** Parses Tiled JSON the same way src/world/BuildingMap.ts does. */
function loadMap(raw: string): LoadedMap {
  const map = JSON.parse(raw) as TiledMap;
  const objects = (layer: string): TiledObject[] =>
    map.layers.find((l) => l.name === layer)?.objects ?? [];
  const flag = (o: TiledObject, name: string): boolean =>
    o.properties?.find((p) => p.name === name)?.value === true;
  const rect = (o: TiledObject): Rect => ({
    x: o.x ?? 0,
    y: o.y ?? 0,
    width: o.width ?? 0,
    height: o.height ?? 0,
  });
  return {
    zones: objects('zones').map((o) => ({
      name: o.name ?? '',
      ...rect(o),
      restricted: flag(o, 'restricted'),
      exterior: flag(o, 'exterior'),
    })),
    lights: objects('lights').map((o) => ({
      id: o.name ?? '',
      kind: o.type ?? o.class ?? 'pool',
      ...rect(o),
    })),
    walls: objects('walls').map(rect),
    doors: objects('doors').map(rect),
    widthPx: map.width * map.tilewidth,
    heightPx: map.height * map.tileheight,
  };
}

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
  it.each(LEVELS)('%s: occlusion only ever darkens', (_name, raw) => {
    const m = loadMap(raw);
    const occluded = new LightModel(m.zones, m.lights, m.walls);
    const open = new LightModel(m.zones, m.lights, m.walls, { occlusion: false });
    occluded.setClosedDoors(m.doors);
    open.setClosedDoors(m.doors);
    let sampled = 0;
    for (let y = 0; y <= m.heightPx; y += 32) {
      for (let x = 0; x <= m.widthPx; x += 32) {
        if (m.walls.some((w) => rectContains(w, x, y))) {
          continue;
        }
        sampled++;
        expect(occluded.computeLightAt(x, y)).toBeLessThanOrEqual(open.computeLightAt(x, y) + 1e-9);
      }
    }
    expect(sampled).toBeGreaterThan(100);
  });

  it('data centre: every rack light inside a rack row still lights an aisle beside it', () => {
    const m = loadMap(dataCentreMapRaw);
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
