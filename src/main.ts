import '@fontsource/saira-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';

import Phaser from 'phaser';
import { PALETTE } from './config/palette';
import { BriefingScene } from './scenes/BriefingScene';
import { BuildingScene } from './scenes/BuildingScene';
import { ContractSelectScene } from './scenes/ContractSelectScene';
import { FieldOverlayScene } from './scenes/FieldOverlayScene';
import { HijackScene } from './scenes/HijackScene';
import { MenuScene } from './scenes/MenuScene';
import { PauseScene } from './scenes/PauseScene';
import { ReportScene } from './scenes/ReportScene';
import { SettingsScene } from './scenes/SettingsScene';
import { getSettings } from './state/settings';
import { applyRenderScale, installTextResolution } from './ui/uiCamera';
import { canvasSizeFor } from './ui/viewport';

/**
 * How long the browser window must stay still, in milliseconds, before the canvas
 * is re-fitted to its new size. Dragging a window edge fires a resize event
 * every frame, so we wait for the dragging to stop rather than resizing the
 * canvas dozens of times.
 */
const WINDOW_RESIZE_SETTLE_MS = 250;

/**
 * Canvas text cannot use a web font until the browser has finished loading it,
 * so wait for both families before the game boots. Falls through after a
 * short timeout rather than blocking the game on a slow font fetch.
 */
async function waitForFonts(): Promise<void> {
  const fonts = [
    document.fonts.load('600 48px "Saira Condensed"'),
    document.fonts.load('400 16px "IBM Plex Mono"'),
  ];
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000));
  await Promise.race([Promise.all(fonts), timeout]);
}

async function boot(): Promise<void> {
  await waitForFonts();

  // The canvas is sized in device pixels so text and lines stay sharp. Every
  // scene still lays out in 960 by 540 units; a fitted camera does the scaling.
  const { width, height } = canvasSizeFor({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    renderScale: getSettings().renderScale,
  });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width,
    height,
    backgroundColor: PALETTE.base,
    render: {
      pixelArt: true,
      roundPixels: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      // Flip debug to true to see Arcade's own collision boxes while tuning.
      arcade: { debug: false },
    },
    input: {
      gamepad: true,
    },
    // The kiosk boots first; it opens the contract schedule, which starts the
    // building. Pause and settings are overlays launched on top. Phaser draws
    // running scenes in this list's order, not the order they were launched,
    // so the field overlay (the building's HUD) sits straight after the
    // building and below pause, settings and the CCTV multiplexer.
    scene: [
      MenuScene,
      ContractSelectScene,
      BriefingScene,
      BuildingScene,
      FieldOverlayScene,
      ReportScene,
      PauseScene,
      SettingsScene,
      HijackScene,
    ],
  });

  // Scenes are created on a later tick, so the text wrapper is in place before
  // any text exists.
  installTextResolution();

  // Maximising or shrinking the browser window re-fits the canvas to the new
  // device-pixel size, instead of stretching the size it booted at.
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => applyRenderScale(game), WINDOW_RESIZE_SETTLE_MS);
  });

  // Dev-only handles for manual inspection. Stripped from production builds.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
    (window as unknown as { __settings: typeof getSettings }).__settings = getSettings;
  }
}

void boot();
