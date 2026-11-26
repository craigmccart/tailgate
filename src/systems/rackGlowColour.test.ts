import { describe, expect, it } from 'vitest';
import dataCentreMapRaw from '../../public/maps/data-centre.json?raw';
import { parseMapData } from '../world/mapData';
import { rackGlowColour } from './rackGlowColour';

describe('rackGlowColour', () => {
  it('keeps the colours real data-centre racks have today', () => {
    // Rack light centres from public/maps/data-centre.json. If the hash
    // changes, these racks change colour on screen, so this should fail.
    expect(rackGlowColour(500, 340)).toBe('amber'); // rackA500340
    expect(rackGlowColour(500, 600)).toBe('white'); // rackA500600
    expect(rackGlowColour(900, 340)).toBe('white'); // rackA900340
  });

  it('mixes amber and white across the data-centre rack lights', () => {
    const { lights } = parseMapData(dataCentreMapRaw);
    const racks = lights.filter((l) => l.kind === 'rack');
    expect(racks.length).toBeGreaterThan(1);
    const colours = new Set(
      racks.map((l) => rackGlowColour(l.x + l.width / 2, l.y + l.height / 2)),
    );
    expect(colours.has('amber')).toBe(true);
    expect(colours.has('white')).toBe(true);
  });
});
