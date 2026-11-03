import { describe, expect, it } from 'vitest';
import { veilErasePoint, veilOriginFor } from './veilGeometry';

describe('veilErasePoint', () => {
  it('is identity at zoom 1 with the view at the origin', () => {
    expect(veilErasePoint(100, 50, { x: 0, y: 0 }, 1)).toEqual({ x: 100, y: 50, scale: 1 });
  });
  it('maps world to veil pixels under zoom and scroll', () => {
    expect(veilErasePoint(700, 400, { x: 200, y: 100 }, 2.5)).toEqual({ x: 1250, y: 750, scale: 2.5 });
  });
});

describe('veilOriginFor', () => {
  it('puts the margin outside a view at zoom 1', () => {
    expect(veilOriginFor({ x: 480, y: 270 }, 960, 540, 1, 48)).toEqual({ x: -48, y: -48 });
  });
  it('shrinks the half view and the margin into world units under zoom', () => {
    expect(veilOriginFor({ x: 1000, y: 500 }, 1920, 1080, 2, 48)).toEqual({ x: 496, y: 206 });
  });
});
