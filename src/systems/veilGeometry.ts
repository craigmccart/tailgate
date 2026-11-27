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

/**
 * The world point under the veil's top-left corner: half the camera's view
 * plus the margin, measured back from the camera's centre and turned from
 * canvas pixels into world units by the zoom. Working from the centre rather
 * than the camera's world view matters straight after a resize, when the
 * centre has just been set but the world view is not refreshed until the
 * camera next draws.
 *
 * @param centre the world point at the middle of the camera's view
 * @param viewWidthPx the camera's width in canvas pixels
 * @param viewHeightPx the camera's height in canvas pixels
 * @param zoom the world camera's zoom
 * @param marginPx the spare veil past each screen edge, in canvas pixels
 */
export function veilOriginFor(
  centre: { x: number; y: number },
  viewWidthPx: number,
  viewHeightPx: number,
  zoom: number,
  marginPx: number
): { x: number; y: number } {
  return {
    x: centre.x - (viewWidthPx / 2 + marginPx) / zoom,
    y: centre.y - (viewHeightPx / 2 + marginPx) / zoom,
  };
}
