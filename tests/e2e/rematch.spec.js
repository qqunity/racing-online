import { test, expect } from '@playwright/test';
import {
  openPlayer,
  hostCreatesRoom,
  guestJoinsRoom,
  startRace,
  waitForRacing,
  autoFinish,
  finishBoth,
  gameState,
} from '../fixtures.js';

// Read the series score block: [{ name, wins }] per player in the room.
function seriesScores(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid=series-row]')].map((el) => {
      const spans = el.querySelectorAll('span');
      return {
        name: spans[0].textContent.replace(' (вы)', '').trim(),
        wins: Number(spans[spans.length - 1].textContent),
      };
    })
  );
}

test('rematch: host restarts, new seed, series score counts the win', async ({ browser }) => {
  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  const code = await hostCreatesRoom(host.page, 'Хост');
  await guestJoinsRoom(guest.page, code, 'Гость');
  await startRace(host.page);
  await waitForRacing(host.page);
  await waitForRacing(guest.page);
  const seed1 = (await gameState(host.page)).seed;

  await finishBoth(host, guest);

  // Host sees the rematch button; guest only sees the hint, no button at all.
  await expect(host.page.getByTestId('rematch-btn')).toBeVisible();
  await expect(host.page.getByTestId('rematch-btn')).toBeEnabled();
  await expect(guest.page.getByTestId('rematch-hint')).toBeVisible();
  await expect(guest.page.getByTestId('rematch-btn')).toHaveCount(0);

  // After race 1 the winner has exactly one series win, the loser none.
  await expect(host.page.getByTestId('series-row')).toHaveCount(2);
  // First span of the winning row: "1.Имя (вы)" -> "Имя".
  const winnerName = (await host.page.locator('.ui-result-row.win > span').first().textContent())
    .replace(/^\s*1\./, '')
    .replace(' (вы)', '')
    .trim();
  let scores = await seriesScores(host.page);
  expect(scores.find((s) => s.name === winnerName).wins).toBe(1);
  expect(scores.reduce((sum, s) => sum + s.wins, 0)).toBe(1);

  // Rematch: both players race again on a fresh seed.
  await host.page.getByTestId('rematch-btn').click();
  await waitForRacing(host.page);
  await waitForRacing(guest.page);
  const seed2 = (await gameState(host.page)).seed;
  expect(seed2).not.toBe(seed1);

  await finishBoth(host, guest);

  // Two races run -> two wins distributed; both clients agree on the score.
  scores = await seriesScores(host.page);
  expect(scores.reduce((sum, s) => sum + s.wins, 0)).toBe(2);
  const guestScores = await seriesScores(guest.page);
  expect(guestScores).toEqual(scores);

  await host.context.close();
  await guest.context.close();
});

test('host leaves on the results screen: the guest is promoted and gets the button', async ({
  browser,
}) => {
  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  const code = await hostCreatesRoom(host.page, 'Хост');
  await guestJoinsRoom(guest.page, code, 'Гость');
  await startRace(host.page);
  await waitForRacing(host.page);
  await waitForRacing(guest.page);
  await finishBoth(host, guest);

  await expect(guest.page.getByTestId('rematch-hint')).toBeVisible();
  await host.page.getByTestId('result-leave-btn').click();

  // The server promotes the guest to host; the results screen reflects it.
  await expect(guest.page.getByTestId('rematch-btn')).toBeVisible();
  // Alone in the room — the rematch needs at least one opponent.
  await expect(guest.page.getByTestId('rematch-btn')).toBeDisabled();

  await host.context.close();
  await guest.context.close();
});

test('a third player joins between races and is pulled into the rematch', async ({ browser }) => {
  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  const code = await hostCreatesRoom(host.page, 'Хост');
  await guestJoinsRoom(guest.page, code, 'Гость');
  await startRace(host.page);
  await waitForRacing(host.page);
  await waitForRacing(guest.page);
  await finishBoth(host, guest);

  // race === null between races, so joining by code works; newcomer waits in the lobby.
  const third = await openPlayer(browser);
  await guestJoinsRoom(third.page, code, 'Новичок');

  // The results screen picks up the roomUpdate: three series rows now.
  await expect(host.page.getByTestId('series-row')).toHaveCount(3);

  await host.page.getByTestId('rematch-btn').click();
  await waitForRacing(host.page);
  await waitForRacing(guest.page);
  await waitForRacing(third.page);
  expect((await gameState(third.page)).phase).toBe('racing');

  // Everyone finishes -> three ranked rows on the newcomer's screen.
  // (the race only ends once ALL connected players have crossed the line)
  await autoFinish(host.page);
  await autoFinish(guest.page);
  await autoFinish(third.page);
  await expect(host.page.getByTestId('result-title')).toBeVisible();
  await expect(third.page.getByTestId('result-title')).toBeVisible();
  await expect(third.page.getByTestId('result-row')).toHaveCount(3);

  await host.context.close();
  await guest.context.close();
  await third.context.close();
});
