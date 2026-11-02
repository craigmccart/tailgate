/** Every scene lays itself out in this many units wide, whatever the canvas size. */
export const UI_WIDTH = 960;
/** Every scene lays itself out in this many units tall, whatever the canvas size. */
export const UI_HEIGHT = 540;
/** The canvas is never taller than this many device pixels, so a 4K screen stays smooth. */
export const MAX_CANVAS_HEIGHT = 1440;

/** The window and display facts that decide how big the canvas should be. */
export interface CanvasSizeInput {
  /** Window width in CSS pixels. */
  innerWidth: number;
  /** Window height in CSS pixels. */
  innerHeight: number;
  /** Device pixels per CSS pixel (1.75 on a 1440p monitor at 175 percent scaling). */
  devicePixelRatio: number;
  /** Player setting, 1 for full sharpness, lower for a cheaper, softer picture. */
  renderScale: number;
}

/**
 * Works out the canvas size in device pixels: the largest 16 by 9 picture that
 * fits the window, scaled by the player's render scale, kept between the
 * 960 by 540 layout unit and MAX_CANVAS_HEIGHT. Both sides come out even so the
 * 16 by 9 shape stays clean.
 */
export function canvasSizeFor(input: CanvasSizeInput): { width: number; height: number } {
  const boxWidth = input.innerWidth * input.devicePixelRatio;
  const boxHeight = input.innerHeight * input.devicePixelRatio;

  let height = Math.min(boxHeight, (boxWidth * 9) / 16);
  height *= input.renderScale;
  height = Math.min(height, MAX_CANVAS_HEIGHT);
  height = Math.max(height, UI_HEIGHT);
  // Width comes from the unrounded height so rounding never skews the 16 by 9 shape.
  const width = (height * 16) / 9;

  return { width: toEven(width), height: toEven(height) };
}

function toEven(value: number): number {
  return 2 * Math.round(value / 2);
}

/** How far to zoom the UI camera so the 960 unit box fills a canvas this wide. */
export function uiZoomFor(canvasWidth: number): number {
  return canvasWidth / UI_WIDTH;
}
