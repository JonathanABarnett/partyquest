// Entry point — renders the welcome screen first, transitions to the game view.

import { renderAll } from './ui/render.js';
import { mountControls } from './ui/controls.js';
import { mountWelcome } from './ui/welcome.js';
import { runBatch, runSweep, runVarianceCheck } from './sim/batch.js';
import { setupGame } from './engine/state.js';
import { playGame } from './engine/game.js';
import { pickByPolicy } from './ai/policies.js';
import { loadSavedState } from './engine/persistence.js';

// ── DOM refs ────────────────────────────────────────────────────────────────
const welcomeRoot = document.getElementById('welcome-root');
const gameApp     = document.getElementById('game-app');
const stateRoot   = document.getElementById('state-root');
const controlRoot = document.getElementById('control-root');
const backBtn     = document.getElementById('back-to-welcome');

// ── App state ───────────────────────────────────────────────────────────────
let gameStarted = false;
let api = null;
let configOverride = {}; // accumulated from welcome settings page

// ── View switching ───────────────────────────────────────────────────────────
function showWelcome() {
  gameApp.style.display     = 'none';
  welcomeRoot.style.display = 'flex';
  welcome.showHome(); // always return to the home card, not a sub-screen
}

function showGame() {
  welcomeRoot.style.display = 'none';
  gameApp.style.display  = 'grid';
}

// ── Mount game controls (once) ───────────────────────────────────────────────
function ensureGameMounted() {
  if (gameStarted) return;
  gameStarted = true;
  api = mountControls(controlRoot, {
    onNewState: (state) => renderAll(state, stateRoot, {
      onAction:       (action) => api?.dispatch(action),
      onNewGame:      () => api?.newGame(),
      onReplaySeed:   (seed) => api?.replaySeed(seed),
      onReplayGame:   () => api?.startReplay(api.getState()),
      onStopReplay:   () => api?.stopReplay(),
      onPauseReplay:  () => api?.pauseReplay(),
      onResumeReplay: () => api?.resumeReplay(),
      onStepForward:  () => api?.stepForwardReplay(),
      onSetSpeed:     (ms) => api?.setReplaySpeed(ms),
      isReplaying:    () => !!api?.isReplaying(),
      isReplayPaused: () => !!api?.isReplayPaused(),
      replayProgress: () => api?.replayProgress(),
      tutorial:       api?.tutorial,
    }),
  });
  window.__pq = { runBatch, runSweep, runVarianceCheck, setupGame, playGame, pickByPolicy };
}

// ── Welcome callbacks ────────────────────────────────────────────────────────
const welcome = mountWelcome(welcomeRoot, {
  hasSave: () => {
    const s = loadSavedState();
    return !!(s && !s.outcome);
  },

  getConfig: () => configOverride,

  setConfig: (patch) => {
    if (!patch || Object.keys(patch).length === 0) {
      configOverride = {}; // reset
    } else {
      configOverride = { ...configOverride, ...patch };
    }
    // If the game is already mounted, push to the controls override.
    if (api) api.setConfigOverride(configOverride);
  },

  onStartGame: ({ playerCount, humans, policy, seed }) => {
    ensureGameMounted();
    // Push welcome config into controls before starting.
    api.setConfigOverride(configOverride);
    // Set the sidebar dropdowns to match.
    const $ = (id) => document.getElementById(id);
    if ($('playerCount')) $('playerCount').value = String(playerCount);
    if ($('humanCount'))  $('humanCount').value  = humans === playerCount ? 'all' : String(humans);
    if ($('policy'))      $('policy').value       = policy;
    if ($('seed'))        $('seed').value          = String(seed);
    api.newGame({ seed });
    showGame();
  },

  onTutorial: () => {
    ensureGameMounted();
    showGame();
    setTimeout(() => {
      document.getElementById('startTutorial')?.click();
    }, 50);
  },

  onResume: () => {
    ensureGameMounted();
    showGame();
    setTimeout(() => {
      document.getElementById('resumeGame')?.click();
    }, 50);
  },

  onSimulation: () => {
    ensureGameMounted();
    const $ = (id) => document.getElementById(id);
    if ($('humanCount')) $('humanCount').value = '0';
    if ($('policy'))     $('policy').value     = 'opportunist';
    api.newGame();
    showGame();
  },
});

// ── Back to menu button (in game header) ─────────────────────────────────────
backBtn?.addEventListener('click', () => showWelcome());

// ── First visit: if tutorial flag not set, go straight to welcome.
// Otherwise show welcome so the user can choose their path.
showWelcome();
