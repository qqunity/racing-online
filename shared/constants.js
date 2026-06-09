// Shared game constants — imported by both the Phaser client and the Node server.
// Keep this file dependency-free so it loads in the browser and in Node alike.

// Logical play-field dimensions. The client scales its camera to these.
export const VIEW_WIDTH = 480;
export const VIEW_HEIGHT = 800;

// Road / lanes
export const LANES = 4;
export const ROAD_MARGIN = 40; // px of grass on each side of the road
export const LANE_WIDTH = (VIEW_WIDTH - ROAD_MARGIN * 2) / LANES;

// Centre x of a lane index (0..LANES-1).
export function laneCenterX(lane) {
  return ROAD_MARGIN + LANE_WIDTH * lane + LANE_WIDTH / 2;
}

// Distance is measured in abstract "metres". The world scrolls downward as the
// player advances, so distance == how far the player has driven.
export const FINISH_DISTANCE = 3000;

// Speeds are in metres per second.
export const BASE_SPEED = 220; // forward speed with no modifiers
export const MIN_SPEED = 90; // speed floor while spun out / crashed
export const NITRO_SPEED = 360; // forward speed while nitro is active
export const OIL_SPEED = 120; // forward speed while spun out on oil

// Lateral movement: how long a lane-change tween takes (ms).
export const LANE_CHANGE_MS = 120;

// Power-up effect durations (ms).
export const NITRO_DURATION_MS = 2500;
export const OIL_DURATION_MS = 1800;
export const CRASH_DURATION_MS = 1200; // slowdown after hitting traffic
export const INVULN_AFTER_CRASH_MS = 800;

// Power-up / obstacle kinds.
export const ENTITY = {
  TRAFFIC: 'traffic',
  NITRO: 'nitro',
  OIL: 'oil',
};

// Race lifecycle.
export const COUNTDOWN_MS = 3000; // 3..2..1..GO
export const PROGRESS_TICK_MS = 100; // how often the client reports progress
export const MAX_PLAYERS = 6;

// Room codes.
export const ROOM_CODE_LENGTH = 4;

// Server-side sanity: the fastest physically possible finish time.
// Even flooring nothing but nitro the whole way can't beat this.
export const MIN_PLAUSIBLE_FINISH_MS =
  (FINISH_DISTANCE / NITRO_SPEED) * 1000 * 0.8;
