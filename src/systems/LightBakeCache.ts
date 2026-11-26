import Phaser from 'phaser';
import { LIGHTING } from '../config/lighting';
import type { LightSource } from './LightModel';
import {
  bakeLight,
  changedRects,
  crossfadeAlpha,
  overlapsReach,
  reversalStartMs,
  splitBakes,
  type BakedLight,
  type TexelCrop,
} from './lightBake';
import type { Rect } from './occlusion';

/** One baked picture, ready for the renderer to erase out of the veil. */
export interface BakeEntry {
  source: LightSource;
  /** Key of the picture in the texture manager. */
  key: string;
  /** World position of the picture's top-left corner. */
  worldX: number;
  worldY: number;
  /** Size of the picture, in world pixels. */
  worldWidth: number;
  worldHeight: number;
  /** How much of this picture shows, 0 to 1. Below 1 only during a crossfade. */
  fade: number;
}

/** A picture held as a texture, and where it sits in the world. */
interface BakedTexture {
  key: string;
  worldX: number;
  worldY: number;
  worldWidth: number;
  worldHeight: number;
}

/** One way a light can look: its bake for one set of nearby doors shut. */
interface Variant {
  bake: BakedLight;
  /** Null only if the texture could not be made. */
  texture: BakedTexture | null;
}

/** A running crossfade between two variants of one light. */
interface Crossfade {
  startMs: number;
  /** The variant the fade started from, so a door reversing mid-fade can be spotted. */
  fromKey: string;
  /** Light both variants share, shown in full throughout. */
  shared: BakedTexture | null;
  /** True when the shared picture was made for this fade and is freed after it. */
  sharedOwned: boolean;
  /** Light only the new variant has, fading in. */
  gained: BakedTexture | null;
  /** Light only the old variant has, fading out. */
  lost: BakedTexture | null;
}

/** Everything the cache keeps for one static light. */
interface LightSlot {
  source: LightSource;
  /** The light's place in the source list, used in its texture keys. */
  index: number;
  /** The walls that can shade this light, worked out once. */
  walls: Rect[];
  /** Every variant baked so far, by which of its nearby doors were shut. */
  variants: Map<string, Variant>;
  /** The variant on screen, or the one being faded to. */
  shownKey: string;
  fade: Crossfade | null;
  /** Counts this light's textures, so every one gets a fresh key. */
  version: number;
}

/** Gives every cache its own texture keys, so a detain restart never meets the old ones. */
let nextCacheId = 0;

/**
 * A variant's name: the shut doors in the light's reach, by position and size,
 * sorted so the order the scene lists them in never matters. All open is ''.
 */
function doorSetKey(closedNearby: readonly Rect[]): string {
  return closedNearby
    .map((r) => `${r.x},${r.y},${r.width},${r.height}`)
    .sort()
    .join('|');
}

/**
 * Holds the baked pictures of every static light, shadows included, for the
 * lighting veil to erase each frame. Walls never move, but doors do, so each
 * light keeps one baked variant per set of its nearby doors shut. Lights with
 * one or two nearby doors get both the all-open and the all-shut variant
 * baked up front, so the usual door change only swaps between pictures that
 * already exist; any other variant is baked the first time it is needed.
 *
 * When a door near a light opens or shuts, the change crossfades over
 * LIGHTING.bake.crossfadeMs. Only the light that changes fades: the part both
 * variants share stays in full, so the rest of the pool never dims.
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

  constructor(
    scene: Phaser.Scene,
    sources: readonly LightSource[],
    walls: readonly Rect[],
    doors: readonly Rect[]
  ) {
    this.scene = scene;
    this.slots = sources.map((source, index) => {
      const slot: LightSlot = {
        source,
        index,
        walls: walls.filter((w) => overlapsReach(w, source)),
        variants: new Map(),
        shownKey: '',
        fade: null,
        version: 0,
      };
      // All open shows until the first setClosedDoors call says otherwise.
      this.variant(slot, []);
      const nearbyDoors = doors.filter((d) => overlapsReach(d, source));
      if (nearbyDoors.length === 1 || nearbyDoors.length === 2) {
        this.variant(slot, nearbyDoors);
      }
      return slot;
    });
  }

  /**
   * Hands over this frame's closed doors. Cheap when nothing has moved. When a
   * door has opened or shut, every light whose reach box it overlaps moves to
   * the matching variant with a crossfade. The very first call moves with no
   * fade, because nothing was on screen before it.
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
      const closedNearby = closed.filter((door) => overlapsReach(door, slot.source));
      const key = doorSetKey(closedNearby);
      if (key === slot.shownKey) {
        continue;
      }
      const target = this.variant(slot, closedNearby);
      if (first) {
        this.endFade(slot);
        slot.shownKey = key;
      } else {
        this.crossfadeTo(slot, key, target, nowMs);
      }
    }
  }

  /** The pictures to erase this frame, each with how much of it shows. */
  entries(nowMs: number): readonly BakeEntry[] {
    this.settle(nowMs);
    const out: BakeEntry[] = [];
    const push = (source: LightSource, tex: BakedTexture | null, fade: number): void => {
      if (tex) {
        out.push({ source, ...tex, fade });
      }
    };
    for (const slot of this.slots) {
      if (slot.fade) {
        const shown = crossfadeAlpha(nowMs - slot.fade.startMs, LIGHTING.bake.crossfadeMs);
        push(slot.source, slot.fade.shared, 1);
        push(slot.source, slot.fade.gained, shown);
        push(slot.source, slot.fade.lost, 1 - shown);
      } else {
        push(slot.source, slot.variants.get(slot.shownKey)?.texture ?? null, 1);
      }
    }
    return out;
  }

  /** Frees every texture. Called on the scene's SHUTDOWN; safe to call twice. */
  destroy(): void {
    for (const slot of this.slots) {
      this.endFade(slot);
      for (const v of slot.variants.values()) {
        this.removeTexture(v.texture);
      }
      slot.variants.clear();
    }
    this.slots = [];
  }

  /** Ends any crossfade that has run its course. */
  private settle(nowMs: number): void {
    for (const slot of this.slots) {
      if (
        slot.fade &&
        crossfadeAlpha(nowMs - slot.fade.startMs, LIGHTING.bake.crossfadeMs) >= 1
      ) {
        this.endFade(slot);
      }
    }
  }

  /** Stops a light's crossfade, if any, so its shown variant takes over in full. */
  private endFade(slot: LightSlot): void {
    if (!slot.fade) {
      return;
    }
    if (slot.fade.sharedOwned) {
      this.removeTexture(slot.fade.shared);
    }
    this.removeTexture(slot.fade.gained);
    this.removeTexture(slot.fade.lost);
    slot.fade = null;
  }

  /**
   * Starts fading a light to another variant. If a door moves while a fade is
   * still running, the new fade starts from the variant the light was heading
   * to, as if the old fade had already finished. The one exception is a door
   * that reverses mid-fade, heading straight back to where the fade began:
   * the fade back starts as far through as the old one had left to go, so the
   * doorway carries on from the brightness it had reached instead of jumping.
   */
  private crossfadeTo(slot: LightSlot, key: string, target: Variant, nowMs: number): void {
    const fromKey = slot.shownKey;
    const from = slot.variants.get(fromKey);
    // Read how far the running fade had got before ending it.
    const running = slot.fade;
    const reversing = running !== null && running.fromKey === key;
    const progress = running
      ? crossfadeAlpha(nowMs - running.startMs, LIGHTING.bake.crossfadeMs)
      : 0;
    this.endFade(slot);
    slot.shownKey = key;
    if (!from || !from.texture || !target.texture) {
      return; // a missing picture has nothing to blend, so just swap
    }
    const split = splitBakes(from.bake, target.bake);
    if (!split.gained && !split.lost) {
      return; // the door changed nothing this light can see
    }
    // One door opening only gains light, so the shared part is the old picture;
    // one door shutting only loses light, so it is the new one. Only a mix of
    // both needs a shared picture of its own.
    let shared: BakedTexture | null;
    let sharedOwned = false;
    if (!split.lost) {
      shared = from.texture;
    } else if (!split.gained) {
      shared = target.texture;
    } else {
      const { originX, originY, sizeTexels } = target.bake;
      shared = this.createTexture(slot, split.shared, sizeTexels, sizeTexels, originX, originY, 0);
      sharedOwned = true;
    }
    slot.fade = {
      startMs: reversing
        ? reversalStartMs(nowMs, progress, LIGHTING.bake.crossfadeMs)
        : nowMs,
      fromKey,
      shared,
      sharedOwned,
      gained: this.cropTexture(slot, target.bake, split.gained),
      lost: this.cropTexture(slot, target.bake, split.lost),
    };
  }

  /** A texture for the changing part of a fade, placed where it sits in the light's square. */
  private cropTexture(
    slot: LightSlot,
    bake: BakedLight,
    crop: TexelCrop | null
  ): BakedTexture | null {
    if (!crop) {
      return null;
    }
    const texelPx = LIGHTING.bake.texelPx;
    return this.createTexture(
      slot,
      crop.alpha,
      crop.width,
      crop.height,
      bake.originX + crop.x * texelPx,
      bake.originY + crop.y * texelPx,
      1
    );
  }

  /** The light's variant for these shut nearby doors, baked now if it is not cached yet. */
  private variant(slot: LightSlot, closedNearby: readonly Rect[]): Variant {
    const key = doorSetKey(closedNearby);
    const cached = slot.variants.get(key);
    if (cached) {
      return cached;
    }
    const { source } = slot;
    const bake = bakeLight({
      x: source.x,
      y: source.y,
      radiusPx: source.radiusPx,
      occluders: closedNearby.length > 0 ? [...slot.walls, ...closedNearby] : slot.walls,
      texelPx: LIGHTING.bake.texelPx,
    });
    const size = bake.sizeTexels;
    const texture =
      size > 0
        ? this.createTexture(slot, bake.alpha, size, size, bake.originX, bake.originY, 0)
        : null;
    const made: Variant = { bake, texture };
    slot.variants.set(key, made);
    return made;
  }

  /**
   * Makes a canvas texture from a block of alpha: white, with the alpha as its
   * transparency. A crop gets a clear border one texel wide, so smooth
   * filtering fades its edge to nothing exactly as the full picture would.
   */
  private createTexture(
    slot: LightSlot,
    alpha: Uint8ClampedArray,
    widthTexels: number,
    heightTexels: number,
    worldX: number,
    worldY: number,
    borderTexels: number
  ): BakedTexture | null {
    const texelPx = LIGHTING.bake.texelPx;
    const width = widthTexels + 2 * borderTexels;
    const height = heightTexels + 2 * borderTexels;
    const key = `lightBake-${this.cacheId}-${slot.index}-${slot.version}`;
    slot.version += 1;
    const tex = this.scene.textures.createCanvas(key, width, height);
    if (!tex) {
      return null;
    }
    const image = tex.getContext().createImageData(width, height);
    const data = image.data;
    for (let row = 0; row < heightTexels; row++) {
      for (let col = 0; col < widthTexels; col++) {
        const p = ((row + borderTexels) * width + col + borderTexels) * 4;
        data[p] = 255;
        data[p + 1] = 255;
        data[p + 2] = 255;
        data[p + 3] = alpha[row * widthTexels + col];
      }
    }
    tex.putData(image, 0, 0);
    tex.refresh();
    // Pixel textures use nearest-neighbour filtering globally. A baked light
    // is a soft gradient, so it must stay smoothly filtered, like lightMask.
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return {
      key,
      worldX: worldX - borderTexels * texelPx,
      worldY: worldY - borderTexels * texelPx,
      worldWidth: width * texelPx,
      worldHeight: height * texelPx,
    };
  }

  private removeTexture(tex: BakedTexture | null): void {
    if (tex && this.scene.textures.exists(tex.key)) {
      this.scene.textures.remove(tex.key);
    }
  }
}
