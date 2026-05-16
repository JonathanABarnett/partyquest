// Interactive in-game tutorial. A small state machine + a banner renderer.
// The user plays a real (fixed-seed) game while contextual coaching appears
// in a sticky banner. Action-gated steps advance when the player takes any
// matching action, so the tutorial teaches by doing rather than by reading.

const FIRST_VISIT_KEY = 'partyquest:tutorial-seen';

// Each step shows a contextual banner; `advanceOn` is 'next' (Next button) or
// a predicate (action, state) => bool that fires when the engine dispatches a
// matching action. `target` is a CSS selector that gets a pulse highlight.
const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Partyquest',
    body: `You're about to play a co-op fantasy adventure with hidden personal agendas. Your party works together to survive the world's doom — but each of you also has a secret quest. Sometimes those goals align. Sometimes they don't. Press <b>Next</b> to begin.`,
    target: null,
    advanceOn: 'next',
  },
  {
    id: 'your-party',
    title: 'Your party',
    body: `<b>P1 is you.</b> P2 and P3 are AI partners. Each hero has a <em>Race</em>, a <em>Class</em>, an <em>Alignment</em> (visible to everyone), and a <em>Quest</em> (the headline is visible, the twist is hidden). Hover any stat or quest text for tooltips.`,
    target: '.player-card.active',
    advanceOn: 'next',
  },
  {
    id: 'the-map',
    title: 'The realm',
    body: `Your party starts in the Capital, surrounded by a random ring of regions. Tiles adjacent to your character glow with a dashed sage outline — <b>click any glowing tile to move there</b>. Hover any tile to see what events spawn on its terrain.`,
    target: '.map-panel',
    advanceOn: 'next',
  },
  {
    id: 'doom-clock',
    title: 'The Doom Clock',
    body: `Each round the world fights back — a Threat fires and the <b>Doom Clock</b> ticks up. When it hits the max (10 by default), the <b>Final Act</b> begins and your party has 3 rounds to win.`,
    target: '.doom-row',
    advanceOn: 'next',
  },
  {
    id: 'your-quest',
    title: 'Your hidden quest',
    body: `Your quest has <b>three stages</b>. Stage 1: succeed any event check. Stage 2: travel to a specific terrain. Stage 3: <em>commit</em> — Lawful quests help the party, Neutral are neutral, Chaotic hurt the party. Your quest headline tells you the alignment; the twist (revealed at game-end) tells you what really happened.`,
    target: '.player-card.active .player-quest',
    advanceOn: 'next',
  },
  {
    id: 'take-action',
    title: 'Take your first action',
    body: `Time to actually play. <b>Click ⚔ Attempt event</b> below to draw an event card at your current tile and roll dice to resolve it. (Or pick any other action — the tutorial advances on any action.)`,
    target: '.player-card.active .player-actions button',
    advanceOn: () => true, // any action dispatch advances this step
  },
  {
    id: 'the-roll',
    title: 'How rolls work',
    body: `Every check is <b>2d6 + stat bonus vs DC</b>. Double-6 is a crit (success + bonus). Snake-eyes is a fumble (failure + extra consequence). Success lifts your quest forward; failure costs HP or raises tile alert. The log below records every roll.`,
    target: '.log-panel',
    advanceOn: 'next',
  },
  {
    id: 'ai-turns',
    title: 'AI partners play themselves',
    body: `Your turn ended. P2 and P3 already played their turns automatically — scroll the log to see what they did. Your turn is up again. Try moving to an adjacent tile by clicking it on the map.`,
    target: '.map-panel',
    advanceOn: (action) => action.type === 'move',
  },
  {
    id: 'techniques',
    title: 'Stealing the world\'s moves',
    body: `The Techniques Row shows the last few threats — you can <b>claim one as a free power</b> (a stat bonus, heal, or doom rollback) by clicking its card on your turn. The trade-off: claiming uses your action, and the threat keeps doing damage until claimed.`,
    target: '.tech-panel',
    advanceOn: 'next',
  },
  {
    id: 'final-act',
    title: 'You\'re ready',
    body: `When Doom hits max, one region lights up red — the <b>Final Act tile</b>. Move there and click <b>★ Try [Alignment] resolution</b>. Land 3 successful checks of one alignment to win. Win as <em>your</em> alignment to score big personally. Finish this game your way!`,
    target: null,
    advanceOn: 'next',
  },
];

export function createTutorial() {
  let active = false;
  let stepIdx = 0;
  let renderFn = null;

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
  function next() {
    if (!active) return;
    stepIdx++;
    if (stepIdx >= STEPS.length) { stop(); return; }
    renderFn?.();
  }
  function current() { return active ? STEPS[stepIdx] : null; }
  function isFirstVisit() {
    try { return !localStorage.getItem(FIRST_VISIT_KEY); } catch { return false; }
  }
  // Called by controls.dispatch after every manual action.
  function onAction(action, state) {
    const cur = current();
    if (!cur) return;
    if (typeof cur.advanceOn === 'function' && cur.advanceOn(action, state)) {
      next();
    }
  }
  function setRenderHook(fn) { renderFn = fn; }
  return {
    start, stop, next, current, isFirstVisit, onAction, setRenderHook,
    totalSteps: STEPS.length,
    stepIndex: () => stepIdx,
  };
}
