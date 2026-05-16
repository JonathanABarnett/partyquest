// Save/restore game state to localStorage.
// We can't JSON-stringify state directly because it contains rng (functions)
// and references to card/race/class objects that are also referenced by the
// static catalogs in data.js. We serialize by id and rehydrate on restore.

import { RACES, CLASSES, EVENTS, THREATS, QUESTS } from './data.js';
import { makeRng } from './rng.js';

const SAVE_KEY       = 'partyquest:save-v1';
const RECORD_KEY     = 'partyquest:record';
const SLOT_KEY       = (n) => `partyquest:slot-${n}`;
const AUTO_FA_KEY    = 'partyquest:autosnap-finalact';
const SLOT_ORDER_KEY = 'partyquest:slot-order';
export const SLOT_COUNT = 3;

// Slot display order — an array like [2, 1, 3] meaning slot-2 is shown first.
export function getSlotOrder() {
  try {
    const raw = localStorage.getItem(SLOT_ORDER_KEY);
    if (!raw) return Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);
    const o = JSON.parse(raw);
    // Validate: must be a permutation of 1..SLOT_COUNT
    if (Array.isArray(o) && o.length === SLOT_COUNT && new Set(o).size === SLOT_COUNT) return o;
  } catch {}
  return Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);
}

export function setSlotOrder(order) {
  try { localStorage.setItem(SLOT_ORDER_KEY, JSON.stringify(order)); } catch {}
}

// Swap two slot numbers in both storage AND the order array.
export function swapSlots(a, b) {
  const rawA = localStorage.getItem(SLOT_KEY(a));
  const rawB = localStorage.getItem(SLOT_KEY(b));
  if (rawA != null) localStorage.setItem(SLOT_KEY(b), rawA);
  else localStorage.removeItem(SLOT_KEY(b));
  if (rawB != null) localStorage.setItem(SLOT_KEY(a), rawB);
  else localStorage.removeItem(SLOT_KEY(a));
}

export function saveState(state) {
  if (!state) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(state)));
  } catch { /* private mode etc. — silent */ }
}

export function loadSavedState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return deserialize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSavedState() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

// W/L/T tally across the human's sessions.
export function loadRecord() {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (!raw) return { wins: 0, losses: 0, ties: 0 };
    return JSON.parse(raw);
  } catch {
    return { wins: 0, losses: 0, ties: 0 };
  }
}

export function recordOutcome(outcome) {
  if (!outcome) return loadRecord();
  const r = loadRecord();
  if (outcome.partyWin) r.wins += 1;
  else r.losses += 1; // any non-win counts as a loss for now
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); } catch {}
  return r;
}

export function resetRecord() {
  try { localStorage.removeItem(RECORD_KEY); } catch {}
}

// --- Named save slots (in addition to the auto-save / resume slot) ---
// Each slot is a manually-named snapshot the player can save into and load
// back from. Same serialize format; just a different storage key.

export function saveSlot(n, state, name) {
  if (!state || n < 1 || n > SLOT_COUNT) return;
  try {
    const existing = (() => { try { return JSON.parse(localStorage.getItem(SLOT_KEY(n))).meta; } catch { return {}; } })();
    const meta = {
      ts: Date.now(),
      round: state.round,
      doom: state.doomClock,
      finalAct: !!state.finalAct,
      playerCount: state.players.length,
      humanCount: state.players.filter((p) => p.policy === 'manual').length,
      seed: state.seed,
      name: name != null ? name : (existing?.name || ''),
    };
    const blob = { meta, state: serialize(state) };
    localStorage.setItem(SLOT_KEY(n), JSON.stringify(blob));
    return meta;
  } catch { return null; }
}

export function renameSlot(n, name) {
  try {
    const raw = localStorage.getItem(SLOT_KEY(n));
    if (!raw) return;
    const blob = JSON.parse(raw);
    blob.meta = { ...(blob.meta || {}), name };
    localStorage.setItem(SLOT_KEY(n), JSON.stringify(blob));
  } catch {}
}

export function loadSlot(n) {
  try {
    const raw = localStorage.getItem(SLOT_KEY(n));
    if (!raw) return null;
    const blob = JSON.parse(raw);
    return { meta: blob.meta, state: deserialize(blob.state) };
  } catch { return null; }
}

export function listSlots() {
  const out = [];
  for (let n = 1; n <= SLOT_COUNT; n++) {
    try {
      const raw = localStorage.getItem(SLOT_KEY(n));
      out.push(raw ? { n, ...JSON.parse(raw).meta } : { n, empty: true });
    } catch { out.push({ n, empty: true }); }
  }
  return out;
}

export function clearSlot(n) {
  try { localStorage.removeItem(SLOT_KEY(n)); } catch {}
}

// Auto-snapshot taken when the Final Act first triggers. A single dedicated
// slot, separate from the manual ones, so the player can always retry the
// climax without overwriting their own snapshots.
export function saveAutoFinalActSnapshot(state) {
  if (!state) return;
  try {
    const meta = {
      ts: Date.now(),
      round: state.round,
      doom: state.doomClock,
      finalAct: true,
      playerCount: state.players.length,
      humanCount: state.players.filter((p) => p.policy === 'manual').length,
      seed: state.seed,
      auto: true,
    };
    localStorage.setItem(AUTO_FA_KEY, JSON.stringify({ meta, state: serialize(state) }));
  } catch {}
}

export function loadAutoFinalActSnapshot() {
  try {
    const raw = localStorage.getItem(AUTO_FA_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw);
    return { meta: blob.meta, state: deserialize(blob.state) };
  } catch { return null; }
}

export function getAutoFinalActMeta() {
  try {
    const raw = localStorage.getItem(AUTO_FA_KEY);
    if (!raw) return null;
    return JSON.parse(raw).meta;
  } catch { return null; }
}

export function clearAutoFinalActSnapshot() {
  try { localStorage.removeItem(AUTO_FA_KEY); } catch {}
}

function byId(list, id) { return list.find((x) => x.id === id); }

function serialize(s) {
  return {
    v: 1,
    seed: s.seed,
    config: s.config,
    rngState: s.rng.getState(),
    map: s.map,
    players: s.players.map((p) => ({
      id: p.id,
      name: p.name,
      raceId: p.race.id,
      classId: p.class.id,
      alignment: p.alignment,
      stats: p.stats,
      hp: p.hp,
      maxHp: p.maxHp,
      favors: p.favors,
      location: p.location,
      techniqueIds: p.techniques.map((t) => t.id),
      quest: {
        id: p.quest.id,
        currentStage: p.quest.currentStage,
        stagesDone: p.quest.stagesDone,
        completed: p.quest.completed,
      },
      questsCompleted: p.questsCompleted,
      incapacitated: p.incapacitated,
      abilityUsedRound: p.abilityUsedRound,
      policy: p.policy,
      pendingBonus: p.pendingBonus || null,
      pendingReroll: !!p.pendingReroll,
    })),
    threatDeckIds: s.threatDeck.map((t) => t.id),
    eventDeckIds: s.eventDeck.map((e) => e.id),
    eventDiscardIds: s.eventDiscard.map((e) => e.id),
    techniquesRowIds: s.techniquesRow.map((t) => t.id),
    doomClock: s.doomClock,
    round: s.round,
    phase: s.phase,
    currentPlayerIdx: s.currentPlayerIdx,
    actionsThisTurn: s.actionsThisTurn,
    finalAct: s.finalAct,
    outcome: s.outcome,
    log: (s.log || []).slice(-200),
    actionHistory: (s.actionHistory || []).slice(-500),
  };
}

function deserialize(d) {
  if (!d || d.v !== 1) return null;
  const rng = makeRng(d.seed);
  rng.setState(d.rngState);
  return {
    seed: d.seed,
    config: d.config,
    rng,
    map: d.map,
    players: d.players.map((p) => {
      const race = byId(RACES, p.raceId);
      const klass = byId(CLASSES, p.classId);
      const quest = byId(QUESTS, p.quest.id);
      return {
        id: p.id,
        name: p.name,
        race,
        class: klass,
        alignment: p.alignment,
        stats: p.stats,
        hp: p.hp,
        maxHp: p.maxHp,
        favors: p.favors,
        location: p.location,
        techniques: p.techniqueIds.map((id) => byId(THREATS, id)).filter(Boolean),
        quest: {
          ...quest,
          currentStage: p.quest.currentStage,
          stagesDone: p.quest.stagesDone,
          completed: p.quest.completed,
        },
        questsCompleted: p.questsCompleted,
        incapacitated: p.incapacitated,
        abilityUsedRound: p.abilityUsedRound,
        policy: p.policy,
        pendingBonus: p.pendingBonus || null,
        pendingReroll: !!p.pendingReroll,
      };
    }),
    threatDeck: d.threatDeckIds.map((id) => byId(THREATS, id)).filter(Boolean),
    eventDeck: d.eventDeckIds.map((id) => byId(EVENTS, id)).filter(Boolean),
    eventDiscard: d.eventDiscardIds.map((id) => byId(EVENTS, id)).filter(Boolean),
    techniquesRow: d.techniquesRowIds.map((id) => byId(THREATS, id)).filter(Boolean),
    doomClock: d.doomClock,
    round: d.round,
    phase: d.phase,
    currentPlayerIdx: d.currentPlayerIdx,
    actionsThisTurn: d.actionsThisTurn,
    finalAct: d.finalAct,
    outcome: d.outcome,
    log: d.log || [],
    actionHistory: d.actionHistory || [],
  };
}
