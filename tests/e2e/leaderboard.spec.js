import { test, expect } from '@playwright/test';
import {
  openPlayer,
  hostCreatesRoom,
  guestJoinsRoom,
  startRace,
  waitForRacing,
  autoFinish,
} from '../fixtures.js';

// Persistence: a finished multiplayer race lands in the all-time leaderboard
// (visible in the menu and via the REST endpoint). Names are unique per run
// because a reused dev server keeps its stats file between runs.
test('finished race is recorded and shown in the leaderboard', async ({ browser, request }) => {
  // Unique but short: the name input is capped at 14 chars.
  const runId = Date.now().toString(36).slice(-6);
  const hostName = `Хост-${runId}`;
  const guestName = `Гость-${runId}`;

  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  const code = await hostCreatesRoom(host.page, hostName);
  await guestJoinsRoom(guest.page, code, guestName);
  await startRace(host.page);
  await waitForRacing(host.page);
  await waitForRacing(guest.page);
  await autoFinish(host.page);
  await autoFinish(guest.page);

  await expect(host.page.getByTestId('result-title')).toBeVisible();
  await expect(guest.page.getByTestId('result-title')).toBeVisible();

  // Work out who won from the host's result screen.
  const hostTitle = await host.page.getByTestId('result-title').textContent();
  const winnerName = hostTitle.includes('Победа') ? hostName : guestName;
  const loserName = winnerName === hostName ? guestName : hostName;

  // Both players leave to the menu.
  await host.page.getByTestId('result-leave-btn').click();
  await guest.page.getByTestId('result-leave-btn').click();
  await expect(host.page.getByTestId('records-btn')).toBeVisible();
  await expect(guest.page.getByTestId('records-btn')).toBeVisible();

  // Open the leaderboard: both names present, winner has exactly one win.
  await host.page.getByTestId('records-btn').click();
  const rows = host.page.getByTestId('leaderboard-row');
  await expect(rows.filter({ hasText: winnerName })).toHaveCount(1);
  await expect(rows.filter({ hasText: loserName })).toHaveCount(1);
  await expect(rows.filter({ hasText: winnerName })).toContainText('🏆 1 ·');
  await expect(rows.filter({ hasText: loserName })).toContainText('🏆 0 ·');

  // REST endpoint shape: { top: [{ name, races, wins, bestTimeMs }, ...] }.
  const res = await request.get('/api/leaderboard');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(Array.isArray(body.top)).toBe(true);

  const winner = body.top.find((p) => p.name === winnerName);
  const loser = body.top.find((p) => p.name === loserName);
  expect(winner).toBeTruthy();
  expect(loser).toBeTruthy();
  expect(winner.wins).toBe(1);
  expect(winner.races).toBe(1);
  expect(typeof winner.bestTimeMs).toBe('number');
  expect(loser.wins).toBe(0);
  expect(loser.races).toBe(1);

  await host.context.close();
  await guest.context.close();
});
