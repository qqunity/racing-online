import Phaser from 'phaser';
import { VIEW_WIDTH, VIEW_HEIGHT } from '@shared/constants.js';

import BootScene from './scenes/BootScene.js';
import MenuScene from './scenes/MenuScene.js';
import LobbyScene from './scenes/LobbyScene.js';
import RaceScene from './scenes/RaceScene.js';
import ResultScene from './scenes/ResultScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_WIDTH,
  height: VIEW_HEIGHT,
  backgroundColor: '#2b2f3a',
  pixelArt: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, MenuScene, LobbyScene, RaceScene, ResultScene],
};

// eslint-disable-next-line no-new
const game = new Phaser.Game(config);

// Expose for E2E test hooks (read-only diagnostics + auto-finish).
window.__PHASER_GAME__ = game;
