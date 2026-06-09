import Phaser from 'phaser';
import { createOverlay } from '../ui/dom.js';
import { socket, net, startRace, leaveRoom } from '../net/socket.js';

// Waiting room: shows the room code and connected players. The host can start
// the race once at least one other player has joined.
export default class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create() {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x2b2f3a).setOrigin(0);

    this.ui = createOverlay(`
      <h1>Лобби</h1>
      <h2>Поделись кодом с друзьями</h2>
      <div class="ui-code" data-testid="room-code">${net.code || '----'}</div>
      <label>Игроки (<span data-testid="player-count">0</span>)</label>
      <ul class="ui-players" data-testid="player-list"></ul>
      <button class="ui-btn" data-testid="start-btn" disabled>Старт</button>
      <button class="ui-btn secondary" data-testid="leave-btn">Выйти</button>
      <div class="ui-error" data-testid="lobby-hint"></div>
    `);

    this.startBtn = this.ui.q('[data-testid=start-btn]');
    this.hintEl = this.ui.q('[data-testid=lobby-hint]');

    this.startBtn.addEventListener('click', () => startRace());
    this.ui.q('[data-testid=leave-btn]').addEventListener('click', () => {
      leaveRoom();
      this.scene.start('Menu');
    });

    this.onRoomUpdate = ({ players, hostId }) => {
      net.players = players;
      net.hostId = hostId;
      this.render();
    };
    this.onRaceStarting = (cfg) => {
      net.lastRaceConfig = cfg;
      this.scene.start('Race', cfg);
    };

    socket.on('roomUpdate', this.onRoomUpdate);
    socket.on('raceStarting', this.onRaceStarting);

    this.render();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  render() {
    const list = this.ui.q('[data-testid=player-list]');
    list.innerHTML = net.players
      .map(
        (p) =>
          `<li data-player-id="${p.id}">${escapeHtml(p.name)}${
            p.isHost ? ' <span class="ui-host-badge">хост</span>' : ''
          }</li>`
      )
      .join('');
    this.ui.q('[data-testid=player-count]').textContent = String(net.players.length);

    const isHost = net.hostId === net.selfId;
    const enough = net.players.length >= 2;
    this.startBtn.style.display = isHost ? 'block' : 'none';
    this.startBtn.disabled = !enough;
    if (isHost) {
      this.hintEl.textContent = enough ? '' : 'Нужно минимум 2 игрока';
    } else {
      this.hintEl.textContent = 'Ждём, пока хост начнёт гонку…';
    }
  }

  cleanup() {
    socket.off('roomUpdate', this.onRoomUpdate);
    socket.off('raceStarting', this.onRaceStarting);
    if (this.ui) this.ui.destroy();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
