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
import { PROGRESS_TICK_MS } from '../../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // In dev the Vite server proxies to us, so any origin is fine.
  cors: { origin: true },
});

const rooms = new RoomManager();
const races = new RaceManager(io);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Serve the built client when it exists (production / docker).
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

io.on('connection', (socket) => {
  socket.data.name = 'Player';

  socket.on('createRoom', ({ name } = {}) => {
    leaveCurrentRoom(socket); // safety: one room at a time
    socket.data.name = name || 'Player';
    const room = rooms.createRoom(socket.id, socket.data.name);
    socket.join(room.code);
    socket.emit('roomCreated', { code: room.code, players: room.playerList() });
    io.to(room.code).emit('roomUpdate', { players: room.playerList(), hostId: room.hostId });
  });

  socket.on('joinRoom', ({ code, name } = {}) => {
    const room = rooms.getRoom(code);
    if (!room) return socket.emit('joinError', { msg: 'Комната не найдена' });
    if (room.race) return socket.emit('joinError', { msg: 'Гонка уже идёт' });
    if (room.isFull()) return socket.emit('joinError', { msg: 'Комната заполнена' });

    leaveCurrentRoom(socket);
    socket.data.name = name || 'Player';
    room.addPlayer(socket.id, socket.data.name);
    socket.join(room.code);
    socket.emit('roomJoined', { code: room.code, players: room.playerList(), hostId: room.hostId });
    io.to(room.code).emit('roomUpdate', { players: room.playerList(), hostId: room.hostId });
  });

  socket.on('startRace', () => {
    const room = findRoom(socket.id);
    if (!room || room.hostId !== socket.id || room.race) return;
    races.start(room);
  });

  socket.on('progress', ({ distance } = {}) => {
    const room = findRoom(socket.id);
    if (room) races.updateProgress(room, socket.id, Number(distance) || 0);
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

function findRoom(socketId) {
  for (const room of rooms.rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}

server.listen(PORT, () => {
  console.log(`[racing] server listening on :${PORT} (progress tick ${PROGRESS_TICK_MS}ms)`);
});
