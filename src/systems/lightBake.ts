import { segmentBlocked, type Rect } from './occlusion';

/**
 * Pure maths for baking a static light into its own small picture, once, with
 * the shadows of the walls and closed doors around it already drawn in. The
 * lighting veil then erases that picture each frame instead of a plain round
 * brush, so the light the player sees stops at the same walls as the light the
 * guards use. No Phaser in here, so Vitest can run it in node.
 */

/**
 * The shape of the soft round light brush: full at the centre, still at this
 * level at the knee, then down to nothing at the edge. LightingRenderer builds
 * its brush texture from the same two numbers, so a baked light and a brushed
 * light fade off in exactly the same way.
 */
export const FALLOFF_KNEE_T = 0.55;
export const FALLOFF_KNEE_LEVEL = 0.65;

/** A baked light: a square of alpha values laid over the world. */
export interface BakedLight {
  /** World position of the square's top-left corner. */
  originX: number;
  originY: number;
  /** Width and height of the square, in texels. */
  sizeTexels: number;
  /** One alpha per texel, row by row, 0 (no light) to 255 (full light). */
  alpha: Uint8ClampedArray;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * How bright the brush is at a distance from the light, given as that
 * distance over the light's reach: 1 at the centre, the knee level at the
 * knee, 0 at the edge and beyond, straight lines in between.
 */
export function lightFalloff(t: number): number {
  if (t <= 0) {
    return 1;
  }
  if (t >= 1) {
    return 0;
  }
  if (t <= FALLOFF_KNEE_T) {
    return 1 - ((1 - FALLOFF_KNEE_LEVEL) * t) / FALLOFF_KNEE_T;
  }
  return (FALLOFF_KNEE_LEVEL * (1 - t)) / (1 - FALLOFF_KNEE_T);
}

/**
 * Bakes one light. The square is just wide enough to hold the light's reach,
 * centred on the light. Each texel takes the brush's brightness at its centre,
 * or none at all when a wall or closed door sits between it and the light.
 * The light's own intensity is left out: the renderer applies it each frame,
 * along with the slow breathe.
 */
export function bakeLight(input: {
  x: number;
  y: number;
  radiusPx: number;
  occluders: readonly Rect[];
  texelPx: number;
}): BakedLight {
  const { x, y, radiusPx, occluders, texelPx } = input;
  const sizeTexels = Math.ceil((2 * radiusPx) / texelPx);
  const half = (sizeTexels * texelPx) / 2;
  const originX = x - half;
  const originY = y - half;
  const alpha = new Uint8ClampedArray(sizeTexels * sizeTexels);

  for (let row = 0; row < sizeTexels; row++) {
    const cy = originY + (row + 0.5) * texelPx;
    // Only rects level with the stretch between the light and this row, on
    // the same side as the texel, can cast a shadow on it. Skipping the rest
    // up front keeps a big flood light quick to bake; the answer is the same.
    const top = Math.min(y, cy);
    const bottom = Math.max(y, cy);
    const rowRects = occluders.filter((r) => r.y <= bottom && r.y + r.height >= top);
    const leftRects = rowRects.filter((r) => r.x <= x);
    const rightRects = rowRects.filter((r) => r.x + r.width >= x);
    for (let col = 0; col < sizeTexels; col++) {
      const cx = originX + (col + 0.5) * texelPx;
      const level = lightFalloff(Math.hypot(cx - x, cy - y) / radiusPx);
      // Texels past the reach stay dark without paying for the wall test.
      if (level <= 0 || segmentBlocked(x, y, cx, cy, cx < x ? leftRects : rightRects)) {
        continue;
      }
      alpha[row * sizeTexels + col] = Math.round(255 * level);
    }
  }

  return { originX, originY, sizeTexels, alpha };
}

/**
 * How far through a crossfade we are, 0 at the start to 1 at the end. A fade
 * of no length is finished straight away.
 */
export function crossfadeAlpha(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) {
    return 1;
  }
  return clamp01(elapsedMs / durationMs);
}

/** A rectangle of texels cut out of a baked square, with its own alpha row by row. */
export interface TexelCrop {
  /** The crop's top-left texel inside the full square. */
  x: number;
  y: number;
  /** Size of the crop, in texels. */
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
}

/** Two bakes of one light, split into the part they share and the part that changes. */
export interface BakeSplit {
  /** Texel-wise minimum of the two: light both pictures have. A full square. */
  shared: Uint8ClampedArray;
  /** Light only the new picture has, cropped tight, or null when there is none. */
  gained: TexelCrop | null;
  /** Light only the old picture has, cropped tight, or null when there is none. */
  lost: TexelCrop | null;
}

/**
 * Splits an old and a new bake of the same light for a crossfade. A wall or
 * door either blocks a texel or it does not, so the two bakes only differ
 * where one of them is 0: the shared part, the gained part and the lost part
 * never overlap. The renderer shows the shared part in full and fades only
 * the gained part in and the lost part out, so light that both pictures have
 * never dims while a door moves.
 *
 * When nothing is lost the shared part is the old bake, and when nothing is
 * gained it is the new one, so a single door opening or shutting can reuse a
 * picture that already exists.
 */
export function splitBakes(old: BakedLight, next: BakedLight): BakeSplit {
  if (
    old.sizeTexels !== next.sizeTexels ||
    old.originX !== next.originX ||
    old.originY !== next.originY
  ) {
    throw new Error('splitBakes needs two bakes of the same light');
  }
  const size = old.sizeTexels;
  const shared = new Uint8ClampedArray(size * size);
  const gained = new Uint8ClampedArray(size * size);
  const lost = new Uint8ClampedArray(size * size);
  for (let i = 0; i < shared.length; i++) {
    const before = old.alpha[i];
    const after = next.alpha[i];
    shared[i] = Math.min(before, after);
    if (before === 0) {
      gained[i] = after;
    }
    if (after === 0) {
      lost[i] = before;
    }
  }
  return { shared, gained: cropToLit(gained, size), lost: cropToLit(lost, size) };
}

/** Cuts a square of alpha down to the smallest box holding every lit texel, or null for none. */
function cropToLit(alpha: Uint8ClampedArray, size: number): TexelCrop | null {
  let minCol = size;
  let minRow = size;
  let maxCol = -1;
  let maxRow = -1;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (alpha[row * size + col] > 0) {
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
      }
    }
  }
  if (maxCol < 0) {
    return null;
  }
  const width = maxCol - minCol + 1;
  const height = maxRow - minRow + 1;
  const out = new Uint8ClampedArray(width * height);
  for (let row = 0; row < height; row++) {
    const start = (minRow + row) * size + minCol;
    out.set(alpha.subarray(start, start + width), row * width);
  }
  return { x: minCol, y: minRow, width, height, alpha: out };
}

/**
 * True when the rect overlaps the light's reach box, the square from its
 * centre out to its reach on every side. Touching the box edge counts. Only
 * these rects can cast a shadow inside the light.
 */
export function overlapsReach(
  rect: Rect,
  light: { x: number; y: number; radiusPx: number }
): boolean {
  return (
    rect.x <= light.x + light.radiusPx &&
    rect.x + rect.width >= light.x - light.radiusPx &&
    rect.y <= light.y + light.radiusPx &&
    rect.y + rect.height >= light.y - light.radiusPx
  );
}

const sameRect = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * The rects in one set but not the other: doors that have just closed, then
 * doors that have just opened. Rects are matched by position and size, not by
 * object, because the scene builds a fresh list of closed doors every frame.
 */
export function changedRects(before: readonly Rect[], after: readonly Rect[]): Rect[] {
  const changed: Rect[] = [];
  for (const r of after) {
    if (!before.some((b) => sameRect(b, r))) {
      changed.push(r);
    }
  }
  for (const r of before) {
    if (!after.some((a) => sameRect(a, r))) {
      changed.push(r);
    }
  }
  return changed;
}
