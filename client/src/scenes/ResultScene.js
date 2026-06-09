import Phaser from 'phaser';
import { createOverlay } from '../ui/dom.js';
import { socket, net, leaveRoom } from '../net/socket.js';

// Final standings after a race. Host can start another race (back to lobby);
// everyone can leave to the menu.
export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  init(data) {
    this.ranking = (data && data.ranking) || [];
  }

  create() {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x2b2f3a).setOrigin(0);

    const rowsHtml = this.ranking
      .map((r) => {
        const win = r.place === 1;
        const time = r.finished ? `${(r.timeMs / 1000).toFixed(2)} с` : 'не финишировал';
        const self = r.id === net.selfId ? ' (вы)' : '';
        return `<div class="ui-result-row ${win ? 'win' : ''}" data-testid="result-row">
            <span><span class="ui-place">${r.place}.</span>${escapeHtml(r.name)}${self}</span>
            <span>${time}</span>
          </div>`;
      })
      .join('');

    const winner = this.ranking.find((r) => r.place === 1);
    const youWon = winner && winner.id === net.selfId;

    this.ui = createOverlay(`
      <h1 data-testid="result-title">${youWon ? '🏆 Победа!' : '🏁 Финиш'}</h1>
      <h2>${winner ? `Победитель: ${escapeHtml(winner.name)}` : 'Результаты'}</h2>
      ${rowsHtml}
      <button class="ui-btn" data-testid="again-btn">В лобби</button>
      <button class="ui-btn secondary" data-testid="result-leave-btn">Выйти в меню</button>
    `);

    this.ui.q('[data-testid=again-btn]').addEventListener('click', () => this.scene.start('Lobby'));
    this.ui.q('[data-testid=result-leave-btn]').addEventListener('click', () => {
      leaveRoom();
      this.scene.start('Menu');
    });

    // If the host kicks off another race while we're on this screen.
    this.onRaceStarting = (cfg) => {
      net.lastRaceConfig = cfg;
      this.scene.start('Race', cfg);
    };
    socket.on('raceStarting', this.onRaceStarting);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      socket.off('raceStarting', this.onRaceStarting);
      if (this.ui) this.ui.destroy();
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
