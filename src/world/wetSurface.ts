import Phaser from 'phaser';
import { WEATHER } from '../config/weather';
import type { ZoneRect } from './BuildingMap';
import { wetSheenEllipsesFor, type SheenLight } from './weatherGeometry';

/** Texture key for the soft oval of shine, generated once at runtime. */
const SHEEN_KEY = 'wetSheenGlow';
/** Size of that texture, px. It is stretched to every oval, so it can be small. */
const SHEEN_SIZE = 128;

/**
 * Bakes the wet shine on the outdoor tarmac once, at level load: for every
 * exterior zone a lamp's light reaches, one picture the size of the zone with a
 * soft oval of shine under each lamp, brightest in the middle and fading to
 * nothing at its rim. The picture ends at the zone's edge, so the shine never
 * spills onto the loading dock floor or through a wall. It sits below the
 * lighting veil, so it only shows where the light really lands. It never
 * moves, so it stays when SCREEN EFFECTS is off.
 */
export function drawWetSheen(
  scene: Phaser.Scene,
  zones: readonly ZoneRect[],
  sources: readonly SheenLight[]
): void {
  const cfg = WEATHER.wetSheen;
  ensureSheenTexture(scene);
  if (!scene.textures.exists(SHEEN_KEY)) {
    return; // no canvas to draw the shine on; the tarmac simply stays dry
  }
  // One brush, kept off the display list, stretched to each oval in turn and
  // destroyed once every zone is baked.
  const brush = scene.make
    .image({ x: 0, y: 0, key: SHEEN_KEY, add: false })
    .setOrigin(0.5)
    .setTint(cfg.tint)
    .setAlpha(cfg.alpha);
  for (const zone of zones) {
    const ellipses = wetSheenEllipsesFor([zone], sources, cfg);
    if (ellipses.length === 0) {
      continue; // indoors, or no lamp reaches this patch of ground
    }
    const sheen = scene.add
      .renderTexture(zone.x, zone.y, zone.width, zone.height)
      .setOrigin(0, 0)
      .setDepth(cfg.depth);
    // Pixel textures use nearest-neighbour filtering globally. The baked shine
    // is a smooth gradient, so it is filtered smoothly when the camera zooms in.
    sheen.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (const e of ellipses) {
      brush.setDisplaySize(e.width, e.height);
      sheen.draw(brush, e.x - zone.x, e.y - zone.y);
    }
  }
  brush.destroy();
}

/** Builds the soft round shine texture once (guarded, so a restart reuses it). */
function ensureSheenTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(SHEEN_KEY)) {
    return;
  }
  const tex = scene.textures.createCanvas(SHEEN_KEY, SHEEN_SIZE, SHEEN_SIZE);
  if (!tex) {
    return;
  }
  const ctx = tex.getContext();
  const r = SHEEN_SIZE / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  // White in the middle, easing off and gone by the rim, so no oval has an edge.
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(0.75, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SHEEN_SIZE, SHEEN_SIZE);
  tex.refresh();
  // Pixel textures use nearest-neighbour filtering globally. This generated
  // gradient is an exception, like the lighting mask: its falloff must stay
  // smooth when it is stretched into a long oval.
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}
