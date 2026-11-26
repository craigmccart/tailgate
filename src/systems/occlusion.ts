/**
 * Shared wall maths for vision cones and lighting. Pure functions only: no
 * Phaser import, so Vitest can run them in node. Phaser.Geom.Rectangle fits the
 * Rect shape, so scene code can pass its rectangles straight in.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Nearest distance a ray travels from (ox,oy) along unit (dx,dy) before a segment, or Infinity. */
export function rayToSegment(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const sx = bx - ax;
  const sy = by - ay;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) {
    return Infinity; // parallel
  }
  const t = ((ax - ox) * sy - (ay - oy) * sx) / denom; // distance along the ray
  const u = ((ax - ox) * dy - (ay - oy) * dx) / denom; // position along the segment
  if (t >= 0 && u >= 0 && u <= 1) {
    return t;
  }
  return Infinity;
}

/** Distance from (ox,oy) along unit (dx,dy) to the nearest rect edge, capped at maxDist. */
export function rayDistanceToRects(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  rects: readonly Rect[],
  maxDist: number
): number {
  let nearest = maxDist;
  for (const w of rects) {
    const right = w.x + w.width;
    const bottom = w.y + w.height;
    const edges: [number, number, number, number][] = [
      [w.x, w.y, right, w.y],
      [right, w.y, right, bottom],
      [right, bottom, w.x, bottom],
      [w.x, bottom, w.x, w.y],
    ];
    for (const [ax, ay, bx, by] of edges) {
      const t = rayToSegment(ox, oy, dx, dy, ax, ay, bx, by);
      if (t < nearest) {
        nearest = t;
      }
    }
  }
  return nearest;
}

/** True if the point is inside the rect or on its edge. */
export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** Slab (Liang-Barsky) test: does the segment touch the rect at all, edges and corners included? */
function segmentTouchesRect(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  let tMin = 0;
  let tMax = 1;
  const axes: [number, number, number, number][] = [
    [ax, bx - ax, r.x, r.x + r.width],
    [ay, by - ay, r.y, r.y + r.height],
  ];
  for (const [start, delta, lo, hi] of axes) {
    if (delta === 0) {
      if (start < lo || start > hi) {
        return false; // parallel to this slab and outside it
      }
      continue;
    }
    let t1 = (lo - start) / delta;
    let t2 = (hi - start) / delta;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) {
      return false;
    }
  }
  return true;
}

/**
 * True when the segment touches any rect that contains neither end. Touching an
 * edge or corner counts as blocked. A rect holding either end is ignored, so a
 * light inside a rack row, or landing on a wall face, is not blocked by it.
 */
export function segmentBlocked(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rects: readonly Rect[]
): boolean {
  for (const r of rects) {
    if (rectContains(r, ax, ay) || rectContains(r, bx, by)) {
      continue;
    }
    if (segmentTouchesRect(ax, ay, bx, by, r)) {
      return true;
    }
  }
  return false;
}
