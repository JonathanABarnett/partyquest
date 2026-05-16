// Lightweight toast notification system.
// showToast(msg, type) — type: 'success' | 'warn' | 'danger' | 'gold' | 'crit'
// Toasts stack vertically, auto-dismiss after 3.5 s, can be dismissed early.

let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) return;
  container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);
}

export function showToast(msg, type = 'success', duration = 3500) {
  ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${msg}</span><button class="toast-close" title="Dismiss">✕</button>`;
  el.querySelector('.toast-close').addEventListener('click', () => dismiss(el));
  container.appendChild(el);
  // Animate in
  requestAnimationFrame(() => el.classList.add('toast-show'));
  const timer = setTimeout(() => dismiss(el), duration);
  el.dataset.timer = timer;
}

function dismiss(el) {
  if (!el.parentNode) return;
  clearTimeout(parseInt(el.dataset.timer));
  el.classList.remove('toast-show');
  el.classList.add('toast-hide');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

// Scan fresh log entries for notable events and fire toasts.
// Quest toasts are scoped to the human player's name to avoid spamming
// when AI partners complete their quests.
let _prevLogLen = 0;
let _prevDoom = 0;

export function checkLogForToasts(state) {
  if (!state?.log) return;
  const newEntries = state.log.slice(_prevLogLen);
  _prevLogLen = state.log.length;

  // Find human player names (policy === 'manual')
  const humanNames = new Set(
    (state.players || []).filter((p) => p.policy === 'manual').map((p) => p.name)
  );
  const isHuman = (msg) => [...humanNames].some((n) => msg.startsWith(n));

  for (const e of newEntries) {
    const m = e.msg;
    // Quest toasts — only for the human player
    if (/stage 1 → 2/.test(m) && isHuman(m)) showToast('✓ Quest stage 1 cleared!', 'success');
    if (/stage 2 → 3/.test(m) && isHuman(m)) showToast('✓ Stage 2 done — commit when ready!', 'success');
    if (/completes quest/.test(m) && isHuman(m)) showToast('🏆 Quest complete!', 'gold');
    // Crits/fumbles — only for human player
    if (/→ critical/.test(m) && isHuman(m)) showToast('★ Critical hit!', 'crit');
    if (/→ fumble/.test(m) && isHuman(m) && !m.includes('resolution')) showToast('☠ Fumble!', 'danger');
    // World events — always show (affects whole party)
    if (/FINAL ACT triggered|Final Act triggered/i.test(m)) {
      showToast('⚡ FINAL ACT begins! Move to the red tile.', 'danger', 5000);
    }
    if (/resolution complete/.test(m)) showToast('★★★ Resolution achieved!', 'gold', 5000);
    if (/Game over.*party win/i.test(m)) showToast('🎉 Party Victory!', 'gold', 6000);
    if (/Game over.*party loss/i.test(m)) showToast('☠ Party Defeated.', 'danger', 5000);
  }

  // Doom milestones — only when doom is below max (FA not yet triggered)
  const doom = state.doomClock || 0;
  const max  = state.config?.doomMax || 10;
  if (doom >= max) { _prevDoom = doom; return; } // FA already triggered
  const half   = Math.floor(max / 2);
  const threeQ = Math.floor(max * 0.75);
  if (doom >= half   && _prevDoom < half)   showToast(`⚠ Doom at ${doom}/${max} — halfway there`, 'warn');
  else if (doom >= threeQ && _prevDoom < threeQ) showToast(`🔥 Doom at ${doom}/${max} — Final Act is close!`, 'warn', 4000);
  _prevDoom = doom;
}

export function resetToastTracking() {
  _prevLogLen = 0;
  _prevDoom   = 0;
}
