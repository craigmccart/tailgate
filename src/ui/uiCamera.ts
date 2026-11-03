import Phaser from 'phaser';
import { getSettings } from '../state/settings';
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
 * canvas, then keeps it that way when the canvas resizes, and re-sharpens the
 * scene's text to match. The resize listener is removed when the scene shuts
 * down. Returns the zoom applied.
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
    refreshTextResolution(scene);
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
 * Every text whose resolution the wrapper below chose. A resize re-sharpens
 * exactly these, so a text that picked its own resolution is never touched. It
 * is a weak set, so destroyed texts do not pile up.
 */
const autoResolutionTexts = new WeakSet<Phaser.GameObjects.Text>();

/**
 * Makes every text created with `this.add.text` render at its scene's main
 * camera zoom, so it is drawn at the size it is shown and stays sharp on a
 * large canvas. For the menu and HUD scenes that is the UI zoom, because they
 * fit their UI camera before making any text. In the building it is the closer
 * world zoom, so door labels and guard barks are not stretched pixel by pixel.
 * A style that sets its own resolution wins. Safe to call more than once, it
 * only wraps the factory the first time.
 */
export function installTextResolution(): void {
  if (textResolutionInstalled) return;
  textResolutionInstalled = true;

  const proto = Phaser.GameObjects.GameObjectFactory.prototype;
  const original = proto.text as TextFactory;
  proto.text = function (this: Phaser.GameObjects.GameObjectFactory, x, y, text, style) {
    const ownResolution = style?.resolution !== undefined;
    const resolved = ownResolution ? style : { ...style, resolution: this.scene.cameras.main.zoom };
    const made = original.call(this, x, y, text, resolved);
    if (!ownResolution) autoResolutionTexts.add(made);
    return made;
  };
}

/**
 * Re-renders the scene's wrapper-sized text at its main camera's current zoom.
 * Without it, text made while the canvas was small (render scale 50 percent)
 * stays soft after the canvas grows, until the scene next restarts. Looks inside
 * containers too. Call it after the camera has been re-zoomed. Phaser also fires
 * a resize when only the window moves, so a text already at the right resolution
 * is left alone rather than redrawn for nothing.
 * fitUiCamera calls this for every menu and HUD scene. The building scene has no
 * UI camera, so it calls this itself for its world labels, after re-zooming its
 * world camera.
 */
export function refreshTextResolution(scene: Phaser.Scene): void {
  const zoom = scene.cameras.main.zoom;
  const visit = (items: Phaser.GameObjects.GameObject[]): void => {
    for (const item of items) {
      if (item instanceof Phaser.GameObjects.Text) {
        if (autoResolutionTexts.has(item) && item.style.resolution !== zoom) {
          item.setResolution(zoom);
        }
      } else if (item instanceof Phaser.GameObjects.Container) {
        visit(item.list);
      }
    }
  };
  visit(scene.children.list);
}

/**
 * Resizes the game's canvas to suit the window and the player's render scale
 * setting. Uses setGameSize, not resize: the game runs in FIT scale mode, and
 * setGameSize is the call that refreshes the FIT layout and tells every scene's
 * camera about the new size. Also called when the browser window changes size.
 * If the canvas is already the right size it does nothing: Phaser's own window
 * listener has re-fitted the page layout, and resizing to the same size would
 * only clear the canvas and rebuild the lighting veil for no gain.
 */
export function applyRenderScale(game: Phaser.Game): void {
  const { width, height } = canvasSizeFor({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    renderScale: getSettings().renderScale,
  });
  if (width === game.scale.width && height === game.scale.height) return;
  game.scale.setGameSize(width, height);
}
