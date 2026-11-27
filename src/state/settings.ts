/**
 * Player settings, a module-level singleton so every system reads the same
 * values and they survive scene restarts. Persisted to localStorage under one
 * key, per the CLAUDE.md "localStorage for settings only" rule. Phase 6 adds the
 * menu UI; the plumbing (including the screen-shake / flash toggle) is here now.
 */
interface Settings {
  /**
   * Screen shake on alarm AND the DETAINED camera flash. One toggle covers both
   * sudden-motion effects, for photosensitivity and nystagmus comfort. Default on.
   */
  screenShake: boolean;
  /** Master audio volume, 0 to 1. */
  masterVolume: number;
  /** Global mute. */
  muted: boolean;
  /** Multiplier on HUD text size, for the accessibility menu. */
  hudScale: number;
  /** Extra brightness on top of the lighting visibility floor, 0 to 1. */
  extraBrightness: number;
  /**
   * The security-feed atmosphere: the vignette, faint static and cool cast over
   * the picture, its alert tinting, the slow breathe on the building's lights,
   * and every looping dressing tween on the meta screens (the kiosk's sheen,
   * caret blink and card glow, and the pause badge's sway). Pure presentation,
   * so turning it off changes nothing a guard can see. Default on. The
   * DETAINED flash and the alarm shake are sudden-motion effects and stay
   * under screenShake instead.
   */
  screenEffects: boolean;
  /**
   * Assist mode: guards move at a reduced speed. No score penalty and no shame
   * copy anywhere, per the accessibility design. Default off.
   */
  assistMode: boolean;
  /**
   * How many pixels the game draws, as a fraction of what the window could
   * show: 1 is full sharpness, 0.5 draws a quarter of the pixels and stretches
   * them up, which is softer but easier on a slower machine. Steps of 0.25
   * between 0.5 and 1. Always read through normaliseRenderScale, so a bad
   * stored value cannot reach the canvas.
   */
  renderScale: number;
}

const STORAGE_KEY = 'tailgate.settings';

const settings: Settings = {
  screenShake: true,
  masterVolume: 0.8,
  muted: false,
  hudScale: 1,
  extraBrightness: 0,
  screenEffects: true,
  assistMode: false,
  renderScale: 1,
};

/**
 * The render scale steps in quarters, so the menu offers 50, 75 and 100 percent.
 * Exported so the settings row moves by the same amount the normaliser rounds to.
 */
export const RENDER_SCALE_STEP = 0.25;
/** Below this the picture is too blurry to play, so it is the floor. */
const RENDER_SCALE_MIN = 0.5;
/** Full sharpness, and also the fallback for anything that is not a number. */
const RENDER_SCALE_MAX = 1;

/**
 * Cleans up a render scale from any source (storage, a hand-edited value, the
 * menu). Anything that is not a finite number gives full sharpness; a number
 * rounds to the nearest quarter and stays between 50 and 100 percent. Strings
 * are not accepted, even ones that look like numbers.
 */
export function normaliseRenderScale(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return RENDER_SCALE_MAX;
  const snapped = Math.round(v / RENDER_SCALE_STEP) * RENDER_SCALE_STEP;
  return Math.max(RENDER_SCALE_MIN, Math.min(RENDER_SCALE_MAX, snapped));
}

// Load any persisted overrides. Guarded so a headless build never throws.
try {
  const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (raw) {
    Object.assign(settings, JSON.parse(raw) as Partial<Settings>);
  }
} catch {
  // No storage available; defaults stand.
}
// A stored render scale that is missing, mistyped or out of range is cleaned up
// once here, so nothing downstream has to defend against it.
settings.renderScale = normaliseRenderScale(settings.renderScale);

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures; the in-memory settings still apply.
  }
}

export function getSettings(): Readonly<Settings> {
  return settings;
}

export function setScreenShake(on: boolean): void {
  settings.screenShake = on;
  persist();
}

export function setMasterVolume(v: number): void {
  settings.masterVolume = Math.max(0, Math.min(1, v));
  persist();
}

export function setMuted(muted: boolean): void {
  settings.muted = muted;
  persist();
}

export function setHudScale(v: number): void {
  settings.hudScale = v;
  persist();
}

export function setExtraBrightness(v: number): void {
  settings.extraBrightness = Math.max(0, Math.min(1, v));
  persist();
}

export function setScreenEffects(on: boolean): void {
  settings.screenEffects = on;
  persist();
}

export function setAssistMode(on: boolean): void {
  settings.assistMode = on;
  persist();
}

export function setRenderScale(v: number): void {
  settings.renderScale = normaliseRenderScale(v);
  persist();
}
