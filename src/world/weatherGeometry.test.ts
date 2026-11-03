import { describe, expect, it } from 'vitest';
import { WEATHER } from '../config/weather';
import { rainEmitterFor, wetSheenEllipsesFor } from './weatherGeometry';

const carPark = { name: 'carPark', x: 0, y: 800, width: 1000, height: 500, restricted: false, exterior: true };
const office = { name: 'office', x: 0, y: 0, width: 1000, height: 500, restricted: false, exterior: false };

/**
 * The rain tests pass their own densities, so they do not move when Craig
 * tunes the rain in weather.ts. The sheen tests use the shipped sheen shape
 * (widthFactor 0.9, heightFactor 1.6, offsetYFactor 0.35): retuning those
 * three means updating the expected ovals below.
 */
const sparse = { ...WEATHER.rain, dropsPerSecondPer10kPx2: 0.6 };
const heavy = { ...WEATHER.rain, dropsPerSecondPer10kPx2: 3 };

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
    expect(e.frequencyMs).toBeCloseTo(8, 6);
    expect(e.quantity).toBe(48);
  });
  it('the shipped density on a real car park', () => {
    const realCarPark = { ...carPark, width: 2400, height: 352 };
    const e = rainEmitterFor(realCarPark, heavy);
    expect(e.quantity).toBe(3);
    expect(e.frequencyMs).toBeCloseTo((1000 / (((2400 * 352) / 10000) * 3)) * 3, 6);
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
  it('a light whose reach ends exactly at the edge', () => {
    const sources = [{ x: 500, y: 700, radiusPx: 100 }];
    expect(wetSheenEllipsesFor([carPark, office], sources, WEATHER.wetSheen)).toEqual([]);
  });
  it('no exterior zone', () => {
    const sources = [{ x: 450, y: 150, radiusPx: 50 }];
    expect(wetSheenEllipsesFor([office], sources, WEATHER.wetSheen)).toEqual([]);
  });
});
