import { describe, expect, it } from 'vitest';
import { canvasSizeFor, uiZoomFor } from './viewport';

describe('canvasSizeFor', () => {
  it('fills a 1440p monitor at 175 percent scaling', () => {
    expect(canvasSizeFor({ innerWidth: 1463, innerHeight: 823, devicePixelRatio: 1.75, renderScale: 1 }))
      .toEqual({ width: 2560, height: 1440 });
  });
  it('is exactly 1080p on a 1080p window', () => {
    expect(canvasSizeFor({ innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, renderScale: 1 }))
      .toEqual({ width: 1920, height: 1080 });
  });
  it('caps a 4K display at 1440p', () => {
    expect(canvasSizeFor({ innerWidth: 3840, innerHeight: 2160, devicePixelRatio: 2, renderScale: 1 }))
      .toEqual({ width: 2560, height: 1440 });
  });
  it('halves with render scale 0.5', () => {
    expect(canvasSizeFor({ innerWidth: 1463, innerHeight: 823, devicePixelRatio: 1.75, renderScale: 0.5 }))
      .toEqual({ width: 1280, height: 720 });
  });
  it('never drops below the 960 by 540 layout unit', () => {
    expect(canvasSizeFor({ innerWidth: 800, innerHeight: 400, devicePixelRatio: 1, renderScale: 1 }))
      .toEqual({ width: 960, height: 540 });
  });
  it('letterboxes a tall window by width', () => {
    expect(canvasSizeFor({ innerWidth: 1000, innerHeight: 2000, devicePixelRatio: 2, renderScale: 1 }))
      .toEqual({ width: 2000, height: 1126 });
  });
});

describe('uiZoomFor', () => {
  it('maps the canvas width onto the 960 unit box', () => {
    expect(uiZoomFor(2560)).toBeCloseTo(2.6667, 3);
    expect(uiZoomFor(960)).toBe(1);
  });
});
