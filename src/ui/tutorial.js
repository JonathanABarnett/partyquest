// Interactive in-game tutorial. State machine + banner renderer. The user
// plays a real (fixed-seed) game while a sticky contextual coach explains
// each step. Action-gated steps advance when the player takes a matching
// action. Same locked setup every run so the walkthrough is identical.
//
// v2 of the walkthrough covers 3 full rounds end-to-end with who/what/
// where/why help blocks on every step.

const FIRST_VISIT_KEY = 'partyquest:tutorial-seen';

// Locked tutorial config. Seed 7 produces an Elf Ranger for P1, with quick
// first-round events that succeed and let stage 1 of the quest clear early.
export const TUTORIAL_CONFIG = {
  seed: 7,
  playerCount: 3,
  humans: 1,
  aiPolicy: 'opportunist',
};

// Small DSL: a "help block" tagged by who/what/where/why for consistency.
function help({ who, what, where, why, after }) {
  const rows = [];
  if (after) rows.push(`<div class="t-after">${after}</div>`);
  if (who) rows.push(`<div class="t-row"><span class="t-tag">WHO</span> ${who}</div>`);
  if (what) rows.push(`<div class="t-row"><span class="t-tag">WHAT</span> ${what}</div>`);
  if (where) rows.push(`<div class="t-row"><span class="t-tag">WHERE</span> ${where}</div>`);
  if (why) rows.push(`<div class="t-row"><span class="t-tag">WHY</span> ${why}</div>`);
  return rows.join('');
}

function escapeHtmlLite(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function abilityText(ab) {
  switch (ab) {
    case 'wildernessBonus': return '+1 to next check, +2 in forest or mountain';
    case 'heal':            return 'heal self +2 HP and nearest hurt ally +1 HP';
    case 'calm':            return 'reduce alert on current tile by 1';
    case 'rejuvenate':      return 'heal +1 HP and +1 on next check';
    case 'inspire':         return '+1 on own next check AND on an ally\'s next check';
    case 'rerollStr':
    case 'rerollDex':       return 'prime a reroll for the next failed check (any stat)';
    case 'bonusInt':        return '+2 on the next INT check';
    default:                return `${ab} (see ability popover)`;
  }
}

// Find P1's most recent roll result in the log — used by the "How rolls work" step.
function lastP1Roll(state) {
  const log = state?.log || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const m = log[i].msg;
    if (/^P1.*(rolled|→ (success|failure|critical|fumble))/.test(m)) return m;
  }
  return log[log.length - 1]?.msg || '';
}

// Pull AI (non-P1) log entries from the LAST COMPLETED round — walks backward
// past the most recent "End of round" boundary to find P2/P3 entries.
function recentAIBullets(state) {
  const log = state?.log || [];
  // Find the index of the most recent "End of round N" entry
  let endIdx = log.length - 1;
  while (endIdx >= 0 && !log[endIdx].msg.startsWith('End of round')) endIdx--;
  if (endIdx < 0) return ''; // no completed round yet
  // Collect non-P1 player entries from before that boundary
  const lines = [];
  for (let i = endIdx - 1; i >= 0 && lines.length < 8; i--) {
    const m = log[i].msg;
    if (/^End of round|^Round \d+ — Threat/.test(m)) break;
    if (/^P[2-9]\d*/.test(m)) lines.unshift(m); // P2, P3, … but not P1
  }
  return lines.map((m) => `<li>${escapeHtmlLite(m)}</li>`).join('');
}


const STEPS = [
  // ---------- INTRO ----------
  {
    id: 'welcome',
    title: 'Welcome to Partyquest',
    body: () => help({
      what: `Partyquest is a co-op fantasy adventure where each hero has a <b>hidden personal agenda</b>. The party wins together — but you each also have a private quest. Sometimes the goals align. Sometimes they don't.`,
      who: `You'll control one hero (P1). The other two heroes are <em>AI partners</em> who play automatically after your turn.`,
      why: `<b>Tutorial scope:</b> we'll play through <b>3 full rounds</b> so you see every phase (World → Players → End) at least three times. Click <b>Next</b> to begin.`,
    }),
    target: null,
    advanceOn: 'next',
  },
  {
    id: 'your-character',
    title: (state) => {
      const me = state.players?.find((p) => p.policy === 'manual');
      return me ? `Meet P1 — your ${me.race.name} ${me.class.name}` : 'Meet your hero';
    },
    body: (state) => {
      const me = state.players?.find((p) => p.policy === 'manual');
      const cls = me?.class?.name || 'hero';
      const align = me?.alignment || '';
      const abilDesc = abilityText(me?.class?.ability || '');
      return help({
        who: `You're P1, a <b>${me?.race?.name || ''} ${cls}</b> aligned <b>${align}</b>. Hover the class name on your card for a stat/ability popover.`,
        what: `Each class has a +2 primary stat, +1 secondary, +0 elsewhere, plus a once-per-round signature ability — yours: <em>${abilDesc}</em>.`,
        where: `Look at the highlighted player card — that's you. P2 and P3 use the <em>opportunist</em> AI policy (cooperative early, ambitious late).`,
        why: `Your class shapes which events you're good at. Your alignment shapes how you score in the Final Act (Lawful = STR/DEX, Neutral = INT/STR, Chaotic = CHA/INT).`,
      });
    },
    target: '.player-card.active',
    advanceOn: 'next',
  },
  {
    id: 'the-realm',
    title: 'The Realm & the Doom Clock',
    body: () => help({
      where: `The map is the Capital (centered, gold) plus 4 regions arranged in a ring around it. Adjacent tiles to your character glow with a sage dashed outline — those are your move options.`,
      what: `The <b>Doom Clock</b> at the top fills one red pip each round when the World plays a Threat card. The threat causes damage or alerts, then joins the Techniques Row.`,
      why: `When Doom hits max (10), the <b>Final Act</b> triggers: one region lights up red and your party has 3 rounds to converge there and win. Plan your moves with that timer in mind.`,
    }),
    target: '.map-panel',
    advanceOn: 'next',
  },
  {
    id: 'your-quest',
    title: 'Your hidden quest',
    body: (state) => {
      const me = state.players?.find((p) => p.policy === 'manual');
      const terrain = me?.quest?.stages?.[1]?.terrain || 'a specific terrain';
      const align = me?.alignment || 'your alignment';
      const impact = align === 'Lawful' ? 'helps the party' : align === 'Chaotic' ? 'costs the party HP and advances doom' : 'is neutral to the party';
      return help({
        what: `<b>3 stages:</b> <b>1)</b> succeed any event check, <b>2)</b> travel to a <b>${terrain}</b> region, <b>3)</b> commit (your alignment determines what happens to the party — yours ${impact}).`,
        where: `Your quest line is on your card, just below stats. The numbered pips track progress; pip 1 is glowing now.`,
        why: `Completing your quest scores major personal points at game-end, separate from any party-win bonus.`,
      });
    },
    target: '.player-card.active .player-quest',
    advanceOn: 'next',
  },

  // ---------- ROUND 1 ----------
  {
    id: 'r1-event',
    title: 'Round 1 — attempt an event',
    body: () => help({
      what: `Click the <b>⚔ Attempt event</b> button. The engine draws an event matching your tile's terrain and rolls <b>2d6 + stat bonus</b> against the event's DC.`,
      where: `On your character card — first gold button.`,
      why: `Any successful event clears your stage-1 quest pip. Even failures matter — they cost HP or raise tile alert.`,
    }),
    target: '.player-card.active .player-actions button',
    advanceOn: (action) => action.type === 'event',
    description: 'Click ⚔ Attempt event',
  },
  {
    id: 'r1-rolls',
    title: 'How rolls work',
    body: (state) => {
      const roll = lastP1Roll(state);
      return help({
        after: roll ? `<div class="t-recent">Your roll: <em>${escapeHtmlLite(roll)}</em></div>` : '',
        what: `Every check is <b>2d6 + stat bonus</b> vs the event's DC. The dice icons in the log show what you rolled. Double-6 is a <b>crit</b> (bonus reward). Snake-eyes (double 1) is a <b>fumble</b> (extra consequence).`,
        where: `Look at the log below — lines are color-coded: <em>sage = success</em>, <em>rose = failure</em>, gold-bordered = crit, red-bordered = fumble.`,
        why: `Your stat bonus is your consistent edge. Pick approaches that hit your high stats — a DEX check with +2 DEX beats a STR check at +0 every time.`,
      });
    },
    target: '.log-panel',
    advanceOn: 'next',
  },
  {
    id: 'r1-end-turn',
    title: 'End your turn',
    body: () => help({
      what: `Each turn = 1 move + 1 act. You spent your act on the event. Click <b>➜ End turn</b> to pass to P2 and P3.`,
      where: `Subtle button at the right end of your action row.`,
      why: `AI partners will play their turns automatically. After all three players finish, a new round starts with another Threat card.`,
    }),
    target: '.player-card.active .player-actions button:last-of-type',
    advanceOn: (action) => action.type === 'end_turn',
    description: 'Click ➜ End turn',
  },
  {
    id: 'r1-ai',
    title: 'Your AI partners played (round 1)',
    body: (state) => {
      const bullets = recentAIBullets(state);
      const ul = bullets
        ? `<ul class="tutorial-list">${bullets}</ul>`
        : `<div class="muted small">Your AI partners took quiet turns — scroll the log to see the details.</div>`;
      return help({
        after: `<div class="t-narration">${ul}</div>`,
        who: `P2 and P3 just took their turns automatically.`,
        what: `Opportunist AI helps the party early (cooperative play) and pivots to greedy later (chases its own quest). You can see the policy on each AI card (under "policy").`,
        why: `Watching AI partners helps you read your own options — if an AI heals or rests, that's a signal they're hurt. If they bee-line to a terrain, they're chasing a quest stage.`,
      });
    },
    target: '.log-panel',
    advanceOn: 'next',
  },

  // ---------- ROUND 2 ----------
  {
    id: 'r2-intro',
    title: 'Round 2 begins — time to travel',
    body: (state) => {
      const me = state.players?.find((p) => p.policy === 'manual');
      const target = me?.quest?.stages?.[1]?.terrain || 'a specific terrain';
      return help({
        what: `A new round started. The World played another Threat (you saw the log) and doom advanced. You're up again.`,
        where: `Your quest stage 2 wants you on a <b>${target}</b> region. Check the map — is there one nearby? Adjacent tiles (sage outline) are your move options.`,
        why: `The Capital connects to every region, so worst case you can always get anywhere in 2 hops (region → Capital → other region). Plan whether to push for stage 2 or stay safe for now.`,
      });
    },
    target: '.map-panel',
    advanceOn: 'next',
  },
  {
    id: 'r2-move',
    title: 'Click an adjacent tile to move',
    body: () => help({
      what: `Click <b>any</b> tile that glows with the sage dashed outline. Movement uses your <em>move</em> action (you still have your <em>act</em> action this turn).`,
      where: `On the map. Hover any tile first to see its terrain icon, sample events, and adjacency highlights.`,
      why: `Movement isn't free — each round on the road is a round closer to Final Act. If your quest terrain isn't adjacent yet, consider doing an event here for stage 1 first.`,
    }),
    target: '.map-panel',
    advanceOn: (action) => action.type === 'move',
    description: 'Click any adjacent tile to move',
  },
  {
    id: 'r2-end-turn',
    title: 'End your turn (round 2)',
    body: (state) => {
      const me = state.players?.find((p) => p.policy === 'manual');
      const loc = state.map?.allLocations.find((l) => l.id === me?.location);
      const targetTerrain = me?.quest?.stages?.[1]?.terrain;
      const arrived = loc?.terrain === targetTerrain;
      return help({
        after: arrived ? `<div class="t-good">✓ You're on a <b>${targetTerrain}</b> tile. Your quest will advance to stage 3 next time you end the turn here.</div>` : `<div class="t-info">You're on <b>${loc?.terrain || '?'}</b>. Quest stage 2 needs <b>${targetTerrain}</b> — keep traveling next round.</div>`,
        what: `Click <b>➜ End turn</b>. If you can spare the action you could try an event here first, but for the tutorial let's just end and watch AI play.`,
        why: `Ending early in the tutorial keeps the pace tight. In real play, squeeze every action you can.`,
      });
    },
    target: '.player-card.active .player-actions button:last-of-type',
    advanceOn: (action) => action.type === 'end_turn',
    description: 'Click ➜ End turn',
  },
  {
    id: 'r2-ai',
    title: 'AI partners played (round 2)',
    body: (state) => {
      const bullets = recentAIBullets(state);
      const ul = bullets
        ? `<ul class="tutorial-list">${bullets}</ul>`
        : `<div class="muted small">Your AI partners took quiet turns — scroll the log to see the details.</div>`;
      return help({
        after: `<div class="t-narration">${ul}</div>`,
        what: `Another World phase fired (doom +1 or more) and your partners took their second turns. Notice the Techniques Row at the bottom — each threat the world plays gets added there for you to claim.`,
        why: `The doom clock is creeping toward Final Act. By round 5-7 you'll start seeing the red glow on a region. Plan a path there now.`,
      });
    },
    target: '.tech-panel',
    advanceOn: 'next',
  },

  // ---------- ROUND 3 ----------
  {
    id: 'r3-techniques',
    title: 'Round 3 — meet the Techniques Row',
    body: (state) => {
      const techs = state.techniquesRow || [];
      const summary = techs.length
        ? techs.map((t) => `<li><b>${escapeHtmlLite(t.name)}</b> — ${techDescr(t.tech)}</li>`).join('')
        : '<li class="muted">(empty for now — wait for a threat)</li>';
      return help({
        after: `<div class="t-narration"><div class="muted small">Available now:</div><ul class="tutorial-list">${summary}</ul></div>`,
        what: `The Techniques Row is the threats the World has played, kept for you to <em>steal</em>. Click any card to claim it — claim uses your <em>act</em> action this turn.`,
        where: `Below the player cards. Hover any card for details.`,
        why: `Threats damage you, but you can turn them into your own one-shot powers: stat bonuses to use later, heal, or doom rollback. They're crucial for Final Act prep.`,
      });
    },
    target: '.tech-panel',
    advanceOn: 'next',
  },
  {
    id: 'r3-claim',
    title: 'Claim a technique',
    body: () => help({
      what: `Click <b>any</b> technique card to claim it. It joins your inventory (you'll see "Techs held: ..." on your card) until you spend it.`,
      where: `In the Techniques Row below. Claimable cards have a gold border.`,
      why: `<b>Stockpile bonuses now</b> so the Final Act resolution rolls go your way. A held +3 STR bonus from a claimed Pyre Strike can be the difference between a fumble and a crit.`,
    }),
    target: '.tech-panel',
    advanceOn: (action) => action.type === 'claim_technique',
    description: 'Click any technique card to claim it',
  },
  {
    id: 'r3-end-turn',
    title: 'End round 3',
    body: (state) => help({
      after: `<div class="t-info">Doom clock is at <b>${state.doomClock} / ${state.config.doomMax}</b> — ${state.config.doomMax - state.doomClock} ticks until Final Act.</div>`,
      what: `End your turn one more time. You've now seen every phase of a round: World → Players (you + AI) → End.`,
      why: `Each remaining round you'll need to balance: advance your quest (events, moves), prep for FA (claim techniques), and survive (rest, heal).`,
    }),
    target: '.player-card.active .player-actions button:last-of-type',
    advanceOn: (action) => action.type === 'end_turn',
    description: 'Click ➜ End turn',
  },

  // ---------- WRAP-UP ----------
  {
    id: 'final-act-preview',
    title: 'What\'s coming: the Final Act',
    body: () => help({
      what: `When Doom hits max, one region lights up red — that's the <b>Final Act tile</b>. A banner appears at the top showing 3 colored progress bars (Lawful blue, Neutral green, Chaotic rose).`,
      where: `Move to the red tile, then click <b>★ Try [Alignment] resolution</b> on your card. Each attempt rolls 2d6 + best of two stats per alignment vs DC 9.`,
      why: `<b>3 successful checks of one alignment = party wins.</b> If you win on <em>YOUR</em> alignment AND completed your quest, you score big personally. If the party wins on someone else's alignment, you might lose individually even though the party won.`,
    }),
    target: '.doom-row',
    advanceOn: 'next',
  },
  {
    id: 'ready',
    title: 'You\'re ready — finish your way',
    body: () => help({
      what: `You've played 3 full rounds and learned every system: events, movement, end-turn, AI partners, techniques, quest stages, and the Final Act.`,
      who: `The rest of the game is yours alone. Watch HP, claim techniques aggressively, and try to reach the Final Act tile when it appears.`,
      why: `<b>Pro tip:</b> the Save slots in the sidebar let you snapshot a tense moment before risky choices, so you can try multiple strategies on the same map.`,
    }),
    target: null,
    advanceOn: 'next',
  },
];

function techDescr(tech) {
  if (!tech) return '';
  switch (tech.type) {
    case 'bonus': return `+${tech.value} to ${tech.stat} checks`;
    case 'heal': return `heal ${tech.value} HP`;
    case 'doomBack': return `doom -${tech.value}`;
    case 'reroll': return `reroll one check`;
    default: return tech.type;
  }
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
    if (typeof step.body === 'function') return step.body(state);
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
