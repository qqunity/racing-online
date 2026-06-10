import { test, expect } from '@playwright/test';
import {
  openPlayer,
  hostCreatesRoom,
  guestJoinsRoom,
  startRace,
  waitForRacing,
} from '../fixtures.js';

// Start a 2-player race and return { host, guest } page bundles.
async function startTwoPlayerRace(browser) {
  const host = await openPlayer(browser);
  const guest = await openPlayer(browser);
  const code = await hostCreatesRoom(host.page, 'Хост');
  await guestJoinsRoom(guest.page, code, 'Гость');
  await startRace(host.page);
  await waitForRacing(host.page);
  await waitForRacing(guest.page);
  return { host, guest };
}

test('shield blocks exactly one crash, then crashes hurt again', async ({ browser }) => {
  const { host, guest } = await startTwoPlayerRace(browser);

  // Collect a shield and immediately take a hit — atomically within one JS
  // turn, so no game frame (or organic collision) can interleave.
  const result = await host.page.evaluate(() => {
    const g = window.__GAME__;
    const shield = g.track.find((e) => e.kind === 'shield');
    if (!shield) return { error: 'no shield on track' };
    const collected = g.forceCollect(shield.id);
    const afterCollect = { ...g.effects };
    g.simulateCrash();
    const afterBlocked = { ...g.effects };
    return { collected, afterCollect, afterBlocked };
  });

  expect(result.error).toBeUndefined();
  expect(result.collected).toBe(true);
  // Shield armed after pickup.
  expect(result.afterCollect.hasShield).toBe(true);
  expect(result.afterCollect.label).toContain('🛡');
  // The crash was absorbed: shield gone, no slowdown, brief invulnerability.
  expect(result.afterBlocked.hasShield).toBe(false);
  expect(result.afterBlocked.crashMs).toBe(0);
  expect(result.afterBlocked.invulnMs).toBeGreaterThan(0);

  // Control: once vulnerable again, a crash without a shield does slow us down.
  await host.page.waitForFunction(
    () => {
      const g = window.__GAME__;
      if (!g) return false;
      const fx = g.effects;
      if (fx.invulnMs > 0 || fx.crashMs > 0 || fx.hasShield) return false;
      g.simulateCrash();
      return g.effects.crashMs > 0;
    },
    null,
    { timeout: 10_000 }
  );

  await host.context.close();
  await guest.context.close();
});
