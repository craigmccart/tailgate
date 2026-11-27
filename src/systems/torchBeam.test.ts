import { describe, expect, it } from 'vitest';
import { easeAngle, torchBeamTriangles } from './torchBeam';

const deg = (d: number): number => (d * Math.PI) / 180;

// 9 rays across a 70 degree cone are 8.75 degrees apart, so an 8 degree
// feather needs one extra ray outside each edge: 9 + 2 - 1 = 10 triangles.
const base = {
  x: 0,
  y: 0,
  facing: 0,
  halfFovRad: deg(35),
  rangePx: 200,
  rays: 9,
  intensity: 0.5,
  edgeFeatherRad: deg(8),
  occluders: [],
};

/** How many feather rays the beam adds outside each edge of the cone. */
const extraRays = (tris: readonly unknown[], rays: number): number =>
  (tris.length - (rays - 1)) / 2;

describe('torchBeamTriangles', () => {
  it('makes one triangle per gap between rays, feather rays included', () => {
    expect(torchBeamTriangles(base)).toHaveLength(10);
  });
  it('fades to nothing at full range in the open', () => {
    for (const t of torchBeamTriangles(base)) {
      expect(t.bAlpha).toBeCloseTo(0);
      expect(t.cAlpha).toBeCloseTo(0);
    }
  });
  it('pools light on a wall at half range', () => {
    const tris = torchBeamTriangles({ ...base, occluders: [{ x: 100, y: -300, width: 10, height: 600 }] });
    // The fourth gap inside the cone, after the one feather triangle.
    const middle = tris[4];
    expect(middle.bx).toBeCloseTo(100, 0);
    expect(middle.bAlpha).toBeGreaterThan(0.2);
  });
  it("keeps the vision cone's own rays inside the cone", () => {
    const tris = torchBeamTriangles(base);
    const extra = extraRays(tris, base.rays);
    const firstInside = tris[extra];
    const lastInside = tris[extra + base.rays - 2];
    expect(Math.atan2(firstInside.by, firstInside.bx)).toBeCloseTo(-base.halfFovRad, 9);
    expect(Math.atan2(lastInside.cy, lastInside.cx)).toBeCloseTo(base.halfFovRad, 9);
  });
  it('is full torch strength at the guard in every triangle inside the cone', () => {
    const tris = torchBeamTriangles(base);
    const extra = extraRays(tris, base.rays);
    const inside = tris.slice(extra, extra + base.rays - 1);
    expect(inside).toHaveLength(base.rays - 1);
    for (const t of inside) {
      expect(t.aAlpha).toBe(base.intensity);
    }
  });
  it('fades to nothing in the outermost triangles, outside the cone', () => {
    const tris = torchBeamTriangles(base);
    const first = tris[0];
    const last = tris[tris.length - 1];
    expect(first.aAlpha).toBe(0);
    expect(last.aAlpha).toBe(0);
    // Their outer rays sit at least a feather's width past the cone's edges.
    expect(Math.atan2(first.by, first.bx)).toBeLessThanOrEqual(-(base.halfFovRad + base.edgeFeatherRad));
    expect(Math.atan2(last.cy, last.cx)).toBeGreaterThanOrEqual(base.halfFovRad + base.edgeFeatherRad);
  });
  it('steps down one ray at a time across the feather', () => {
    // The game's own 40 rays are about 1.8 degrees apart: five feather rays a side.
    const tris = torchBeamTriangles({ ...base, rays: 40 });
    const gap = (2 * base.halfFovRad) / 39;
    const extra = extraRays(tris, 40);
    expect(extra).toBe(Math.ceil(base.edgeFeatherRad / gap));
    // Just past the edge, the light is down by one ray's share of the feather.
    expect(tris[extra - 1].aAlpha).toBeCloseTo(base.intensity * (1 - gap / base.edgeFeatherRad), 9);
    for (let i = 0; i < extra; i++) {
      expect(tris[i].aAlpha).toBeLessThan(tris[i + 1].aAlpha);
    }
  });
  it('adds no feather rays when the feather is 0', () => {
    expect(torchBeamTriangles({ ...base, edgeFeatherRad: 0 })).toHaveLength(base.rays - 1);
  });
  it('makes no beam from a single ray', () => {
    expect(torchBeamTriangles({ ...base, rays: 1 })).toEqual([]);
  });
});

describe('easeAngle', () => {
  /** The signed gap from a to b the short way round, minus pi to pi. */
  const gap = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

  it('snaps straight to the target when the ease time is 0', () => {
    expect(easeAngle(0.2, 1.4, 16, 0)).toBe(1.4);
  });
  it('does not move when no time has passed', () => {
    expect(easeAngle(0.2, 1.4, 0, 120)).toBe(0.2);
  });
  it('turns the short way across pi, not back through 0', () => {
    let angle = 3.0;
    for (let i = 0; i < 20; i++) {
      angle = easeAngle(angle, -3.0, 16, 120);
      // Every step stays on the far side of the circle, near pi.
      expect(Math.abs(angle)).toBeGreaterThan(3.0 - 1e-12);
    }
    expect(Math.abs(gap(angle, -3.0))).toBeLessThan(0.01);
  });
  it('moves steadily toward the target and never overshoots', () => {
    let angle = -1.0;
    let previous = Math.abs(gap(angle, 2.0));
    for (let i = 0; i < 30; i++) {
      angle = easeAngle(angle, 2.0, 16, 120);
      const remaining = gap(angle, 2.0);
      expect(remaining).toBeGreaterThanOrEqual(0); // still on the same side
      expect(remaining).toBeLessThanOrEqual(previous);
      previous = remaining;
    }
  });
  it('leaves under 5 percent of the turn after the ease time, however the frames fall', () => {
    const start = 0;
    const target = 1.5;
    // One long step.
    expect(Math.abs(gap(easeAngle(start, target, 120, 120), target))).toBeLessThan(0.05 * target);
    // The same 120 ms in uneven frames.
    let angle = start;
    for (const dt of [16, 17, 33, 8, 16, 30]) {
      angle = easeAngle(angle, target, dt, 120);
    }
    expect(Math.abs(gap(angle, target))).toBeLessThan(0.05 * target);
  });
});
