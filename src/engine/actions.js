// Legal-action enumeration + execution. The single place that mutates state
// during a player's turn. Each action returns a list of log lines.

import { activePlayer, locationOf, logEntry, alivePlayers } from './state.js';
import { rollCheck, pickBestApproach, applyEffect } from './resolution.js';

// Each turn: 1 Move (optional) + 1 Act. Tracked via state.actionsThisTurn bitfield:
//   bit 0 = move spent, bit 1 = act spent. Both spent → end turn.
const MOVE_BIT = 1;
const ACT_BIT = 2;

export function hasMoved(state) { return (state.actionsThisTurn & MOVE_BIT) !== 0; }
export function hasActed(state) { return (state.actionsThisTurn & ACT_BIT) !== 0; }
export function turnDone(state) { return hasActed(state); } // ending an Act ends the turn

export function legalActions(state) {
  const player = activePlayer(state);
  if (!player || player.incapacitated) return [{ type: 'end_turn' }];
  if (state.finalAct) return legalFinalActActions(state, player);

  const actions = [];

  // Move actions (one per adjacent location, only if move not yet spent)
  if (!hasMoved(state)) {
    const here = locationOf(state, player.location);
    for (const adj of here.adjacent) {
      actions.push({ type: 'move', to: adj });
    }
  }

  if (!hasActed(state)) {
    // Attempt event at current location
    actions.push({ type: 'event' });
    // Rest (heal 2 HP, only if hurt)
    if (player.hp < player.maxHp) actions.push({ type: 'rest' });
    // Claim technique
    state.techniquesRow.forEach((_, idx) => {
      actions.push({ type: 'claim_technique', idx });
    });
    // Use class ability (very abstract — just "use ability")
    if (player.abilityUsedRound !== state.round) {
      actions.push({ type: 'ability' });
    }
    // Use a technique you already hold
    player.techniques.forEach((_, idx) => {
      actions.push({ type: 'use_technique', idx });
    });
    // Spend a favor to advance own quest stage (if quest open)
    if (player.favors >= 1 && !player.quest.completed) {
      actions.push({ type: 'favor_advance' });
    }
  }

  // Always allow ending the turn voluntarily.
  actions.push({ type: 'end_turn' });
  return actions;
}

function legalFinalActActions(state, player) {
  const actions = [{ type: 'end_turn' }];
  // Move toward final-act location if not there
  if (player.location !== state.finalAct.location) {
    const here = locationOf(state, player.location);
    for (const adj of here.adjacent) {
      actions.push({ type: 'move', to: adj });
    }
  } else if (!hasActed(state)) {
    // Each alignment can try its own resolution
    actions.push({ type: 'final_check', alignment: 'Lawful' });
    actions.push({ type: 'final_check', alignment: 'Neutral' });
    actions.push({ type: 'final_check', alignment: 'Chaotic' });
  }
  return actions;
}

export function performAction(state, action) {
  const player = activePlayer(state);
  if (!player) return;

  switch (action.type) {
    case 'move': return doMove(state, player, action.to);
    case 'event': return doEvent(state, player);
    case 'rest': return doRest(state, player);
    case 'claim_technique': return doClaimTechnique(state, player, action.idx);
    case 'use_technique': return doUseTechnique(state, player, action.idx);
    case 'ability': return doAbility(state, player);
    case 'favor_advance': return doFavorAdvance(state, player);
    case 'final_check': return doFinalCheck(state, player, action.alignment);
    case 'end_turn': return doEndTurn(state);
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

function doMove(state, player, locId) {
  player.location = locId;
  state.actionsThisTurn |= MOVE_BIT;
  const loc = locationOf(state, locId);
  logEntry(state, `${player.name} moves to ${loc.name}.`);
  // Track quest stage 2 (travel_to)
  const q = player.quest;
  if (!q.completed && q.currentStage === 1 && q.stages[1].type === 'travel_to') {
    if (loc.terrain === q.stages[1].terrain) {
      q.stagesDone[1] = true;
      q.currentStage = 2;
      logEntry(state, `${player.name} advances quest "${q.headline}" (stage 2 → 3).`);
    }
  }
}

function doEvent(state, player) {
  state.actionsThisTurn |= ACT_BIT;
  const loc = locationOf(state, player.location);
  // Draw an event card matching the terrain if possible; else universal.
  let evt = drawEvent(state, loc.terrain);
  const approach = pickBestApproach(player, evt, loc.terrain);
  const roll = rollCheck(state, player, approach.stat, approach.dc, { terrain: loc.terrain });
  logEntry(state, `${player.name} attempts ${evt.name} (${approach.stat} DC${approach.dc}): rolled ${roll.raw}+${roll.bonus}=${roll.total} → ${roll.outcome}.`);

  if (roll.outcome === 'success' || roll.outcome === 'critical') {
    applyEffect(state, player, approach.onSuccess);
    if (roll.outcome === 'critical') applyEffect(state, player, { favors: 1 });
    // Quest stage 1: any successful event
    const q = player.quest;
    if (!q.completed && q.currentStage === 0 && q.stages[0].type === 'event_success') {
      q.stagesDone[0] = true;
      q.currentStage = 1;
      logEntry(state, `${player.name} advances quest "${q.headline}" (stage 1 → 2).`);
    }
  } else {
    applyEffect(state, player, approach.onFail);
    if (roll.outcome === 'fumble') {
      applyEffect(state, player, { hp: -1, alert: 1 });
    }
  }
}

function drawEvent(state, terrain) {
  if (state.eventDeck.length === 0) {
    state.eventDeck = state.rng.shuffle(state.eventDiscard);
    state.eventDiscard = [];
  }
  // Prefer terrain-matched event from top few; else just take top.
  for (let i = 0; i < state.eventDeck.length; i++) {
    const e = state.eventDeck[i];
    if (e.terrain == null || e.terrain === terrain) {
      state.eventDeck.splice(i, 1);
      state.eventDiscard.push(e);
      return e;
    }
  }
  const e = state.eventDeck.shift();
  state.eventDiscard.push(e);
  return e;
}

function doRest(state, player) {
  state.actionsThisTurn |= ACT_BIT;
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + 2);
  logEntry(state, `${player.name} rests (${before} → ${player.hp} HP).`);
}

function doClaimTechnique(state, player, idx) {
  state.actionsThisTurn |= ACT_BIT;
  const t = state.techniquesRow.splice(idx, 1)[0];
  if (!t) return;
  player.techniques.push(t);
  logEntry(state, `${player.name} claims technique "${t.name}".`);
}

function doUseTechnique(state, player, idx) {
  state.actionsThisTurn |= ACT_BIT;
  const t = player.techniques.splice(idx, 1)[0];
  if (!t) return;
  const tech = t.tech;
  if (tech.type === 'heal') applyEffect(state, player, { hp: tech.value });
  if (tech.type === 'doomBack') state.doomClock = Math.max(0, state.doomClock - tech.value);
  // 'bonus' and 'reroll' techniques would apply to a future check; we apply
  // them as a temporary buff in player.pendingBonus for the next check.
  if (tech.type === 'bonus') {
    player.pendingBonus = { stat: tech.stat, value: tech.value, source: t.name };
  }
  if (tech.type === 'reroll') {
    player.pendingReroll = true;
  }
  logEntry(state, `${player.name} uses technique "${t.name}".`);
}

function doAbility(state, player) {
  state.actionsThisTurn |= ACT_BIT;
  player.abilityUsedRound = state.round;
  const cls = player.class;
  switch (cls.ability) {
    case 'heal':
      // Cleric: heal 2 HP, prefer most wounded ally
      {
        const target = state.players
          .filter((p) => !p.incapacitated && p.hp < p.maxHp)
          .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0] || player;
        applyEffect(state, target, { hp: 2 });
        logEntry(state, `${player.name} (Cleric) heals ${target.name} for 2.`);
      }
      break;
    case 'calm':
      // Paladin: reduce alert on current tile by 1
      {
        const loc = locationOf(state, player.location);
        if (loc) loc.alert = Math.max(0, loc.alert - 1);
        logEntry(state, `${player.name} (Paladin) calms ${loc?.name}.`);
      }
      break;
    case 'rejuvenate':
      // Druid: +1 HP to self + +1 to next check
      applyEffect(state, player, { hp: 1 });
      player.pendingBonus = { stat: null, value: 1, source: 'Druid Rejuvenate' };
      logEntry(state, `${player.name} (Druid) rejuvenates (+1 HP, +1 next check).`);
      break;
    default:
      // Reroll/bonus abilities apply on next check
      player.pendingBonus = { stat: null, value: 1, source: `${cls.name} ability` };
      logEntry(state, `${player.name} uses ${cls.name} ability (+1 next check).`);
  }
}

function doFavorAdvance(state, player) {
  if (player.favors < 1) return;
  state.actionsThisTurn |= ACT_BIT;
  player.favors -= 1;
  const q = player.quest;
  if (q.completed) return;
  q.stagesDone[q.currentStage] = true;
  q.currentStage += 1;
  logEntry(state, `${player.name} spends 1 Favor → advances quest "${q.headline}".`);
  checkQuestCompletion(state, player);
}

// Each alignment accepts two stats — players roll the better of the two.
// Symmetric coverage so every class primary maps to ≥1 alignment and no
// alignment has a structural advantage:
//   Lawful  (bind/capture)  : STR (subdue)        or DEX (precise binding)
//   Neutral (destroy)       : INT (find weakness) or STR (overpower)
//   Chaotic (claim power)   : CHA (charm/dominate) or INT (master arcana)
const ALIGNMENT_STATS = {
  Lawful: ['STR', 'DEX'],
  Neutral: ['INT', 'STR'],
  Chaotic: ['CHA', 'INT'],
};

function doFinalCheck(state, player, alignment) {
  state.actionsThisTurn |= ACT_BIT;
  const fa = state.finalAct;
  const dc = state.config.finalActDC;
  const threshold = state.config.finalActSuccessThreshold;
  const candidates = ALIGNMENT_STATS[alignment];
  const stat = candidates.reduce((best, s) => (player.stats[s] > player.stats[best] ? s : best), candidates[0]);
  const roll = rollCheck(state, player, stat, dc);
  logEntry(state, `${player.name} attempts ${alignment} resolution (${stat} DC${dc}): ${roll.total} → ${roll.outcome}.`);
  if (roll.outcome === 'success' || roll.outcome === 'critical') {
    fa.progress[alignment] = (fa.progress[alignment] || 0) + 1;
    if (fa.progress[alignment] >= threshold) {
      fa.resolved = alignment;
      logEntry(state, `*** ${alignment} resolution complete! ***`);
    }
  } else if (roll.outcome === 'fumble') {
    applyEffect(state, player, { hp: -2 });
  }
}

function doEndTurn(state) {
  state.actionsThisTurn = MOVE_BIT | ACT_BIT; // mark fully spent
  // Stage 3 (final stage) auto-resolves at end-of-turn if first two done and player is on quest's terrain
  const player = activePlayer(state);
  if (player && !player.quest.completed && player.quest.currentStage === 2) {
    const stage = player.quest.stages[2];
    if (stage.type === 'final') {
      // Stage 3 needs to be at a terrain matching their quest, and they must choose to commit.
      // Greedy model: commit if at right terrain.
      const loc = locationOf(state, player.location);
      const targetTerrain = player.quest.stages[1].terrain;
      if (loc?.terrain === targetTerrain) {
        commitQuestStage3(state, player);
      }
    }
  }
}

function commitQuestStage3(state, player) {
  const stage = player.quest.stages[2];
  player.quest.stagesDone[2] = true;
  player.quest.completed = true;
  player.questsCompleted += 1;
  logEntry(state, `${player.name} completes quest "${player.quest.headline}" — ${player.quest.twist}`);

  // Apply party impact
  if (stage.partyImpact === 'harm') {
    state.players.forEach((p) => {
      if (p.id !== player.id && !p.incapacitated) {
        p.hp = Math.max(0, p.hp - 1);
        if (p.hp === 0) p.incapacitated = true;
      }
    });
    state.doomClock = Math.min(state.config.doomMax, state.doomClock + 1);
    logEntry(state, `Party takes 1 damage and doom advances (Chaotic completion).`);
  } else if (stage.partyImpact === 'help') {
    state.players.forEach((p) => {
      if (p.id !== player.id && !p.incapacitated) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
      }
    });
    logEntry(state, `Party gains 1 HP (Lawful completion).`);
  }
}

export function checkQuestCompletion(state, player) {
  const q = player.quest;
  if (q.completed) return;
  if (q.currentStage >= q.stages.length) {
    q.completed = true;
    player.questsCompleted += 1;
    logEntry(state, `${player.name} completes quest "${q.headline}".`);
  }
}
