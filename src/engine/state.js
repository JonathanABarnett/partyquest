// Game state factory + setup. Pure functions only — all randomness via the
// passed-in rng instance.

import { makeRng } from './rng.js';
import {
  RACES, CLASSES, ALIGNMENTS, QUESTS, EVENTS, THREATS, TILE_POOL,
  statBlock,
} from './data.js';

// v1.2 — DC nudged 10 → 9, threshold restored to GDD canon (3 successes /
// 3 rounds). The big change is in actions.js: each alignment now accepts
// two stats (e.g. Lawful = STR or DEX), which gives every class primary at
// least one strong alignment and lets DEX classes contribute to the Final
// Act. See README §"What the sim found".
export const DEFAULT_CONFIG = {
  doomMax: 10,
  finalActWindow: 3,
  finalActDC: 9,
  finalActSuccessThreshold: 3,
  startingFavors: 2,
  techniquesRowMax: 5,
  questDrawSize: 2,
  movePerTurn: 1,
  // v1.4 dial — if true, class signature abilities fire automatically at the
  // top of the owner's turn when their trigger condition is met, and they do
  // not consume the act slot. Hypothesis: this lifts bottom-class win rates
  // (cleric/bard/rogue/ranger) and lets tactical play complete both s3 quests
  // AND class abilities in the same turn.
  abilitiesFree: false,
};

export function regionsForPlayerCount(n) {
  // 2p → 3 regions, 3p → 4, 4p → 5.
  return Math.max(3, n + 1);
}

export function setupGame({ seed = Date.now(), players, config = {} }) {
  const rng = makeRng(seed);
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. Map: capital + N region tiles arranged in a ring.
  const regionCount = regionsForPlayerCount(players.length);
  const tiles = rng.shuffle(TILE_POOL).slice(0, regionCount);

  const capital = {
    id: 'capital', name: 'The Capital', terrain: 'capital',
    adjacent: tiles.map((t) => t.id), alert: 0,
  };

  const regions = tiles.map((tile, i) => {
    const prev = tiles[(i - 1 + tiles.length) % tiles.length];
    const next = tiles[(i + 1) % tiles.length];
    return {
      id: tile.id,
      name: tile.name,
      terrain: tile.terrain,
      adjacent: [capital.id, prev.id, next.id].filter((x, idx, a) => a.indexOf(x) === idx && x !== tile.id),
      alert: 0,
    };
  });

  const map = { capital, regions, allLocations: [capital, ...regions] };

  // 2. Players: each gets race, class, alignment, quest.
  const playerStates = players.map((p, idx) => {
    const race = p.race ? RACES.find((r) => r.id === p.race) : rng.pick(RACES);
    const klass = p.class ? CLASSES.find((c) => c.id === p.class) : rng.pick(CLASSES);
    const alignment = p.alignment || rng.pick(ALIGNMENTS);

    // Filter quests for this class/alignment to ones whose required terrains are on the map.
    const terrainsOnMap = new Set(regions.map((r) => r.terrain));
    const eligibleQuests = QUESTS.filter((q) =>
      q.class === klass.id &&
      q.alignment === alignment &&
      q.locationRequirements.every((t) => terrainsOnMap.has(t))
    );
    // If terrain-filtered set empties (small map), fall back to all class+alignment quests.
    const questPool = eligibleQuests.length > 0
      ? eligibleQuests
      : QUESTS.filter((q) => q.class === klass.id && q.alignment === alignment);

    // Draw 2, keep 1 (engine picks first for determinism; UI will let humans pick later).
    const drawn = rng.shuffle(questPool).slice(0, Math.min(cfg.questDrawSize, questPool.length));
    const quest = drawn[0];

    return {
      id: `p${idx}`,
      name: p.name || `Player ${idx + 1}`,
      race,
      class: klass,
      alignment,
      stats: statBlock(klass),
      hp: klass.hp,
      maxHp: klass.hp,
      favors: cfg.startingFavors,
      location: 'capital',
      techniques: [],
      quest: {
        ...quest,
        currentStage: 0,
        stagesDone: [false, false, false],
        completed: false,
      },
      questsCompleted: 0,
      incapacitated: false,
      abilityUsedRound: -1,
      policy: p.policy || 'manual',
    };
  });

  // 3. Threat deck shuffled. Initial 3 cards revealed to start the techniques row.
  const threatDeck = rng.shuffle(THREATS);
  const techniquesRow = [];
  const initialReveal = threatDeck.splice(0, 3);
  // Add to techniques row without firing immediate effects (per §3.4).
  initialReveal.forEach((t) => techniquesRow.push(t));

  // 4. Event deck = all events shuffled, reshuffled when exhausted.
  const eventDeck = rng.shuffle(EVENTS);

  return {
    seed,
    config: cfg,
    rng,
    map,
    players: playerStates,
    threatDeck,
    eventDeck,
    eventDiscard: [],
    techniquesRow,
    doomClock: 0,
    round: 1,
    phase: 'world', // first thing each round is the World Phase
    currentPlayerIdx: 0,
    actionsThisTurn: 0, // each turn = 1 Move + 1 Act
    finalAct: null,
    outcome: null,
    log: [{ round: 0, msg: `Game start (seed ${seed}, ${playerStates.length} players)` }],
  };
}

export function activePlayer(state) {
  return state.players[state.currentPlayerIdx];
}

export function locationOf(state, locId) {
  if (locId === 'capital') return state.map.capital;
  return state.map.regions.find((r) => r.id === locId);
}

export function alivePlayers(state) {
  return state.players.filter((p) => !p.incapacitated);
}

export function logEntry(state, msg) {
  state.log.push({ round: state.round, phase: state.phase, player: state.currentPlayerIdx, msg });
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
}
