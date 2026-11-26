import type { Rect } from '../systems/occlusion';
import type { LightRect, ZoneRect } from './BuildingMap';

/**
 * Pure reader for the Tiled map JSON, with no Phaser in it, so tests and tools
 * can load a level's zones, lights, walls and doors. Callers pass the raw
 * string (tests import the map files with ?raw).
 */

interface TiledProperty {
  name: string;
  value: unknown;
}

interface TiledObject {
  name?: string;
  type?: string;
  class?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  properties?: TiledProperty[];
}

interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: { name: string; objects?: TiledObject[] }[];
}

export interface MapData {
  zones: ZoneRect[];
  lights: LightRect[];
  walls: Rect[];
  doors: Rect[];
  widthPx: number;
  heightPx: number;
}

/** Parses Tiled JSON the same way src/world/BuildingMap.ts does. */
export function parseMapData(raw: string): MapData {
  const map = JSON.parse(raw) as TiledMap;
  const objects = (layer: string): TiledObject[] =>
    map.layers.find((l) => l.name === layer)?.objects ?? [];
  const flag = (o: TiledObject, name: string): boolean =>
    o.properties?.find((p) => p.name === name)?.value === true;
  const rect = (o: TiledObject): Rect => ({
    x: o.x ?? 0,
    y: o.y ?? 0,
    width: o.width ?? 0,
    height: o.height ?? 0,
  });
  return {
    zones: objects('zones').map((o) => ({
      name: o.name ?? '',
      ...rect(o),
      restricted: flag(o, 'restricted'),
      exterior: flag(o, 'exterior'),
    })),
    lights: objects('lights').map((o) => ({
      id: o.name ?? '',
      kind: o.type ?? o.class ?? 'pool',
      ...rect(o),
    })),
    walls: objects('walls').map(rect),
    doors: objects('doors').map(rect),
    widthPx: map.width * map.tilewidth,
    heightPx: map.height * map.tileheight,
  };
}
