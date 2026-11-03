import { describe, expect, it } from 'vitest';
import { pointerIsLive, pointerLookAhead } from './cameraLookAhead';

const centre = { x: 480, y: 270 };

describe('pointerLookAhead', () => {
  it('is zero when screen effects are off', () => {
    expect(pointerLookAhead({ pointerUi: { x: 900, y: 50 }, stick: null, enabled: false, maxPx: 56 }))
      .toEqual({ x: 0, y: 0 });
  });
  it('is zero with the pointer at the centre', () => {
    expect(pointerLookAhead({ pointerUi: centre, stick: null, enabled: true, maxPx: 56 }))
      .toEqual({ x: 0, y: 0 });
  });
  it('scales a pointer at the top edge to the full lookahead', () => {
    const r = pointerLookAhead({ pointerUi: { x: 480, y: 0 }, stick: null, enabled: true, maxPx: 56 });
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(-56);
  });
  it('clamps a far corner pointer to the maximum length', () => {
    const r = pointerLookAhead({ pointerUi: { x: 960, y: 540 }, stick: null, enabled: true, maxPx: 56 });
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(56);
  });
  it('lets the right stick win over the pointer', () => {
    const r = pointerLookAhead({ pointerUi: { x: 0, y: 0 }, stick: { x: 1, y: 0 }, enabled: true, maxPx: 56 });
    expect(r).toEqual({ x: 56, y: 0 });
  });
  it('ignores a stick inside the deadzone', () => {
    const r = pointerLookAhead({ pointerUi: null, stick: { x: 0.1, y: 0 }, enabled: true, maxPx: 56 });
    expect(r).toEqual({ x: 0, y: 0 });
  });
  it('lets a live pointer lean the view when the stick is only nudged', () => {
    const r = pointerLookAhead({ pointerUi: { x: 480, y: 0 }, stick: { x: 0.1, y: 0.1 }, enabled: true, maxPx: 56 });
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(-56);
  });
  it('leans the full distance along a diagonal stick', () => {
    const r = pointerLookAhead({ pointerUi: null, stick: { x: 0.3, y: 0.4 }, enabled: true, maxPx: 56 });
    expect(r.x).toBeCloseTo(33.6);
    expect(r.y).toBeCloseTo(44.8);
  });
  it('is zero for a pushed stick when screen effects are off', () => {
    expect(pointerLookAhead({ pointerUi: null, stick: { x: 1, y: 0 }, enabled: false, maxPx: 56 }))
      .toEqual({ x: 0, y: 0 });
  });
  it('is zero when the maximum lean is 0', () => {
    expect(pointerLookAhead({ pointerUi: { x: 900, y: 50 }, stick: { x: 1, y: 0 }, enabled: true, maxPx: 0 }))
      .toEqual({ x: 0, y: 0 });
  });
});

describe('pointerIsLive', () => {
  it('is false when the mouse has never moved', () => {
    expect(pointerIsLive({ overCanvas: true, pointerMoveTimeMs: 0, lastPadInputTimeMs: 0 })).toBe(false);
  });
  it('is false when the mouse is off the canvas', () => {
    expect(pointerIsLive({ overCanvas: false, pointerMoveTimeMs: 5000, lastPadInputTimeMs: 0 })).toBe(false);
  });
  it('is true when the mouse moved after the last pad input', () => {
    expect(pointerIsLive({ overCanvas: true, pointerMoveTimeMs: 5000, lastPadInputTimeMs: 4000 })).toBe(true);
  });
  it('is false when the pad was used after the last mouse move', () => {
    expect(pointerIsLive({ overCanvas: true, pointerMoveTimeMs: 4000, lastPadInputTimeMs: 5000 })).toBe(false);
  });
});
