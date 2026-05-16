// Render functions — direct DOM manipulation, no framework. The full UI
// re-renders on every state change; cheap because the state object is small.

import { activePlayer, locationOf } from '../engine/state.js';

export function renderAll(state, root) {
  root.innerHTML = '';
  root.appendChild(renderHeader(state));
  root.appendChild(renderMap(state));
  root.appendChild(renderPlayers(state));
  root.appendChild(renderTechniquesRow(state));
  root.appendChild(renderLog(state));
}

function renderHeader(state) {
  const el = document.createElement('div');
  el.className = 'panel header-panel';
  const fa = state.finalAct ? ` — FINAL ACT (round ${state.finalAct.roundsElapsed + 1}/${state.config.finalActWindow})` : '';
  const outcome = state.outcome
    ? ` — ${state.outcome.partyWin ? `PARTY WIN (${state.outcome.resolvedBy})` : `PARTY LOSS (${state.outcome.reason})`}`
    : '';
  el.innerHTML = `
    <div class="header-row">
      <div>
        <div class="muted">Round ${state.round} · Phase: <b>${state.phase}</b>${fa}${outcome}</div>
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

function renderMap(state) {
  const el = document.createElement('div');
  el.className = 'panel map-panel';
  el.innerHTML = `<h3>Map</h3>`;
  const grid = document.createElement('div');
  grid.className = 'map-grid';
  // Render capital + ring of regions
  const cells = [state.map.capital, ...state.map.regions];
  cells.forEach((loc) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    if (state.finalAct?.location === loc.id) tile.classList.add('final-act');
    if (loc.id === 'capital') tile.classList.add('capital');
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

function renderPlayers(state) {
  const wrap = document.createElement('div');
  wrap.className = 'panel players-panel';
  wrap.innerHTML = `<h3>Adventurers</h3>`;
  const list = document.createElement('div');
  list.className = 'players-list';
  const active = activePlayer(state);
  state.players.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'player-card';
    if (active && p.id === active.id && state.phase === 'player') card.classList.add('active');
    if (p.incapacitated) card.classList.add('down');
    const stats = Object.entries(p.stats)
      .map(([k, v]) => `<span><b>${k}</b> +${v}</span>`)
      .join('');
    const q = p.quest;
    const stagesPips = q.stages.map((s, i) =>
      `<span class="stage-pip ${q.stagesDone[i] ? 'done' : i === q.currentStage ? 'now' : ''}" title="${s.description || s.type}">${i + 1}</span>`
    ).join('');
    card.innerHTML = `
      <div class="player-head">
        <div>
          <div class="player-name">${p.name} <span class="muted">${p.race.name} ${p.class.name}</span></div>
          <div class="muted small">${p.alignment} · policy <code>${p.policy}</code></div>
        </div>
        <div class="player-vitals">
          <div>HP <b>${p.hp}/${p.maxHp}</b></div>
          <div>Favors <b>${p.favors}</b></div>
        </div>
      </div>
      <div class="player-stats">${stats}</div>
      <div class="player-quest">
        <div class="muted small">Quest: ${q.headline} ${q.completed ? '✓' : ''}</div>
        <div class="stages">${stagesPips}</div>
      </div>
      ${p.techniques.length ? `<div class="player-techs muted small">Techs: ${p.techniques.map((t) => t.name).join(', ')}</div>` : ''}
    `;
    list.appendChild(card);
  });
  wrap.appendChild(list);
  return wrap;
}

function renderTechniquesRow(state) {
  const el = document.createElement('div');
  el.className = 'panel tech-panel';
  el.innerHTML = `<h3>Techniques Row <span class="muted small">(claim to steal the world's moves)</span></h3>`;
  const row = document.createElement('div');
  row.className = 'tech-row';
  if (state.techniquesRow.length === 0) {
    row.innerHTML = `<div class="muted">empty</div>`;
  } else {
    state.techniquesRow.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'tech-card';
      card.innerHTML = `
        <div class="tech-name">${t.name}</div>
        <div class="muted small">+${t.doom} doom · ${describeTech(t.tech)}</div>
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
  // Show last 30 entries, newest at bottom
  const recent = state.log.slice(-30);
  recent.forEach((entry) => {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `<span class="muted small">r${entry.round}</span> ${escapeHtml(entry.msg)}`;
    list.appendChild(line);
  });
  el.appendChild(list);
  // Scroll to bottom
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
