// Race lifecycle: the server is authoritative over when a race starts, the
// shared seed, and the final ranking. Per-frame simulation runs on each client
// (parallel lanes), but the server validates finish times and orders results.

import {
  COUNTDOWN_MS,
  FINISH_DISTANCE,
  FINISH_GRACE_MS,
  MIN_PLAUSIBLE_FINISH_MS,
  LANES,
  ENTITY,
  ATTACK_COOLDOWN_MS,
} from '../../shared/constants.js';
import { generateTrack } from '../../shared/track.js';

export class RaceManager {
  constructor(io, storage = null) {
    this.io = io;
    this.storage = storage; // optional persistence for stats/leaderboards
  }

  // Start a race in a room. Picks a seed (unless one is forced, e.g. the daily
  // challenge), schedules the countdown, and tells every client when (server
  // clock) the race actually begins.
  start(room, opts = {}) {
    const seed = opts.seed !== undefined ? opts.seed >>> 0 : (Math.random() * 0xffffffff) >>> 0;
    const mode = opts.mode || room.mode || 'multi';
    const startAt = Date.now() + COUNTDOWN_MS;

    room.race = {
      seed,
      startAt,
      mode,
      // Fixed at start so a UTC-midnight rollover mid-race can't move the
      // result onto the wrong day's board.
      dateKey: opts.dateKey ?? null,
      finishDistance: FINISH_DISTANCE,
      // Server-side copy of the deterministic track — used to validate attacks.
      track: generateTrack(seed),
      // playerId -> { distance, finished, timeMs }
      progress: new Map(),
      finishOrder: [], // playerIds in finish order
      attacksUsed: new Map(), // playerId -> Set<entityId> (one shot per pickup)
      lastAttackAt: new Map(), // playerId -> epoch ms (cooldown)
      done: false,
    };

    for (const id of room.players.keys()) {
      room.race.progress.set(id, { distance: 0, finished: false, timeMs: null });
    }

    this.io.to(room.code).emit('raceStarting', {
      seed,
      finishDistance: FINISH_DISTANCE,
      countdownMs: COUNTDOWN_MS,
      startAt,
      mode,
    });
  }

  // A client reports its current distance + lane. Broadcast to opponents for
  // the HUD progress rail and the on-track ghost cars.
  updateProgress(room, socketId, distance, lane) {
    if (!room.race || room.race.done) return;
    const p = room.race.progress.get(socketId);
    if (!p || p.finished) return;
    p.distance = Math.max(p.distance, distance); // monotonic
    const safeLane = Number.isFinite(lane)
      ? Math.min(LANES - 1, Math.max(0, Math.round(lane)))
      : 0;
    p.lane = safeLane;
    socketIoBroadcastProgress(this.io, room, socketId, p.distance, safeLane);
  }

  // A player fires an oil-bomb (collected from an ATTACK pickup) at the nearest
  // opponent ahead. The server validates everything it can: the pickup really
  // exists on this race's track, the attacker plausibly reached it, each pickup
  // fires at most once per player, and attacks respect a cooldown.
  useAttack(room, socketId, entityId) {
    const race = room.race;
    if (!race || race.done) return;
    const attacker = race.progress.get(socketId);
    if (!attacker || attacker.finished) return;

    const entity = race.track.find((e) => e.id === entityId);
    if (!entity || entity.kind !== ENTITY.ATTACK) return;

    let used = race.attacksUsed.get(socketId);
    if (!used) {
      used = new Set();
      race.attacksUsed.set(socketId, used);
    }
    if (used.has(entityId)) return; // one shot per pickup

    // Plausibility: the attacker must have actually driven up to the pickup.
    if (attacker.distance < entity.dist - 250) return;

    const now = Date.now();
    if (now - (race.lastAttackAt.get(socketId) || 0) < ATTACK_COOLDOWN_MS) return;

    // The charge is spent from here on, even if there is no one to hit.
    used.add(entityId);
    race.lastAttackAt.set(socketId, now);

    // Target: nearest non-finished opponent strictly ahead, still in the room.
    let targetId = null;
    let best = Infinity;
    for (const [id, p] of race.progress) {
      if (id === socketId || p.finished || !room.players.has(id)) continue;
      if (p.distance > attacker.distance && p.distance < best) {
        best = p.distance;
        targetId = id;
      }
    }
    if (!targetId) return; // nobody ahead — the bomb fizzles

    const attackerPlayer = room.players.get(socketId);
    this.io.to(room.code).emit('attacked', {
      targetId,
      attackerId: socketId,
      attackerName: attackerPlayer ? attackerPlayer.name : 'Player',
    });
  }

  // A client reports it crossed the finish line.
  finish(room, socketId, timeMs) {
    if (!room.race || room.race.done) return;
    const p = room.race.progress.get(socketId);
    if (!p || p.finished) return;

    // Basic anti-cheat: reject implausibly fast finishes.
    const safeTime = Number.isFinite(timeMs) ? timeMs : Infinity;
    const accepted = safeTime >= MIN_PLAUSIBLE_FINISH_MS ? safeTime : MIN_PLAUSIBLE_FINISH_MS;

    p.finished = true;
    p.timeMs = accepted;
    p.distance = room.race.finishDistance;
    room.race.finishOrder.push(socketId);

    // Race ends when every connected player has finished…
    const allFinished = [...room.race.progress.values()].every((x) => x.finished);
    if (allFinished) {
      this.endRace(room);
      return;
    }

    // …or FINISH_GRACE_MS after the first finisher. A backgrounded tab freezes
    // its game loop and would otherwise stall the race for everyone forever.
    if (!room.race.graceTimer) {
      const race = room.race;
      race.graceTimer = setTimeout(() => {
        if (room.race === race) this.endRace(room);
      }, FINISH_GRACE_MS);
      race.graceTimer.unref?.();
    }
  }

  // Force-end (e.g. the only remaining racer finished, or everyone left).
  endRace(room) {
    if (!room.race || room.race.done) return;
    room.race.done = true;
    if (room.race.graceTimer) clearTimeout(room.race.graceTimer);

    const ranking = this.buildRanking(room);
    const isDaily = room.race.mode === 'daily';

    if (isDaily) {
      // Daily challenge: record finish times on the day's board only —
      // lifetime races/wins are not affected by solo daily runs.
      const dateKey = room.race.dateKey;
      if (this.storage && dateKey) {
        for (const e of ranking) {
          if (e.finished && e.playerId) {
            this.storage.recordDailyResult(dateKey, {
              playerId: e.playerId,
              name: e.name,
              timeMs: e.timeMs,
            });
          }
        }
      }
      this.io.to(room.code).emit('raceResults', {
        ranking,
        mode: 'daily',
        daily: {
          dateKey,
          top: this.storage ? this.storage.getDaily(dateKey, 10) : [],
        },
      });
    } else {
      // Серия реваншей: победителю (если он финишировал и ещё в комнате) +1.
      const winner = ranking[0];
      if (winner && winner.finished) {
        const player = room.players.get(winner.id);
        if (player) player.seriesWins += 1;
      }

      // Persist lifetime stats for multiplayer races with at least two
      // participants (solo runs don't count).
      if (this.storage && ranking.length >= 2) {
        for (const e of ranking) {
          if (!e.playerId) continue; // unknown identity — nothing to attribute
          this.storage.recordRaceResult({
            playerId: e.playerId,
            name: e.name,
            won: e.place === 1 && e.finished,
            finished: e.finished,
            timeMs: e.timeMs,
          });
        }
      }
      this.io
        .to(room.code)
        .emit('raceResults', { ranking, mode: 'multi', series: room.playerList() });
    }

    room.race = null; // back to lobby
  }

  buildRanking(room) {
    const entries = [...room.race.progress.entries()].map(([id, p]) => {
      const player = room.players.get(id);
      return {
        id,
        name: player ? player.name : 'Player',
        playerId: player ? player.playerId : null,
        finished: p.finished,
        timeMs: p.timeMs,
        distance: p.distance,
      };
    });

    // Finishers first (by time), then non-finishers by distance covered.
    entries.sort((a, b) => {
      if (a.finished && b.finished) return a.timeMs - b.timeMs;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.distance - a.distance;
    });

    return entries.map((e, i) => ({ ...e, place: i + 1 }));
  }
}

function socketIoBroadcastProgress(io, room, socketId, distance, lane) {
  // Send to everyone in the room except the reporter.
  io.to(room.code).emit('opponentProgress', { playerId: socketId, distance, lane });
}
