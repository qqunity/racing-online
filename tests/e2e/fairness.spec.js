import { test, expect } from '@playwright/test';
import {
  openPlayer,
  hostCreatesRoom,
  guestJoinsRoom,
  startRace,
  waitForRacing,
  gameState,
} from '../fixtures.js';

// The fairness guarantee: both clients derive the identical track from the same
// server-issued seed, so the traffic/power-up layout matches exactly.
test('both players race the same seeded track layout', async ({ browser }) => {
  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  const code = await hostCreatesRoom(host.page, 'Хост');
  await guestJoinsRoom(guest.page, code, 'Гость');

  await startRace(host.page);
  await waitForRacing(host.page);
  await waitForRacing(guest.page);

  const a = await gameState(host.page);
  const b = await gameState(guest.page);

  expect(a.seed).toBe(b.seed);
  expect(a.fingerprint).toBe(b.fingerprint);
  expect(a.fingerprint.length).toBeGreaterThan(0);

  await host.context.close();
  await guest.context.close();
});
