import Phaser from 'phaser';
import { LANE_WIDTH } from '@shared/constants.js';

// Generates simple placeholder textures procedurally (no external art assets),
// then hands off to the menu.
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const carW = Math.floor(LANE_WIDTH * 0.62);
    const carH = Math.floor(carW * 1.7);

    this.makeCar('car-player', carW, carH, 0x36d17a, 0x1f8f50);
    this.makeCar('car-traffic', carW, carH, 0xd14b4b, 0x8f2f2f);
    this.makeCircle('pu-nitro', carW, 0x4aa8ff, '⚡');
    this.makeCircle('pu-oil', carW, 0x222222, '☣');

    this.scene.start('Menu');
  }

  // A rounded-ish car body with a darker cabin stripe.
  makeCar(key, w, h, body, cabin) {
    const g = this.add.graphics();
    g.fillStyle(body, 1);
    g.fillRoundedRect(0, 0, w, h, 6);
    g.fillStyle(cabin, 1);
    g.fillRoundedRect(w * 0.18, h * 0.18, w * 0.64, h * 0.28, 3); // windshield
    g.fillRoundedRect(w * 0.18, h * 0.6, w * 0.64, h * 0.22, 3); // rear window
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeCircle(key, d, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(d / 2, d / 2, d / 2);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeCircle(d / 2, d / 2, d / 2 - 2);
    g.generateTexture(key, d, d);
    g.destroy();
  }
}
