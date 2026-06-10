// The player's car: a sprite with discrete lane targets and a smooth lateral
// tween between lanes. Forward motion is handled by the scene (the world
// scrolls); this class only owns lateral position and steering.

import Phaser from 'phaser';
import { LANES, LANE_CHANGE_MS, laneCenterX, CAR_W, CAR_H } from '@shared/constants.js';

export class PlayerCar {
  constructor(scene, lane, y) {
    this.scene = scene;
    this.lane = lane;
    this.sprite = scene.add
      .image(laneCenterX(lane), y, 'car-player')
      .setDisplaySize(CAR_W, CAR_H)
      .setDepth(5);
    this.laneTween = null;
  }

  get x() {
    return this.sprite.x;
  }

  get y() {
    return this.sprite.y;
  }

  // Move one lane left/right. dir = -1 | +1. Ignored if blocked (no control).
  steer(dir) {
    const target = Phaser.Math.Clamp(this.lane + dir, 0, LANES - 1);
    if (target === this.lane) return;
    this.lane = target;
    if (this.laneTween) this.laneTween.stop();
    this.laneTween = this.scene.tweens.add({
      targets: this.sprite,
      x: laneCenterX(this.lane),
      duration: LANE_CHANGE_MS,
      ease: 'Quad.easeOut',
    });
    // Slight tilt for feedback.
    this.scene.tweens.add({
      targets: this.sprite,
      angle: dir * 8,
      duration: LANE_CHANGE_MS,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  // During an oil spin-out we wobble uncontrollably.
  spinWobble(dtMs) {
    this.sprite.angle += dtMs * 0.9;
  }

  setBlinking(on) {
    this.sprite.alpha = on ? 0.5 : 1;
  }

  resetAngle() {
    this.sprite.angle = 0;
  }
}
