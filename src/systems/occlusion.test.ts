import { describe, expect, it } from 'vitest';
import {
  rayDistanceToRects,
  rayToSegment,
  rectContains,
  segmentBlocked,
  type Rect,
} from './occlusion';

const wall = { x: 10, y: -5, width: 4, height: 10 };

/**
 * The loop rayDistanceToRects used before it went allocation-free: a fresh
 * array of four edges per rect per ray. Kept here only to prove the new loop
 * gives exactly the same answers.
 */
function referenceRayDistance(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  rects: readonly Rect[],
  maxDist: number
): number {
  let nearest = maxDist;
  for (const w of rects) {
    const right = w.x + w.width;
    const bottom = w.y + w.height;
    const edges: [number, number, number, number][] = [
      [w.x, w.y, right, w.y],
      [right, w.y, right, bottom],
      [right, bottom, w.x, bottom],
      [w.x, bottom, w.x, w.y],
    ];
    for (const [ax, ay, bx, by] of edges) {
      const t = rayToSegment(ox, oy, dx, dy, ax, ay, bx, by);
      if (t < nearest) {
        nearest = t;
      }
    }
  }
  return nearest;
}

/** A small seeded random number generator (mulberry32), so the test is the same every run. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rayToSegment', () => {
  it('measures the distance to a segment ahead', () => {
    expect(rayToSegment(0, 0, 1, 0, 10, -5, 10, 5)).toBeCloseTo(10);
  });
  it('misses a parallel segment and one behind the origin', () => {
    expect(rayToSegment(0, 0, 1, 0, 0, 5, 10, 5)).toBe(Infinity);
    expect(rayToSegment(0, 0, 1, 0, -10, -5, -10, 5)).toBe(Infinity);
  });
});

describe('rayDistanceToRects', () => {
  it('stops at the nearest rect edge', () => {
    expect(rayDistanceToRects(0, 0, 1, 0, [wall], 100)).toBeCloseTo(10);
  });
  it('is capped at the maximum distance', () => {
    expect(rayDistanceToRects(0, 0, 1, 0, [], 100)).toBe(100);
    expect(rayDistanceToRects(0, 0, 1, 0, [{ ...wall, x: 200 }], 100)).toBe(100);
  });
  it('gives exactly the same distance as the old allocating loop for 400 seeded random rays', () => {
    const rects: Rect[] = [
      wall,
      { x: 60, y: 40, width: 30, height: 8 },
      { x: -40, y: 70, width: 12, height: 50 },
      { x: 120, y: -60, width: 0.5, height: 90 },
      { x: 30.25, y: -90.75, width: 45.5, height: 20.125 },
    ];
    const random = seededRandom(23);
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      const ox = -100 + random() * 300;
      const oy = -120 + random() * 260;
      const angle = random() * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const expected = referenceRayDistance(ox, oy, dx, dy, rects, 250);
      if (expected < 250) {
        hits++;
      }
      expect(rayDistanceToRects(ox, oy, dx, dy, rects, 250)).toBe(expected);
    }
    // Enough rays meet a rect for the comparison to mean something.
    expect(hits).toBeGreaterThan(50);
  });
});

describe('segmentBlocked', () => {
  it('is blocked by a wall between the ends', () => {
    expect(segmentBlocked(0, 0, 30, 0, [wall])).toBe(true);
  });
  it('is clear when the segment passes beside the wall', () => {
    expect(segmentBlocked(0, 20, 30, 20, [wall])).toBe(false);
  });
  it('ignores a rect that contains the start (a light inside a rack row)', () => {
    expect(segmentBlocked(12, 0, 40, 0, [wall])).toBe(false);
  });
  it('ignores a rect that contains the end (light landing on a wall)', () => {
    expect(segmentBlocked(-20, 0, 12, 0, [wall])).toBe(false);
  });
  it('counts touching a corner as blocked', () => {
    // Controller ruling P1: this segment meets the rect only at its corner (10, -5).
    expect(segmentBlocked(5, 0, 15, -10, [wall])).toBe(true);
  });
  it('still counts a corner touch that float rounding puts a hair outside', () => {
    // This segment's midpoint is exactly the corner (10, -5), but the two
    // slabs disagree about it by about 1e-16, so the old test called it a miss.
    expect(segmentBlocked(0.1, -4.01, 19.9, -5.99, [wall])).toBe(true);
  });
  it('handles a vertical segment', () => {
    expect(segmentBlocked(12, -20, 12, 20, [wall])).toBe(true);
    expect(segmentBlocked(20, -20, 20, 20, [wall])).toBe(false);
  });
  it('handles a horizontal segment', () => {
    expect(segmentBlocked(-10, 3, 40, 3, [wall])).toBe(true);
    expect(segmentBlocked(-10, 8, 40, 8, [wall])).toBe(false);
  });
  it('is clear for a zero-length segment outside every rect', () => {
    expect(segmentBlocked(30, 30, 30, 30, [wall])).toBe(false);
  });
  it('counts a segment lying exactly along a rect edge as blocked', () => {
    // Along the top edge y = -5, starting and ending outside the rect.
    expect(segmentBlocked(0, -5, 30, -5, [wall])).toBe(true);
  });
});

describe('rectContains', () => {
  it('includes the edges', () => {
    expect(rectContains(wall, 10, -5)).toBe(true);
    expect(rectContains(wall, 9.9, 0)).toBe(false);
  });
});
