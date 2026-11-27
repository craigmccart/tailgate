import { describe, expect, it } from 'vitest';
import { shakeIntensityFor } from './cameraShake';

describe('shakeIntensityFor', () => {
  it('leaves the intensity alone at zoom 1', () => {
    expect(shakeIntensityFor(0.007, 1)).toBe(0.007);
  });

  it('divides by the zoom twice, so the shake stays the same share of the screen', () => {
    expect(shakeIntensityFor(0.008, 2)).toBe(0.002);
    // Phaser's on-screen offset is intensity * width * zoom * zoom.
    const zoom = 2.6666666666666665;
    const width = 2560;
    expect(shakeIntensityFor(0.007, zoom) * width * zoom * zoom).toBeCloseTo(0.007 * width);
  });
});
