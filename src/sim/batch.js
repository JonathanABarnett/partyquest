// Monte Carlo batch runner. Plays N full games with given AI policies and
// returns aggregated stats.

import { setupGame } from '../engine/state.js';
import { playGame } from '../engine/game.js';
import { pickByPolicy } from '../ai/policies.js';
import { mixSeed } from '../engine/rng.js';

export function runBatch({ games, playerCount, policy, baseSeed, configOverride = {} }) {
  const t0 = performance.now();
  const results = [];
  const winByAlignment = { Lawful: 0, Neutral: 0, Chaotic: 0 };
  const winByClass = {};
  const questCompletionsByStage = [0, 0, 0]; // s1, s2, s3
  const roundsHist = [];
  let partyWins = 0;
  let tpkLosses = 0;
  let timeoutLosses = 0;

  for (let i = 0; i < games; i++) {
    const seed = mixSeed(baseSeed, i);
    const players = Array.from({ length: playerCount }, (_, idx) => ({
      name: `P${idx + 1}`,
      policy,
    }));
    const state = setupGame({ seed, players, config: configOverride });
    const outcome = playGame(state, (s, p, legal) => pickByPolicy(policy, s, p, legal));

    results.push({ seed, outcome });
    roundsHist.push(outcome.finishedRound);
    if (outcome.partyWin) {
      partyWins += 1;
      if (outcome.resolvedBy) winByAlignment[outcome.resolvedBy] += 1;
    } else if (outcome.reason === 'TPK') {
      tpkLosses += 1;
    } else {
      timeoutLosses += 1;
    }
    // Per-player class win/quest stats
    state.players.forEach((p) => {
      const key = p.class.id;
      if (!winByClass[key]) winByClass[key] = { games: 0, wins: 0, quests: 0 };
      winByClass[key].games += 1;
      if (outcome.partyWin && p.alignment === outcome.resolvedBy) winByClass[key].wins += 1;
      winByClass[key].quests += p.questsCompleted;
      // Count stage completions (s1 done, s2 done, s3 done)
      p.quest.stagesDone.forEach((done, idx) => {
        if (done) questCompletionsByStage[idx] += 1;
      });
    });
  }

  const t1 = performance.now();
  const totalPlayers = games * playerCount;
  return {
    games,
    playerCount,
    policy,
    baseSeed,
    elapsedMs: t1 - t0,
    partyWinRate: partyWins / games,
    tpkRate: tpkLosses / games,
    timeoutRate: timeoutLosses / games,
    winByAlignment: {
      Lawful: winByAlignment.Lawful / games,
      Neutral: winByAlignment.Neutral / games,
      Chaotic: winByAlignment.Chaotic / games,
    },
    winByClass: Object.fromEntries(
      Object.entries(winByClass).map(([k, v]) => [k, {
        winRate: v.wins / v.games,
        questCompletionRate: v.quests / v.games,
        sample: v.games,
      }])
    ),
    questCompletionByStage: questCompletionsByStage.map((n) => n / totalPlayers),
    avgRounds: roundsHist.reduce((a, b) => a + b, 0) / roundsHist.length,
    minRounds: Math.min(...roundsHist),
    maxRounds: Math.max(...roundsHist),
  };
}

// Sensitivity sweep: run the same seed range across a baseline + list of
// variants. Each variant is { name, config } where config patches DEFAULT_CONFIG.
// Returns rows ready to render as a comparison table.
export function runSweep({ games, playerCount, policy, baseSeed, variants }) {
  const rows = [];
  let baseWinRate = null;
  for (const v of variants) {
    const r = runBatch({ games, playerCount, policy, baseSeed, configOverride: v.config || {} });
    if (baseWinRate === null) baseWinRate = r.partyWinRate;
    rows.push({
      name: v.name,
      config: v.config || {},
      winRate: r.partyWinRate,
      delta: r.partyWinRate - baseWinRate,
      tpkRate: r.tpkRate,
      timeoutRate: r.timeoutRate,
      avgRounds: r.avgRounds,
      winByAlignment: r.winByAlignment,
      elapsedMs: r.elapsedMs,
    });
  }
  return { games, playerCount, policy, baseSeed, rows };
}

// Run N batches with different seeds; report mean and stdev of win rate across batches.
export function runVarianceCheck({ batches = 5, games, playerCount, policy, baseSeed = 1 }) {
  const summaries = [];
  for (let b = 0; b < batches; b++) {
    summaries.push(runBatch({ games, playerCount, policy, baseSeed: mixSeed(baseSeed, b * 7919) }));
  }
  const winRates = summaries.map((s) => s.partyWinRate);
  const mean = winRates.reduce((a, b) => a + b, 0) / winRates.length;
  const variance = winRates.reduce((a, b) => a + (b - mean) ** 2, 0) / winRates.length;
  const stdev = Math.sqrt(variance);
  return { summaries, winRates, mean, stdev };
}
