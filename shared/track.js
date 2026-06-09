// Deterministic track generation. Given a seed, produces the exact same ordered
// list of entities (traffic, nitro, oil) for every player in a room — this is
// the core fairness guarantee. The client spawns these as the player advances;
// tests use it to assert two clients see identical layouts.

import { createRng } from './rng.js';
import { LANES, FINISH_DISTANCE, ENTITY } from './constants.js';

const START_RUNWAY = 500; // clear space before the first obstacle
const FINISH_BUFFER = 200; // clear space before the finish line
const MIN_GAP = 220; // min metres between consecutive rows
const MAX_GAP = 420; // max metres between rows

// Generate the full ordered list of entities for a race.
// Returns: Array<{ id, dist, lane, kind }> sorted ascending by dist.
export function generateTrack(seed) {
  const rng = createRng(seed);
  const entities = [];
  let dist = START_RUNWAY;
  let id = 0;

  while (dist < FINISH_DISTANCE - FINISH_BUFFER) {
    // Decide how many traffic cars in this row. Never block every lane so the
    // row is always passable; leave at least one free lane.
    const trafficCount = rng.int(1, LANES); // 1..LANES-1
    const lanes = shuffledLanes(rng);
    const trafficLanes = lanes.slice(0, trafficCount);
    const freeLanes = lanes.slice(trafficCount);

    for (const lane of trafficLanes) {
      entities.push({ id: id++, dist, lane, kind: ENTITY.TRAFFIC });
    }

    // Occasionally drop a power-up / hazard into one of the free lanes.
    if (freeLanes.length > 0) {
      const roll = rng.next();
      if (roll < 0.22) {
        entities.push({ id: id++, dist, lane: freeLanes[0], kind: ENTITY.NITRO });
      } else if (roll < 0.42) {
        entities.push({ id: id++, dist, lane: freeLanes[0], kind: ENTITY.OIL });
      }
    }

    dist += MIN_GAP + Math.floor(rng.next() * (MAX_GAP - MIN_GAP));
  }

  return entities;
}

// Fisher–Yates shuffle of lane indices using the seeded rng.
function shuffledLanes(rng) {
  const lanes = [];
  for (let i = 0; i < LANES; i++) lanes.push(i);
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  return lanes;
}

// Stable fingerprint of a track — handy for fairness assertions in tests.
export function trackFingerprint(entities) {
  return entities.map((e) => `${e.dist}:${e.lane}:${e.kind}`).join('|');
}
