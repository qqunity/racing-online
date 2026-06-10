// Daily challenge: everyone in the world races the same track on a given UTC
// day. The seed is derived deterministically from the date, so client and
// server (and every player) agree without any extra coordination.
// Dependency-free ESM — imported by the browser, the Node server and tests.

// UTC calendar date as 'YYYY-MM-DD'.
export function dailyDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// FNV-1a hash of the date key, as an unsigned 32-bit seed for mulberry32.
export function dailySeed(dateKey) {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
