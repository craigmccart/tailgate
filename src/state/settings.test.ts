import { describe, expect, it } from 'vitest';
import { normaliseRenderScale } from './settings';

/**
 * Render scale is the one setting that comes from storage and drives the size of
 * the canvas, so a bad stored value (a typo, an old build, hand-edited
 * localStorage) must never reach the viewport maths. Anything that is not a
 * number falls back to full sharpness; any number snaps to a quarter step in
 * the 50 to 100 percent range the settings row offers.
 */
describe('normaliseRenderScale', () => {
  it('snaps to the nearest quarter step', () => {
    expect(normaliseRenderScale(0.6)).toBe(0.5);
    expect(normaliseRenderScale(0.9)).toBe(1);
  });

  it('keeps a value that is already a quarter step', () => {
    expect(normaliseRenderScale(0.75)).toBe(0.75);
  });

  it('clamps to the 50 to 100 percent range', () => {
    expect(normaliseRenderScale(2)).toBe(1);
    expect(normaliseRenderScale(0.1)).toBe(0.5);
  });

  it('falls back to full sharpness for anything that is not a finite number', () => {
    expect(normaliseRenderScale(Number.NaN)).toBe(1);
    expect(normaliseRenderScale(undefined)).toBe(1);
    expect(normaliseRenderScale(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('does not accept numbers stored as strings', () => {
    expect(normaliseRenderScale('0.5')).toBe(1);
  });
});
