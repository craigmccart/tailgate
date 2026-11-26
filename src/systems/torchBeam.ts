/**
 * The shape of a guard's torch beam on the lighting veil. Pure maths, no
 * Phaser import, so Vitest can run it in node.
 *
 * The beam is a fan of thin triangles, one between each pair of neighbouring
 * rays, all meeting at the guard. Each ray stops at the first wall or closed
 * door it meets, using the same clipping the vision cone is drawn with, so the
 * beam and the cone always agree. Every corner carries its own brightness:
 *  - along the beam, light fades to nothing at full range, so a wall close in
 *    front of a guard catches a bright pool and open floor fades out softly,
 *  - inside the cone the beam is at full torch strength right to its edges,
 *    because that is the light guards count. A few extra rays just outside
 *    each edge fade it to nothing, so the edge is soft. The screen can then
 *    only show a little more light than guards count, never less.
 */

import { rayDistanceToRects, type Rect } from './occlusion';

/** One triangle of the beam: the guard (a) and two neighbouring rim points (b, c), each with its own alpha. */
export interface BeamTriangle {
  ax: number;
  ay: number;
  aAlpha: number;
  bx: number;
  by: number;
  bAlpha: number;
  cx: number;
  cy: number;
  cAlpha: number;
}

/** Everything the beam needs: where the guard stands and looks, the cone's shape, and what blocks light. */
export interface TorchBeamInput {
  /** The guard's world position. */
  x: number;
  y: number;
  /** The way the guard faces, in radians. */
  facing: number;
  /** Half the cone's field of view, in radians. */
  halfFovRad: number;
  /** How far the beam reaches in the open, in world pixels. */
  rangePx: number;
  /** Rays cast across the cone, the same as the vision cone's. Feather rays are added outside it. */
  rays: number;
  /** Peak brightness, 0..1, at the guard. */
  intensity: number;
  /** How far past each edge of the cone the soft fade reaches, in radians. */
  edgeFeatherRad: number;
  /** Walls and closed doors that stop the beam. */
  occluders: readonly Rect[];
}

/** One clipped ray end: where it stopped and how bright the light is there. */
interface RimPoint {
  x: number;
  y: number;
  alpha: number;
  /** 1 anywhere inside the cone, falling to 0 a feather's width outside it. */
  feather: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Builds the beam's triangles, ready to be drawn with per-corner alpha. Inside
 * the cone there are rays - 1 of them; the feather adds the same number of
 * extra rays outside each edge, so there are rays + 2 * extra - 1 in all.
 */
export function torchBeamTriangles(input: TorchBeamInput): BeamTriangle[] {
  const { x, y, facing, halfFovRad, rangePx, rays, intensity, edgeFeatherRad, occluders } = input;
  if (rays < 2) {
    return [];
  }

  // Feather rays keep the cone's own spacing, enough of them to reach a
  // feather's width past each edge. A feather of zero means hard edges.
  const rayGap = (halfFovRad * 2) / (rays - 1);
  const extra = edgeFeatherRad > 0 && rayGap > 0 ? Math.ceil(edgeFeatherRad / rayGap) : 0;

  const rim: RimPoint[] = [];
  for (let i = -extra; i < rays + extra; i++) {
    // Rays 0 to rays - 1 are the same spread the vision cone draws with.
    const offset = -halfFovRad + (halfFovRad * 2 * i) / (rays - 1);
    const a = facing + offset;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const dist = rayDistanceToRects(x, y, dx, dy, occluders, rangePx);
    // How many ray steps this ray sits past the nearest edge of the cone, 0 inside it.
    const stepsOutside = i < 0 ? -i : Math.max(0, i - (rays - 1));
    const overshoot = stepsOutside * rayGap;
    const feather = stepsOutside === 0 ? 1 : clamp(1 - overshoot / edgeFeatherRad, 0, 1);
    rim.push({
      x: x + dx * dist,
      y: y + dy * dist,
      alpha: intensity * (1 - dist / rangePx) * feather,
      feather,
    });
  }

  const triangles: BeamTriangle[] = [];
  for (let i = 0; i + 1 < rim.length; i++) {
    const b = rim[i];
    const c = rim[i + 1];
    triangles.push({
      ax: x,
      ay: y,
      // At the guard the light is full strength, softened only outside the cone.
      aAlpha: intensity * Math.min(b.feather, c.feather),
      bx: b.x,
      by: b.y,
      bAlpha: b.alpha,
      cx: c.x,
      cy: c.y,
      cAlpha: c.alpha,
    });
  }
  return triangles;
}
