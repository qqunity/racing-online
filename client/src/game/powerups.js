// Power-up / hazard effect bookkeeping for the player car.
// Tracks active timers and derives the resulting forward speed and whether the
// player currently has steering control.

import {
  BASE_SPEED,
  MIN_SPEED,
  NITRO_SPEED,
  OIL_SPEED,
  NITRO_DURATION_MS,
  OIL_DURATION_MS,
  CRASH_DURATION_MS,
  INVULN_AFTER_CRASH_MS,
} from '@shared/constants.js';

export class EffectState {
  constructor() {
    this.nitroMs = 0;
    this.oilMs = 0;
    this.crashMs = 0;
    this.invulnMs = 0;
  }

  activateNitro() {
    this.nitroMs = NITRO_DURATION_MS;
    // Nitro overrides an oil spin-out — a satisfying recovery.
    this.oilMs = 0;
  }

  activateOil() {
    if (this.nitroMs > 0) return; // nitro shields against oil
    this.oilMs = OIL_DURATION_MS;
  }

  crash() {
    if (this.invulnMs > 0) return false; // ignore during grace period
    this.crashMs = CRASH_DURATION_MS;
    this.invulnMs = CRASH_DURATION_MS + INVULN_AFTER_CRASH_MS;
    this.nitroMs = 0;
    return true;
  }

  // Advance all timers by dt (ms).
  tick(dtMs) {
    this.nitroMs = Math.max(0, this.nitroMs - dtMs);
    this.oilMs = Math.max(0, this.oilMs - dtMs);
    this.crashMs = Math.max(0, this.crashMs - dtMs);
    this.invulnMs = Math.max(0, this.invulnMs - dtMs);
  }

  get hasControl() {
    // Oil spin-out and a fresh crash both take away steering.
    return this.oilMs === 0 && this.crashMs === 0;
  }

  get isInvulnerable() {
    return this.invulnMs > 0;
  }

  // Current forward speed (metres/second) given the active effects.
  currentSpeed() {
    if (this.crashMs > 0) return MIN_SPEED;
    if (this.nitroMs > 0) return NITRO_SPEED;
    if (this.oilMs > 0) return OIL_SPEED;
    return BASE_SPEED;
  }

  // Short label for the HUD.
  label() {
    if (this.crashMs > 0) return '💥 авария';
    if (this.nitroMs > 0) return '⚡ нитро';
    if (this.oilMs > 0) return '☣ занос';
    return '';
  }
}
