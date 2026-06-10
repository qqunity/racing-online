import Phaser from 'phaser';

// Loads the (CC0, Kenney.nl) sprite art used across the game, then hands off to
// the menu. Display sizing happens where each sprite is created (car.js,
// RaceScene) so the loaded art keeps the gameplay footprint regardless of its
// native resolution. See client/public/sprites/LICENSE-kenney.txt.
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.image('car-player', 'sprites/car-player.png');
    // Traffic comes in several colours; the variant is chosen deterministically
    // per car in RaceScene (see TRAFFIC_TEXTURES) so both players see the same.
    this.load.image('car-traffic', 'sprites/car-traffic.png');
    this.load.image('car-traffic-blue', 'sprites/car-traffic-blue.png');
    this.load.image('car-traffic-yellow', 'sprites/car-traffic-yellow.png');
    this.load.image('car-traffic-grey', 'sprites/car-traffic-grey.png');
    this.load.image('pu-nitro', 'sprites/nitro.png');
    this.load.image('pu-oil', 'sprites/oil.png');
  }

  create() {
    // Shield / attack power-ups have no Kenney art yet — generate simple
    // vector textures at boot. Display size is normalised via setDisplaySize
    // (POWERUP_SIZE) at spawn, same as the PNG power-ups.
    this.makeShieldTexture();
    this.makeAttackTexture();
    this.scene.start('Menu');
  }

  makeShieldTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x2a6fd6, 1);
    g.fillCircle(32, 32, 26);
    g.lineStyle(6, 0x9fd0ff, 1);
    g.strokeCircle(32, 32, 26);
    g.fillStyle(0xdff0ff, 1);
    g.fillCircle(32, 32, 10);
    g.generateTexture('pu-shield', 64, 64);
    g.destroy();
  }

  makeAttackTexture() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xd64545, 1);
    g.fillTriangle(32, 2, 20, 24, 44, 24); // nose cone
    g.fillStyle(0xe8e8e8, 1);
    g.fillRect(22, 24, 20, 26); // body
    g.fillStyle(0xd64545, 1);
    g.fillTriangle(22, 50, 8, 60, 22, 36); // left fin
    g.fillTriangle(42, 50, 56, 60, 42, 36); // right fin
    g.fillStyle(0xffb347, 1);
    g.fillTriangle(25, 52, 39, 52, 32, 63); // exhaust flame
    g.generateTexture('pu-attack', 64, 64);
    g.destroy();
  }
}
