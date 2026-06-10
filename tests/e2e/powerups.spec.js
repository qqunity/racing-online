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

test('attack pickup oils the nearest opponent ahead, exactly once', async ({ browser }) => {
  const { host, guest } = await startTwoPlayerRace(browser);

  // Earliest attack pickup on the (shared, deterministic) track.
  const attack = await guest.page.evaluate(() => {
    const list = window.__GAME__.track.filter((e) => e.kind === 'attack');
    list.sort((a, b) => a.dist - b.dist);
    return list[0] || null;
  });
  expect(attack).not.toBeNull();

  // The guest collects the pickup through the real interact() path: armed.
  const armed = await guest.page.evaluate((id) => {
    const g = window.__GAME__;
    g.forceCollect(id);
    return { ...g.effects };
  }, attack.id);
  expect(armed.attackCharges).toBe(1);
  expect(armed.label).toContain('🚀');

  // Deterministic positions regardless of where this seed put the pickup:
  // the victim (host) sits 250m ahead of the attacker (guest), and the guest
  // has plausibly reached the pickup (server checks distance >= dist - 250).
  await host.page.evaluate((d) => window.__GAME__.setDistance(d), attack.dist + 150);
  await guest.page.evaluate((d) => window.__GAME__.setDistance(d), attack.dist - 100);

  // Let a few progress ticks (100ms) reach the server, and make sure the host
  // isn't on nitro (nitro shrugs off oil and would mask the hit).
  await host.page.waitForFunction(() => window.__GAME__ && window.__GAME__.effects.nitroMs === 0);
  await guest.page.waitForTimeout(400);

  // Fire via the real SPACE code-path.
  await guest.page.evaluate(() => window.__GAME__.useAttack());

  // The host (ahead of the attacker) gets hit: oil spin-out + attacker's name.
  await host.page.waitForFunction(
    () => {
      const g = window.__GAME__;
      return (
        g &&
        g.attackedCount === 1 &&
        g.lastAttack &&
        g.lastAttack.wasSelf &&
        g.effects.oilMs > 0
      );
    },
    null,
    { timeout: 5_000 }
  );
  const hit = await host.page.evaluate(() => window.__GAME__.lastAttack);
  expect(hit.attackerName).toBe('Гость');

  // The charge is spent client-side, and a replay of the same entity (raw
  // network send, bypassing the client guard) is rejected by the server.
  const after = await guest.page.evaluate((id) => {
    const g = window.__GAME__;
    g.useAttack(); // no charge left — must be a client-side no-op
    g._rawUseAttack(id); // forged replay — server must reject (one-shot/cooldown)
    return { ...g.effects };
  }, attack.id);
  expect(after.attackCharges).toBe(0);

  await host.page.waitForTimeout(800);
  const counts = await Promise.all([
    host.page.evaluate(() => (window.__GAME__ ? window.__GAME__.attackedCount : null)),
    guest.page.evaluate(() => (window.__GAME__ ? window.__GAME__.attackedCount : null)),
  ]);
  for (const c of counts) {
    if (c !== null) expect(c).toBe(1); // no second 'attacked' anywhere
  }

  await host.context.close();
  await guest.context.close();
});
