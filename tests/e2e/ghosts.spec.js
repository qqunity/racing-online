import { test, expect } from '@playwright/test';
import {
  openPlayer,
  hostCreatesRoom,
  guestJoinsRoom,
  startRace,
  waitForRacing,
  ghosts,
  playerLane,
} from '../fixtures.js';

// Opponents are rendered as translucent "ghost" cars on the track. The server
// relays each player's { distance, lane } to the room, and every client draws
// the others where they actually are.
test('opponent appears as a moving ghost with the right name and lane', async ({ browser }) => {
  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);

  const code = await hostCreatesRoom(host.page, 'Хост');
  await guestJoinsRoom(guest.page, code, 'Гость');

  await startRace(host.page);
  await waitForRacing(host.page);
  await waitForRacing(guest.page);

  // The host sees exactly one ghost (the guest) once progress starts flowing.
  await host.page.waitForFunction(
    () => {
      const g = window.__GAME__ && window.__GAME__.ghosts;
      return g && g.length === 1 && g[0].distance > 0;
    },
    null,
    { timeout: 10_000 }
  );

  const snapshot = (await ghosts(host.page))[0];
  expect(snapshot.name).toBe('Гость');

  // The ghost's distance keeps growing as the guest drives.
  await host.page.waitForFunction(
    (prev) => {
      const g = window.__GAME__ && window.__GAME__.ghosts;
      return g && g.length === 1 && g[0].distance > prev + 20;
    },
    snapshot.distance,
    { timeout: 10_000 }
  );

  // The guest steers left; the host's ghost follows into the new lane.
  // Retry the keypress in case the guest is momentarily spun out (no control).
  const guestLaneBefore = await playerLane(guest.page);
  const wantLane = guestLaneBefore - 1;
  await expect
    .poll(
      async () => {
        const lane = await playerLane(guest.page);
        if (lane !== wantLane) await guest.page.keyboard.press('ArrowLeft');
        return playerLane(guest.page);
      },
      { timeout: 10_000 }
    )
    .toBe(wantLane);

  await host.page.waitForFunction(
    (want) => {
      const g = window.__GAME__ && window.__GAME__.ghosts;
      return g && g.length === 1 && g[0].lane === want;
    },
    wantLane,
    { timeout: 10_000 }
  );

  await host.context.close();
  await guest.context.close();
});
