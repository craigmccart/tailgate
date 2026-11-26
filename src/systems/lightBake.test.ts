import { describe, expect, it } from 'vitest';
import {
  bakeLight,
  changedRects,
  crossfadeAlpha,
  lightFalloff,
  overlapsReach,
  splitBakes,
  type BakedLight,
  type TexelCrop,
} from './lightBake';

describe('lightFalloff', () => {
  it('matches the old brush', () => {
    expect(lightFalloff(0)).toBe(1);
    expect(lightFalloff(0.55)).toBeCloseTo(0.65);
    expect(lightFalloff(1)).toBe(0);
    expect(lightFalloff(1.5)).toBe(0);
  });
});

describe('bakeLight', () => {
  // The alpha of the texel under a world point, for texelPx 2.
  const at = (b: ReturnType<typeof bakeLight>, wx: number, wy: number): number =>
    b.alpha[Math.floor((wy - b.originY) / 2) * b.sizeTexels + Math.floor((wx - b.originX) / 2)];
  it('is full at the centre and empty past the reach', () => {
    const b = bakeLight({ x: 100, y: 100, radiusPx: 40, occluders: [], texelPx: 2 });
    expect(b.sizeTexels).toBe(40);
    expect(at(b, 100, 100)).toBeGreaterThan(240);
    expect(at(b, 61, 61)).toBe(0);
  });
  it('is dark behind a wall', () => {
    const b = bakeLight({ x: 100, y: 100, radiusPx: 40, occluders: [{ x: 110, y: 60, width: 4, height: 80 }], texelPx: 2 });
    expect(at(b, 120, 100)).toBe(0);
    expect(at(b, 90, 100)).toBeGreaterThan(0);
  });
  it('still shines out of a wall that contains the light', () => {
    const b = bakeLight({ x: 100, y: 100, radiusPx: 40, occluders: [{ x: 90, y: 96, width: 20, height: 8 }], texelPx: 2 });
    expect(at(b, 100, 116)).toBeGreaterThan(0);
  });
});

describe('crossfadeAlpha', () => {
  it('ramps from 0 to 1 over the duration', () => {
    expect(crossfadeAlpha(0, 300)).toBe(0);
    expect(crossfadeAlpha(150, 300)).toBeCloseTo(0.5);
    expect(crossfadeAlpha(900, 300)).toBe(1);
    expect(crossfadeAlpha(0, 0)).toBe(1);
  });
});

describe('overlapsReach', () => {
  const light = { x: 100, y: 100, radiusPx: 40 };
  it('counts a rect touching the edge of the reach box', () => {
    expect(overlapsReach({ x: 140, y: 90, width: 10, height: 10 }, light)).toBe(true);
  });
  it('ignores a rect past the reach box', () => {
    expect(overlapsReach({ x: 141, y: 90, width: 10, height: 10 }, light)).toBe(false);
  });
});

describe('changedRects', () => {
  const a = { x: 0, y: 0, width: 10, height: 4 };
  const b = { x: 50, y: 0, width: 10, height: 4 };
  it('sees no change when the same doors come back as fresh objects', () => {
    expect(changedRects([a, b], [{ ...b }, { ...a }])).toEqual([]);
  });
  it('lists a door that closed and a door that opened', () => {
    expect(changedRects([a], [b])).toEqual([b, a]);
  });
});

describe('splitBakes', () => {
  // A light at (100,100) with a door-sized rect to its right, shut or open.
  const door = { x: 110, y: 90, width: 4, height: 20 };
  const bake = (occluders: { x: number; y: number; width: number; height: number }[]): BakedLight =>
    bakeLight({ x: 100, y: 100, radiusPx: 40, occluders, texelPx: 2 });
  const shut = bake([door]);
  const open = bake([]);

  // Every texel of the full square that is lit in `a` but dark in `b`.
  const onlyIn = (a: BakedLight, b: BakedLight): number[] =>
    [...a.alpha.keys()].filter((i) => a.alpha[i] > 0 && b.alpha[i] === 0);
  // The value a crop holds for a texel of the full square, or 0 outside it.
  const cropAt = (c: TexelCrop, size: number, i: number): number => {
    const col = (i % size) - c.x;
    const row = Math.floor(i / size) - c.y;
    return col < 0 || row < 0 || col >= c.width || row >= c.height ? 0 : c.alpha[row * c.width + col];
  };

  it('an opening door only gains light, and the shared part is the old bake', () => {
    const { shared, gained, lost } = splitBakes(shut, open);
    expect(lost).toBeNull();
    expect(gained).not.toBeNull();
    expect(shared).toEqual(shut.alpha);
    for (const i of onlyIn(open, shut)) {
      expect(cropAt(gained!, open.sizeTexels, i)).toBe(open.alpha[i]);
    }
  });

  it('a closing door only loses light, and the shared part is the new bake', () => {
    const { shared, gained, lost } = splitBakes(open, shut);
    expect(gained).toBeNull();
    expect(lost).not.toBeNull();
    expect(shared).toEqual(shut.alpha);
    for (const i of onlyIn(open, shut)) {
      expect(cropAt(lost!, open.sizeTexels, i)).toBe(open.alpha[i]);
    }
  });

  it('keeps the texel-wise minimum as the shared part when one door opens and another shuts', () => {
    const before = bake([door]);
    const after = bake([{ x: 86, y: 90, width: 4, height: 20 }]);
    const { shared, gained, lost } = splitBakes(before, after);
    expect(gained).not.toBeNull();
    expect(lost).not.toBeNull();
    expect([...shared]).toEqual([...before.alpha].map((v, i) => Math.min(v, after.alpha[i])));
  });

  it('crops the gained texels to a tight box', () => {
    const { gained } = splitBakes(shut, open);
    const size = open.sizeTexels;
    const lit = onlyIn(open, shut);
    const cols = lit.map((i) => i % size);
    const rows = lit.map((i) => Math.floor(i / size));
    expect(gained).toMatchObject({
      x: Math.min(...cols),
      y: Math.min(...rows),
      width: Math.max(...cols) - Math.min(...cols) + 1,
      height: Math.max(...rows) - Math.min(...rows) + 1,
    });
  });

  it('has nothing to fade when the two bakes match', () => {
    const { shared, gained, lost } = splitBakes(open, bake([]));
    expect(gained).toBeNull();
    expect(lost).toBeNull();
    expect(shared).toEqual(open.alpha);
  });
});
