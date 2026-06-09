import { test, expect } from '@playwright/test';
import {
  openPlayer,
  hostCreatesRoom,
  guestJoinsRoom,
  startRace,
  waitForRacing,
  autoFinish,
} from '../fixtures.js';

test('full race: start, drive to finish, see results with a winner', async ({ browser }) => {
  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  const code = await hostCreatesRoom(host.page, 'Хост');
  await guestJoinsRoom(guest.page, code, 'Гость');

  await startRace(host.page);

  // Both clients enter the race and clear the countdown.
  await waitForRacing(host.page);
  await waitForRacing(guest.page);

  // Deterministically teleport both to the finish line.
  await autoFinish(host.page);
  await autoFinish(guest.page);

  // Both should land on the results screen with two ranked rows.
  await expect(host.page.getByTestId('result-title')).toBeVisible();
  await expect(guest.page.getByTestId('result-title')).toBeVisible();
  await expect(host.page.getByTestId('result-row')).toHaveCount(2);

  // Exactly one player is in first place across the standings.
  const firstPlaces = await host.page.locator('.ui-result-row.win').count();
  expect(firstPlaces).toBe(1);

  await host.context.close();
  await guest.context.close();
});
