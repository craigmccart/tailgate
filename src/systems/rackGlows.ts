import Phaser from "phaser";
import { LIGHTING } from "../config/lighting";
import { PALETTE_HEX } from "../config/palette";
import type { LightSource } from "./LightModel";
import { rackGlowColour } from "./rackGlowColour";

/** Texture key for the generated soft glow dot. */
const GLOW_KEY = "rackGlow";
const GLOW_SIZE = 32;

/** Builds the soft dot once (guarded for restarts). White so the tint sets the colour. */
function ensureGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW_KEY)) {
    return;
  }
  const tex = scene.textures.createCanvas(GLOW_KEY, GLOW_SIZE, GLOW_SIZE);
  if (!tex) {
    return;
  }
  const ctx = tex.getContext();
  const r = GLOW_SIZE / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.5)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  tex.refresh();
  // The game runs pixelArt, so a soft texture must opt into smooth filtering.
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

/**
 * Adds one small additive glow per server rack light, above the darkness veil
 * so the LEDs shine in the dark. Static: no animation. Render only.
 */
export function addRackGlows(
  scene: Phaser.Scene,
  sources: readonly LightSource[],
): void {
  ensureGlowTexture(scene);
  const cfg = LIGHTING.rackGlow;
  for (const source of sources) {
    if (source.kind !== "rack") {
      continue;
    }
    const tint =
      rackGlowColour(source.x, source.y) === "amber"
        ? PALETTE_HEX.amber
        : PALETTE_HEX.text;
    scene.add
      .image(source.x, source.y, GLOW_KEY)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint)
      .setAlpha(cfg.alpha)
      .setDisplaySize(2 * cfg.radiusPx, 2 * cfg.radiusPx)
      .setDepth(cfg.depth);
  }
}
