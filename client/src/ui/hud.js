// In-race heads-up display: a progress rail on the right showing the player and
// every opponent's position toward the finish, plus a timer and effect label.

import Phaser from 'phaser';
import { VIEW_WIDTH, VIEW_HEIGHT } from '@shared/constants.js';

const RAIL_X = VIEW_WIDTH - 18;
const RAIL_TOP = 70;
const RAIL_BOTTOM = VIEW_HEIGHT - 40;

export class Hud {
  constructor(scene, players, selfId) {
    this.scene = scene;
    this.selfId = selfId;
    this.markers = new Map(); // playerId -> { dot }

    // Top bar.
    scene.add.rectangle(0, 0, VIEW_WIDTH, 56, 0x10131a, 0.85).setOrigin(0).setDepth(20);
    this.timerText = scene.add
      .text(14, 14, '0.00', { fontFamily: 'monospace', fontSize: '26px', color: '#ffffff' })
      .setDepth(21);
    this.effectText = scene.add
      .text(VIEW_WIDTH / 2, 18, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#4aa8ff' })
      .setOrigin(0.5, 0)
      .setDepth(21);

    // Progress rail.
    scene.add.rectangle(RAIL_X, RAIL_TOP, 6, RAIL_BOTTOM - RAIL_TOP, 0x3a4150).setOrigin(0.5, 0).setDepth(20);
    scene.add.text(RAIL_X, RAIL_TOP - 16, '🏁', { fontSize: '14px' }).setOrigin(0.5).setDepth(21);

    for (const p of players) {
      const isSelf = p.id === this.selfId;
      const dot = scene.add
        .circle(RAIL_X, RAIL_BOTTOM, isSelf ? 7 : 5, isSelf ? 0x36d17a : 0xd1a04b)
        .setDepth(22)
        .setStrokeStyle(2, 0x0b0e13);
      this.markers.set(p.id, { dot, isSelf });
    }
  }

  setProgress(playerId, frac) {
    const m = this.markers.get(playerId);
    if (!m) return;
    const f = Phaser.Math.Clamp(frac, 0, 1);
    m.dot.y = RAIL_BOTTOM - (RAIL_BOTTOM - RAIL_TOP) * f;
  }

  setTimer(seconds) {
    this.timerText.setText(seconds.toFixed(2));
  }

  setEffect(label) {
    this.effectText.setText(label || '');
  }
}
