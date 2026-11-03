/**
 * Where a light lands on the lighting veil. The veil is a render texture laid
 * over the world in canvas pixels, so a world point is moved by the veil's own
 * top-left corner and then stretched by the camera zoom. The brush grows by
 * the same zoom, so a lamp's pool covers the same patch of floor at any zoom.
 *
 * Pure maths, kept apart from LightingRenderer so it can be tested in node.
 *
 * @param worldX world position of the light
 * @param worldY world position of the light
 * @param origin the world point under the veil's top-left corner
 * @param zoom the world camera's zoom
 * @returns the point in veil pixels, and how much to scale the brush radius
 */
export function veilErasePoint(
  worldX: number,
  worldY: number,
  origin: { x: number; y: number },
  zoom: number
): { x: number; y: number; scale: number } {
  return {
    x: (worldX - origin.x) * zoom,
    y: (worldY - origin.y) * zoom,
    scale: zoom,
  };
}
