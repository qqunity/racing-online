import Phaser from 'phaser';
import {
  VIEW_WIDTH,
  VIEW_HEIGHT,
  ROAD_MARGIN,
  LANE_WIDTH,
  LANES,
  ENTITY,
  PROGRESS_TICK_MS,
  laneCenterX,
  CAR_W,
  CAR_H,
  POWERUP_SIZE,
} from '@shared/constants.js';
import { generateTrack, trackFingerprint } from '@shared/track.js';
import {
  socket,
  net,
  reportProgress,
  reportFinished,
  useAttack as sendAttack,
} from '../net/socket.js';
import { PlayerCar } from '../game/car.js';
import { EffectState } from '../game/powerups.js';
import { Hud } from '../ui/hud.js';

// How many screen pixels one metre of forward travel maps to.
const PX_PER_METRE = 1.4;
const PLAYER_Y = VIEW_HEIGHT - 130;
const STRIPE_SPACING = 64;

export default class RaceScene extends Phaser.Scene {
  constructor() {
    super('Race');
  }

  init(cfg) {
    this.seed = cfg.seed >>> 0;
    this.finishDistance = cfg.finishDistance;
    this.countdownMs = cfg.countdownMs;
    this.startAt = cfg.startAt; // server epoch ms

    this.distance = 0;
    this.phase = 'countdown'; // countdown -> racing -> finished
    this.raceClockMs = 0;
    this.sinceProgress = 0;
    this.finished = false;
    this._autoFinish = false;
    this.scrollPx = 0;
    // playerId -> { sprite, nameText, shownDist, targetDist, lane, name }
    this.ghosts = new Map();
    // Attack pickup state: which entity armed the (single) charge.
    this.attackEntityId = null;
    this.attackedCount = 0; // 'attacked' events seen (any target) — test hook
    this.lastAttack = null; // { targetId, attackerId, attackerName }
  }

  create() {
    this.effects = new EffectState();
    this.drawRoad();

    // Deterministic, shared layout from the seed.
    this.track = generateTrack(this.seed).map((e) => ({ ...e, sprite: null, collected: false }));

    this.player = new PlayerCar(this, Math.floor(LANES / 2), PLAYER_Y);
    this.hud = new Hud(this, net.players, net.selfId);

    this.setupInput();
    this.buildCountdownText();

    // Network: opponents' progress (HUD + on-track ghosts) + final results.
    this.onOpp = ({ playerId, distance, lane }) => {
      if (playerId === net.selfId) return;
      const g = this.ensureGhost(playerId);
      g.targetDist = distance;
      if (Number.isInteger(lane)) g.lane = lane;
      this.hud.setProgress(playerId, distance / this.finishDistance);
    };
    this.onResults = ({ ranking }) => this.scene.start('Result', { ranking });
    this.onPlayerLeft = ({ playerId }) => this.removeGhost(playerId);
    this.onAttacked = ({ targetId, attackerId, attackerName }) => {
      this.attackedCount += 1;
      this.lastAttack = { targetId, attackerId, attackerName };
      if (targetId === net.selfId) {
        this.effects.activateOil();
        this.showToast(`🛢 Атака от ${attackerName}!`, '#ff6b6b');
      } else if (attackerId === net.selfId) {
        this.showToast('🚀 Бомба пошла!', '#ffb347');
      } else {
        this.showToast(`🚀 ${attackerName} атакует!`, '#9aa3b2');
      }
    };
    socket.on('opponentProgress', this.onOpp);
    socket.on('raceResults', this.onResults);
    socket.on('playerLeft', this.onPlayerLeft);
    socket.on('attacked', this.onAttacked);

    this.exposeTestHooks();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  update(time, delta) {
    if (this.phase === 'countdown') {
      this.updateCountdown();
      return;
    }
    if (this.phase !== 'racing') return;

    this.effects.tick(delta);

    // Test hook: jump straight to the finish line.
    if (this._autoFinish) {
      this.distance = this.finishDistance;
    } else {
      const speed = this.effects.currentSpeed(); // metres/sec
      this.distance += (speed * delta) / 1000;
    }
    this.raceClockMs += delta;

    this.scrollRoad(delta);
    this.layoutEntities();
    this.updateGhosts(delta);
    this.handleCollisions();
    this.applyEffectVisuals(delta);

    // HUD.
    this.hud.setTimer(this.raceClockMs / 1000);
    this.hud.setProgress(net.selfId, this.distance / this.finishDistance);
    this.hud.setEffect(this.effects.label());

    // Periodic progress report to the server.
    this.sinceProgress += delta;
    if (this.sinceProgress >= PROGRESS_TICK_MS) {
      this.sinceProgress = 0;
      reportProgress(Math.round(this.distance), this.player.lane);
    }

    if (this.distance >= this.finishDistance && !this.finished) {
      this.crossFinish();
    }
  }

  // ---- countdown ----------------------------------------------------------

  buildCountdownText() {
    this.countdownText = this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, '', {
        fontFamily: 'sans-serif',
        fontSize: '120px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30);
  }

  updateCountdown() {
    const remaining = this.startAt - Date.now();
    if (remaining <= 0) {
      this.countdownText.setText('GO!');
      this.time.delayedCall(500, () => this.countdownText.setText(''));
      this.phase = 'racing';
      return;
    }
    this.countdownText.setText(String(Math.ceil(remaining / 1000)));
  }

  // ---- road ---------------------------------------------------------------

  drawRoad() {
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x3a7d34).setOrigin(0); // grass
    this.add
      .rectangle(ROAD_MARGIN, 0, VIEW_WIDTH - ROAD_MARGIN * 2, VIEW_HEIGHT, 0x2a2d34)
      .setOrigin(0); // asphalt
    // Solid edge lines.
    this.add.rectangle(ROAD_MARGIN, 0, 4, VIEW_HEIGHT, 0xf0d050).setOrigin(0);
    this.add.rectangle(VIEW_WIDTH - ROAD_MARGIN - 4, 0, 4, VIEW_HEIGHT, 0xf0d050).setOrigin(0);

    // Dashed lane dividers (scroll to convey speed).
    this.stripes = [];
    const rows = Math.ceil(VIEW_HEIGHT / STRIPE_SPACING) + 2;
    for (let lane = 1; lane < LANES; lane++) {
      const x = ROAD_MARGIN + LANE_WIDTH * lane;
      for (let r = 0; r < rows; r++) {
        const rect = this.add.rectangle(x, 0, 4, 30, 0xdfe3ea).setOrigin(0.5, 0).setDepth(1);
        this.stripes.push({ rect, base: r * STRIPE_SPACING });
      }
    }
  }

  scrollRoad(delta) {
    const speed = this.effects.currentSpeed();
    this.scrollPx = (this.scrollPx + (speed * delta) / 1000 * PX_PER_METRE) % STRIPE_SPACING;
    const total = VIEW_HEIGHT + STRIPE_SPACING;
    for (const s of this.stripes) {
      s.rect.y = ((s.base + this.scrollPx) % total) - STRIPE_SPACING;
    }
  }

  // ---- entities -----------------------------------------------------------

  layoutEntities() {
    for (const e of this.track) {
      if (e.collected) continue;
      const screenY = PLAYER_Y - (e.dist - this.distance) * PX_PER_METRE;
      const visible = screenY > -60 && screenY < VIEW_HEIGHT + 60;
      if (visible && !e.sprite) {
        e.sprite = this.add.image(laneCenterX(e.lane), screenY, textureFor(e)).setDepth(4);
        if (e.kind === ENTITY.TRAFFIC) {
          e.sprite.setDisplaySize(CAR_W, CAR_H);
        } else {
          e.sprite.setDisplaySize(POWERUP_SIZE, POWERUP_SIZE);
        }
      }
      if (e.sprite) {
        e.sprite.y = screenY;
        if (screenY > VIEW_HEIGHT + 60) {
          // Passed below the player — gone for good.
          e.sprite.destroy();
          e.sprite = null;
          e.collected = true;
        }
      }
    }
  }

  // ---- opponent ghosts ------------------------------------------------------
  // Translucent cars showing where the opponents are on the track. Purely
  // visual: ghosts never collide (handleCollisions walks this.track only).

  ensureGhost(playerId) {
    let g = this.ghosts.get(playerId);
    if (g) return g;
    const player = net.players.find((p) => p.id === playerId);
    const name = player ? player.name : 'Player';
    const startLane = Math.floor(LANES / 2);
    const sprite = this.add
      .image(laneCenterX(startLane), VIEW_HEIGHT + 200, 'car-player')
      .setDisplaySize(CAR_W, CAR_H)
      .setAlpha(0.35)
      .setTint(ghostTint(playerId))
      .setDepth(3) // below traffic (4) and the player (5)
      .setVisible(false);
    const nameText = this.add
      .text(sprite.x, sprite.y, name, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#dfe3ea',
      })
      .setOrigin(0.5, 1)
      .setAlpha(0.8)
      .setDepth(3)
      .setVisible(false);
    g = { sprite, nameText, shownDist: 0, targetDist: 0, lane: startLane, name };
    this.ghosts.set(playerId, g);
    return g;
  }

  removeGhost(playerId) {
    const g = this.ghosts.get(playerId);
    if (!g) return;
    g.sprite.destroy();
    g.nameText.destroy();
    this.ghosts.delete(playerId);
  }

  updateGhosts(delta) {
    const k = Math.min(1, delta / 150);
    for (const g of this.ghosts.values()) {
      // Smooth out the ~100ms network ticks.
      g.shownDist += (g.targetDist - g.shownDist) * k;
      const screenY = PLAYER_Y - (g.shownDist - this.distance) * PX_PER_METRE;
      const visible = screenY > -60 && screenY < VIEW_HEIGHT + 60;
      g.sprite.setVisible(visible);
      g.nameText.setVisible(visible);
      if (!visible) continue;
      g.sprite.x += (laneCenterX(g.lane) - g.sprite.x) * k;
      g.sprite.y = screenY;
      g.nameText.x = g.sprite.x;
      g.nameText.y = screenY - CAR_H / 2 - 6;
    }
  }

  handleCollisions() {
    for (const e of this.track) {
      if (e.collected || !e.sprite) continue;
      const dy = Math.abs(e.sprite.y - PLAYER_Y);
      const dx = Math.abs(e.sprite.x - this.player.x);
      if (dy < CAR_H * 0.55 && dx < LANE_WIDTH * 0.6) {
        this.interact(e);
      }
    }
  }

  interact(e) {
    if (e.kind === ENTITY.TRAFFIC) {
      const result = this.effects.crash(); // 'crashed' | 'blocked' | false
      if (result === 'crashed') {
        this.cameras.main.shake(180, 0.012);
        this.consume(e);
      } else if (result === 'blocked') {
        // The shield ate the hit: the traffic car is gone, just a light bump.
        this.cameras.main.shake(90, 0.006);
        this.consume(e);
      }
    } else if (e.kind === ENTITY.NITRO) {
      this.effects.activateNitro();
      this.consume(e);
    } else if (e.kind === ENTITY.OIL) {
      this.effects.activateOil();
      this.consume(e);
    } else if (e.kind === ENTITY.SHIELD) {
      this.effects.activateShield();
      this.consume(e);
    } else if (e.kind === ENTITY.ATTACK) {
      this.effects.attackCharges = 1;
      this.attackEntityId = e.id;
      this.consume(e);
    }
  }

  consume(e) {
    e.collected = true;
    if (e.sprite) {
      e.sprite.destroy();
      e.sprite = null;
    }
  }

  // ---- effects visuals ----------------------------------------------------

  applyEffectVisuals(delta) {
    if (this.effects.oilMs > 0) {
      this.player.spinWobble(delta);
    } else {
      this.player.resetAngle();
    }
    this.player.setBlinking(this.effects.isInvulnerable && Math.floor(this.time.now / 100) % 2 === 0);
    this.player.setShieldVisible(this.effects.hasShield);
  }

  // ---- input --------------------------------------------------------------

  setupInput() {
    const left = () => this.effects.hasControl && this.player.steer(-1);
    const right = () => this.effects.hasControl && this.player.steer(1);
    this.input.keyboard.on('keydown-LEFT', left);
    this.input.keyboard.on('keydown-RIGHT', right);
    this.input.keyboard.on('keydown-A', left);
    this.input.keyboard.on('keydown-D', right);
    this.input.keyboard.on('keydown-SPACE', () => this.fireAttack());
  }

  // Spend the armed attack charge: the server validates and picks the target.
  fireAttack() {
    if (this.phase !== 'racing') return;
    if (this.effects.attackCharges <= 0 || this.attackEntityId === null) return;
    this.effects.attackCharges = 0;
    const entityId = this.attackEntityId;
    this.attackEntityId = null;
    sendAttack(entityId);
  }

  // Short transient message floating above the player car.
  showToast(text, color = '#ffffff') {
    const toast = this.add
      .text(VIEW_WIDTH / 2, PLAYER_Y - CAR_H * 1.4, text, {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color,
        fontStyle: 'bold',
        stroke: '#10131a',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(25);
    this.tweens.add({
      targets: toast,
      y: toast.y - 50,
      alpha: 0,
      duration: 1600,
      ease: 'Quad.easeOut',
      onComplete: () => toast.destroy(),
    });
  }

  // ---- finish -------------------------------------------------------------

  crossFinish() {
    this.finished = true;
    this.distance = this.finishDistance;
    reportFinished(Math.round(this.raceClockMs));
    this.add
      .text(VIEW_WIDTH / 2, VIEW_HEIGHT / 2, 'ФИНИШ!', {
        fontFamily: 'sans-serif',
        fontSize: '64px',
        color: '#36d17a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.phase = 'finished';
  }

  // ---- test hooks ---------------------------------------------------------

  exposeTestHooks() {
    const self = this;
    window.__GAME__ = {
      scene: 'Race',
      seed: this.seed,
      finishDistance: this.finishDistance,
      track: this.track.map((e) => ({ id: e.id, dist: e.dist, lane: e.lane, kind: e.kind })),
      fingerprint: trackFingerprint(this.track),
      get phase() {
        return self.phase;
      },
      get distance() {
        return self.distance;
      },
      get lane() {
        return self.player.lane;
      },
      get ghosts() {
        return [...self.ghosts.entries()].map(([id, g]) => ({
          id,
          name: g.name,
          distance: g.shownDist,
          lane: g.lane,
          visible: g.sprite.visible,
        }));
      },
      get effects() {
        const fx = self.effects;
        return {
          hasShield: fx.hasShield,
          attackCharges: fx.attackCharges,
          oilMs: fx.oilMs,
          crashMs: fx.crashMs,
          invulnMs: fx.invulnMs,
          nitroMs: fx.nitroMs,
          label: fx.label(),
        };
      },
      get attackedCount() {
        return self.attackedCount;
      },
      get lastAttack() {
        return self.lastAttack
          ? { ...self.lastAttack, wasSelf: self.lastAttack.targetId === net.selfId }
          : null;
      },
      // Collect a specific track entity through the real interact() code-path.
      forceCollect(entityId) {
        const e = self.track.find((x) => x.id === entityId);
        if (!e || e.collected) return false;
        self.interact(e);
        return true;
      },
      // Drive the traffic-collision branch without an actual sprite overlap.
      simulateCrash() {
        self.interact({ kind: ENTITY.TRAFFIC, collected: false, sprite: null });
      },
      // Press the attack button through the real code-path (SPACE handler).
      useAttack() {
        self.fireAttack();
      },
      // Raw network send, bypassing the client-side charge bookkeeping —
      // lets tests poke the server-side validation (replay, cooldown).
      _rawUseAttack(entityId) {
        sendAttack(entityId);
      },
      // Teleport forward (monotonic) — keeps E2E independent of where the
      // guaranteed pickups landed on this seed's track.
      setDistance(d) {
        if (Number.isFinite(d)) self.distance = Math.max(self.distance, d);
      },
      // Teleport to the finish line for deterministic E2E tests.
      autoFinish() {
        self.phase = 'racing';
        self._autoFinish = true;
      },
    };
  }

  cleanup() {
    socket.off('opponentProgress', this.onOpp);
    socket.off('raceResults', this.onResults);
    socket.off('playerLeft', this.onPlayerLeft);
    socket.off('attacked', this.onAttacked);
    if (window.__GAME__ && window.__GAME__.scene === 'Race') {
      delete window.__GAME__;
    }
  }
}

// Traffic colour variants. Chosen per car by a hash of its (deterministic,
// shared) entity id, so every client paints the same car the same colour
// without touching shared track generation or the fairness fingerprint.
const TRAFFIC_TEXTURES = ['car-traffic', 'car-traffic-blue', 'car-traffic-yellow', 'car-traffic-grey'];

// Ghost tints: a stable colour per opponent, hashed from the (string) playerId
// — same idea as textureFor's id hash, adapted for socket ids.
const GHOST_TINTS = [0xff6b6b, 0x4aa8ff, 0xf0d050, 0x9b6bff, 0x36d17a, 0xff9f43];

function ghostTint(playerId) {
  let h = 0;
  const s = String(playerId);
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return GHOST_TINTS[((h * 2654435761) >>> 0) % GHOST_TINTS.length];
}

function textureFor(e) {
  if (e.kind === ENTITY.NITRO) return 'pu-nitro';
  if (e.kind === ENTITY.OIL) return 'pu-oil';
  if (e.kind === ENTITY.SHIELD) return 'pu-shield';
  if (e.kind === ENTITY.ATTACK) return 'pu-attack';
  // Knuth multiplicative hash to scramble consecutive ids into a varied mix.
  const idx = ((e.id * 2654435761) >>> 0) % TRAFFIC_TEXTURES.length;
  return TRAFFIC_TEXTURES[idx];
}
