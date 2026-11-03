import { PALETTE_HEX } from './palette';

/**
 * Phase 22 weather: rain over the outdoor zones and a faint wet shine on the
 * tarmac where a lamp spills onto it. Presentation only, so nothing here
 * changes what a guard can see. This is the file Craig edits to make the
 * evening wetter or drier.
 *
 * Comfort note (nystagmus): the rain is faint, thin and quick to fade, and it
 * sits behind the SCREEN EFFECTS setting, so turning that off stops it within
 * a second. The wet shine never moves, so it stays on either way. Both use the
 * cool UI grey; alarm red never appears here.
 */
export const WEATHER = {
  /** Falling rain streaks, only ever over zones marked exterior in the map. */
  rain: {
    /** Above the grid (20), below the lighting veil (25): darkness dims the rain. */
    depth: 21,
    /** How long each streak is, px. Longer reads as heavier, faster rain. */
    streakLengthPx: 7,
    /** How far each streak leans off vertical, degrees, to match the wind. */
    streakAngleDeg: 8,
    /** How see-through a fresh streak is (0 invisible, 1 solid). It fades to nothing as it falls. */
    alpha: 0.14,
    /** How fast rain falls, px per second. */
    speedY: 420,
    /** Sideways wind, px per second. Negative blows the rain to the left. */
    driftX: -40,
    /** How long one streak lives before it has faded out, ms. */
    lifespanMs: 420,
    /**
     * How heavy the rain is: new streaks per second for every 100 by 100 px
     * patch of outdoor ground. At 3 a full car-park view holds about 33
     * streaks at once. This is the number to lower for lighter rain (0.6 is
     * a light drizzle, about 6 streaks on screen, which reads as specks).
     */
    dropsPerSecondPer10kPx2: 3,
    /** Streak colour: the cool UI grey. */
    tint: PALETTE_HEX.text,
  },
  /**
   * The wet shine: a faint, stretched oval of light on the outdoor ground
   * under any lamp whose light reaches it, cut off at the zone's edge. It is
   * drawn once when the level loads and never moves.
   */
  wetSheen: {
    /** Just above the light pools (2), below the route cues (3), so props and people sit on top. */
    depth: 2.5,
    /** How strong the shine is (0 invisible, 1 solid). Keep it faint. */
    alpha: 0.05,
    /** Oval width as a share of the lamp's full reach across. */
    widthFactor: 0.9,
    /** Oval height as a share of the lamp's full reach across. Over 1 stretches it into a smear. */
    heightFactor: 1.6,
    /** How far below the lamp the oval's centre sits, as a share of the lamp's reach. */
    offsetYFactor: 0.35,
    /** Shine colour: the cool UI grey. */
    tint: PALETTE_HEX.text,
  },
} as const;
