// Save/restore game state to localStorage.
// We can't JSON-stringify state directly because it contains rng (functions)
// and references to card/race/class objects that are also referenced by the
// static catalogs in data.js. We serialize by id and rehydrate on restore.

import { RACES, CLASSES, EVENTS, THREATS, QUESTS } from './data.js';
import { makeRng } from './rng.js';

const SAVE_KEY = 'partyquest:save-v1';
const RECORD_KEY = 'partyquest:record';

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
  };
}
