import { describe, expect, it } from 'vitest';
import { torchBeamTriangles } from './torchBeam';

const base = {
  x: 0,
  y: 0,
  facing: 0,
  halfFovRad: (35 * Math.PI) / 180,
  rangePx: 200,
  rays: 9,
  intensity: 0.5,
  edgeFeatherRad: (8 * Math.PI) / 180,
  occluders: [],
};

describe('torchBeamTriangles', () => {
  it('makes one triangle per gap between rays', () => {
    expect(torchBeamTriangles(base)).toHaveLength(8);
  });
  it('fades to nothing at full range in the open', () => {
    for (const t of torchBeamTriangles(base)) {
      expect(t.bAlpha).toBeCloseTo(0);
      expect(t.cAlpha).toBeCloseTo(0);
    }
  });
  it('pools light on a wall at half range', () => {
    const tris = torchBeamTriangles({ ...base, occluders: [{ x: 100, y: -300, width: 10, height: 600 }] });
    const middle = tris[3];
    expect(middle.bx).toBeCloseTo(100, 0);
    expect(middle.bAlpha).toBeGreaterThan(0.2);
  });
  it('feathers the cone edges', () => {
    const tris = torchBeamTriangles(base);
    expect(tris[0].aAlpha).toBeLessThan(tris[3].aAlpha);
    expect(tris[3].aAlpha).toBeCloseTo(0.5);
  });
});
