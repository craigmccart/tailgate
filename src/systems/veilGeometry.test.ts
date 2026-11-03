import { describe, expect, it } from 'vitest';
import { veilErasePoint } from './veilGeometry';

describe('veilErasePoint', () => {
  it('is identity at zoom 1 with the view at the origin', () => {
    expect(veilErasePoint(100, 50, { x: 0, y: 0 }, 1)).toEqual({ x: 100, y: 50, scale: 1 });
  });
  it('maps world to veil pixels under zoom and scroll', () => {
    expect(veilErasePoint(700, 400, { x: 200, y: 100 }, 2.5)).toEqual({ x: 1250, y: 750, scale: 2.5 });
  });
});
