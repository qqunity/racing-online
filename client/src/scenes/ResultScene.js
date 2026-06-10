import Phaser from 'phaser';
import { createOverlay } from '../ui/dom.js';
import { socket, net, startRace, leaveRoom, startDaily } from '../net/socket.js';

// Final standings after a race. Host can start a rematch right from here (or
// go back to the lobby); everyone can leave to the menu. The series score
// (seriesWins per player) lives with the room and is shown under the table.
// Daily-challenge runs get their own variant (no lobby to go back to — only
// "race again" and "back to menu").
export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  init(data) {
    this.ranking = (data && data.ranking) || [];
    // Актуальный состав комнаты со счётом серии (приходит в raceResults).
    this.series = (data && data.series) || [];
    this.mode = (data && data.mode) || 'multi'; // 'multi' | 'daily'
    this.daily = (data && data.daily) || null; // { dateKey, top } for daily runs
  }

  create() {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x2b2f3a).setOrigin(0);

    if (this.mode === 'daily') {
      this.createDaily();
    } else {
      this.createMulti();
    }

    // If another race kicks off while we're on this screen (host restarts the
    // multiplayer race, or we pressed «Ещё раз» on the daily variant).
    this.onRaceStarting = (cfg) => {
      net.lastRaceConfig = cfg;
      this.scene.start('Race', cfg);
    };
    socket.on('raceStarting', this.onRaceStarting);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.onRoomUpdate) socket.off('roomUpdate', this.onRoomUpdate);
      socket.off('raceStarting', this.onRaceStarting);
      if (this.ui) this.ui.destroy();
    });
  }

  createMulti() {
    // raceResults несёт свежий состав комнаты — синхронизируем net,
    // чтобы не зависеть от устаревшего состояния из лобби.
    if (this.series.length) {
      net.players = this.series;
      const host = this.series.find((p) => p.isHost);
      if (host) net.hostId = host.id;
    }

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
      <label>Счёт серии</label>
      <div data-testid="series-score"></div>
      <div data-testid="rematch-area"></div>
      <button class="ui-btn" data-testid="again-btn">В лобби</button>
      <button class="ui-btn secondary" data-testid="result-leave-btn">Выйти в меню</button>
    `);

    this.ui.q('[data-testid=again-btn]').addEventListener('click', () => this.scene.start('Lobby'));
    this.ui.q('[data-testid=result-leave-btn]').addEventListener('click', () => {
      leaveRoom();
      this.scene.start('Menu');
    });

    // Состав комнаты меняется прямо на экране результатов: кто-то вышел
    // (включая хоста — сервер промоутит нового) или зашёл по коду.
    this.onRoomUpdate = ({ players, hostId }) => {
      net.players = players;
      net.hostId = hostId;
      this.series = players;
      this.render();
    };
    socket.on('roomUpdate', this.onRoomUpdate);

    this.render();
  }

  // Daily-challenge results: own time + the day's top-10. There's no lobby —
  // the room is solo and disposable — so the actions are "again" and "menu".
  createDaily() {
    const self = this.ranking.find((r) => r.id === net.selfId);
    const myTime =
      self && self.finished ? `${(self.timeMs / 1000).toFixed(2)} с` : 'не финишировал';
    const top = (this.daily && this.daily.top) || [];
    const dateKey = (this.daily && this.daily.dateKey) || '';

    const rowsHtml = top
      .map(
        (e, i) => `<div class="ui-result-row" data-testid="daily-result-row">
            <span><span class="ui-place">${i + 1}.</span>${escapeHtml(e.name)}</span>
            <span>${(e.timeMs / 1000).toFixed(2)} с</span>
          </div>`,
      )
      .join('');

    this.ui = createOverlay(`
      <h1 data-testid="result-title">📅 Трасса дня</h1>
      <h2>${escapeHtml(dateKey)} · ваше время: <span data-testid="daily-own-time">${myTime}</span></h2>
      ${rowsHtml || '<div data-testid="daily-result-empty">Сегодня ещё нет результатов</div>'}
      <button class="ui-btn" data-testid="daily-again-btn">Ещё раз</button>
      <button class="ui-btn secondary" data-testid="result-leave-btn">В меню</button>
    `);

    this.ui.q('[data-testid=daily-again-btn]').addEventListener('click', () => {
      const name = localStorage.getItem('racing.name') || 'Гонщик';
      net.players = [{ id: net.selfId, name }];
      startDaily(name); // server answers with raceStarting → onRaceStarting
    });
    this.ui.q('[data-testid=result-leave-btn]').addEventListener('click', () => {
      leaveRoom();
      this.scene.start('Menu');
    });
  }

  render() {
    // Счёт серии: имя + число побед для каждого игрока в комнате.
    this.ui.q('[data-testid=series-score]').innerHTML = this.series
      .map(
        (p) => `<div class="ui-result-row" data-testid="series-row" data-player-id="${p.id}">
            <span>${escapeHtml(p.name)}${p.id === net.selfId ? ' (вы)' : ''}</span>
            <span>${p.seriesWins || 0}</span>
          </div>`
      )
      .join('');

    // Реванш: хост видит кнопку (активна при >= 2 игроков), гость — хинт.
    const area = this.ui.q('[data-testid=rematch-area]');
    const isHost = net.hostId === net.selfId;
    if (isHost) {
      const enough = net.players.length >= 2;
      area.innerHTML = `<button class="ui-btn" data-testid="rematch-btn" ${
        enough ? '' : 'disabled'
      }>Ещё раз</button>`;
      area.querySelector('[data-testid=rematch-btn]').addEventListener('click', () => startRace());
    } else {
      area.innerHTML = `<div class="ui-error" data-testid="rematch-hint">Ждём хоста…</div>`;
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
