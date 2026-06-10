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
    this.scene.start('Menu');
  }
}
