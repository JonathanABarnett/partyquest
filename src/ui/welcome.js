// Welcome screen — shown before a game starts. Handles:
// • New Game setup (player count, humans, policy, seed)
// • Tutorial launch
// • Resume (if a save exists)
// • Settings (doom max, DC, threshold, etc.)
// Fires callbacks to main.js which then transitions to the game view.

import { loadRecord } from '../engine/persistence.js';

const POLICIES = [
  { value: 'opportunist', label: 'Opportunist', desc: 'Co-op early, self-interested late' },
  { value: 'greedy',      label: 'Greedy',      desc: 'Always chases personal quest' },
  { value: 'tactical',    label: 'Tactical',    desc: 'Class-ability-aware, strategic' },
  { value: 'altruistic',  label: 'Altruistic',  desc: 'Always maximises party success' },
  { value: 'mixed',       label: 'Mixed',       desc: 'Random blend of greedy + altruistic' },
  { value: 'random',      label: 'Random',      desc: 'Picks uniformly from legal actions' },
];

export function mountWelcome(root, callbacks) {
  let view = 'home'; // 'home' | 'setup' | 'settings'

  function render() {
    root.innerHTML = '';
    if (view === 'home')     root.appendChild(buildHome());
    if (view === 'setup')    root.appendChild(buildSetup());
    if (view === 'settings') root.appendChild(buildSettings());
  }

  // ── Home ─────────────────────────────────────────────────────────────────
  function buildHome() {
    const rec = loadRecord();
    const hasRecord = (rec.wins + rec.losses) > 0;
    const hasSave = callbacks.hasSave();

    const el = document.createElement('div');
    el.className = 'wlc-root';
    el.innerHTML = `
      <div class="wlc-hero">
        <svg class="wlc-flourish" viewBox="0 0 200 24" aria-hidden="true">
          <path d="M2 12 L80 12 M80 12 L95 5 M80 12 L95 19 M110 12 L130 4 M110 12 L130 20 M110 12 L140 12"
                stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <circle cx="145" cy="12" r="2.5" fill="currentColor"/>
        </svg>
        <h1 class="wlc-title">Partyquest</h1>
        <svg class="wlc-flourish flip" viewBox="0 0 200 24" aria-hidden="true">
          <path d="M198 12 L120 12 M120 12 L105 5 M120 12 L105 19 M90 12 L70 4 M90 12 L70 20 M90 12 L60 12"
                stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <circle cx="55" cy="12" r="2.5" fill="currentColor"/>
        </svg>
      </div>
      <p class="wlc-tagline">A co-op fantasy adventure with hidden personal agendas.</p>
      ${hasRecord ? `<div class="wlc-record">★ ${rec.wins}W · ☠ ${rec.losses}L</div>` : ''}

      <div class="wlc-cards">
        <button class="wlc-card primary" data-action="new-game">
          <span class="wlc-card-icon">⚔</span>
          <div class="wlc-card-body">
            <div class="wlc-card-title">New Game</div>
            <div class="wlc-card-desc">Configure your party, choose a seed, and set out.</div>
          </div>
        </button>
        <button class="wlc-card" data-action="tutorial">
          <span class="wlc-card-icon">📖</span>
          <div class="wlc-card-body">
            <div class="wlc-card-title">Learn to Play</div>
            <div class="wlc-card-desc">A guided 3-round walkthrough with step-by-step coaching.</div>
          </div>
        </button>
        ${hasSave ? `
        <button class="wlc-card accent" data-action="resume">
          <span class="wlc-card-icon">↺</span>
          <div class="wlc-card-body">
            <div class="wlc-card-title">Resume</div>
            <div class="wlc-card-desc">Continue your last in-progress session.</div>
          </div>
        </button>` : ''}
        <button class="wlc-card" data-action="simulation">
          <span class="wlc-card-icon">🎲</span>
          <div class="wlc-card-body">
            <div class="wlc-card-title">Simulation Mode</div>
            <div class="wlc-card-desc">Watch AI partners play out a full game automatically.</div>
          </div>
        </button>
      </div>

      <div class="wlc-footer">
        <button class="wlc-link" data-action="settings">⚙ Settings</button>
        <span class="wlc-ver">v1.15</span>
      </div>
    `;

    el.querySelector('[data-action="new-game"]').addEventListener('click', () => { view = 'setup'; render(); });
    el.querySelector('[data-action="tutorial"]').addEventListener('click', () => callbacks.onTutorial());
    el.querySelector('[data-action="resume"]')?.addEventListener('click', () => callbacks.onResume());
    el.querySelector('[data-action="simulation"]').addEventListener('click', () => callbacks.onSimulation());
    el.querySelector('[data-action="settings"]').addEventListener('click', () => { view = 'settings'; render(); });
    return el;
  }

  // ── New Game Setup ────────────────────────────────────────────────────────
  function buildSetup() {
    const el = document.createElement('div');
    el.className = 'wlc-root';
    el.innerHTML = `
      <button class="wlc-back" data-back>← Back</button>
      <h2 class="wlc-section-title">New Game Setup</h2>

      <div class="wlc-setup-grid">
        <div class="wlc-setup-block">
          <div class="wlc-label">How many players?</div>
          <div class="wlc-toggle-group" id="playerCountGroup">
            <button class="wlc-toggle" data-pc="2">2</button>
            <button class="wlc-toggle active" data-pc="3">3</button>
            <button class="wlc-toggle" data-pc="4">4</button>
          </div>
        </div>

        <div class="wlc-setup-block">
          <div class="wlc-label">Human players</div>
          <div class="wlc-toggle-group" id="humanGroup">
            <button class="wlc-toggle" data-hc="0">All AI</button>
            <button class="wlc-toggle active" data-hc="1">P1 only</button>
            <button class="wlc-toggle" data-hc="2">P1 + P2</button>
            <button class="wlc-toggle" data-hc="all">All</button>
          </div>
        </div>

        <div class="wlc-setup-block">
          <div class="wlc-label">AI partners play as</div>
          <div class="wlc-policy-list" id="policyGroup">
            ${POLICIES.map((p) => `
              <label class="wlc-policy-opt ${p.value === 'opportunist' ? 'active' : ''}">
                <input type="radio" name="policy" value="${p.value}" ${p.value === 'opportunist' ? 'checked' : ''} />
                <div class="wlc-policy-body">
                  <div class="wlc-policy-name">${p.label}</div>
                  <div class="wlc-policy-desc muted small">${p.desc}</div>
                </div>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="wlc-setup-block">
          <div class="wlc-label">Map seed</div>
          <div class="wlc-seed-row">
            <input class="wlc-seed-input" id="setupSeed" type="number" value="${Math.floor(Math.random() * 9999) + 1}" min="1" />
            <button class="wlc-btn-soft" id="randomSeed" title="Generate a random seed">🎲 Random</button>
          </div>
          <div class="muted small" style="margin-top:4px">Same seed = same map, threats, and starting classes. Useful for replaying.</div>
        </div>
      </div>

      <div class="wlc-cta">
        <button class="wlc-btn-primary" id="startGame">⚔ Begin Adventure →</button>
      </div>
    `;

    // Toggle logic
    el.querySelectorAll('[data-pc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('[data-pc]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    el.querySelectorAll('[data-hc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('[data-hc]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    el.querySelectorAll('input[name="policy"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        el.querySelectorAll('.wlc-policy-opt').forEach((l) => l.classList.remove('active'));
        radio.closest('.wlc-policy-opt')?.classList.add('active');
      });
    });

    const q = (sel) => el.querySelector(sel);
    q('#randomSeed')?.addEventListener('click', () => {
      q('#setupSeed').value = String(Math.floor(Math.random() * 99999) + 1);
    });
    q('[data-back]').addEventListener('click', () => { view = 'home'; render(); });
    q('#startGame').addEventListener('click', () => {
      const playerCount = parseInt(q('[data-pc].active')?.dataset.pc || '3', 10);
      const humansSel   = q('[data-hc].active')?.dataset.hc || '1';
      const humans      = humansSel === 'all' ? playerCount : Math.min(playerCount, parseInt(humansSel, 10));
      const policy      = q('input[name="policy"]:checked')?.value || 'opportunist';
      const seed        = parseInt(q('#setupSeed')?.value || '1', 10) || 1;
      callbacks.onStartGame({ playerCount, humans, policy, seed });
    });
    return el;
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  function buildSettings() {
    const cfg = callbacks.getConfig?.() || {};
    const el = document.createElement('div');
    el.className = 'wlc-root';
    el.innerHTML = `
      <button class="wlc-back" data-back>← Back</button>
      <h2 class="wlc-section-title">Game Settings</h2>
      <p class="muted small" style="margin-bottom:16px">These take effect for every new game. Existing sessions keep their original values.</p>

      <div class="wlc-settings-grid">
        <div class="wlc-setting-row">
          <label class="wlc-setting-label">
            Doom max
            <span class="wlc-setting-hint">How many rounds until the Final Act triggers</span>
          </label>
          <input class="wlc-setting-input" id="cfgDoom" type="range" min="6" max="16" step="1" value="${cfg.doomMax || 10}" />
          <span class="wlc-setting-val" id="cfgDoomVal">${cfg.doomMax || 10}</span>
        </div>
        <div class="wlc-setting-row">
          <label class="wlc-setting-label">
            Final Act DC
            <span class="wlc-setting-hint">Difficulty of each resolution check (lower = easier)</span>
          </label>
          <input class="wlc-setting-input" id="cfgDC" type="range" min="6" max="13" step="1" value="${cfg.finalActDC || 9}" />
          <span class="wlc-setting-val" id="cfgDCVal">${cfg.finalActDC || 9}</span>
        </div>
        <div class="wlc-setting-row">
          <label class="wlc-setting-label">
            Successes needed
            <span class="wlc-setting-hint">Checks to win the Final Act (3 = canon difficulty)</span>
          </label>
          <input class="wlc-setting-input" id="cfgThresh" type="range" min="1" max="5" step="1" value="${cfg.finalActSuccessThreshold || 3}" />
          <span class="wlc-setting-val" id="cfgThreshVal">${cfg.finalActSuccessThreshold || 3}</span>
        </div>
        <div class="wlc-setting-row">
          <label class="wlc-setting-label">
            Final Act window
            <span class="wlc-setting-hint">Rounds the party has to resolve the Final Act</span>
          </label>
          <input class="wlc-setting-input" id="cfgWindow" type="range" min="2" max="6" step="1" value="${cfg.finalActWindow || 3}" />
          <span class="wlc-setting-val" id="cfgWindowVal">${cfg.finalActWindow || 3}</span>
        </div>
        <div class="wlc-setting-row">
          <label class="wlc-setting-label">
            Free class abilities
            <span class="wlc-setting-hint">Abilities fire automatically without costing an action</span>
          </label>
          <label class="wlc-toggle-pill">
            <input type="checkbox" id="cfgAbilities" ${cfg.abilitiesFree ? 'checked' : ''} />
            <span class="wlc-pill-track"></span>
          </label>
        </div>
      </div>

      <div class="wlc-cta">
        <button class="wlc-btn-primary" id="saveSettings">Save Settings</button>
        <button class="wlc-btn-soft" id="resetSettingsWlc">Reset to defaults</button>
      </div>
    `;

    // Live slider value display
    ['Doom','DC','Thresh','Window'].forEach((k) => {
      const input = el.querySelector(`#cfg${k}`);
      const val   = el.querySelector(`#cfg${k}Val`);
      input?.addEventListener('input', () => { val.textContent = input.value; });
    });

    el.querySelector('[data-back]').addEventListener('click', () => { view = 'home'; render(); });
    el.querySelector('#saveSettings').addEventListener('click', () => {
      callbacks.setConfig?.({
        doomMax: parseInt(el.querySelector('#cfgDoom').value, 10),
        finalActDC: parseInt(el.querySelector('#cfgDC').value, 10),
        finalActSuccessThreshold: parseInt(el.querySelector('#cfgThresh').value, 10),
        finalActWindow: parseInt(el.querySelector('#cfgWindow').value, 10),
        abilitiesFree: el.querySelector('#cfgAbilities').checked,
      });
      view = 'home'; render();
    });
    el.querySelector('#resetSettingsWlc').addEventListener('click', () => {
      callbacks.setConfig?.({});
      view = 'home'; render();
    });

    return el;
  }

  render();
  return {
    refresh: render,
    showHome: () => { view = 'home'; render(); },
  };
}
