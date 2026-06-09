import Phaser from 'phaser';
import { createOverlay } from '../ui/dom.js';
import { socket, net, createRoom, joinRoom } from '../net/socket.js';
import { ROOM_CODE_LENGTH } from '@shared/constants.js';

// Title screen: enter a name, then create a new room or join one by code.
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.drawBackdrop();

    const savedName = localStorage.getItem('racing.name') || '';
    this.ui = createOverlay(`
      <h1>🏎️ Racing Online</h1>
      <h2>Шашкуй, собирай нитро, доедь первым</h2>
      <label for="name">Имя игрока</label>
      <input id="name" data-testid="name-input" maxlength="14" placeholder="Гонщик" value="${savedName}" />
      <button class="ui-btn" data-testid="create-btn">Создать гонку</button>
      <label for="code">Код комнаты</label>
      <div class="ui-row">
        <input id="code" data-testid="code-input" maxlength="${ROOM_CODE_LENGTH}" placeholder="XXXX" style="text-transform:uppercase" />
        <button class="ui-btn secondary" data-testid="join-btn" style="width:auto;padding:12px 18px;">Войти</button>
      </div>
      <div class="ui-error" data-testid="menu-error"></div>
    `);

    const nameInput = this.ui.q('[data-testid=name-input]');
    const codeInput = this.ui.q('[data-testid=code-input]');
    const errEl = this.ui.q('[data-testid=menu-error]');

    const name = () => (nameInput.value.trim() || 'Гонщик');
    const remember = () => localStorage.setItem('racing.name', nameInput.value.trim());

    this.ui.q('[data-testid=create-btn]').addEventListener('click', () => {
      remember();
      createRoom(name());
    });
    this.ui.q('[data-testid=join-btn]').addEventListener('click', () => {
      const code = codeInput.value.trim().toUpperCase();
      if (code.length < ROOM_CODE_LENGTH) {
        errEl.textContent = 'Введите код комнаты';
        return;
      }
      remember();
      joinRoom(code, name());
    });

    // Server responses.
    this.onCreated = ({ code, players }) => {
      net.code = code;
      net.players = players;
      this.goLobby();
    };
    this.onJoined = ({ code, players, hostId }) => {
      net.code = code;
      net.players = players;
      net.hostId = hostId;
      this.goLobby();
    };
    this.onJoinError = ({ msg }) => {
      errEl.textContent = msg || 'Не удалось войти';
    };

    socket.on('roomCreated', this.onCreated);
    socket.on('roomJoined', this.onJoined);
    socket.on('joinError', this.onJoinError);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  goLobby() {
    this.scene.start('Lobby');
  }

  cleanup() {
    socket.off('roomCreated', this.onCreated);
    socket.off('roomJoined', this.onJoined);
    socket.off('joinError', this.onJoinError);
    if (this.ui) this.ui.destroy();
  }

  drawBackdrop() {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x2b2f3a).setOrigin(0);
    // A few decorative lane stripes.
    for (let y = -40; y < height; y += 90) {
      this.add.rectangle(width / 2, y, 8, 50, 0x4a5060).setOrigin(0.5);
    }
  }
}
