import Phaser from 'phaser';
import { JUICE } from '../config/juice';
import { FONTS, PALETTE, PALETTE_HEX } from '../config/palette';
import type { LevelHint } from '../state/levels';
import { FeedTreatment } from '../systems/FeedTreatment';
import { HintSystem } from '../systems/HintSystem';
import { AlertBanner } from '../ui/AlertBanner';
import { FieldHud } from '../ui/FieldHud';
import { ScreenEdgeMarkers } from '../ui/ScreenEdgeMarkers';
import { fadeIn } from '../ui/transitions';
import { fitUiCamera } from '../ui/uiCamera';
import { UI_HEIGHT, UI_WIDTH } from '../ui/viewport';
import type { BuildingScene } from './BuildingScene';

/** What the building hands the overlay when it launches it. */
export interface FieldOverlayData {
  levelId: string;
  hints: readonly LevelHint[];
}

/** The camera fade events carry the duration and colour after the camera and effect. */
type FadeListener = (
  cam: Phaser.Cameras.Scene2D.Camera,
  effect: unknown,
  duration: number,
  red: number,
  green: number,
  blue: number
) => void;

/**
 * Everything fixed to the screen while the player is on site: the HUD chips,
 * the screen-edge markers, the alert banner, the first-run hints, the mission
 * prompt, the security-feed treatment and the DETAINED card. It sits on top of
 * the building scene with its own fitted UI camera and lays out in 960 by 540
 * units, which leaves the building's camera free to zoom the world without
 * moving or resizing any of this.
 *
 * The overlay has no logic of its own. The building launches it, receives the
 * objects through attachOverlay, and drives them from its own update, so a
 * paused building simply leaves the overlay showing its last frame.
 */
export class FieldOverlayScene extends Phaser.Scene {
  hud!: FieldHud;
  alertBanner!: AlertBanner;
  edgeMarkers!: ScreenEdgeMarkers;
  hintSystem!: HintSystem;
  promptText!: Phaser.GameObjects.Text;
  feedTreatment!: FeedTreatment;

  constructor() {
    super('fieldOverlay');
  }

  create(data: FieldOverlayData): void {
    fitUiCamera(this);

    // The security-feed look over the finished picture: cool cast, faint static
    // and an alert-coloured vignette, all below the HUD.
    this.feedTreatment = new FeedTreatment(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.feedTreatment.destroy());
    this.hud = new FieldHud(this);
    this.edgeMarkers = new ScreenEdgeMarkers(this);
    this.alertBanner = new AlertBanner(this);
    this.hintSystem = new HintSystem(this, data.levelId, data.hints);

    // The mission prompt, bottom centre.
    this.promptText = this.add
      .text(UI_WIDTH / 2, UI_HEIGHT - 28, '', {
        fontFamily: FONTS.mono,
        fontSize: '15px',
        color: PALETTE.amber,
      })
      .setOrigin(0.5)
      .setDepth(1000);

    const building = this.scene.get('building') as BuildingScene;
    this.mirrorFades(building.cameras.main);
    // The building's own fade in ran before this scene existed, so start ours here.
    fadeIn(this);
    building.attachOverlay(this);
  }

  /**
   * The DETAINED card: a red wash, a dark card, the heading, and why and
   * where the run picks up. Drawn once per detain; the building restarts soon
   * after, which stops this scene and takes the card with it.
   */
  showDetained(cause: string, resumeAt: string): void {
    const cx = UI_WIDTH / 2;
    const cy = UI_HEIGHT / 2;

    const vignette = this.add
      .rectangle(cx, cy, UI_WIDTH, UI_HEIGHT, PALETTE_HEX.alarm, 0)
      .setDepth(1999);
    this.tweens.add({
      targets: vignette,
      alpha: JUICE.detained.vignetteAlpha,
      duration: JUICE.detained.vignetteFadeMs,
      ease: 'Quad.easeOut',
    });

    this.add.rectangle(cx, cy + 10, 560, 168, PALETTE_HEX.base, 0.82).setDepth(2000);
    this.add
      .text(cx, cy - 24, 'DETAINED', {
        fontFamily: FONTS.display,
        fontSize: '64px',
        color: PALETTE.alarm,
      })
      .setOrigin(0.5)
      .setDepth(2001);

    const lines = ['ESCORTED FROM SITE', cause, `RESUMING AT: ${resumeAt}`];
    lines.forEach((line, i) => {
      this.add
        .text(cx, cy + 22 + i * 20, line, {
          fontFamily: FONTS.mono,
          fontSize: '13px',
          color: PALETTE.text,
        })
        .setOrigin(0.5)
        .setDepth(2001);
    });
  }

  /**
   * Keeps this scene's fades in step with the building's. The shared fade
   * helpers only fade one camera, so without this the HUD and the DETAINED
   * card would stay lit over a black world. The listeners hold on to the
   * camera they were added to: a detain restart gives the building a new
   * camera before this scene is stopped, so it must not be looked up again.
   */
  private mirrorFades(worldCam: Phaser.Cameras.Scene2D.Camera): void {
    const onFadeOut: FadeListener = (_cam, _effect, duration, red, green, blue) => {
      this.cameras.main.fadeOut(duration, red, green, blue);
    };
    const onFadeIn: FadeListener = (_cam, _effect, duration, red, green, blue) => {
      this.cameras.main.fadeIn(duration, red, green, blue);
    };
    worldCam.on(Phaser.Cameras.Scene2D.Events.FADE_OUT_START, onFadeOut);
    worldCam.on(Phaser.Cameras.Scene2D.Events.FADE_IN_START, onFadeIn);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      worldCam.off(Phaser.Cameras.Scene2D.Events.FADE_OUT_START, onFadeOut);
      worldCam.off(Phaser.Cameras.Scene2D.Events.FADE_IN_START, onFadeIn);
    });
  }
}
