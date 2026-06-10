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
    this.hasShield = false;
    this.attackCharges = 0; // 0 | 1 — armed oil-bomb (see RaceScene / ATTACK)
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

  // A shield absorbs one crash. Doesn't stack: picking a second one is a no-op.
  activateShield() {
    this.hasShield = true;
  }

  // Returns 'crashed' | 'blocked' (shield absorbed it) | false (invulnerable).
  crash() {
    if (this.invulnMs > 0) return false; // ignore during grace period
    if (this.hasShield) {
      this.hasShield = false;
      this.invulnMs = INVULN_AFTER_CRASH_MS; // brief grace, no slowdown
      return 'blocked';
    }
    this.crashMs = CRASH_DURATION_MS;
    this.invulnMs = CRASH_DURATION_MS + INVULN_AFTER_CRASH_MS;
    this.nitroMs = 0;
    return 'crashed';
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
    let base = '';
    if (this.crashMs > 0) base = '💥 авария';
    else if (this.nitroMs > 0) base = '⚡ нитро';
    else if (this.oilMs > 0) base = '☣ занос';
    if (this.hasShield) base = base ? `${base} 🛡` : '🛡 щит';
    if (this.attackCharges > 0) base = base ? `${base} · 🚀 Space` : '🚀 Space';
    return base;
  }
}
