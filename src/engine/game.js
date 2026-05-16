// Top-level round/phase orchestrator. The UI and sim both call advance() to
// step state forward one action; advance auto-runs World/End phases.

import { activePlayer, alivePlayers, logEntry } from './state.js';
import { legalActions, performAction, turnDone, maybeAutoTriggerAbility } from './actions.js';
import { applyEffect } from './resolution.js';

// Step the game forward by ONE atomic decision. If the current phase doesn't
// require a decision (World, End), advance fires it automatically. Returns the
// type of step that happened: 'world' | 'player' | 'end' | 'final' | 'gameover'.
export function step(state, decisionFn) {
  if (state.outcome) return 'gameover';

  if (state.phase === 'world') {
    runWorldPhase(state);
    // triggerFinalAct may have flipped phase to 'final' — preserve it.
    if (state.phase === 'world') state.phase = 'player';
    state.currentPlayerIdx = 0;
    state.actionsThisTurn = 0;
    skipDeadPlayers(state);
    return 'world';
  }

  if (state.phase === 'player' || state.phase === 'final') {
    const p = activePlayer(state);
    if (!p || alivePlayers(state).length === 0) {
      endRound(state);
      return 'end';
    }
    // Auto-fire ability at top of turn if the config dial is on and the
    // trigger condition is met. Free of the act-slot cost.
    if (state.actionsThisTurn === 0) maybeAutoTriggerAbility(state, p);
    const legal = legalActions(state);
    const choice = decisionFn(state, p, legal);
    performAction(state, choice);
    if (state.finalAct?.resolved) {
      finalizeFinalAct(state);
      return 'gameover';
    }
    if (turnDone(state)) advanceTurn(state);
    return state.phase;
  }

  return 'idle';
}

function runWorldPhase(state) {
  // Draw 1 threat card → resolve immediate, advance doom, add to techniques row.
  if (state.threatDeck.length === 0) {
    // Reshuffle from existing row + a tiny base set so we never starve
    state.threatDeck = state.rng.shuffle(state.techniquesRow.slice());
  }
  const t = state.threatDeck.shift();
  if (!t) {
    state.doomClock = Math.min(state.config.doomMax, state.doomClock + 1);
    logEntry(state, `Round ${state.round} — World Phase: no threat available, doom +1.`);
  } else {
    applyEffect(state, null, { doom: t.doom });
    // immediate effects: party-wide
    if (t.immediate) {
      if (t.immediate.partyHp != null) {
        state.players.forEach((p) => {
          if (!p.incapacitated) {
            p.hp = Math.max(0, p.hp + t.immediate.partyHp);
            if (p.hp === 0) p.incapacitated = true;
          }
        });
      }
      if (t.immediate.alertEach != null) {
        state.map.regions.forEach((r) => { r.alert += t.immediate.alertEach; });
      }
      if (t.immediate.drainFavors != null) {
        state.players.forEach((p) => { p.favors = Math.max(0, p.favors - t.immediate.drainFavors); });
      }
    }
    state.techniquesRow.push(t);
    if (state.techniquesRow.length > state.config.techniquesRowMax) {
      state.techniquesRow.shift();
    }
    logEntry(state, `Round ${state.round} — Threat: ${t.name} (+${t.doom} doom).`);
  }

  if (state.doomClock >= state.config.doomMax && !state.finalAct) {
    triggerFinalAct(state);
  }
}

function advanceTurn(state) {
  state.currentPlayerIdx += 1;
  state.actionsThisTurn = 0;
  if (state.currentPlayerIdx >= state.players.length) {
    endRound(state);
    return;
  }
  skipDeadPlayers(state);
}

function skipDeadPlayers(state) {
  // Skip past incapacitated players for the player phase
  let safety = state.players.length + 1;
  while (safety-- > 0 && state.currentPlayerIdx < state.players.length && state.players[state.currentPlayerIdx].incapacitated) {
    state.currentPlayerIdx += 1;
    state.actionsThisTurn = 0;
  }
}

function endRound(state) {
  state.phase = 'end';
  logEntry(state, `End of round ${state.round}.`);
  // Round bookkeeping
  state.round += 1;
  state.currentPlayerIdx = 0;
  state.actionsThisTurn = 0;
  // Game-over checks
  if (alivePlayers(state).length === 0) {
    state.outcome = computeOutcome(state, { partyWin: false, reason: 'TPK' });
    return;
  }
  // Tick the Final Act countdown at the end of each round during final phase.
  if (state.finalAct) {
    state.finalAct.roundsElapsed += 1;
    if (state.finalAct.roundsElapsed >= state.config.finalActWindow) {
      finalizeFinalAct(state);
      return;
    }
    state.phase = 'final';
  } else {
    state.phase = 'world';
  }
}

function triggerFinalAct(state) {
  // Pick the final-act location: pick a random non-capital region
  const loc = state.rng.pick(state.map.regions);
  state.finalAct = {
    location: loc.id,
    roundsElapsed: 0,
    progress: { Lawful: 0, Neutral: 0, Chaotic: 0 },
    resolved: null,
  };
  logEntry(state, `*** FINAL ACT triggered at ${loc.name}. Party has ${state.config.finalActWindow} rounds. ***`);
  state.phase = 'final';
  state.currentPlayerIdx = 0;
  state.actionsThisTurn = 0;
}

function finalizeFinalAct(state) {
  if (state.outcome) return;
  const fa = state.finalAct;
  if (fa?.resolved) {
    state.outcome = computeOutcome(state, { partyWin: true, resolvedBy: fa.resolved });
  } else {
    state.outcome = computeOutcome(state, { partyWin: false, reason: 'timeout' });
  }
}

function computeOutcome(state, base) {
  const scores = state.players.map((p) => {
    let score = 0;
    if (base.partyWin && p.alignment === base.resolvedBy) score += 5;
    if (p.questsCompleted > 0) score += 4 * p.questsCompleted;
    if (!p.incapacitated) score += 1;
    score += p.techniques.length;
    score += p.favors;
    return { playerId: p.id, name: p.name, alignment: p.alignment, score, alive: !p.incapacitated, questsCompleted: p.questsCompleted };
  });
  logEntry(state, `Game over: ${base.partyWin ? `party win (${base.resolvedBy})` : `party loss (${base.reason})`}.`);
  return { ...base, scores, finishedRound: state.round };
}

// Convenience: run the entire game using the provided decision function.
export function playGame(state, decisionFn, opts = {}) {
  const maxSteps = opts.maxSteps ?? 5000;
  let steps = 0;
  while (!state.outcome && steps < maxSteps) {
    step(state, decisionFn);
    steps += 1;
  }
  if (!state.outcome) {
    state.outcome = { partyWin: false, reason: 'max-steps', scores: [], finishedRound: state.round };
  }
  return state.outcome;
}
