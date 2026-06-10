// Race lifecycle: the server is authoritative over when a race starts, the
// shared seed, and the final ranking. Per-frame simulation runs on each client
// (parallel lanes), but the server validates finish times and orders results.

import {
  COUNTDOWN_MS,
  FINISH_DISTANCE,
  MIN_PLAUSIBLE_FINISH_MS,
  LANES,
} from '../../shared/constants.js';

export class RaceManager {
  constructor(io) {
    this.io = io;
  }

  // Start a race in a room. Picks a seed, schedules the countdown, and tells
  // every client when (server clock) the race actually begins.
  start(room) {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const startAt = Date.now() + COUNTDOWN_MS;

    room.race = {
      seed,
      startAt,
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
    this.io.to(room.code).emit('raceResults', { ranking });
    room.race = null; // back to lobby
  }

  buildRanking(room) {
    const entries = [...room.race.progress.entries()].map(([id, p]) => {
      const player = room.players.get(id);
      return {
        id,
        name: player ? player.name : 'Player',
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
