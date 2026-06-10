// Shared helpers for driving the game from Playwright. Each "player" is an
// isolated browser context so two of them can sit in the same room at once.

import { expect } from '@playwright/test';
import { ROOM_CODE_LENGTH } from '../shared/constants.js';

// Open a fresh context+page on the menu screen.
export async function openPlayer(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('name-input')).toBeVisible();
  return { context, page };
}

// Create a room and return its code (read from the lobby).
export async function hostCreatesRoom(page, name) {
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('create-btn').click();
  const codeEl = page.getByTestId('room-code');
  await expect(codeEl).toBeVisible();
  await expect(codeEl).toHaveText(/^[A-Z0-9]{4}$/);
  const code = (await codeEl.textContent()).trim();
  expect(code.length).toBe(ROOM_CODE_LENGTH);
  return code;
}

// Join an existing room by code; lands in the lobby.
export async function guestJoinsRoom(page, code, name) {
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('code-input').fill(code);
  await page.getByTestId('join-btn').click();
  await expect(page.getByTestId('room-code')).toHaveText(code);
}

// Host starts the race (button enabled once >= 2 players).
export async function startRace(hostPage) {
  const btn = hostPage.getByTestId('start-btn');
  await expect(btn).toBeEnabled();
  await btn.click();
}

// Wait until the race scene is live and past the countdown.
export async function waitForRacing(page) {
  await page.waitForFunction(() => window.__GAME__ && window.__GAME__.phase === 'racing', null, {
    timeout: 15_000,
  });
}

// Read the exposed game state from the race scene.
export function gameState(page) {
  return page.evaluate(() => {
    const g = window.__GAME__;
    return g ? { phase: g.phase, seed: g.seed, fingerprint: g.fingerprint, distance: g.distance } : null;
  });
}

// Teleport to the finish line (deterministic finish for tests).
export async function autoFinish(page) {
  await page.evaluate(() => window.__GAME__ && window.__GAME__.autoFinish());
}

// Opponent ghosts as seen by this client: [{ id, name, distance, lane, visible }].
export function ghosts(page) {
  return page.evaluate(() => (window.__GAME__ ? window.__GAME__.ghosts : null));
}

// The local player's current lane index.
export function playerLane(page) {
  return page.evaluate(() => (window.__GAME__ ? window.__GAME__.lane : null));
}
