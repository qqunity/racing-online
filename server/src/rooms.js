// In-memory room/session management. No database — rooms live only as long as
// players are connected. Suitable for an MVP.

import { ROOM_CODE_LENGTH, MAX_PLAYERS } from '../../shared/constants.js';

// Avoid ambiguous characters (0/O, 1/I) in room codes.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  generateCode() {
    let code;
    do {
      code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostId, hostName, hostPlayerId = null) {
    const code = this.generateCode();
    const room = new Room(code, hostId);
    room.addPlayer(hostId, hostName, hostPlayerId);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get((code || '').toUpperCase()) || null;
  }

  // Remove a player from whatever room they're in. Returns the affected room
  // (or null). Deletes the room if it becomes empty.
  removePlayer(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) {
        room.removePlayer(socketId);
        if (room.players.size === 0) {
          this.rooms.delete(room.code);
          return { room, deleted: true };
        }
        return { room, deleted: false };
      }
    }
    return { room: null, deleted: false };
  }
}

export class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    /** @type {Map<string, {id:string, name:string, playerId:string|null, seriesWins:number}>} */
    this.players = new Map();
    // Active race state, or null when in the lobby.
    this.race = null;
    // 'multi' — обычная комната с лобби; 'daily' — одиночный заезд «трассы дня».
    this.mode = 'multi';
  }

  // playerId — stable persistent identity (localStorage UUID), used for stats.
  // seriesWins — счёт серии реваншей; живёт вместе с комнатой.
  addPlayer(id, name, playerId = null) {
    this.players.set(id, { id, name: name || 'Player', playerId: playerId || null, seriesWins: 0 });
  }

  removePlayer(id) {
    this.players.delete(id);
    // If the host left, promote the next remaining player.
    if (id === this.hostId) {
      const next = this.players.keys().next();
      this.hostId = next.done ? null : next.value;
    }
  }

  isFull() {
    return this.players.size >= MAX_PLAYERS;
  }

  // Serialisable player list for the lobby UI.
  playerList() {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.id === this.hostId,
      seriesWins: p.seriesWins,
    }));
  }
}
