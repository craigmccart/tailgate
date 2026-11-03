import { describe, expect, it } from 'vitest';
import { WEATHER } from '../config/weather';
import { rainEmitterFor, wetSheenEllipsesFor } from './weatherGeometry';

const carPark = { name: 'carPark', x: 0, y: 800, width: 1000, height: 500, restricted: false, exterior: true };
const office = { name: 'office', x: 0, y: 0, width: 1000, height: 500, restricted: false, exterior: false };

/** A light shower, so these tests do not move when Craig tunes the real density. */
const sparse = { ...WEATHER.rain, dropsPerSecondPer10kPx2: 0.6 };

describe('rainEmitterFor', () => {
  it('covers the zone and scales frequency with area', () => {
    const e = rainEmitterFor(carPark, sparse);
    expect(e).toMatchObject({ x: 0, y: 800, width: 1000, height: 500 });
    expect(e.frequencyMs).toBeCloseTo(1000 / (50 * 0.6), 3);
    expect(e.quantity).toBe(1);
  });
  it('batches drops instead of emitting faster than every 8 ms', () => {
    const huge = { ...carPark, width: 10000, height: 10000 };
    const e = rainEmitterFor(huge, sparse);
    expect(e.frequencyMs).toBe(8);
    expect(e.quantity).toBe(48);
  });
  it('the shipped density on a real car park', () => {
    const realCarPark = { ...carPark, width: 2400, height: 352 };
    const e = rainEmitterFor(realCarPark, WEATHER.rain);
    expect(e.frequencyMs).toBe(8);
    expect(e.quantity).toBe(2);
  });
});

describe('wetSheenEllipsesFor', () => {
  it('a light inside the car park', () => {
    const sources = [
      { x: 500, y: 1000, radiusPx: 100 },
      { x: 450, y: 150, radiusPx: 50 },
    ];
    expect(wetSheenEllipsesFor([carPark, office], sources, WEATHER.wetSheen)).toEqual([
      { x: 500, y: 1035, width: 180, height: 320, clip: { x: 0, y: 800, width: 1000, height: 500 } },
    ]);
  });
  it('a light outside whose reach crosses in', () => {
    const sources = [{ x: 500, y: 750, radiusPx: 100 }];
    expect(wetSheenEllipsesFor([carPark, office], sources, WEATHER.wetSheen)).toEqual([
      { x: 500, y: 785, width: 180, height: 320, clip: { x: 0, y: 800, width: 1000, height: 500 } },
    ]);
  });
  it('a light whose reach stops short', () => {
    const sources = [{ x: 500, y: 650, radiusPx: 100 }];
    expect(wetSheenEllipsesFor([carPark, office], sources, WEATHER.wetSheen)).toEqual([]);
  });
  it('no exterior zone', () => {
    const sources = [{ x: 450, y: 150, radiusPx: 50 }];
    expect(wetSheenEllipsesFor([office], sources, WEATHER.wetSheen)).toEqual([]);
  });
});
