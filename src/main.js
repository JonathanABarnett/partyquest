// Entry point — wires UI controls to render loop.

import { renderAll } from './ui/render.js';
import { mountControls } from './ui/controls.js';
import { runBatch, runSweep, runVarianceCheck } from './sim/batch.js';
import { setupGame } from './engine/state.js';
import { playGame } from './engine/game.js';
import { pickByPolicy } from './ai/policies.js';

const stateRoot = document.getElementById('state-root');
const controlRoot = document.getElementById('control-root');

// `let` so the callback closure can reference `api` (undefined during the
// initial onNewState fire from inside mountControls). `const` would put `api`
// in the TDZ and throw.
let api;
api = mountControls(controlRoot, {
  onNewState: (state) => renderAll(state, stateRoot, {
    onAction: (action) => api?.dispatch(action),
    onNewGame: () => api?.newGame(),
    onReplaySeed: (seed) => api?.replaySeed(seed),
    tutorial: api?.tutorial,
  }),
});

// Diagnostic hook for ad-hoc sweeps from the devtools console.
window.__pq = { runBatch, runSweep, runVarianceCheck, setupGame, playGame, pickByPolicy };
