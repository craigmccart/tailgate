/**
 * Juice and polish tuning: camera feel, alarm screen shake, the DETAINED flash
 * and the interact progress hold. Presentation only, no gameplay maths. All the
 * numbers Craig might want to soften or sharpen live here.
 *
 * Comfort note: the camera look-ahead eases more slowly than the follow so it
 * never feels like the world slides under you, and the shake is deliberately
 * tiny. Both, and the flash, obey the screen-shake setting for photosensitivity.
 */
export const JUICE = {
  camera: {
    /** Deadzone half-extents in px; the frame ignores motion smaller than this. */
    deadzoneW: 40,
    deadzoneH: 32,
    /** How far ahead of travel the view biases, px. Set 0 to disable cleanly. */
    lookAheadPx: 48,
    /** Ease rate for the look-ahead offset. Kept below the follow lerp (0.1). */
    lookAheadLerp: 0.045,
    /**
     * How close the camera sits to the building. 1 is the original view. 1.4 is
     * the Phase 22 setting: the screen shows about 70 percent of the old width
     * and height (1 divided by 1.4), so everything looks 40 percent bigger,
     * closer and more detailed. The HUD stays the same size. Higher is closer
     * still, but you see less of a guard's approach, so go up in small steps.
     */
    worldZoom: 1.4,
    /**
     * How far the view leans toward the mouse, or the right stick on a pad, in
     * world px. The full lean is reached with the mouse at the top or bottom
     * edge of the screen. It is added on top of the travel look-ahead above and
     * is switched off by the SCREEN EFFECTS setting. Set 0 to disable cleanly.
     */
    pointerLookAheadPx: 56,
    /**
     * Ease rate for that lean, per frame. Deliberately slower than the travel
     * look-ahead (0.045), so the view takes a little over a second to settle
     * and never slides under you. Lower is gentler.
     */
    pointerLookAheadLerp: 0.04,
  },
  shake: {
    /** Length of the alarm screen shake, ms. */
    durationMs: 300,
    /** Phaser shake intensity, a fraction of the viewport. Kept tiny. */
    intensity: 0.007,
  },
  detained: {
    /** Peak opacity of the red detained vignette, and how fast it fades in. */
    vignetteAlpha: 0.34,
    vignetteFadeMs: 180,
    /** Alarm-red camera flash duration, ms. Gated by the screen-shake setting. */
    flashMs: 220,
  },
  progress: {
    /** The bar above the player during a plant or photo hold. */
    trackW: 50,
    trackH: 7,
    yOffset: 30,
    cornerR: 3,
    /** A redundant ring closing around the player, so progress is never one thin bar. */
    ringRadius: 22,
    ringThickness: 3,
  },
} as const;
