// Control panel: setup form, step/run buttons, batch sim controls.

import { setupGame } from '../engine/state.js';
import { step } from '../engine/game.js';
import { pickByPolicy } from '../ai/policies.js';
import { runBatch, runVarianceCheck, runSweep } from '../sim/batch.js';
import { legalActions } from '../engine/actions.js';
import { activePlayer } from '../engine/state.js';

export function mountControls(root, { onNewState }) {
  let state = null;

  const ctrl = document.createElement('div');
  ctrl.className = 'control-panel panel';
  ctrl.innerHTML = `
    <h3>Controls</h3>
    <div class="control-row">
      <label>Players
        <select id="playerCount">
          <option>2</option><option selected>3</option><option>4</option>
        </select>
      </label>
      <label>Policy
        <select id="policy">
          <option value="greedy" selected>greedy</option>
          <option value="random">random</option>
          <option value="altruistic">altruistic</option>
          <option value="mixed">mixed</option>
          <option value="tactical">tactical</option>
          <option value="opportunist">opportunist</option>
        </select>
      </label>
      <label>Seed
        <input type="number" id="seed" value="1" />
      </label>
      <button id="newGame">New Game</button>
    </div>
    <div class="control-row">
      <button id="stepOne">Step 1 action</button>
      <button id="stepTurn">Step 1 turn</button>
      <button id="stepRound">Step 1 round</button>
      <button id="playOut">Play to end</button>
    </div>
    <div class="control-row">
      <h4>Manual action (current player)</h4>
      <select id="actionPick"></select>
      <button id="actionGo">Do</button>
    </div>
    <hr/>
    <h4>Monte Carlo Simulation</h4>
    <div class="control-row">
      <label>Games <input type="number" id="simGames" value="1000" min="10" max="10000"/></label>
      <label>Players <select id="simPlayers"><option>2</option><option selected>3</option><option>4</option></select></label>
      <label>Policy <select id="simPolicy">
        <option value="greedy" selected>greedy</option>
        <option value="random">random</option>
        <option value="altruistic">altruistic</option>
        <option value="mixed">mixed</option>
        <option value="tactical">tactical</option>
        <option value="opportunist">opportunist</option>
      </select></label>
      <button id="runSim">Run batch</button>
      <button id="runVariance">5-batch variance</button>
      <button id="runSweep">Sensitivity sweep</button>
    </div>
    <div id="simResults" class="sim-results"></div>
  `;
  root.appendChild(ctrl);

  const $ = (id) => ctrl.querySelector('#' + id);

  function newGame() {
    const playerCount = parseInt($('playerCount').value, 10);
    const policy = $('policy').value;
    const seed = parseInt($('seed').value, 10) || 1;
    const players = Array.from({ length: playerCount }, (_, i) => ({
      name: `P${i + 1}`, policy,
    }));
    state = setupGame({ seed, players });
    refreshActionList();
    onNewState(state);
  }

  function decisionFn(s, p, legal) {
    // Default to the player's own policy (manual override happens via UI buttons).
    return pickByPolicy(p.policy === 'manual' ? 'greedy' : p.policy, s, p, legal);
  }

  function stepOne() {
    if (!state || state.outcome) return;
    step(state, decisionFn);
    refreshActionList();
    onNewState(state);
  }

  function stepTurn() {
    if (!state || state.outcome) return;
    const startIdx = state.currentPlayerIdx;
    const startRound = state.round;
    let safety = 200;
    while (safety-- > 0 && !state.outcome && state.round === startRound && state.currentPlayerIdx === startIdx) {
      step(state, decisionFn);
    }
    refreshActionList();
    onNewState(state);
  }

  function stepRound() {
    if (!state || state.outcome) return;
    const startRound = state.round;
    let safety = 2000;
    while (safety-- > 0 && !state.outcome && state.round === startRound) {
      step(state, decisionFn);
    }
    refreshActionList();
    onNewState(state);
  }

  function playOut() {
    if (!state) return;
    let safety = 10000;
    while (safety-- > 0 && !state.outcome) {
      step(state, decisionFn);
    }
    refreshActionList();
    onNewState(state);
  }

  function refreshActionList() {
    const sel = $('actionPick');
    sel.innerHTML = '';
    if (!state || state.outcome) {
      sel.innerHTML = '<option>—</option>';
      return;
    }
    if (state.phase !== 'player' && state.phase !== 'final') {
      sel.innerHTML = `<option>auto-phase: ${state.phase}</option>`;
      return;
    }
    const p = activePlayer(state);
    if (!p) { sel.innerHTML = '<option>—</option>'; return; }
    const legal = legalActions(state);
    legal.forEach((a, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = describeAction(a);
      sel.appendChild(opt);
    });
  }

  function describeAction(a) {
    switch (a.type) {
      case 'move': return `Move → ${a.to}`;
      case 'event': return `Attempt event here`;
      case 'rest': return `Rest`;
      case 'claim_technique': return `Claim technique #${a.idx + 1}`;
      case 'use_technique': return `Use technique #${a.idx + 1}`;
      case 'ability': return `Use class ability`;
      case 'favor_advance': return `Spend Favor → advance quest`;
      case 'final_check': return `Final-act check (${a.alignment})`;
      case 'end_turn': return `End turn`;
      default: return JSON.stringify(a);
    }
  }

  function doManualAction() {
    if (!state || state.outcome) return;
    const idx = parseInt($('actionPick').value, 10);
    const legal = legalActions(state);
    const a = legal[idx];
    if (!a) return;
    // Apply this action directly (bypass policy for this single step)
    step(state, () => a);
    refreshActionList();
    onNewState(state);
  }

  function runSim() {
    const games = parseInt($('simGames').value, 10);
    const playerCount = parseInt($('simPlayers').value, 10);
    const policy = $('simPolicy').value;
    const out = $('simResults');
    out.innerHTML = '<div class="muted">running...</div>';
    setTimeout(() => {
      const r = runBatch({ games, playerCount, policy, baseSeed: Date.now() & 0xffff });
      out.innerHTML = renderBatchReport(r);
    }, 10);
  }

  function runSweepPreset() {
    const games = parseInt($('simGames').value, 10);
    const playerCount = parseInt($('simPlayers').value, 10);
    const policy = $('simPolicy').value;
    const out = $('simResults');
    out.innerHTML = '<div class="muted">running sweep (6 variants)...</div>';
    setTimeout(() => {
      // Use a stable baseSeed so multiple sweep runs are reproducible — and
      // every variant in the sweep shares the same seed range so deltas are
      // attributable to the config dial, not noise.
      const baseSeed = 4242;
      const variants = [
        { name: 'Baseline (v1.2)', config: {} },
        { name: 'v1.1 (thresh=2, DC10)', config: { finalActDC: 10, finalActSuccessThreshold: 2 } },
        { name: 'v1.0 (thresh=3, DC10)', config: { finalActDC: 10, finalActSuccessThreshold: 3 } },
        { name: 'DC 9 → 8 (easier)', config: { finalActDC: 8 } },
        { name: 'Threshold 3 → 4 (harder)', config: { finalActSuccessThreshold: 4 } },
        { name: 'Window 3 → 2 (tighter)', config: { finalActWindow: 2 } },
      ];
      const r = runSweep({ games, playerCount, policy, baseSeed, variants });
      out.innerHTML = renderSweepReport(r);
    }, 10);
  }

  function runVariance() {
    const games = parseInt($('simGames').value, 10);
    const playerCount = parseInt($('simPlayers').value, 10);
    const policy = $('simPolicy').value;
    const out = $('simResults');
    out.innerHTML = '<div class="muted">running 5 batches...</div>';
    setTimeout(() => {
      const r = runVarianceCheck({ batches: 5, games, playerCount, policy, baseSeed: Date.now() & 0xffff });
      out.innerHTML = renderVarianceReport(r);
    }, 10);
  }

  $('newGame').addEventListener('click', newGame);
  $('stepOne').addEventListener('click', stepOne);
  $('stepTurn').addEventListener('click', stepTurn);
  $('stepRound').addEventListener('click', stepRound);
  $('playOut').addEventListener('click', playOut);
  $('actionGo').addEventListener('click', doManualAction);
  $('runSim').addEventListener('click', runSim);
  $('runVariance').addEventListener('click', runVariance);
  $('runSweep').addEventListener('click', runSweepPreset);

  // Start with one game ready to go
  newGame();

  return {
    refresh: refreshActionList,
    getState: () => state,
  };
}

function renderBatchReport(r) {
  const ms = r.elapsedMs.toFixed(0);
  const cls = Object.entries(r.winByClass)
    .map(([k, v]) => `<tr><td>${k}</td><td>${(v.winRate * 100).toFixed(1)}%</td><td>${v.questCompletionRate.toFixed(2)}</td><td>${v.sample}</td></tr>`)
    .join('');
  return `
    <div class="sim-card">
      <div class="muted small">${r.games} games · ${r.playerCount} players · policy=${r.policy} · ${ms}ms</div>
      <div class="big-stat">${(r.partyWinRate * 100).toFixed(1)}% <span class="muted small">party win</span></div>
      <div>TPK: ${(r.tpkRate * 100).toFixed(1)}% · Timeout: ${(r.timeoutRate * 100).toFixed(1)}%</div>
      <div>Win by alignment — L ${(r.winByAlignment.Lawful * 100).toFixed(1)}% · N ${(r.winByAlignment.Neutral * 100).toFixed(1)}% · C ${(r.winByAlignment.Chaotic * 100).toFixed(1)}%</div>
      <div>Avg rounds: ${r.avgRounds.toFixed(1)} (min ${r.minRounds}, max ${r.maxRounds})</div>
      <div>Quest stage completion: s1 ${(r.questCompletionByStage[0]*100).toFixed(0)}% · s2 ${(r.questCompletionByStage[1]*100).toFixed(0)}% · s3 ${(r.questCompletionByStage[2]*100).toFixed(0)}%</div>
      <table class="sim-table">
        <thead><tr><th>Class</th><th>Win</th><th>Quests</th><th>n</th></tr></thead>
        <tbody>${cls}</tbody>
      </table>
    </div>
  `;
}

function renderSweepReport(r) {
  const rows = r.rows.map((row, i) => {
    const dPct = (row.delta * 100);
    const dStr = i === 0 ? '—' : `${dPct >= 0 ? '+' : ''}${dPct.toFixed(1)}`;
    const dCls = i === 0 ? '' : dPct > 0 ? 'delta-pos' : dPct < 0 ? 'delta-neg' : '';
    const align = `L ${(row.winByAlignment.Lawful * 100).toFixed(0)} · N ${(row.winByAlignment.Neutral * 100).toFixed(0)} · C ${(row.winByAlignment.Chaotic * 100).toFixed(0)}`;
    return `<tr>
      <td>${row.name}</td>
      <td><b>${(row.winRate * 100).toFixed(1)}%</b></td>
      <td class="${dCls}">${dStr}</td>
      <td class="muted small">${row.avgRounds.toFixed(1)}</td>
      <td class="muted small">${(row.tpkRate * 100).toFixed(1)}%</td>
      <td class="muted small">${align}</td>
    </tr>`;
  }).join('');
  return `
    <div class="sim-card">
      <div class="muted small">${r.games} games × ${r.rows.length} variants · ${r.playerCount}p · ${r.policy} · seed ${r.baseSeed}</div>
      <table class="sim-table sweep-table">
        <thead><tr>
          <th>Variant</th><th>Win %</th><th>Δ vs base</th><th>Avg rd</th><th>TPK</th><th>Align win % (L·N·C)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderVarianceReport(r) {
  const rates = r.winRates.map((w) => (w * 100).toFixed(1) + '%').join(' · ');
  return `
    <div class="sim-card">
      <div class="big-stat">${(r.mean * 100).toFixed(1)}% ± ${(r.stdev * 100).toFixed(2)}%</div>
      <div class="muted small">mean win rate ± stdev across 5 batches</div>
      <div>per-batch: ${rates}</div>
    </div>
  `;
}
