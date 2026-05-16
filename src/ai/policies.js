// AI decision policies. Each is `(state, player, legalActions) => action`.
// Used by both manual fallback and batch simulation.

import { locationOf } from '../engine/state.js';
import { statBonus } from '../engine/resolution.js';

export const POLICIES = {
  random,
  greedy,
  altruistic,
  mixed,
  tactical,
  opportunist,
};

export function pickByPolicy(name, state, player, legal) {
  const fn = POLICIES[name] || greedy;
  return fn(state, player, legal);
}

function random(state, player, legal) {
  return legal[state.rng.int(legal.length)];
}

// Greedy: maximize personal quest progress, with sensible self-preservation.
function greedy(state, player, legal) {
  // 0. Survival: if HP <= 2, rest is highest priority.
  if (player.hp <= 2) {
    const rest = legal.find((a) => a.type === 'rest');
    if (rest) return rest;
  }

  // 0a. Final Act takes priority over everything else — game ends soon.
  if (state.finalAct) {
    if (player.location !== state.finalAct.location) {
      const moves = legal.filter((a) => a.type === 'move');
      if (moves.length > 0) {
        const direct = moves.find((m) => m.to === state.finalAct.location);
        if (direct) return direct;
        return moves[0];
      }
    } else {
      const my = legal.find((a) => a.type === 'final_check' && a.alignment === player.alignment);
      if (my) return my;
      const any = legal.find((a) => a.type === 'final_check');
      if (any) return any;
    }
    return legal.find((a) => a.type === 'end_turn') || legal[0];
  }

  const q = player.quest;

  // 1. If quest is complete, free actions: claim techniques, then attempt events for techniques.
  if (q.completed) {
    const claim = legal.find((a) => a.type === 'claim_technique');
    if (claim && player.techniques.length < 2) return claim;
    const evt = legal.find((a) => a.type === 'event');
    if (evt) return evt;
  }

  // 2. Stage 0 → need event success. If we can event here, do it (prefer events with a check we're good at).
  if (!q.completed && q.currentStage === 0) {
    const evt = legal.find((a) => a.type === 'event');
    if (evt) return evt;
  }

  // 3. Stage 1 → travel toward terrain matching q.stages[1].terrain.
  if (!q.completed && q.currentStage === 1) {
    const target = q.stages[1].terrain;
    const moves = legal.filter((a) => a.type === 'move');
    if (moves.length > 0) {
      // Prefer move to target terrain; else any move toward a tile of that terrain.
      const direct = moves.find((m) => locationOf(state, m.to)?.terrain === target);
      if (direct) return direct;
      // Otherwise pick a random move (we'll keep moving and re-evaluate)
      return moves[0];
    }
    // No move available; spend a favor to advance if possible.
    const fav = legal.find((a) => a.type === 'favor_advance');
    if (fav) return fav;
  }

  // 4. Stage 2 → on terrain, end turn (auto-commit on end_turn) or favor-advance.
  if (!q.completed && q.currentStage === 2) {
    const here = locationOf(state, player.location);
    const target = q.stages[1].terrain;
    if (here?.terrain === target) {
      return legal.find((a) => a.type === 'end_turn') || legal[0];
    }
    // Need to travel back to right terrain
    const moves = legal.filter((a) => a.type === 'move');
    if (moves.length > 0) {
      const direct = moves.find((m) => locationOf(state, m.to)?.terrain === target);
      if (direct) return direct;
      return moves[0];
    }
  }

  // 5. Fallback: claim a free technique or end turn.
  const claim = legal.find((a) => a.type === 'claim_technique');
  if (claim && player.techniques.length === 0) return claim;
  const evt = legal.find((a) => a.type === 'event');
  if (evt) return evt;
  return legal.find((a) => a.type === 'end_turn') || legal[0];
}

// Altruistic: maximize party progress (lower doom, support others) over self.
function altruistic(state, player, legal) {
  // 0. Heal allies if Cleric
  if (player.hp <= 3) {
    const rest = legal.find((a) => a.type === 'rest');
    if (rest) return rest;
  }

  // 1. Use class ability if available (heal/calm helps party)
  const ability = legal.find((a) => a.type === 'ability');
  if (ability && (player.class.ability === 'heal' || player.class.ability === 'calm')) return ability;

  // 2. Final Act: rush in, attempt resolution of the alignment with most progress.
  if (state.finalAct) {
    if (player.location !== state.finalAct.location) {
      const moves = legal.filter((a) => a.type === 'move');
      if (moves.length > 0) {
        const direct = moves.find((m) => m.to === state.finalAct.location);
        if (direct) return direct;
        return moves[0];
      }
    } else {
      // Pick the leading alignment IF one is actually ahead; on ties (e.g. all
      // zero at the start) fall back to the player's own alignment so altruists
      // don't all bandwagon onto the same entry-order-default. This was a sim
      // degeneracy in v1.3 — every game was converging to Lawful.
      const sorted = Object.entries(state.finalAct.progress).sort((a, b) => b[1] - a[1]);
      const top = sorted[0];
      const second = sorted[1];
      const leading = top && (!second || top[1] > second[1]) ? top[0] : player.alignment;
      const choice = legal.find((a) => a.type === 'final_check' && a.alignment === leading);
      if (choice) return choice;
    }
  }

  // 3. Otherwise event for techniques, claim techniques.
  const evt = legal.find((a) => a.type === 'event');
  if (evt) return evt;
  const claim = legal.find((a) => a.type === 'claim_technique');
  if (claim) return claim;
  return legal.find((a) => a.type === 'end_turn') || legal[0];
}

function mixed(state, player, legal) {
  // Alternate between greedy and altruistic by player index parity.
  const fn = state.currentPlayerIdx % 2 === 0 ? greedy : altruistic;
  return fn(state, player, legal);
}

// Tactical: class-ability-aware. Uses each class's signature ability at its
// highest-leverage moment, then falls back to greedy quest progression.
// Tests the hypothesis that the v1.2 class spread is AI quality, not class
// balance.
function tactical(state, player, legal) {
  const ability = legal.find((a) => a.type === 'ability');
  if (ability) {
    const trigger = abilityTrigger(state, player);
    if (trigger) return ability;
  }

  // Pre-Final-Act: claim threat techniques aggressively. They're free power
  // and the AI will spend them in Final Act for stat bonuses.
  if (!state.finalAct) {
    const claim = legal.find((a) => a.type === 'claim_technique');
    if (claim && player.techniques.length < 2 && state.doomClock >= 5) return claim;
  }

  // During Final Act: spend held techniques BEFORE attempting the check (they
  // give +bonus to next check).
  if (state.finalAct && player.location === state.finalAct.location) {
    const useTech = legal.find((a) => a.type === 'use_technique');
    if (useTech && !player.pendingBonus) {
      const tech = player.techniques[useTech.idx];
      // Use a stat-bonus tech only if it matches an alignment check the player
      // will attempt.
      if (tech?.tech?.type === 'bonus') return useTech;
    }
  }

  // Otherwise greedy.
  return greedy(state, player, legal);
}

function abilityTrigger(state, player) {
  switch (player.class.ability) {
    case 'heal':
      // Cleric: trigger when any ally (including self) is below half HP.
      return state.players.some((p) => !p.incapacitated && p.hp <= Math.floor(p.maxHp / 2));
    case 'calm':
      // Paladin: trigger if current tile has alert >= 1.
      return state.map.allLocations.find((l) => l.id === player.location)?.alert >= 1;
    case 'inspire':
      // Bard: trigger if a teammate is about to attempt a Final Act check.
      // Heuristic: Final Act active and at least one teammate at finalAct loc.
      return state.finalAct && state.players.some(
        (p) => p.id !== player.id && !p.incapacitated && p.location === state.finalAct.location
      );
    case 'wildernessBonus':
      // Ranger: trigger when on forest/mountain and about to attempt event.
      {
        const loc = state.map.allLocations.find((l) => l.id === player.location);
        return loc && (loc.terrain === 'forest' || loc.terrain === 'mountain');
      }
    case 'rejuvenate':
      // Druid: trigger if hurt OR about to do a quest stage check.
      return player.hp < player.maxHp || player.quest.currentStage <= 1;
    case 'rerollStr':
    case 'rerollDex':
      // Fighter / Rogue: fire when about to attempt event (gives reroll headroom).
      return !state.finalAct && player.quest.currentStage === 0;
    case 'bonusInt':
      // Wizard: fire pre-Final-Act so the +2 INT applies during check.
      return state.finalAct && player.alignment === 'Neutral';
    default:
      return false;
  }
}

// Opportunist: altruistic while doom < 7 (help party survive), then greedy
// once doom is high (commit personal quest). Models the realistic human
// pivot from cooperation to self-interest under pressure.
function opportunist(state, player, legal) {
  if (state.doomClock < 7 && !state.finalAct) {
    return altruistic(state, player, legal);
  }
  return greedy(state, player, legal);
}
