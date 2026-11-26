import { describe, expect, it } from "vitest";
import dataCentreMapRaw from "../../public/maps/data-centre.json?raw";
import { parseMapData } from "../world/mapData";
import { rackGlowColour } from "./rackGlowColour";

describe("rackGlowColour", () => {
  it("gives the same colour for the same position every time", () => {
    for (const [x, y] of [
      [100, 200],
      [333.4, 71.9],
      [0, 0],
    ] as const) {
      expect(rackGlowColour(x, y)).toBe(rackGlowColour(x, y));
    }
  });

  it("mixes amber and white across the data-centre rack lights", () => {
    const { lights } = parseMapData(dataCentreMapRaw);
    const racks = lights.filter((l) => l.kind === "rack");
    expect(racks.length).toBeGreaterThan(1);
    const colours = new Set(
      racks.map((l) => rackGlowColour(l.x + l.width / 2, l.y + l.height / 2)),
    );
    expect(colours.has("amber")).toBe(true);
    expect(colours.has("white")).toBe(true);
  });
});
