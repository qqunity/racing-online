// Entry point: Express HTTP server + Socket.IO realtime layer.
// In production it also serves the built Phaser client (client/dist) so the
// whole game runs from a single origin/port — no CORS, websocket same host.

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';

import { RoomManager } from './rooms.js';
import { RaceManager } from './raceManager.js';
import { Storage } from './storage.js';
import { PROGRESS_TICK_MS } from '../../shared/constants.js';
import { dailyDateKey, dailySeed } from '../../shared/daily.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
// Stats live in a JSON file; override the path via DATA_FILE (tests do).
const DATA_FILE = path.resolve(
  process.env.DATA_FILE || path.resolve(__dirname, '../../data/stats.json'),
);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // In dev the Vite server proxies to us, so any origin is fine.
  cors: { origin: true },
});

const rooms = new RoomManager();
const storage = new Storage(DATA_FILE);
const races = new RaceManager(io, storage);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// REST: read-only leaderboards (must be registered before the static catch-all).
app.get('/api/leaderboard', (_req, res) => {
  res.json({ top: storage.getLeaderboard(10) });
});

app.get('/api/daily', (_req, res) => {
  const dateKey = dailyDateKey();
  res.json({ dateKey, seed: dailySeed(dateKey), top: storage.getDaily(dateKey, 10) });
});

// Serve the built client when it exists (production / docker).
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

io.on('connection', (socket) => {
  socket.data.name = 'Player';
  socket.data.playerId = null;

  socket.on('createRoom', ({ name, playerId } = {}) => {
    leaveCurrentRoom(socket); // safety: one room at a time
    socket.data.name = name || 'Player';
    socket.data.playerId = sanitizePlayerId(playerId) ?? socket.data.playerId;
    const room = rooms.createRoom(socket.id, socket.data.name, socket.data.playerId);
    socket.join(room.code);
    socket.emit('roomCreated', { code: room.code, players: room.playerList() });
    io.to(room.code).emit('roomUpdate', { players: room.playerList(), hostId: room.hostId });
  });

  socket.on('joinRoom', ({ code, name, playerId } = {}) => {
    const room = rooms.getRoom(code);
    if (!room) return socket.emit('joinError', { msg: 'Комната не найдена' });
    if (room.mode === 'daily') return socket.emit('joinError', { msg: 'Комната не найдена' });
    if (room.race) return socket.emit('joinError', { msg: 'Гонка уже идёт' });
    if (room.isFull()) return socket.emit('joinError', { msg: 'Комната заполнена' });

    leaveCurrentRoom(socket);
    socket.data.name = name || 'Player';
    socket.data.playerId = sanitizePlayerId(playerId) ?? socket.data.playerId;
    room.addPlayer(socket.id, socket.data.name, socket.data.playerId);
    socket.join(room.code);
    socket.emit('roomJoined', { code: room.code, players: room.playerList(), hostId: room.hostId });
    io.to(room.code).emit('roomUpdate', { players: room.playerList(), hostId: room.hostId });
  });

  // Daily challenge: a private single-player room racing today's fixed seed.
  // No lobby — the race starts immediately, the client waits for raceStarting.
  socket.on('startDaily', ({ name, playerId } = {}) => {
    leaveCurrentRoom(socket);
    socket.data.name = name || 'Player';
    socket.data.playerId = sanitizePlayerId(playerId) ?? socket.data.playerId;

    const room = rooms.createRoom(socket.id, socket.data.name, socket.data.playerId);
    room.mode = 'daily';
    socket.join(room.code);

    const dateKey = dailyDateKey();
    races.start(room, { seed: dailySeed(dateKey), mode: 'daily', dateKey });
  });

  socket.on('startRace', () => {
    const room = findRoom(socket.id);
    if (!room || room.hostId !== socket.id || room.race) return;
    if (room.players.size < 2) return; // нужен хотя бы один соперник
    races.start(room);
  });

  socket.on('progress', ({ distance, lane } = {}) => {
    const room = findRoom(socket.id);
    if (room) races.updateProgress(room, socket.id, Number(distance) || 0, Number(lane) || 0);
  });

  socket.on('useAttack', ({ entityId } = {}) => {
    const room = findRoom(socket.id);
    if (room) races.useAttack(room, socket.id, Number(entityId));
  });

  socket.on('finished', ({ timeMs } = {}) => {
    const room = findRoom(socket.id);
    if (room) races.finish(room, socket.id, Number(timeMs));
  });

  socket.on('leaveRoom', () => leaveCurrentRoom(socket));
  socket.on('disconnect', () => leaveCurrentRoom(socket));
});

// Remove the socket from its current room and notify the rest.
function leaveCurrentRoom(socket) {
  const before = findRoom(socket.id);
  if (!before) return;
  const code = before.code;
  const wasRacing = !!before.race;

  const { room, deleted } = rooms.removePlayer(socket.id);
  socket.leave(code);
  if (deleted || !room) return;

  io.to(room.code).emit('roomUpdate', { players: room.playerList(), hostId: room.hostId });
  io.to(room.code).emit('playerLeft', { playerId: socket.id });

  // If a race was running and everyone left has now finished, close it out.
  if (wasRacing && room.race) {
    const remaining = [...room.race.progress.keys()].filter((id) => room.players.has(id));
    const allDone = remaining.every((id) => room.race.progress.get(id).finished);
    if (remaining.length === 0 || allDone) races.endRace(room);
  }
}

// Persistent identity comes from the client; cap its length defensively.
function sanitizePlayerId(playerId) {
  if (typeof playerId !== 'string' || !playerId.trim()) return null;
  return playerId.trim().slice(0, 64);
}

function findRoom(socketId) {
  for (const room of rooms.rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}

server.listen(PORT, () => {
  console.log(`[racing] server listening on :${PORT} (progress tick ${PROGRESS_TICK_MS}ms)`);
});
