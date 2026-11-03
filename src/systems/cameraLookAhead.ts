import { THROW } from '../config/throw';
import { UI_HEIGHT, UI_WIDTH } from '../ui/viewport';

// Pure maths for the pointer and stick lean of the world camera. No Phaser
// import, so it runs under Vitest's node environment. BuildingScene eases its
// camera offset toward the result.

/** What decides whether the mouse should steer the lean this frame. */
export interface PointerLiveInput {
  /** True while the mouse is over the game canvas. */
  overCanvas: boolean;
  /** When the mouse last moved, in ms on the page clock, or 0 if it never has. */
  pointerMoveTimeMs: number;
  /** When the pad last showed any input, in ms on the same clock, or 0 if never. */
  lastPadInputTimeMs: number;
}

/**
 * True when the mouse is the input the player is using right now: it is over
 * the canvas, it has moved at least once, and it moved more recently than the
 * pad was touched. A mouse left parked after the click that focused the tab
 * therefore stops leaning the view the moment the pad is used, and only takes
 * over again when it is moved.
 */
export function pointerIsLive(input: PointerLiveInput): boolean {
  return (
    input.overCanvas &&
    input.pointerMoveTimeMs > 0 &&
    input.pointerMoveTimeMs > input.lastPadInputTimeMs
  );
}

/** What the camera should lean toward this frame. */
export interface PointerLookAheadInput {
  /** The mouse in UI units (the 960 by 540 layout), or null when there is no usable mouse. */
  pointerUi: { x: number; y: number } | null;
  /** The right stick, each axis from -1 to 1, or null when no pad is connected. */
  stick: { x: number; y: number } | null;
  /** The SCREEN EFFECTS setting. Off means no lean at all. */
  enabled: boolean;
  /** The furthest the view may lean, in world pixels. */
  maxPx: number;
}

/**
 * Where the view should lean, as an offset in world pixels from the usual
 * follow position. The right stick wins over the mouse. With the mouse, the lean
 * grows from nothing at the middle of the screen to maxPx at the top or bottom
 * edge, and never goes past maxPx in the corners.
 */
export function pointerLookAhead(input: PointerLookAheadInput): { x: number; y: number } {
  if (!input.enabled || input.maxPx <= 0) {
    return { x: 0, y: 0 };
  }

  const { stick, pointerUi, maxPx } = input;

  if (stick) {
    const stickLength = Math.hypot(stick.x, stick.y);
    // Below the aim deadzone the stick counts as untouched, so the mouse (if
    // there is one) still gets its say.
    if (stickLength >= THROW.aimDeadzone) {
      return { x: (stick.x / stickLength) * maxPx, y: (stick.y / stickLength) * maxPx };
    }
  }

  if (!pointerUi) {
    return { x: 0, y: 0 };
  }

  // Half the screen height, measured from the centre, is the full lean. That
  // makes the lean the same on every canvas size and keeps it round, not boxy.
  const scale = maxPx / (UI_HEIGHT / 2);
  const x = (pointerUi.x - UI_WIDTH / 2) * scale;
  const y = (pointerUi.y - UI_HEIGHT / 2) * scale;
  const length = Math.hypot(x, y);

  if (length === 0) {
    return { x: 0, y: 0 };
  }
  if (length > maxPx) {
    return { x: (x / length) * maxPx, y: (y / length) * maxPx };
  }
  return { x, y };
}
