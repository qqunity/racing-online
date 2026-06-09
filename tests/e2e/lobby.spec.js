import { test, expect } from '@playwright/test';
import { openPlayer, hostCreatesRoom, guestJoinsRoom } from '../fixtures.js';

test('host creates a room and a guest joins; both see two players', async ({ browser }) => {
  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  const code = await hostCreatesRoom(host.page, 'Хост');
  await guestJoinsRoom(guest.page, code, 'Гость');

  // Both lobbies converge on a 2-player roster.
  await expect(host.page.getByTestId('player-count')).toHaveText('2');
  await expect(guest.page.getByTestId('player-count')).toHaveText('2');
  await expect(host.page.getByTestId('player-list')).toContainText('Хост');
  await expect(host.page.getByTestId('player-list')).toContainText('Гость');

  // Only the host gets an enabled Start button.
  await expect(host.page.getByTestId('start-btn')).toBeEnabled();

  await host.context.close();
  await guest.context.close();
});

test('joining a non-existent room shows an error', async ({ browser }) => {
  const guest = await openPlayer(browser);
  await guest.page.getByTestId('name-input').fill('Гость');
  await guest.page.getByTestId('code-input').fill('ZZZZ');
  await guest.page.getByTestId('join-btn').click();
  await expect(guest.page.getByTestId('menu-error')).toContainText(/не найдена/i);
  await guest.context.close();
});
