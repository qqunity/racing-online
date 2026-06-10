// A player whose tab went to background freezes their game loop (the browser
// stops requestAnimationFrame): they never move and never finish. The server
// must not let such a player stall the race forever — FINISH_GRACE_MS after
// the first finisher the race force-ends and stragglers rank by distance.

import { test, expect } from '@playwright/test';
import { FINISH_GRACE_MS } from '../../shared/constants.js';
import {
  openPlayer,
  hostCreatesRoom,
  guestJoinsRoom,
  startRace,
  waitForRacing,
  autoFinish,
} from '../fixtures.js';

test('a frozen opponent does not stall the race: grace timer ends it', async ({ browser }) => {
  test.setTimeout(FINISH_GRACE_MS + 30_000);

  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  const code = await hostCreatesRoom(host.page, 'Хост');
  await guestJoinsRoom(guest.page, code, 'Гость');
  await startRace(host.page);
  await waitForRacing(host.page);
  await waitForRacing(guest.page);

  // Freeze the guest exactly like a backgrounded tab would: stop the loop.
  await guest.page.evaluate(() => window.__PHASER_GAME__.loop.sleep());

  await autoFinish(host.page);

  // The guest never finishes, yet the host must reach the results screen
  // within the grace window instead of hanging on «ФИНИШ!» forever.
  await expect(host.page.getByTestId('result-title')).toBeVisible({
    timeout: FINISH_GRACE_MS + 10_000,
  });

  const rows = host.page.getByTestId('result-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Хост');
  await expect(rows.nth(1)).toContainText('Гость');
  await expect(rows.nth(1)).toContainText('не финишировал');

  await host.context.close();
  await guest.context.close();
});
