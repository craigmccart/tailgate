import Phaser from 'phaser';
import { LIGHTING } from '../config/lighting';
import type { LightSource } from './LightModel';
import { bakeLight, changedRects, crossfadeAlpha, overlapsReach } from './lightBake';
import type { Rect } from './occlusion';

/** One baked light, ready for the renderer to erase out of the veil. */
export interface BakeEntry {
  source: LightSource;
  /** Key of the baked picture in the texture manager. */
  key: string;
  /** World position of the picture's top-left corner. */
  worldX: number;
  worldY: number;
  /** Width and height of the picture, in world pixels. */
  worldSize: number;
  /** How much of this picture shows, 0 to 1. Below 1 only during a crossfade. */
  fade: number;
}

/** A baked picture held as a texture, and where it sits in the world. */
interface BakedTexture {
  key: string;
  worldX: number;
  worldY: number;
  worldSize: number;
}

/** Everything the cache keeps for one static light. */
interface LightSlot {
  source: LightSource;
  /** The light's place in the source list, used in its texture keys. */
  index: number;
  /** The walls that can shade this light, worked out once. */
  walls: Rect[];
  /** What the light shows now. Null only if its texture could not be made. */
  current: BakedTexture | null;
  /** The picture fading out while a crossfade runs. */
  previous: BakedTexture | null;
  /** When the running crossfade began, or null when none is running. */
  fadeStartMs: number | null;
  /** Counts this light's bakes, so every texture gets a fresh key. */
  version: number;
}

/** Gives every cache its own texture keys, so a detain restart never meets the old ones. */
let nextCacheId = 0;

/**
 * Holds one baked picture per static light, shadows included, for the
 * lighting veil to erase each frame. Walls never move, so each light is baked
 * once. Doors do move: when one near a light opens or shuts, only that light
 * is baked again, and its old picture melts into the new one over
 * LIGHTING.bake.crossfadeMs so the change never pops. Lights far from any
 * moving door are never touched again.
 *
 * Render only. Detection has its own wall-aware light in LightModel; this is
 * just so the screen shows the same cover the guards work from.
 */
export class LightBakeCache {
  private readonly scene: Phaser.Scene;
  private readonly cacheId = nextCacheId++;
  private slots: LightSlot[];
  /** The closed doors seen last frame, or null before the first frame. */
  private closedDoors: Rect[] | null = null;

  constructor(scene: Phaser.Scene, sources: readonly LightSource[], walls: readonly Rect[]) {
    this.scene = scene;
    // Walls only for now: the first setClosedDoors call adds the closed doors.
    this.slots = sources.map((source, index) => {
      const slot: LightSlot = {
        source,
        index,
        walls: walls.filter((w) => overlapsReach(w, source)),
        current: null,
        previous: null,
        fadeStartMs: null,
        version: 0,
      };
      slot.current = this.bake(slot, []);
      return slot;
    });
  }

  /**
   * Hands over this frame's closed doors. Cheap when nothing has moved. When a
   * door has opened or shut, every light whose reach box it overlaps is baked
   * again and crossfaded in. The very first call bakes the lights by closed
   * doors straight in with no fade, because nothing was on screen before it.
   */
  setClosedDoors(rects: readonly Rect[], nowMs: number): void {
    this.settle(nowMs);
    const first = this.closedDoors === null;
    const changed = changedRects(this.closedDoors ?? [], rects);
    if (!first && changed.length === 0) {
      return;
    }
    // Keep a copy: the scene builds a fresh list every frame.
    const closed = rects.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
    this.closedDoors = closed;

    for (const slot of this.slots) {
      if (!changed.some((door) => overlapsReach(door, slot.source))) {
        continue;
      }
      const next = this.bake(
        slot,
        closed.filter((door) => overlapsReach(door, slot.source))
      );
      if (first) {
        this.replace(slot, next);
      } else {
        this.crossfadeTo(slot, next, nowMs);
      }
    }
  }

  /** The pictures to erase this frame, each with how much of it shows. */
  entries(nowMs: number): readonly BakeEntry[] {
    this.settle(nowMs);
    const out: BakeEntry[] = [];
    for (const slot of this.slots) {
      const shown =
        slot.fadeStartMs === null
          ? 1
          : crossfadeAlpha(nowMs - slot.fadeStartMs, LIGHTING.bake.crossfadeMs);
      if (slot.previous) {
        out.push({ source: slot.source, ...slot.previous, fade: 1 - shown });
      }
      if (slot.current) {
        out.push({ source: slot.source, ...slot.current, fade: shown });
      }
    }
    return out;
  }

  /** Frees every baked texture. Called on the scene's SHUTDOWN; safe to call twice. */
  destroy(): void {
    for (const slot of this.slots) {
      this.removeTexture(slot.previous);
      this.removeTexture(slot.current);
    }
    this.slots = [];
  }

  /** Ends any crossfade that has run its course and frees the picture it faded out. */
  private settle(nowMs: number): void {
    for (const slot of this.slots) {
      if (
        slot.fadeStartMs !== null &&
        crossfadeAlpha(nowMs - slot.fadeStartMs, LIGHTING.bake.crossfadeMs) >= 1
      ) {
        this.removeTexture(slot.previous);
        slot.previous = null;
        slot.fadeStartMs = null;
      }
    }
  }

  /** Swaps a light's picture at once, with no fade. */
  private replace(slot: LightSlot, next: BakedTexture | null): void {
    this.removeTexture(slot.previous);
    this.removeTexture(slot.current);
    slot.previous = null;
    slot.current = next;
    slot.fadeStartMs = null;
  }

  /** Starts fading a light's current picture out and the new one in. */
  private crossfadeTo(slot: LightSlot, next: BakedTexture | null, nowMs: number): void {
    if (slot.fadeStartMs === null) {
      slot.previous = slot.current;
    } else {
      // Another door moved before the last fade finished. Only two pictures
      // can blend, so drop whichever half-faded one shows less: the light
      // then shifts by at most half the difference, rather than jumping.
      const shown = crossfadeAlpha(nowMs - slot.fadeStartMs, LIGHTING.bake.crossfadeMs);
      if (shown >= 0.5) {
        this.removeTexture(slot.previous);
        slot.previous = slot.current;
      } else {
        this.removeTexture(slot.current);
      }
    }
    slot.current = next;
    slot.fadeStartMs = nowMs;
  }

  /**
   * Bakes one light against its walls and the given closed doors into a new
   * canvas texture: white, with the baked light as its alpha.
   */
  private bake(slot: LightSlot, doors: readonly Rect[]): BakedTexture | null {
    const { source } = slot;
    const texelPx = LIGHTING.bake.texelPx;
    const baked = bakeLight({
      x: source.x,
      y: source.y,
      radiusPx: source.radiusPx,
      occluders: doors.length > 0 ? [...slot.walls, ...doors] : slot.walls,
      texelPx,
    });
    const size = baked.sizeTexels;
    if (size === 0) {
      return null;
    }
    const key = `lightBake-${this.cacheId}-${slot.index}-${slot.version}`;
    slot.version += 1;
    const tex = this.scene.textures.createCanvas(key, size, size);
    if (!tex) {
      return null;
    }
    const image = tex.getContext().createImageData(size, size);
    const data = image.data;
    for (let i = 0; i < baked.alpha.length; i++) {
      const p = i * 4;
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = baked.alpha[i];
    }
    tex.putData(image, 0, 0);
    tex.refresh();
    // Pixel textures use nearest-neighbour filtering globally. A baked light
    // is a soft gradient, so it must stay smoothly filtered, like lightMask.
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return { key, worldX: baked.originX, worldY: baked.originY, worldSize: size * texelPx };
  }

  private removeTexture(tex: BakedTexture | null): void {
    if (tex && this.scene.textures.exists(tex.key)) {
      this.scene.textures.remove(tex.key);
    }
  }
}
