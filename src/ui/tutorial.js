// Interactive in-game tutorial. A state machine + a banner renderer.
// The user plays a real (fixed-seed) game while a contextual coach in a
// sticky banner explains every step. Action-gated steps advance when the
// player takes a matching action. Same fixed seed + player config every
// time so the walkthrough is identical for every new player.

const FIRST_VISIT_KEY = 'partyquest:tutorial-seen';

// Locked tutorial config — every tutorial run produces the same game state.
// Seed 7 + 3 players (1 human, 2 opportunist AI partners) was chosen because
// it produces a Cleric for P1 (a good teaching class — heal makes sense to
// new players), and quick first-round events that can succeed.
export const TUTORIAL_CONFIG = {
  seed: 7,
  playerCount: 3,
  humans: 1,
  aiPolicy: 'opportunist',
};

// `body` is static text or a function (state, log) => html string. `target`
// is a CSS selector that gets a gold pulse highlight. `advanceOn` is either
// the string 'next' (Next button) or a predicate (action, state) => bool.
// `description` is shown to the player as the action prompt.
const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Partyquest',
    body: `You're about to play a co-op fantasy adventure with hidden personal agendas. Your party works together to survive the world's doom — but each of you also has a secret quest. <b>This tutorial walks you through one complete game.</b> The setup is the same every time so you can replay it as many times as you need. Press <b>Next</b> to begin.`,
    target: null,
    advanceOn: 'next',
  },
  {
    id: 'your-character',
    title: (state) => {
      const me = state.players?.find((p) => p.policy === 'manual');
      return me ? `Meet your hero — P1 the ${me.race.name} ${me.class.name}` : 'Meet your hero';
    },
    body: (state) => {
      const me = state.players?.find((p) => p.policy === 'manual');
      const cls = me?.class?.name || 'hero';
      const align = me?.alignment || '';
      return `You're playing <b>P1</b>, a <b>${cls}</b> (alignment <b>${align}</b>). The other two characters (P2 and P3) are <em>AI partners</em> — they'll take their turns automatically after you. Hover the class name on your card to see your stats, max HP, and signature ability. Your <b>quest headline</b> and <b>alignment</b> are visible to everyone, but the quest's hidden twist (what you actually do at stage 3) is yours alone.`;
    },
    target: '.player-card.active',
    advanceOn: 'next',
  },
  {
    id: 'the-realm',
    title: 'The Realm',
    body: `The map is a Capital surrounded by random regions. You start at the Capital — see the gold border around your tile? Tiles glowing with a dashed sage outline are <b>adjacent</b> and clickable to move. The Doom Clock at the top ticks up each round; when it hits max, the <b>Final Act</b> begins.`,
    target: '.map-panel',
    advanceOn: 'next',
  },
  {
    id: 'your-quest',
    title: 'Your hidden quest',
    body: `Your quest has <b>three stages</b>: <b>1)</b> succeed any event check, <b>2)</b> travel to a specific terrain, <b>3)</b> commit (Lawful helps the party, Chaotic hurts them). The numbered pips on your quest line show your progress. Right now stage 1 is glowing — let's clear it.`,
    target: '.player-card.active .player-quest',
    advanceOn: 'next',
  },
  {
    id: 'first-event',
    title: 'Roll your first event',
    body: `Click the <b>⚔ Attempt event</b> button on your character card. The engine will draw an event card matching your tile's terrain and roll <b>2d6 + stat bonus</b> against the event's difficulty. Win it and your stage 1 quest pip turns sage green.`,
    target: '.player-card.active .player-actions button',
    advanceOn: (action) => action.type === 'event',
    description: 'Click ⚔ Attempt event',
  },
  {
    id: 'after-event',
    title: 'How rolls work',
    body: (_state, logTail) => `Look at the log below — the most recent line shows your roll. The two dice icons are your <b>2d6</b>, followed by the <b>+ stat bonus</b>, then the total compared to the DC. Sage-green lines = success, rose-pink lines = failure. Double-6 is a crit (success + extra reward). Snake-eyes (double 1) is a fumble (failure + extra consequence). Latest: <em>${logTail || '(see log)'}</em>`,
    target: '.log-panel',
    advanceOn: 'next',
  },
  {
    id: 'end-turn',
    title: 'End your turn',
    body: `You get <b>one move and one act per turn</b>. You already used your act (the event). To pass to your AI partners, click <b>➜ End turn</b>. After you end, the AI partners will play their turns automatically.`,
    target: '.player-card.active .player-actions button:last-of-type',
    advanceOn: (action) => action.type === 'end_turn',
    description: 'Click ➜ End turn',
  },
  {
    id: 'ai-narration',
    title: 'Your AI partners just played',
    body: (state, _logTail) => {
      // Pull the most recent ~6 log entries to summarize the AI turn.
      const recent = (state.log || []).slice(-8).filter((e) => /^P[2-9]|^P[1-9][0-9]/.test(e.msg));
      if (recent.length === 0) return 'Your AI partners took their turns silently — check the log below for the full play-by-play.';
      const lines = recent.map((e) => `<li>${escapeHtmlLite(e.msg)}</li>`).join('');
      return `Here's what P2 and P3 (your AI partners) just did:<ul class="tutorial-list">${lines}</ul>Now it's your turn again. Notice the round and doom clock advanced — the world fights back at the start of every round.`;
    },
    target: '.log-panel',
    advanceOn: 'next',
  },
  {
    id: 'plan-travel',
    title: 'Stage 2 — travel to your terrain',
    body: (state) => {
      const me = state.players?.find((p) => p.policy === 'manual');
      const target = me?.quest?.stages?.[1]?.terrain || '?';
      return `Your quest stage 2 needs you on a <b>${target}</b> region. Look at the map — does a ${target} tile exist? If so, click it to move there. (Tiles you can move to right now have the sage dashed outline.)`;
    },
    target: '.map-panel',
    advanceOn: (action) => action.type === 'move',
    description: 'Click any adjacent tile to move',
  },
  {
    id: 'techniques',
    title: 'Steal the world\'s moves',
    body: `Each round, the world plays a Threat card — it damages you and joins the <b>Techniques Row</b>. You can <b>claim</b> a card on your turn (click it) to keep that power for yourself: stat bonuses, heals, doom rollbacks. Try clicking one. (Claiming uses your action this turn.)`,
    target: '.tech-panel',
    advanceOn: (action) => action.type === 'claim_technique',
    description: 'Click a card in the Techniques Row',
  },
  {
    id: 'doom-clock',
    title: 'The Doom Clock',
    body: `Look at the doom row in the header — each red pip is one tick of doom. When it fills up, the <b>Final Act</b> triggers: one region lights up red, and your party has 3 rounds to converge there and win. Until then, your job is to advance your quest and stay alive.`,
    target: '.doom-row',
    advanceOn: 'next',
  },
  {
    id: 'final-act-preview',
    title: 'About the Final Act',
    body: `When doom hits max, one region lights red and a banner appears with 3 progress bars (Lawful, Neutral, Chaotic). Move to the red tile and click <b>★ Try [Alignment] resolution</b>. <b>Land 3 successful checks of one alignment</b> to win. If you win on <em>your</em> alignment AND complete your quest, you score big personally.`,
    target: null,
    advanceOn: 'next',
  },
  {
    id: 'ready',
    title: 'You\'re ready — finish the game!',
    body: `That's everything you need. From here, play the rest however you like. Watch your HP, claim techniques aggressively, and try to reach the Final Act tile when it appears. <b>Good luck!</b> (You can restart this tutorial any time from the sidebar.)`,
    target: null,
    advanceOn: 'next',
  },
];

function escapeHtmlLite(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function createTutorial() {
  let active = false;
  let stepIdx = 0;
  let renderFn = null;
  let onExitFn = null;

  function start() {
    active = true;
    stepIdx = 0;
    try { localStorage.setItem(FIRST_VISIT_KEY, '1'); } catch {}
    renderFn?.();
  }
  function stop() {
    active = false;
    try { localStorage.setItem(FIRST_VISIT_KEY, '1'); } catch {}
    renderFn?.();
  }
  function exitAndReset() {
    // Stop the tutorial AND ask the host to start a fresh game.
    stop();
    onExitFn?.();
  }
  function next() {
    if (!active) return;
    stepIdx++;
    if (stepIdx >= STEPS.length) { stop(); return; }
    renderFn?.();
  }
  function current() { return active ? STEPS[stepIdx] : null; }
  function resolveBody(step, state) {
    if (typeof step.body === 'function') {
      const lastLog = state?.log?.slice(-1)[0]?.msg || '';
      return step.body(state, lastLog);
    }
    return step.body;
  }
  function isFirstVisit() {
    try { return !localStorage.getItem(FIRST_VISIT_KEY); } catch { return false; }
  }
  function onAction(action, state) {
    const cur = current();
    if (!cur) return;
    if (typeof cur.advanceOn === 'function' && cur.advanceOn(action, state)) {
      next();
    }
  }
  function setRenderHook(fn) { renderFn = fn; }
  function setExitHook(fn) { onExitFn = fn; }
  return {
    start, stop, next, current, isFirstVisit, onAction, setRenderHook,
    setExitHook, exitAndReset, resolveBody,
    totalSteps: STEPS.length,
    stepIndex: () => stepIdx,
  };
}
