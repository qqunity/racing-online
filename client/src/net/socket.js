// Thin wrapper around socket.io-client. A single shared connection used across
// all scenes. Same-origin in both dev (via Vite proxy) and prod (server serves
// the static client), so io() needs no explicit URL.

import { io } from 'socket.io-client';

export const socket = io({ autoConnect: true });

// Tracks the room we're currently in, for convenience across scenes.
export const net = {
  socket,
  code: null,
  selfId: null,
  players: [],
  hostId: null,
  lastRaceConfig: null, // { seed, finishDistance, countdownMs, startAt }
};

socket.on('connect', () => {
  net.selfId = socket.id;
});

// Stable identity for stats/leaderboards, persisted in localStorage so it
// survives reconnects and page reloads (unlike socket.id).
export function getPlayerId() {
  let id = localStorage.getItem('racing.playerId');
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem('racing.playerId', id);
  }
  return id;
}

export function createRoom(name) {
  socket.emit('createRoom', { name, playerId: getPlayerId() });
}

export function joinRoom(code, name) {
  socket.emit('joinRoom', { code: (code || '').toUpperCase(), name, playerId: getPlayerId() });
}

export function startRace() {
  socket.emit('startRace');
}

// Daily challenge: solo room on today's fixed seed; server replies with
// raceStarting directly (no roomCreated/lobby step).
export function startDaily(name) {
  socket.emit('startDaily', { name, playerId: getPlayerId() });
}

export function reportProgress(distance, lane) {
  socket.emit('progress', { distance, lane });
}

export function reportFinished(timeMs) {
  socket.emit('finished', { timeMs });
}

// Fire the collected attack pickup (oil-bomb) — server picks the target.
export function useAttack(entityId) {
  socket.emit('useAttack', { entityId });
}

export function leaveRoom() {
  socket.emit('leaveRoom');
  net.code = null;
}
