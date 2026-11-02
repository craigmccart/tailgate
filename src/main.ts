import '@fontsource/saira-condensed/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';

import Phaser from 'phaser';
import { PALETTE } from './config/palette';
import { BriefingScene } from './scenes/BriefingScene';
import { BuildingScene } from './scenes/BuildingScene';
import { ContractSelectScene } from './scenes/ContractSelectScene';
import { HijackScene } from './scenes/HijackScene';
import { MenuScene } from './scenes/MenuScene';
import { PauseScene } from './scenes/PauseScene';
import { ReportScene } from './scenes/ReportScene';
import { SettingsScene } from './scenes/SettingsScene';
import { getSettings } from './state/settings';
import { installTextResolution } from './ui/uiCamera';
import { canvasSizeFor } from './ui/viewport';

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
    renderScale: 1,
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
    // building. Pause and settings are overlays launched on top.
    scene: [
      MenuScene,
      ContractSelectScene,
      BriefingScene,
      BuildingScene,
      ReportScene,
      PauseScene,
      SettingsScene,
      HijackScene,
    ],
  });

  // Scenes are created on a later tick, so the text wrapper is in place before
  // any text exists.
  installTextResolution();

  // Dev-only handles for manual inspection. Stripped from production builds.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
    (window as unknown as { __settings: typeof getSettings }).__settings = getSettings;
  }
}

void boot();
