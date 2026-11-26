import { describe, expect, it } from 'vitest';
import { rayDistanceToRects, rayToSegment, rectContains, segmentBlocked } from './occlusion';

const wall = { x: 10, y: -5, width: 4, height: 10 };

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
});

describe('rectContains', () => {
  it('includes the edges', () => {
    expect(rectContains(wall, 10, -5)).toBe(true);
    expect(rectContains(wall, 9.9, 0)).toBe(false);
  });
});
