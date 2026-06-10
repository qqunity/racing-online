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

// On-screen sprite footprint (px). Loaded art is scaled to these via
// setDisplaySize so its native resolution doesn't affect gameplay; collisions
// in RaceScene are computed from CAR_H / LANE_WIDTH, not the texture size.
export const CAR_W = LANE_WIDTH * 0.62;
export const CAR_H = CAR_W * 1.7;
export const POWERUP_SIZE = LANE_WIDTH * 0.72;

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
  SHIELD: 'shield', // blocks one crash
  ATTACK: 'attack', // oil-bomb launched at the nearest opponent ahead
};

// Min interval between attack launches per player (server-enforced).
export const ATTACK_COOLDOWN_MS = 3000;

// Race lifecycle.
export const COUNTDOWN_MS = 3000; // 3..2..1..GO
export const PROGRESS_TICK_MS = 100; // how often the client reports progress
export const MAX_PLAYERS = 6;
// After the first finisher, the rest get this long to cross the line before
// the race is force-ended (stragglers rank by distance). Guards against a
// player whose tab went to background: the browser freezes rAF, so their car
// never moves and never finishes — without this the race would hang forever.
export const FINISH_GRACE_MS = 15000;

// Room codes.
export const ROOM_CODE_LENGTH = 4;

// Server-side sanity: the fastest physically possible finish time.
// Even flooring nothing but nitro the whole way can't beat this.
export const MIN_PLAUSIBLE_FINISH_MS =
  (FINISH_DISTANCE / NITRO_SPEED) * 1000 * 0.8;
