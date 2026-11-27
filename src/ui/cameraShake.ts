/**
 * The intensity to hand Phaser's camera shake so it moves the picture by the
 * same share of the screen at any zoom. Phaser grows a shake by the zoom twice
 * over: once when it works out the offset, and again because that offset is
 * applied inside the already zoomed camera. Dividing by the zoom twice undoes
 * both, so JUICE.shake.intensity keeps meaning "this fraction of the screen".
 *
 * Pure maths, kept apart from the scene so it can be tested in node.
 */
export function shakeIntensityFor(intensity: number, zoom: number): number {
  return intensity / (zoom * zoom);
}
