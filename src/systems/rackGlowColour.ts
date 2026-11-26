/**
 * Which colour a server rack LED glows. It depends only on the light's
 * position, so the same rack is always the same colour, even after a restart.
 * Never red: red is reserved for detection.
 */
export type RackGlowColour = 'amber' | 'white';

export function rackGlowColour(x: number, y: number): RackGlowColour {
  // A small integer hash of the rounded position, then even is amber, odd is white.
  let h = (Math.round(x) * 73856093) ^ (Math.round(y) * 19349663);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h & 1) === 0 ? 'amber' : 'white';
}
