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
 *  - across the beam, the last few degrees at each side fade to nothing, so
 *    the edges are soft rather than a hard line.
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
  /** Rays cast across the fan. The beam has one fewer triangle than this. */
  rays: number;
  /** Peak brightness, 0..1, at the guard on the beam's centre line. */
  intensity: number;
  /** How wide the soft fade is at each side of the beam, in radians. */
  edgeFeatherRad: number;
  /** Walls and closed doors that stop the beam. */
  occluders: readonly Rect[];
}

/** One clipped ray end: where it stopped and how bright the light is there. */
interface RimPoint {
  x: number;
  y: number;
  alpha: number;
  /** 0 on the cone's edge, rising to 1 once a feather's width inside it. */
  feather: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Builds the beam's triangles, rays - 1 of them, ready to be drawn with per-corner alpha. */
export function torchBeamTriangles(input: TorchBeamInput): BeamTriangle[] {
  const { x, y, facing, halfFovRad, rangePx, rays, intensity, edgeFeatherRad, occluders } = input;
  if (rays < 2) {
    return [];
  }

  const rim: RimPoint[] = [];
  for (let i = 0; i < rays; i++) {
    // The same spread of rays the vision cone draws with.
    const offset = -halfFovRad + (halfFovRad * 2 * i) / (rays - 1);
    const a = facing + offset;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const dist = rayDistanceToRects(x, y, dx, dy, occluders, rangePx);
    // How far this ray sits inside the nearest edge of the cone.
    const fromEdge = halfFovRad - Math.abs(offset);
    // A feather of zero means hard edges, rather than a divide by zero.
    const feather = edgeFeatherRad > 0 ? clamp(fromEdge / edgeFeatherRad, 0, 1) : 1;
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
      // At the guard the light is full strength, softened only by the edge feather.
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
