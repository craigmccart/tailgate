import Phaser from 'phaser';
import { WEATHER } from '../config/weather';
import type { ZoneRect } from './BuildingMap';
import { wetSheenEllipsesFor, type SheenLight } from './weatherGeometry';

/**
 * Draws the wet shine on the outdoor tarmac once, at level load: for every
 * exterior zone a lamp's light reaches, one Graphics of faint ovals cut off at
 * the zone's edge, so the shine never spills onto the loading dock floor or
 * through a wall. It sits below the lighting veil, so it only shows where the
 * light really lands. It never moves, so it stays when SCREEN EFFECTS is off.
 */
export function drawWetSheen(
  scene: Phaser.Scene,
  zones: readonly ZoneRect[],
  sources: readonly SheenLight[]
): void {
  const cfg = WEATHER.wetSheen;
  for (const zone of zones) {
    const ellipses = wetSheenEllipsesFor([zone], sources, cfg);
    if (ellipses.length === 0) {
      continue; // indoors, or no lamp reaches this patch of ground
    }
    const sheen = scene.add.graphics().setDepth(cfg.depth);
    sheen.fillStyle(cfg.tint, cfg.alpha);
    for (const e of ellipses) {
      sheen.fillEllipse(e.x, e.y, e.width, e.height);
    }
    // The mask shape is never drawn itself (it is kept off the display list);
    // only its outline matters, so the fill colour is irrelevant.
    const { clip } = ellipses[0];
    const maskShape = scene.make.graphics({}, false);
    maskShape.fillStyle(cfg.tint);
    maskShape.fillRect(clip.x, clip.y, clip.width, clip.height);
    sheen.setMask(maskShape.createGeometryMask());
    // Off the display list means the scene will not tidy it up on a restart.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => maskShape.destroy());
  }
}
