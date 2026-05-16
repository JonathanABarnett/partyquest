// Render functions. Direct DOM, no framework. Full re-render on every state
// change; cheap because state is small. The `ctx` object carries the action
// dispatcher so click handlers can step the engine.

import { activePlayer, locationOf } from '../engine/state.js';
import { legalActions } from '../engine/actions.js';
import { EVENTS } from '../engine/data.js';
import { loadRecord } from '../engine/persistence.js';

// Terrain visual catalog — gradient + icon + flavor text. Used by tile render.
const TERRAIN = {
  capital:  { icon: '🏰', label: 'Capital',  bg: 'linear-gradient(135deg, #5a4a2b 0%, #8a6f3e 60%, #d4b46a 100%)', flavor: 'Safe haven' },
  forest:   { icon: '🌲', label: 'Forest',   bg: 'linear-gradient(135deg, #1a2e1f 0%, #2d5a3d 70%, #4a8a5e 100%)', flavor: 'Dense, watchful' },
  mountain: { icon: '⛰',  label: 'Mountain', bg: 'linear-gradient(135deg, #3a3a45 0%, #5a5060 60%, #8a7c8c 100%)', flavor: 'Hard climbs, hard finds' },
  plain:    { icon: '🌾', label: 'Plain',    bg: 'linear-gradient(135deg, #7a6534 0%, #b3933e 60%, #d8c067 100%)', flavor: 'Open and exposed' },
  cavern:   { icon: '🕳', label: 'Cavern',   bg: 'linear-gradient(135deg, #1a1525 0%, #2e2438 60%, #5a4a6e 100%)', flavor: 'Echoing dark' },
  swamp:    { icon: '🪵', label: 'Swamp',    bg: 'linear-gradient(135deg, #2a3520 0%, #4a5538 60%, #6a7548 100%)', flavor: 'Murky and slow' },
  ruins:    { icon: '🏛', label: 'Ruins',    bg: 'linear-gradient(135deg, #2e2820 0%, #4a4238 60%, #7a6e5a 100%)', flavor: 'Lost and dangerous' },
};

// Class icons (used on player cards)
const CLASS_ICON = {
  fighter: '⚔', rogue: '🗡', wizard: '🔮', cleric: '✚',
  ranger: '🏹', bard: '🎵', paladin: '🛡', druid: '🌿',
};

// Race color accent for player chips
const RACE_COLOR = {
  human: '#d4a574', elf: '#9bcf94', dwarf: '#c9967a', halfling: '#e3c47a',
  halforc: '#8a6a5a', tiefling: '#b87aa8',
};

export function renderAll(state, root, ctx = {}) {
  const onAction = ctx.onAction || (() => {});
  const tutorial = ctx.tutorial;
  root.innerHTML = '';
  if (tutorial?.current()) root.appendChild(renderTutorialBanner(tutorial, state));
  if (ctx.isReplaying?.()) root.appendChild(renderReplayBanner(ctx));
  if (state.outcome) root.appendChild(renderGameOver(state, ctx));
  root.appendChild(renderHeader(state));
  root.appendChild(renderHint(state));
  if (state.finalAct) root.appendChild(renderFinalActBanner(state));
  root.appendChild(renderMap(state, onAction));
  root.appendChild(renderPlayers(state, onAction));
  root.appendChild(renderTechniquesRow(state, onAction));
  root.appendChild(renderLog(state));
  // After the DOM is mounted, apply pulse to the tutorial target element.
  if (tutorial?.current()) {
    requestAnimationFrame(() => applyTutorialHighlight(tutorial.current()));
  }
}

const REPLAY_SPEEDS = [
  { label: '¼×', ms: 2000 },
  { label: '½×', ms: 1000 },
  { label: '1×', ms: 500 },
  { label: '2×', ms: 250 },
  { label: '4×', ms: 125 },
];

function renderReplayBanner(ctx) {
  const el = document.createElement('div');
  el.className = 'replay-banner';
  const paused = ctx.isReplayPaused?.() ?? false;
  const progress = ctx.replayProgress?.();
  const pct = progress ? Math.round((progress.idx / progress.total) * 100) : 0;
  el.innerHTML = `
    <span class="replay-icon">${paused ? '⏸' : '▶'}</span>
    <div class="replay-controls">
      <button class="replay-btn" data-replay="pause-resume">${paused ? '▶ Resume' : '⏸ Pause'}</button>
      <button class="replay-btn" data-replay="step" ${!paused ? 'disabled' : ''} title="Step one action forward">⏭ Step</button>
      <div class="replay-speed-group">
        ${REPLAY_SPEEDS.map((s) => `<button class="replay-speed-btn" data-speed="${s.ms}">${s.label}</button>`).join('')}
      </div>
      <button class="replay-btn stop" data-replay="stop">■ Stop</button>
    </div>
    <div class="replay-progress">
      <div class="replay-progress-bar" style="width:${pct}%"></div>
      <span class="muted small">${progress ? `${progress.idx} / ${progress.total}` : ''}</span>
    </div>
  `;
  el.querySelector('[data-replay="pause-resume"]').addEventListener('click', () => {
    if (paused) ctx.onResumeReplay?.(); else ctx.onPauseReplay?.();
  });
  el.querySelector('[data-replay="step"]')?.addEventListener('click', () => ctx.onStepForward?.());
  el.querySelector('[data-replay="stop"]').addEventListener('click', () => ctx.onStopReplay?.());
  el.querySelectorAll('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.onSetSpeed?.(parseInt(btn.dataset.speed, 10)));
  });
  return el;
}

function renderTutorialBanner(tutorial, state) {
  const step = tutorial.current();
  const idx = tutorial.stepIndex();
  const total = tutorial.totalSteps;
  const el = document.createElement('div');
  el.className = 'tutorial-banner';
  const isAuto = typeof step.advanceOn === 'function';
  const body = tutorial.resolveBody ? tutorial.resolveBody(step, state) : step.body;
  const title = typeof step.title === 'function' ? step.title(state) : step.title;
  el.innerHTML = `
    <div class="tutorial-progress">
      <span class="tutorial-step-num">Tutorial · step ${idx + 1} of ${total}</span>
      <div class="tutorial-progress-actions">
        <button class="link-btn" data-tutorial="skip" title="Stop the tutorial; continue this game freely.">Skip tutorial</button>
        <button class="link-btn" data-tutorial="exit" title="Stop the tutorial AND start a fresh new game.">✕ Exit &amp; new game</button>
      </div>
    </div>
    <div class="tutorial-title">${title}</div>
    <div class="tutorial-body">${body}</div>
    <div class="tutorial-actions">
      ${isAuto
        ? `<span class="muted small">${step.description ? '👉 ' + step.description : '(advances automatically when you act)'}</span>`
        : `<button class="primary" data-tutorial="next">Next →</button>`
      }
    </div>
  `;
  el.querySelector('[data-tutorial="skip"]').addEventListener('click', () => tutorial.stop());
  el.querySelector('[data-tutorial="exit"]').addEventListener('click', () => tutorial.exitAndReset?.());
  el.querySelector('[data-tutorial="next"]')?.addEventListener('click', () => tutorial.next());
  return el;
}

function applyTutorialHighlight(step) {
  // Strip any previous highlight
  document.querySelectorAll('.tutorial-target').forEach((e) => e.classList.remove('tutorial-target'));
  if (!step.target) return;
  const t = document.querySelector(step.target);
  if (t) t.classList.add('tutorial-target');
}

function renderHint(state) {
  const el = document.createElement('div');
  el.className = 'hint-banner';
  if (state.outcome) {
    el.innerHTML = `<span class="hint-icon">↻</span> The game is over. Click <b>New Game</b> below to start another, or open <b>Settings</b> in the sidebar to tweak the rules.`;
    return el;
  }
  const p = activePlayer(state);
  if (!p) { el.innerHTML = `<span class="hint-icon">⏳</span> Resolving phase…`; return el; }
  const q = p.quest;
  let nextStep = '';
  if (state.finalAct) {
    if (p.location !== state.finalAct.location) {
      const loc = state.map.allLocations.find((l) => l.id === state.finalAct.location);
      nextStep = `move to <b>${loc?.name}</b> (the Final Act tile, glowing red), then attempt your alignment's resolution.`;
    } else {
      nextStep = `attempt your alignment's resolution (the gold <b>★ Try ${p.alignment}</b> button below). 3 successes wins.`;
    }
  } else if (!q.completed && q.currentStage === 0) {
    nextStep = `complete any event (click <b>⚔ Attempt event</b>) to clear quest stage 1.`;
  } else if (!q.completed && q.currentStage === 1) {
    const target = q.stages[1].terrain;
    nextStep = `travel to a <b>${target}</b> region (highlighted on the map) for quest stage 2.`;
  } else if (!q.completed && q.currentStage === 2) {
    nextStep = `you're at stage 3 — end the turn while on the right terrain to commit your quest.`;
  } else {
    nextStep = `hold position and claim techniques from the row below to power up before the Final Act.`;
  }
  el.innerHTML = `<span class="hint-icon">${CLASS_ICON[p.class.id] || '➤'}</span> <b>${p.name}'s turn.</b> Next: ${nextStep}`;
  return el;
}

function renderGameOver(state, ctx) {
  const el = document.createElement('div');
  el.className = 'panel gameover-panel ' + (state.outcome.partyWin ? 'win' : 'loss');
  const scores = (state.outcome.scores || []).slice().sort((a, b) => b.score - a.score);
  const scoresHtml = scores.length
    ? `<table class="scores-table">
        <thead><tr><th>Player</th><th>Align</th><th>Quests</th><th>Score</th></tr></thead>
        <tbody>${scores.map((s, i) => `<tr class="${i === 0 ? 'top' : ''}"><td>${s.name}</td><td>${s.alignment}</td><td>${s.questsCompleted}</td><td><b>${s.score}</b></td></tr>`).join('')}</tbody>
      </table>`
    : '';
  el.innerHTML = `
    <div class="gameover-head">
      <h2>${state.outcome.partyWin ? '★ Party Victory ★' : '☠ Party Loss ☠'}</h2>
      <div class="muted small">${state.outcome.partyWin ? `Resolved ${state.outcome.resolvedBy}` : `(${state.outcome.reason})`}</div>
    </div>
    ${scoresHtml}
    <div class="seed-line muted small">Seed: <code>${state.seed}</code>
      <button class="link-btn" data-action="copy-seed" title="Copy seed to clipboard">copy</button>
    </div>
    <div class="gameover-actions">
      ${state.actionHistory?.length ? `<button class="primary" data-action="watch-replay" title="Watch this exact game played back action-by-action at 0.5s/step">▶ Watch replay</button>` : ''}
      <button data-action="replay-seed" title="Same map, same threats — different decisions">↻ Replay this seed</button>
      <button data-action="new-game" title="Same map ID + 1; a fresh game">→ New game (seed +1)</button>
    </div>
  `;
  el.querySelector('[data-action="watch-replay"]')?.addEventListener('click', () => {
    ctx.onReplayGame?.();
  });
  el.querySelector('[data-action="replay-seed"]').addEventListener('click', () => {
    ctx.onReplaySeed?.(state.seed);
  });
  el.querySelector('[data-action="new-game"]').addEventListener('click', () => {
    ctx.onNewGame?.();
  });
  el.querySelector('[data-action="copy-seed"]').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(String(state.seed));
      e.target.textContent = 'copied ✓';
      setTimeout(() => { e.target.textContent = 'copy'; }, 1500);
    } catch { /* clipboard not granted; silent */ }
  });
  return el;
}

function renderHeader(state) {
  const el = document.createElement('div');
  el.className = 'panel header-panel';
  const fa = state.finalAct ? ` — FINAL ACT` : '';
  const r = loadRecord();
  const wl = (r.wins + r.losses) > 0
    ? `<span class="record-badge" title="Across all your saved games on this device. Resets via the Reset record button below.">★ ${r.wins}W · ☠ ${r.losses}L</span>`
    : '';
  el.innerHTML = `
    <div class="header-row">
      <div>
        <div class="muted">Round ${state.round} · Phase: <b>${state.phase}</b>${fa}</div>
        <div class="doom-row" title="Doom advances each round; when it hits max the Final Act begins.">
          <span class="muted">Doom</span>
          ${renderDoomTrack(state)}
          <span>${state.doomClock} / ${state.config.doomMax}</span>
        </div>
      </div>
      <div class="muted small header-right">
        ${wl}
        Seed: <code>${state.seed}</code> · <button class="link-btn" id="help-toggle">How to play</button>
      </div>
    </div>
    <div class="help-content" hidden>
      <h4>Quick rules</h4>
      <ul class="help-list">
        <li><b>Goal:</b> the party survives until the <b>Final Act</b> (when Doom hits max), then converges on the highlighted tile and lands 3 successful checks of one alignment.</li>
        <li><b>Your turn:</b> click one <em>action button</em> on your player card (⚔ event, ☾ rest, ✦ class ability, etc.), or click an <em>adjacent tile</em> to move. You get one move + one act per turn.</li>
        <li><b>Quests:</b> each player has a hidden quest with three stages. Stage 1: succeed any event. Stage 2: travel to your class's terrain. Stage 3: commit (Lawful helps the party; Chaotic hurts it).</li>
        <li><b>Techniques row:</b> claim a card to steal a threat's power — usable later as a stat bonus or heal.</li>
        <li><b>Scoring:</b> party can win while individuals lose. Match your alignment to the resolution, complete your quest, and stay alive for points.</li>
      </ul>
    </div>
  `;
  // Toggle help
  el.querySelector('#help-toggle').addEventListener('click', () => {
    const c = el.querySelector('.help-content');
    c.hidden = !c.hidden;
  });
  return el;
}

function renderDoomTrack(state) {
  const max = state.config.doomMax;
  let pips = '';
  for (let i = 0; i < max; i++) {
    pips += `<span class="pip ${i < state.doomClock ? 'on' : ''}"></span>`;
  }
  return `<span class="doom-track">${pips}</span>`;
}

function renderFinalActBanner(state) {
  const fa = state.finalAct;
  const loc = state.map.allLocations.find((l) => l.id === fa.location);
  const threshold = state.config.finalActSuccessThreshold;
  const roundsLeft = state.config.finalActWindow - fa.roundsElapsed;
  const bars = ['Lawful', 'Neutral', 'Chaotic'].map((align) => {
    const n = fa.progress[align] || 0;
    const pct = Math.min(100, (n / threshold) * 100);
    const done = fa.resolved === align;
    return `<div class="fa-bar ${align.toLowerCase()} ${done ? 'done' : ''}" title="${alignTooltip(align)}">
      <div class="fa-bar-label">${align} <span class="muted small">${n} / ${threshold}</span></div>
      <div class="fa-bar-track"><div class="fa-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
  return wrapPanel('final-act-panel', `
    <div class="fa-head">
      <h3>⚡ FINAL ACT — ${loc?.name || 'Unknown'}</h3>
      <div class="muted small">${roundsLeft} round${roundsLeft !== 1 ? 's' : ''} remaining</div>
    </div>
    <div class="fa-bars">${bars}</div>
    <div class="muted small" style="margin-top:6px;">First alignment to ${threshold} successful checks wins. Each player rolls their own alignment's check.</div>
  `);
}

function alignTooltip(a) {
  switch (a) {
    case 'Lawful': return 'Bind/capture the threat — rolls STR or DEX (best of)';
    case 'Neutral': return 'Destroy the threat — rolls INT or STR (best of)';
    case 'Chaotic': return 'Claim its power — rolls CHA or INT (best of)';
    default: return '';
  }
}

function renderMap(state, onAction) {
  const el = document.createElement('div');
  el.className = 'panel map-panel';
  el.innerHTML = `<h3>The Realm <span class="muted small">— click a glowing adjacent tile to move</span></h3>`;
  const ring = document.createElement('div');
  ring.className = 'map-ring';
  // SVG layer with adjacency spokes (capital→region) + ring edges (region→region).
  ring.appendChild(buildAdjacencyLines(state.map.regions.length));

  const active = activePlayer(state);
  const legal = (active && !state.outcome && (state.phase === 'player' || state.phase === 'final')) ? legalActions(state) : [];
  const moveOptions = new Set(legal.filter((a) => a.type === 'move').map((a) => a.to));

  // Final Act path hint: during FA, compute the shortest path from active
  // player's current tile to the FA tile and mark every tile on it. Helps
  // human players see "two moves through the Capital" at a glance.
  let pathHint = new Set();
  if (state.finalAct && active && active.location !== state.finalAct.location) {
    const path = shortestPath(active.location, state.finalAct.location, state.map);
    if (path) path.forEach((id) => pathHint.add(id));
  }

  const cells = [state.map.capital, ...state.map.regions];
  const regionCount = state.map.regions.length;
  cells.forEach((loc, idx) => {
    const t = TERRAIN[loc.terrain] || TERRAIN.plain;
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.style.background = t.bg;
    tile.dataset.locId = loc.id;
    if (state.finalAct?.location === loc.id) tile.classList.add('final-act');
    if (pathHint.has(loc.id) && loc.id !== active?.location) tile.classList.add('path-hint');
    if (loc.id === 'capital') {
      tile.classList.add('capital');
    } else {
      // idx 0 = capital, so region index = idx - 1
      const regionIdx = idx - 1;
      const angleDeg = (360 / regionCount) * regionIdx - 90;
      tile.classList.add('region');
      tile.style.setProperty('--angle-deg', `${angleDeg}deg`);
    }
    // Adjacency listing on each tile so hover can highlight neighbors
    tile.dataset.adjacent = loc.adjacent.join(',');
    if (moveOptions.has(loc.id)) {
      tile.classList.add('move-target');
      tile.addEventListener('click', () => onAction({ type: 'move', to: loc.id }));
    }
    if (active && active.location === loc.id) tile.classList.add('here');
    const here = state.players.filter((p) => p.location === loc.id && !p.incapacitated);
    // Preview which events can spawn at this terrain (filter EVENTS by tile terrain or universal).
    const eventSamples = EVENTS
      .filter((e) => e.terrain == null || e.terrain === loc.terrain)
      .slice(0, 4)
      .map((e) => e.name)
      .join(', ');
    tile.title = `${loc.name} — ${t.label}\n${t.flavor}\nPossible events: ${eventSamples}${moveOptions.has(loc.id) ? '\n→ click to move' : ''}`;
    tile.innerHTML = `
      <div class="tile-icon">${t.icon}</div>
      <div class="tile-body">
        <div class="tile-name">${loc.name}</div>
        <div class="tile-terrain">${t.label}</div>
        ${loc.alert ? `<div class="tile-alert">⚠ alert ${loc.alert}</div>` : ''}
      </div>
      <div class="tile-players">${here.map((p) => `<span class="player-chip" style="background:${RACE_COLOR[p.race.id] || '#d4a574'}" title="${p.name} (${p.race.name} ${p.class.name})">${CLASS_ICON[p.class.id] || '◆'} ${p.name}</span>`).join('')}</div>
      ${moveOptions.has(loc.id) ? '<div class="tile-move-hint">→ move here</div>' : ''}
    `;
    // Adjacency hover: highlight neighbor tiles
    tile.addEventListener('mouseenter', () => {
      const adjacents = (tile.dataset.adjacent || '').split(',');
      ring.querySelectorAll('.tile').forEach((t) => {
        if (adjacents.includes(t.dataset.locId)) t.classList.add('adj-hover');
      });
    });
    tile.addEventListener('mouseleave', () => {
      ring.querySelectorAll('.tile.adj-hover').forEach((t) => t.classList.remove('adj-hover'));
    });
    ring.appendChild(tile);
  });
  el.appendChild(ring);
  return el;
}

// BFS for shortest path between two locations on the map graph.
function shortestPath(fromId, toId, map) {
  if (fromId === toId) return [fromId];
  const adj = {};
  map.allLocations.forEach((l) => { adj[l.id] = l.adjacent; });
  const queue = [[fromId]];
  const visited = new Set([fromId]);
  while (queue.length > 0) {
    const path = queue.shift();
    const last = path[path.length - 1];
    for (const nbr of adj[last] || []) {
      if (visited.has(nbr)) continue;
      const newPath = [...path, nbr];
      if (nbr === toId) return newPath;
      visited.add(nbr);
      queue.push(newPath);
    }
  }
  return null;
}

// SVG layer drawn behind tiles. Coordinates are in 0–100 space and the SVG
// stretches to fill the ring; tile centers are at the same percent positions.
function buildAdjacencyLines(regionCount) {
  const lines = [];
  const cx = 50, cy = 50;
  const r = 35; // distance from center to region centers (percentage of viewBox)
  const positions = [];
  for (let i = 0; i < regionCount; i++) {
    const a = (2 * Math.PI / regionCount) * i - Math.PI / 2;
    positions.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  // Spokes — capital to each region
  positions.forEach((p) => lines.push(`<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(2)}" y2="${p.y.toFixed(2)}" />`));
  // Ring edges — each region to the next
  for (let i = 0; i < regionCount; i++) {
    const a = positions[i], b = positions[(i + 1) % regionCount];
    lines.push(`<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" />`);
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg class="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>`;
  return wrap.firstChild;
}

function renderPlayers(state, onAction) {
  const wrap = document.createElement('div');
  wrap.className = 'panel players-panel';
  wrap.innerHTML = `<h3>Adventurers <span class="muted small">— the active player's actions are highlighted</span></h3>`;
  const list = document.createElement('div');
  list.className = 'players-list';
  const active = activePlayer(state);
  const isActiveTurn = active && (state.phase === 'player' || state.phase === 'final') && !state.outcome;
  const legal = isActiveTurn ? legalActions(state) : [];

  state.players.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'player-card';
    const isActive = active && p.id === active.id && isActiveTurn;
    if (isActive) card.classList.add('active');
    if (p.incapacitated) card.classList.add('down');
    const stats = ['STR', 'DEX', 'INT', 'CHA']
      .map((k) => `<span title="${k} = ${k === 'STR' ? 'Strength (force, fight)' : k === 'DEX' ? 'Dexterity (sneak, evade)' : k === 'INT' ? 'Intellect (cast, solve)' : 'Charisma (persuade, charm)'}"><b>${k}</b>${p.stats[k] >= 0 ? '+' : ''}${p.stats[k]}</span>`)
      .join('');
    const q = p.quest;
    const stagesPips = q.stages.map((s, i) =>
      `<span class="stage-pip ${q.stagesDone[i] ? 'done' : i === q.currentStage ? 'now' : ''}" title="${s.description || s.type}">${i + 1}</span>`
    ).join('');
    const hpBarPct = (p.hp / p.maxHp) * 100;
    const icon = CLASS_ICON[p.class.id] || '◆';
    const raceColor = RACE_COLOR[p.race.id] || '#d4a574';
    const abilityOnCooldown = p.abilityUsedRound === state.round;
    const abilityStatus = abilityOnCooldown
      ? `<span class="ability-status used" title="${p.class.name} ability already used this round; ready again next round.">⏳ ability cooling</span>`
      : `<span class="ability-status ready" title="${p.class.name} ability is ready.">✦ ability ready</span>`;

    let actionBtns = '';
    if (isActive) {
      actionBtns = renderActionButtons(legal, p);
    }

    card.innerHTML = `
      <div class="player-head">
        <div class="player-id">
          <div class="player-icon" style="border-color:${raceColor}">${icon}</div>
          <div class="class-info-wrap">
            <div class="player-name">${p.name}</div>
            <div class="muted small">${p.race.name} <span class="class-label">${p.class.name}</span> · ${p.alignment}</div>
            <div class="muted small">policy <code>${p.policy}</code>${p.pendingBonus ? ` · <span class="badge">+${p.pendingBonus.value} ${p.pendingBonus.stat || ''} next</span>` : ''}${p.pendingReroll ? ' · <span class="badge">reroll ready</span>' : ''}</div>
            ${renderClassPopover(p)}
          </div>
        </div>
        <div class="player-vitals">
          <div class="hp-bar" title="${p.hp} HP remaining out of ${p.maxHp}"><div class="hp-bar-fill" style="width:${hpBarPct}%"></div><span>${p.hp}/${p.maxHp}</span></div>
          <div class="favors-pill" title="Favors are spent to push the party toward your destination or force-advance your quest.">⚝ Favors <b>${p.favors}</b></div>
        </div>
      </div>
      <div class="player-stats">${stats}</div>
      <div class="player-quest" title="${q.headline} — ${q.stages.map((s, i) => `${i + 1}: ${s.description || s.type}`).join(' | ')}">
        <div class="muted small">${q.completed ? '✓ ' : ''}Quest: <b>${q.headline}</b></div>
        <div class="stages">${stagesPips}</div>
      </div>
      <div class="player-status-row">${abilityStatus}</div>
      ${p.techniques.length ? `<div class="player-techs muted small">Techs held: ${p.techniques.map((t) => t.name).join(', ')}</div>` : ''}
      ${isActive ? `<div class="player-actions">${actionBtns}</div>` : ''}
    `;

    if (isActive) {
      card.querySelectorAll('button[data-action]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const payload = JSON.parse(btn.dataset.action);
          onAction(payload);
        });
      });
    }
    list.appendChild(card);
  });
  wrap.appendChild(list);
  return wrap;
}

function renderActionButtons(legal, player) {
  const buttons = [];
  const has = (t) => legal.find((a) => a.type === t);

  if (has('event')) buttons.push({ a: { type: 'event' }, label: '⚔ Attempt event', help: 'Draw an event card at your current tile and roll to resolve it.' });
  if (has('rest')) buttons.push({ a: { type: 'rest' }, label: '☾ Rest (+2 HP)', cls: 'soft', help: 'Recover 2 HP. Uses your action.' });
  if (has('ability')) buttons.push({ a: { type: 'ability' }, label: `✦ ${player.class.name} ability`, cls: 'gold', help: `Use your class signature: ${describeClassAbility(player.class.ability)}` });
  if (has('favor_advance')) buttons.push({ a: { type: 'favor_advance' }, label: '⚝ Spend Favor → advance quest', cls: 'soft', help: 'Costs 1 Favor; bumps your quest forward one stage.' });
  legal.filter((a) => a.type === 'final_check').forEach((a) => {
    buttons.push({ a, label: `★ Try ${a.alignment} resolution`, cls: 'gold', help: alignTooltip(a.alignment) });
  });
  legal.filter((a) => a.type === 'use_technique').forEach((a) => {
    const t = player.techniques[a.idx];
    buttons.push({ a, label: `↬ Use ${t?.name || 'tech'}`, cls: 'soft', help: t ? describeTech(t.tech) : '' });
  });
  buttons.push({ a: { type: 'end_turn' }, label: '➜ End turn', cls: 'subtle', help: 'Skip remaining actions and pass to the next player.' });

  return buttons.map((b) => `<button class="${b.cls || ''}" title="${b.help || ''}" data-action='${JSON.stringify(b.a).replace(/'/g, "&#39;")}'>${b.label}</button>`).join('');
}

// Class quick-reference popover anchored to the class label. Shows on hover.
function renderClassPopover(p) {
  const cls = p.class;
  const race = p.race;
  const stats = ['STR', 'DEX', 'INT', 'CHA']
    .map((k) => `<tr><td>${k}</td><td><b>${p.stats[k] >= 0 ? '+' : ''}${p.stats[k]}</b></td></tr>`)
    .join('');
  return `<div class="class-popover">
    <div class="class-popover-head">
      <span class="class-popover-icon">${CLASS_ICON[cls.id] || '◆'}</span>
      <div>
        <div class="class-popover-name">${cls.name}</div>
        <div class="muted small">Max HP <b>${cls.hp}</b> · primary <b>${cls.primary}</b> · secondary <b>${cls.secondary}</b></div>
      </div>
    </div>
    <table class="class-popover-stats">${stats}</table>
    <div class="class-popover-ability">
      <div class="muted small">Signature ability</div>
      <div>✦ ${describeClassAbility(cls.ability)}</div>
    </div>
    <div class="class-popover-race">
      <span class="muted small">Race</span> <b>${race.name}</b> — ${race.flavor}
    </div>
  </div>`;
}

function describeClassAbility(ab) {
  switch (ab) {
    case 'heal': return 'heal self +2 HP and nearest hurt ally +1 HP';
    case 'calm': return 'reduce alert on your current tile by 1';
    case 'rejuvenate': return 'heal +1 HP and +1 on your next check';
    case 'inspire': return '+1 on your next check AND on an ally\'s next check';
    case 'rerollDex':
    case 'rerollStr': return 'prime a reroll for your next failed check (any stat)';
    case 'wildernessBonus': return '+1 next check (+2 in forest/mountain)';
    case 'bonusInt': return '+2 on your next INT check';
    default: return '+1 on your next check';
  }
}

function renderTechniquesRow(state, onAction) {
  const el = document.createElement('div');
  el.className = 'panel tech-panel';
  el.innerHTML = `<h3>Techniques Row <span class="muted small">— steal the world's moves; click a card to claim</span></h3>`;
  const row = document.createElement('div');
  row.className = 'tech-row';
  const active = activePlayer(state);
  const isActiveTurn = active && (state.phase === 'player' || state.phase === 'final') && !state.outcome;
  const legal = isActiveTurn ? legalActions(state) : [];
  const claimable = isActiveTurn ? new Set(legal.filter((a) => a.type === 'claim_technique').map((a) => a.idx)) : new Set();

  if (state.techniquesRow.length === 0) {
    row.innerHTML = `<div class="muted">(empty — no techniques available)</div>`;
  } else {
    state.techniquesRow.forEach((t, idx) => {
      const card = document.createElement('div');
      card.className = 'tech-card';
      card.title = `${t.name}: ${describeTech(t.tech)}. Claiming uses your action.`;
      if (claimable.has(idx)) {
        card.classList.add('claimable');
        card.addEventListener('click', () => onAction({ type: 'claim_technique', idx }));
      }
      card.innerHTML = `
        <div class="tech-name">⚙ ${t.name}</div>
        <div class="muted small">${describeTech(t.tech)}</div>
        <div class="muted small">+${t.doom} doom·threat</div>
        ${claimable.has(idx) ? '<div class="claim-hint">↓ click to claim</div>' : ''}
      `;
      row.appendChild(card);
    });
  }
  el.appendChild(row);
  return el;
}

function describeTech(tech) {
  switch (tech.type) {
    case 'bonus': return `+${tech.value} to ${tech.stat} checks`;
    case 'heal': return `heal ${tech.value} HP`;
    case 'doomBack': return `doom -${tech.value}`;
    case 'reroll': return `reroll one check`;
    default: return tech.type;
  }
}

// Track log length across renders so we can highlight only newly added lines.
let _lastLogLen = 0;
function renderLog(state) {
  const el = document.createElement('div');
  el.className = 'panel log-panel';
  el.innerHTML = `<h3>Adventure Log</h3>`;
  const list = document.createElement('div');
  list.className = 'log-list';
  const totalLen = state.log.length;
  const newCount = Math.max(0, totalLen - _lastLogLen);
  _lastLogLen = totalLen;
  const recent = state.log.slice(-40);
  const firstNewIdx = recent.length - newCount;
  recent.forEach((entry, i) => {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="muted small">r${entry.round}</span> ${enrichLog(entry.msg)}`;
    if (/critical/.test(entry.msg)) line.classList.add('log-crit');
    else if (/fumble/.test(entry.msg)) line.classList.add('log-fumble');
    else if (/success/.test(entry.msg)) line.classList.add('log-success');
    else if (/failure/.test(entry.msg)) line.classList.add('log-failure');
    if (/Final Act|resolution complete|Game over|FINAL ACT/i.test(entry.msg)) line.classList.add('log-major');
    if (i >= firstNewIdx && newCount > 0) line.classList.add('log-new');
    list.appendChild(line);
  });
  el.appendChild(list);
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  return el;
}

// Replace bare roll notation like `rolled 3+2=5` with a small dice graphic.
const ROLL_RE = /rolled (\d+)\+(\d+)=(\d+)/g;
function enrichLog(msg) {
  let html = escapeHtml(msg);
  html = html.replace(ROLL_RE, (_m, total, bonus, sum) => {
    // The roll text is "rolled <raw>+<bonus>=<total>" where raw = d1+d2.
    // We don't have d1/d2 separately, so split the raw value into two faces
    // visually (top 1–6 then remainder, both clamped). This is a UI flourish,
    // not the source of truth.
    const raw = parseInt(total, 10);
    const d1 = Math.max(1, Math.min(6, Math.ceil(raw / 2)));
    const d2 = Math.max(1, Math.min(6, raw - d1));
    return `<span class="dice-pair">${diceSvg(d1)}${diceSvg(d2)}</span><span class="roll-result">+${escapeHtml(bonus)} = <b>${escapeHtml(sum)}</b></span>`;
  });
  return html;
}

const DIE_DOTS = {
  1: [[12, 12]],
  2: [[6, 6], [18, 18]],
  3: [[6, 6], [12, 12], [18, 18]],
  4: [[6, 6], [18, 6], [6, 18], [18, 18]],
  5: [[6, 6], [18, 6], [12, 12], [6, 18], [18, 18]],
  6: [[6, 6], [18, 6], [6, 12], [18, 12], [6, 18], [18, 18]],
};
function diceSvg(face) {
  const dots = DIE_DOTS[face] || DIE_DOTS[1];
  const dotsXml = dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="#1a1208"/>`).join('');
  return `<svg class="die" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="#e0bc73" stroke="#8a6f3e" stroke-width="1"/>${dotsXml}</svg>`;
}

function wrapPanel(cls, inner) {
  const el = document.createElement('div');
  el.className = `panel ${cls}`;
  el.innerHTML = inner;
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
