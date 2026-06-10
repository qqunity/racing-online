// Tiny JSON-file persistence for player stats and daily-challenge results.
// Loads everything into memory on construction; every mutation rewrites the
// file atomically (tmp file + rename) so a crash can't leave a torn write.

import fs from 'node:fs';
import path from 'node:path';

const EMPTY = () => ({ version: 1, players: {}, daily: {} });
const DAILY_KEEP_DAYS = 30; // prune daily boards older than this
const DAILY_MAX_ROWS = 50; // per-day cap

export class Storage {
  constructor(file) {
    this.file = file;
    this.state = EMPTY();
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) return; // first run: empty state
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.state = {
        version: 1,
        players: parsed && typeof parsed.players === 'object' && parsed.players ? parsed.players : {},
        daily: parsed && typeof parsed.daily === 'object' && parsed.daily ? parsed.daily : {},
      };
    } catch (err) {
      console.warn(`[storage] could not read ${this.file}, starting empty: ${err.message}`);
      this.state = EMPTY();
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, this.file);
  }

  // Upsert a player's lifetime stats after a multiplayer race.
  // Non-finishers still get races+1, but never a bestTimeMs.
  recordRaceResult({ playerId, name, won, finished, timeMs }) {
    if (!playerId) return;
    const p = this.state.players[playerId] || {
      name: name || 'Player',
      races: 0,
      wins: 0,
      bestTimeMs: null,
      updatedAt: null,
    };
    if (name) p.name = name;
    p.races += 1;
    if (won) p.wins += 1;
    if (finished && Number.isFinite(timeMs)) {
      p.bestTimeMs = p.bestTimeMs == null ? timeMs : Math.min(p.bestTimeMs, timeMs);
    }
    p.updatedAt = new Date().toISOString();
    this.state.players[playerId] = p;
    this.save();
  }

  // Best result of the day per player: an improvement overwrites the previous
  // entry instead of duplicating it. Board is sorted by time and capped.
  recordDailyResult(dateKey, { playerId, name, timeMs }) {
    if (!dateKey || !playerId || !Number.isFinite(timeMs)) return;
    const list = this.state.daily[dateKey] || [];
    const existing = list.find((e) => e.playerId === playerId);
    if (existing) {
      if (timeMs < existing.timeMs) {
        existing.timeMs = timeMs;
        if (name) existing.name = name;
        existing.at = new Date().toISOString();
      }
    } else {
      list.push({ playerId, name: name || 'Player', timeMs, at: new Date().toISOString() });
    }
    list.sort((a, b) => a.timeMs - b.timeMs);
    this.state.daily[dateKey] = list.slice(0, DAILY_MAX_ROWS);
    this.pruneDaily();
    this.save();
  }

  pruneDaily() {
    const cutoff = new Date(Date.now() - DAILY_KEEP_DAYS * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    for (const key of Object.keys(this.state.daily)) {
      if (key < cutoff) delete this.state.daily[key];
    }
  }

  // All-time board: most wins first, best time as tiebreaker.
  getLeaderboard(limit = 10) {
    return Object.entries(this.state.players)
      .map(([playerId, p]) => ({
        playerId,
        name: p.name,
        races: p.races,
        wins: p.wins,
        bestTimeMs: p.bestTimeMs,
      }))
      .sort(
        (a, b) =>
          b.wins - a.wins ||
          (a.bestTimeMs ?? Infinity) - (b.bestTimeMs ?? Infinity),
      )
      .slice(0, limit);
  }

  getDaily(dateKey, limit = 10) {
    return (this.state.daily[dateKey] || []).slice(0, limit);
  }
}
