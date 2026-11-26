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

/**
 * Distance from (ox,oy) along unit (dx,dy) to the nearest rect edge, capped at
 * maxDist. Vision cones and torch beams call this for every ray, every frame,
 * so it tests the four edges one by one and makes no arrays.
 */
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
    // Top, right, bottom then left edge, each in the same direction as before.
    let t = rayToSegment(ox, oy, dx, dy, w.x, w.y, right, w.y);
    if (t < nearest) {
      nearest = t;
    }
    t = rayToSegment(ox, oy, dx, dy, right, w.y, right, bottom);
    if (t < nearest) {
      nearest = t;
    }
    t = rayToSegment(ox, oy, dx, dy, right, bottom, w.x, bottom);
    if (t < nearest) {
      nearest = t;
    }
    t = rayToSegment(ox, oy, dx, dy, w.x, bottom, w.x, w.y);
    if (t < nearest) {
      nearest = t;
    }
  }
  return nearest;
}

/** True if the point is inside the rect or on its edge. */
export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/**
 * How far apart, as a share of the segment, the two slabs may disagree and
 * still count as touching. A segment through a rect's exact corner can come
 * out a hair outside it from float rounding alone, and touching must always
 * count as blocked. Far too small to matter anywhere else.
 */
const TOUCH_TOLERANCE = 1e-9;

/**
 * Slab (Liang-Barsky) test: does the segment touch the rect at all, edges and
 * corners included? Plain numbers only, no arrays, because baking and the
 * detection light run this many thousands of times.
 */
function segmentTouchesRect(ax: number, ay: number, bx: number, by: number, r: Rect): boolean {
  let tMin = 0;
  let tMax = 1;

  // The x slab, between the rect's left and right sides.
  const dx = bx - ax;
  if (dx === 0) {
    if (ax < r.x || ax > r.x + r.width) {
      return false; // parallel to this slab and outside it
    }
  } else {
    const t1 = (r.x - ax) / dx;
    const t2 = (r.x + r.width - ax) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax + TOUCH_TOLERANCE) {
      return false;
    }
  }

  // The y slab, between the rect's top and bottom.
  const dy = by - ay;
  if (dy === 0) {
    if (ay < r.y || ay > r.y + r.height) {
      return false; // parallel to this slab and outside it
    }
  } else {
    const t1 = (r.y - ay) / dy;
    const t2 = (r.y + r.height - ay) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax + TOUCH_TOLERANCE) {
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
