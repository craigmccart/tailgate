import { describe, expect, it } from 'vitest';
import buildingCMapRaw from '../../public/maps/building-c.json?raw';
import dataCentreMapRaw from '../../public/maps/data-centre.json?raw';
import warehouseMapRaw from '../../public/maps/warehouse.json?raw';
import type { Rect } from '../systems/occlusion';
import type { LightRect, ZoneRect } from './BuildingMap';
import { coverByZone } from './coverReport';
import { parseMapData } from './mapData';

// The project has no Node type definitions; Vitest runs in Node, so process exists.
declare const process: { env: Record<string, string | undefined> };

const LEVELS = [
  ['building-c', buildingCMapRaw],
  ['data-centre', dataCentreMapRaw],
  ['warehouse', warehouseMapRaw],
] as const;

// serverRoom ambient is 0.12 (hidden). A pool at (100,100) lights 0.9 * (1 - d/140).
const zone: ZoneRect = {
  name: 'serverRoom',
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  restricted: false,
  exterior: false,
};
const pool: LightRect = { id: 'p', kind: 'pool', x: 100, y: 100, width: 0, height: 0 };
const wall: Rect = { x: 150, y: 0, width: 10, height: 300 };

describe('coverByZone', () => {
  it('counts cells behind a wall hidden only once light stops at the wall', () => {
    const [cover] = coverByZone({
      zones: [zone],
      lights: [pool],
      walls: [wall],
      closedDoors: [],
      cellPx: 20,
    });
    expect(cover.zone).toBe('serverRoom');
    expect(cover.hiddenAfter).toBeGreaterThanOrEqual(cover.hiddenBefore);
    expect(cover.hiddenAfter).toBeGreaterThan(cover.hiddenBefore);
  });

  it('returns 0 for a zone with no counted cells', () => {
    const covered: Rect = { x: 0, y: 0, width: 400, height: 300 };
    const [cover] = coverByZone({
      zones: [zone],
      lights: [],
      walls: [covered],
      closedDoors: [],
      cellPx: 20,
    });
    expect(cover).toEqual({ zone: 'serverRoom', hiddenBefore: 0, hiddenAfter: 0 });
  });

  it('merges zone rectangles that share a name into one entry', () => {
    const covers = coverByZone({
      zones: [zone, { ...zone, x: 400 }],
      lights: [],
      walls: [],
      closedDoors: [],
      cellPx: 20,
    });
    expect(covers).toHaveLength(1);
    expect(covers[0].hiddenBefore).toBe(1);
  });

  it.each(LEVELS)('%s: no zone gets less cover with every door closed', (_name, raw) => {
    const m = parseMapData(raw);
    const covers = coverByZone({ ...m, closedDoors: m.doors, cellPx: 16 });
    expect(covers.length).toBeGreaterThan(0);
    for (const c of covers) {
      expect(c.hiddenAfter, c.zone).toBeGreaterThanOrEqual(c.hiddenBefore);
    }
  });

  // Opt-in report. To print it, run exactly:
  //   COVER_REPORT=1 npx vitest run src/world/coverReport.test.ts --silent=false
  // From an AI agent session add --reporter=default as well: there Vitest
  // picks a quieter reporter that hides a passing test's console output.
  it.runIf(process.env.COVER_REPORT === '1')('prints the per-site cover table', () => {
    const pct = (v: number): number => Math.round(v * 1000) / 10;
    for (const [name, raw] of LEVELS) {
      const m = parseMapData(raw);
      const rows = coverByZone({ ...m, closedDoors: m.doors, cellPx: 16 }).map((c) => ({
        zone: c.zone,
        'hidden before %': pct(c.hiddenBefore),
        'hidden after %': pct(c.hiddenAfter),
        'change (points)': Math.round((c.hiddenAfter - c.hiddenBefore) * 1000) / 10,
      }));
      console.log(name);
      console.table(rows);
    }
  });
});
