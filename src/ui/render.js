// Render functions. Direct DOM manipulation, no framework. Full re-render on
// every state change; cheap because state is small. The `ctx` object carries
// the action dispatcher so click handlers can step the engine.

import { activePlayer, locationOf, alivePlayers } from '../engine/state.js';
import { legalActions } from '../engine/actions.js';

export function renderAll(state, root, ctx = {}) {
  const onAction = ctx.onAction || (() => {});
  root.innerHTML = '';
  if (state.outcome) root.appendChild(renderGameOver(state, ctx));
  root.appendChild(renderHeader(state));
  if (state.finalAct) root.appendChild(renderFinalActBanner(state));
  root.appendChild(renderMap(state, onAction));
  root.appendChild(renderPlayers(state, onAction));
  root.appendChild(renderTechniquesRow(state, onAction));
  root.appendChild(renderLog(state));
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
    <div class="gameover-actions">
      <button class="primary" data-action="new-game">New Game (same seed +1)</button>
    </div>
  `;
  el.querySelector('[data-action="new-game"]').addEventListener('click', () => {
    ctx.onNewGame?.();
  });
  return el;
}

function renderHeader(state) {
  const el = document.createElement('div');
  el.className = 'panel header-panel';
  const fa = state.finalAct ? ` — FINAL ACT` : '';
  el.innerHTML = `
    <div class="header-row">
      <div>
        <div class="muted">Round ${state.round} · Phase: <b>${state.phase}</b>${fa}</div>
        <div class="doom-row">
          <span class="muted">Doom</span>
          ${renderDoomTrack(state)}
          <span>${state.doomClock} / ${state.config.doomMax}</span>
        </div>
      </div>
      <div class="muted">Seed: <code>${state.seed}</code></div>
    </div>
  `;
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
    return `<div class="fa-bar ${align.toLowerCase()} ${done ? 'done' : ''}">
      <div class="fa-bar-label">${align} <span class="muted small">${n} / ${threshold}</span></div>
      <div class="fa-bar-track"><div class="fa-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
  return wrapPanel('final-act-panel', `
    <div class="fa-head">
      <h3>FINAL ACT — ${loc?.name || 'Unknown'}</h3>
      <div class="muted small">${roundsLeft} round${roundsLeft !== 1 ? 's' : ''} remaining</div>
    </div>
    <div class="fa-bars">${bars}</div>
  `);
}

function renderMap(state, onAction) {
  const el = document.createElement('div');
  el.className = 'panel map-panel';
  el.innerHTML = `<h3>Map <span class="muted small">— click adjacent tile to move active player</span></h3>`;
  const grid = document.createElement('div');
  grid.className = 'map-grid';

  const active = activePlayer(state);
  const legal = (active && !state.outcome && (state.phase === 'player' || state.phase === 'final')) ? legalActions(state) : [];
  const moveOptions = new Set(legal.filter((a) => a.type === 'move').map((a) => a.to));

  const cells = [state.map.capital, ...state.map.regions];
  cells.forEach((loc) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    if (state.finalAct?.location === loc.id) tile.classList.add('final-act');
    if (loc.id === 'capital') tile.classList.add('capital');
    if (moveOptions.has(loc.id)) {
      tile.classList.add('move-target');
      tile.style.cursor = 'pointer';
      tile.addEventListener('click', () => onAction({ type: 'move', to: loc.id }));
    }
    if (active && active.location === loc.id) tile.classList.add('here');
    const here = state.players.filter((p) => p.location === loc.id && !p.incapacitated);
    tile.innerHTML = `
      <div class="tile-name">${loc.name}</div>
      <div class="tile-terrain">${loc.terrain}</div>
      ${loc.alert ? `<div class="tile-alert">alert ${loc.alert}</div>` : ''}
      <div class="tile-players">${here.map((p) => `<span class="player-chip p-${p.id}">${p.name}</span>`).join('')}</div>
    `;
    grid.appendChild(tile);
  });
  el.appendChild(grid);
  return el;
}

function renderPlayers(state, onAction) {
  const wrap = document.createElement('div');
  wrap.className = 'panel players-panel';
  wrap.innerHTML = `<h3>Adventurers</h3>`;
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
      .map((k) => `<span title="${k}"><b>${k}</b>${p.stats[k] >= 0 ? '+' : ''}${p.stats[k]}</span>`)
      .join('');
    const q = p.quest;
    const stagesPips = q.stages.map((s, i) =>
      `<span class="stage-pip ${q.stagesDone[i] ? 'done' : i === q.currentStage ? 'now' : ''}" title="${s.description || s.type}">${i + 1}</span>`
    ).join('');
    const hpBarPct = (p.hp / p.maxHp) * 100;

    let actionBtns = '';
    if (isActive) {
      actionBtns = renderActionButtons(legal, p);
    }

    card.innerHTML = `
      <div class="player-head">
        <div>
          <div class="player-name">${p.name} <span class="muted">${p.race.name} ${p.class.name}</span></div>
          <div class="muted small">${p.alignment} · <code>${p.policy}</code>${p.pendingBonus ? ` · <span class="badge">+${p.pendingBonus.value} ${p.pendingBonus.stat || ''} next</span>` : ''}${p.pendingReroll ? ' · <span class="badge">reroll ready</span>' : ''}</div>
        </div>
        <div class="player-vitals">
          <div class="hp-bar"><div class="hp-bar-fill" style="width:${hpBarPct}%"></div><span>${p.hp}/${p.maxHp}</span></div>
          <div class="favors-pill">Favors <b>${p.favors}</b></div>
        </div>
      </div>
      <div class="player-stats">${stats}</div>
      <div class="player-quest" title="${q.headline} — ${q.stages.map((s, i) => `${i + 1}: ${s.description || s.type}`).join(' | ')}">
        <div class="muted small">${q.completed ? '✓ ' : ''}Quest: <b>${q.headline}</b></div>
        <div class="stages">${stagesPips}</div>
      </div>
      ${p.techniques.length ? `<div class="player-techs muted small">Techs: ${p.techniques.map((t) => t.name).join(', ')}</div>` : ''}
      ${isActive ? `<div class="player-actions">${actionBtns}</div>` : ''}
    `;

    // Wire action buttons
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

// Map legal actions to clean labeled buttons. Hide noise (per-tile moves
// since those live on the map; per-tech claims since those live on the tech
// row). Show one button per high-level intent.
function renderActionButtons(legal, player) {
  const buttons = [];
  const has = (t) => legal.find((a) => a.type === t);

  if (has('event')) buttons.push({ a: { type: 'event' }, label: '⚔ Attempt event' });
  if (has('rest')) buttons.push({ a: { type: 'rest' }, label: '☾ Rest (+2 HP)', cls: 'soft' });
  if (has('ability')) buttons.push({ a: { type: 'ability' }, label: `✦ ${player.class.name} ability`, cls: 'gold' });
  if (has('favor_advance')) buttons.push({ a: { type: 'favor_advance' }, label: '⚝ Spend Favor → advance quest', cls: 'soft' });
  // Final-act checks: one button per alignment available
  legal.filter((a) => a.type === 'final_check').forEach((a) => {
    buttons.push({ a, label: `★ Try ${a.alignment} resolution`, cls: 'gold' });
  });
  // Use-technique: one button per held tech
  legal.filter((a) => a.type === 'use_technique').forEach((a) => {
    const t = player.techniques[a.idx];
    buttons.push({ a, label: `↬ Use ${t?.name || 'tech'}`, cls: 'soft' });
  });
  buttons.push({ a: { type: 'end_turn' }, label: '➜ End turn', cls: 'subtle' });

  return buttons.map((b) => `<button class="${b.cls || ''}" data-action='${JSON.stringify(b.a).replace(/'/g, "&#39;")}'>${b.label}</button>`).join('');
}

function renderTechniquesRow(state, onAction) {
  const el = document.createElement('div');
  el.className = 'panel tech-panel';
  el.innerHTML = `<h3>Techniques Row <span class="muted small">(claim to steal the world's moves)</span></h3>`;
  const row = document.createElement('div');
  row.className = 'tech-row';
  const active = activePlayer(state);
  const isActiveTurn = active && (state.phase === 'player' || state.phase === 'final') && !state.outcome;
  const legal = isActiveTurn ? legalActions(state) : [];
  const claimable = isActiveTurn ? new Set(legal.filter((a) => a.type === 'claim_technique').map((a) => a.idx)) : new Set();

  if (state.techniquesRow.length === 0) {
    row.innerHTML = `<div class="muted">empty</div>`;
  } else {
    state.techniquesRow.forEach((t, idx) => {
      const card = document.createElement('div');
      card.className = 'tech-card';
      if (claimable.has(idx)) {
        card.classList.add('claimable');
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => onAction({ type: 'claim_technique', idx }));
      }
      card.innerHTML = `
        <div class="tech-name">${t.name}</div>
        <div class="muted small">+${t.doom} doom · ${describeTech(t.tech)}</div>
        ${claimable.has(idx) ? '<div class="muted small">click to claim</div>' : ''}
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

function renderLog(state) {
  const el = document.createElement('div');
  el.className = 'panel log-panel';
  el.innerHTML = `<h3>Log</h3>`;
  const list = document.createElement('div');
  list.className = 'log-list';
  const recent = state.log.slice(-40);
  recent.forEach((entry) => {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="muted small">r${entry.round}</span> ${escapeHtml(entry.msg)}`;
    list.appendChild(line);
  });
  el.appendChild(list);
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  return el;
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
