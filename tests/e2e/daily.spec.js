import { test, expect } from '@playwright/test';
import { openPlayer, waitForRacing, autoFinish, gameState } from '../fixtures.js';
import { dailyDateKey, dailySeed } from '../../shared/daily.js';
import { MIN_PLAUSIBLE_FINISH_MS } from '../../shared/constants.js';

// Drive the menu into a daily run: set the name, open the daily panel, start.
async function startDailyRun(page, name) {
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId('daily-btn').click();
  await page.getByTestId('daily-start-btn').click();
  await waitForRacing(page);
}

// Short unique name (the input caps at 14 chars); stats persist across runs
// when a dev server is reused, so names must not repeat between runs.
function uniqueName(prefix) {
  return `${prefix}-${Date.now().toString(36).slice(-6)}`;
}

test('daily race uses the deterministic seed of the day', async ({ browser }) => {
  const p = await openPlayer(browser);
  await startDailyRun(p.page, uniqueName('Д'));

  const mode = await p.page.evaluate(() => window.__GAME__.mode);
  expect(mode).toBe('daily');

  const st = await gameState(p.page);
  expect(st.seed).toBe(dailySeed(dailyDateKey()));

  await p.context.close();
});

test('finishing the daily shows the daily result screen with own entry', async ({ browser }) => {
  const name = uniqueName('Дф');
  const p = await openPlayer(browser);
  await startDailyRun(p.page, name);
  await autoFinish(p.page);

  await expect(p.page.getByTestId('result-title')).toContainText('Трасса дня');
  const ownRow = p.page.getByTestId('daily-result-row').filter({ hasText: name });
  await expect(ownRow).toHaveCount(1);
  // autoFinish teleports instantly, so the server clamps the time up to the
  // minimum plausible finish — that exact value must be on the board.
  await expect(ownRow).toContainText(`${(MIN_PLAUSIBLE_FINISH_MS / 1000).toFixed(2)} с`);

  await p.context.close();
});

test('two daily players race the identical track and both hit the board', async ({ browser }) => {
  const nameA = uniqueName('Да');
  const nameB = uniqueName('Дб');
  const a = await openPlayer(browser);
  const b = await openPlayer(browser);

  await startDailyRun(a.page, nameA);
  await startDailyRun(b.page, nameB);

  // Same date seed → byte-identical track on both clients.
  const sa = await gameState(a.page);
  const sb = await gameState(b.page);
  expect(sa.seed).toBe(sb.seed);
  expect(sa.fingerprint).toBe(sb.fingerprint);

  // Finish sequentially so B's result screen is guaranteed to include A.
  await autoFinish(a.page);
  await expect(a.page.getByTestId('result-title')).toContainText('Трасса дня');
  await autoFinish(b.page);
  await expect(b.page.getByTestId('result-title')).toContainText('Трасса дня');

  const rows = b.page.getByTestId('daily-result-row');
  await expect(rows.filter({ hasText: nameA })).toHaveCount(1);
  await expect(rows.filter({ hasText: nameB })).toHaveCount(1);

  await a.context.close();
  await b.context.close();
});

test('«Ещё раз» on the daily result starts a fresh daily run', async ({ browser }) => {
  const p = await openPlayer(browser);
  await startDailyRun(p.page, uniqueName('Др'));
  await autoFinish(p.page);
  await expect(p.page.getByTestId('daily-again-btn')).toBeVisible();

  await p.page.getByTestId('daily-again-btn').click();
  await waitForRacing(p.page);
  const st = await gameState(p.page);
  expect(st.phase).toBe('racing');
  expect(st.seed).toBe(dailySeed(dailyDateKey()));

  await p.context.close();
});
