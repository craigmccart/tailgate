import Phaser from 'phaser';
import { UI_HEIGHT, UI_WIDTH, canvasSizeFor, uiZoomFor } from './viewport';

// The Phaser-dependent helpers live here, apart from viewport.ts, because
// importing Phaser needs a browser window and the viewport maths is tested in
// node. Keep this file out of any unit test.

/** The UI zoom for a scene's current canvas. */
export function uiZoomOf(scene: Phaser.Scene): number {
  return uiZoomFor(scene.scale.width);
}

/**
 * Points the scene's main camera at the 960 by 540 box and zooms it to fill the
 * canvas, then keeps it that way when the canvas resizes. The resize listener is
 * removed when the scene shuts down. Returns the zoom applied.
 */
export function fitUiCamera(scene: Phaser.Scene): number {
  const fit = (): number => {
    const zoom = uiZoomOf(scene);
    scene.cameras.main.setZoom(zoom);
    scene.cameras.main.centerOn(UI_WIDTH / 2, UI_HEIGHT / 2);
    return zoom;
  };
  const onResize = (): void => {
    fit();
  };

  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, onResize);
  });
  return fit();
}

type TextFactory = (
  this: Phaser.GameObjects.GameObjectFactory,
  x: number,
  y: number,
  text: string | string[],
  style?: Phaser.Types.GameObjects.Text.TextStyle,
) => Phaser.GameObjects.Text;

let textResolutionInstalled = false;

/**
 * Makes every text created with `this.add.text` render at the UI zoom, so it
 * stays sharp on a large canvas. A style that sets its own resolution wins.
 * Safe to call more than once, it only wraps the factory the first time.
 */
export function installTextResolution(): void {
  if (textResolutionInstalled) return;
  textResolutionInstalled = true;

  const proto = Phaser.GameObjects.GameObjectFactory.prototype;
  const original = proto.text as TextFactory;
  proto.text = function (this: Phaser.GameObjects.GameObjectFactory, x, y, text, style) {
    const resolved =
      style?.resolution === undefined ? { ...style, resolution: uiZoomOf(this.scene) } : style;
    return original.call(this, x, y, text, resolved);
  };
}

/**
 * Resizes the game's canvas to suit the window. Uses setGameSize, not resize:
 * the game runs in FIT scale mode, and setGameSize is the call that refreshes
 * the FIT layout and tells every scene's camera about the new size. The render
 * scale is fixed at 1 until the player setting exists.
 */
export function applyRenderScale(game: Phaser.Game): void {
  const { width, height } = canvasSizeFor({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    renderScale: 1,
  });
  game.scale.setGameSize(width, height);
}
