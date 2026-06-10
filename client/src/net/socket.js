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

export function createRoom(name) {
  socket.emit('createRoom', { name });
}

export function joinRoom(code, name) {
  socket.emit('joinRoom', { code: (code || '').toUpperCase(), name });
}

export function startRace() {
  socket.emit('startRace');
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
