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
import { socket, net, reportProgress, reportFinished } from '../net/socket.js';
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
    this.opponentDist = new Map();
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

    // Network: opponents' progress + final results.
    this.onOpp = ({ playerId, distance }) => {
      if (playerId === net.selfId) return;
      this.opponentDist.set(playerId, distance);
      this.hud.setProgress(playerId, distance / this.finishDistance);
    };
    this.onResults = ({ ranking, series }) => this.scene.start('Result', { ranking, series });
    socket.on('opponentProgress', this.onOpp);
    socket.on('raceResults', this.onResults);

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
      reportProgress(Math.round(this.distance));
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
      const crashed = this.effects.crash();
      if (crashed) {
        this.cameras.main.shake(180, 0.012);
        e.collected = true;
        if (e.sprite) {
          e.sprite.destroy();
          e.sprite = null;
        }
      }
    } else if (e.kind === ENTITY.NITRO) {
      this.effects.activateNitro();
      this.consume(e);
    } else if (e.kind === ENTITY.OIL) {
      this.effects.activateOil();
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
  }

  // ---- input --------------------------------------------------------------

  setupInput() {
    const left = () => this.effects.hasControl && this.player.steer(-1);
    const right = () => this.effects.hasControl && this.player.steer(1);
    this.input.keyboard.on('keydown-LEFT', left);
    this.input.keyboard.on('keydown-RIGHT', right);
    this.input.keyboard.on('keydown-A', left);
    this.input.keyboard.on('keydown-D', right);
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
    if (window.__GAME__ && window.__GAME__.scene === 'Race') {
      delete window.__GAME__;
    }
  }
}

// Traffic colour variants. Chosen per car by a hash of its (deterministic,
// shared) entity id, so every client paints the same car the same colour
// without touching shared track generation or the fairness fingerprint.
const TRAFFIC_TEXTURES = ['car-traffic', 'car-traffic-blue', 'car-traffic-yellow', 'car-traffic-grey'];

function textureFor(e) {
  if (e.kind === ENTITY.NITRO) return 'pu-nitro';
  if (e.kind === ENTITY.OIL) return 'pu-oil';
  // Knuth multiplicative hash to scramble consecutive ids into a varied mix.
  const idx = ((e.id * 2654435761) >>> 0) % TRAFFIC_TEXTURES.length;
  return TRAFFIC_TEXTURES[idx];
}
