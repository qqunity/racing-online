// Race lifecycle: the server is authoritative over when a race starts, the
// shared seed, and the final ranking. Per-frame simulation runs on each client
// (parallel lanes), but the server validates finish times and orders results.

import {
  COUNTDOWN_MS,
  FINISH_DISTANCE,
  MIN_PLAUSIBLE_FINISH_MS,
} from '../../shared/constants.js';

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
      // playerId -> { distance, finished, timeMs }
      progress: new Map(),
      finishOrder: [], // playerIds in finish order
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

  // A client reports its current distance. Broadcast to opponents for the HUD.
  updateProgress(room, socketId, distance) {
    if (!room.race || room.race.done) return;
    const p = room.race.progress.get(socketId);
    if (!p || p.finished) return;
    p.distance = Math.max(p.distance, distance); // monotonic
    socketIoBroadcastProgress(this.io, room, socketId, p.distance);
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

    // Race ends when every connected player has finished.
    const allFinished = [...room.race.progress.values()].every((x) => x.finished);
    if (allFinished) {
      this.endRace(room);
    }
  }

  // Force-end (e.g. the only remaining racer finished, or everyone left).
  endRace(room) {
    if (!room.race || room.race.done) return;
    room.race.done = true;

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
      this.io.to(room.code).emit('raceResults', { ranking, mode: 'multi' });
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

function socketIoBroadcastProgress(io, room, socketId, distance) {
  // Send to everyone in the room except the reporter.
  io.to(room.code).emit('opponentProgress', { playerId: socketId, distance });
}
