# Partyquest — v1 Playtest Tool

Static-site playtest tool for the GDD in `docs/game-design.md` (a co-op high-fantasy adventure with hidden personal agendas).

## What's in the box

- **Game engine** — pure-function state machine driven by a seeded RNG (mulberry32). Any seed replays exactly.
- **Manual playthrough** — full state visible (map, players, quests, threats, log). Step one action, one turn, one round, or play to the end.
- **AI policies** — `random`, `greedy` (max personal quest), `altruistic` (max party progress), `mixed` (alternating).
- **Monte Carlo batch** — run 1000 games in a few seconds; outputs party win rate, alignment splits, class breakdown, doom-pacing.
- **Variance check** — 5 batches with different seeds, mean ± stdev so you can tell signal from noise.

## Running it

It's static — anything that serves files works. Locally:

```
python -m http.server 8000
# then open http://localhost:8000/
```

Or `npx serve .` if you have Node.

## Layout

```
index.html
styles.css
src/
  main.js
  engine/
    rng.js         seeded RNG + sub-stream mixer
    data.js        races, classes, alignments, quests, events, threats, tiles
    state.js       setup + state factory
    resolution.js  2d6 + stat checks, effect application
    actions.js     legal-action enumeration + execution
    game.js        round/phase orchestrator
  ai/
    policies.js    random / greedy / altruistic / mixed
  sim/
    batch.js       Monte Carlo runner + variance check
  ui/
    render.js      DOM rendering of full game state
    controls.js    sidebar controls (setup, step, sim)
```

## Design decisions baked into v1

- **Dice**: 2d6 + stat. Crit = double-6, fumble = snake-eyes.
- **Stats**: STR, DEX, INT, CHA (4). +2 primary / +1 secondary / +0 the rest, by class.
- **HP**: simple integer track, class-dependent max (6 wizard → 10 fighter/paladin).
- **Doom clock max**: 10. Triggers Final Act, 3-round window to converge and resolve.
- **Quest stages**: stage 1 = any event success; stage 2 = travel to your class's terrain; stage 3 = commit (Lawful helps party, Neutral neutral, Chaotic hurts).
- **Initiative**: fixed clockwise (P0 → P1 → P2 …).
- **Final-act resolution**: each alignment needs 3 successful checks (STR / INT / CHA). First to 3 wins.

These are the v1 calls from the GDD's "open questions" — all isolated in `src/engine/data.js` or `state.js` constants so a future variant can flip them.

## Acceptance criteria status

- ✅ Full game playable manually start-to-finish in the UI.
- ✅ 1000-game batch completes in well under 60 seconds in modern browsers.
- ✅ 5-batch variance reported (mean ± stdev) so designers can read signal vs. noise.

## What the sim found

First sweep flagged the Final Act as the design's load-bearing weak spot. At
the v1 numbers (DC 10, need 3 successes per alignment, 3-round window), greedy/3p
games won **17.8%** of the time, with **83% of losses being timeouts** (not
party deaths). Alignment splits were lopsided (Neutral 8%, Lawful 6%, Chaotic
4%) because too many classes have INT as primary and the Neutral final check
rolls INT.

Sensitivity sweep across 1000 games × 6 variants (shared seed range):

| Variant | Win % | Δ | Notes |
|---|---:|---:|---|
| Baseline (v1 numbers) | 17.8% | — | Neutral over-wins |
| Final DC 10 → 9 | 38.9% | +21.1 | Helps, doesn't flatten alignment |
| Final DC 10 → 8 | 62.1% | +44.3 | Flattens alignment, too easy |
| **Threshold 3 → 2** | **50.9%** | **+33.1** | Flattens alignment, target zone |
| Doom max 10 → 12 | 16.3% | −1.5 | Doesn't help — journey isn't the bottleneck |
| DC 9 + Threshold 2 | 76.1% | +58.3 | Too easy combined |

**Counterintuitive find:** slowing the doom clock (10 → 12) actually *lowers*
win rate slightly. More rounds = more threat damage; the bottleneck is the
Final Act math, not getting there.

Follow-up sweeps validated **threshold=2** holds up across player counts (2p
36%, 3p 51%, 4p 64%) and across AI policies — and importantly, the policy
sweep shows the game's core design tension is intact:

| Policy | Win % | Personal s3 quest done |
|---|---:|---:|
| altruistic | 66% | 0% |
| mixed | 55% | 39% |
| greedy | 51% | 59% |
| random | 16% | 14% |

The pure altruist wins more party games but never completes their hidden
quest — meaning *cooperation maximizes party victory and selfishness
maximizes individual score*, exactly the betrayal-pressure dynamic the GDD
described.

**v1.1 ships with `finalActSuccessThreshold: 2`** ([state.js](src/engine/state.js)).

### v1.2 — class rebalance + dual-stat alignment coverage

The v1.1 fix worked at the alignment level but left a **12.5pp class spread**: DEX-primary classes (rogue, ranger) sat at the bottom because the alignment Final Act checks (Lawful=STR, Neutral=INT, Chaotic=CHA) never touched DEX. Two coordinated changes addressed it:

1. **Cleric: INT primary → CHA primary** ([data.js](src/engine/data.js)) — restores 2-2-2-2 stat distribution across the 8 classes.
2. **Each alignment now accepts two stats**, player rolls the better ([actions.js](src/engine/actions.js)):
   - **Lawful** (bind/capture): STR or DEX
   - **Neutral** (destroy): INT or STR
   - **Chaotic** (claim power): CHA or INT

That made the game too easy (65.8% win rate, 2-stat gives every class an alignment match), so DC was nudged to **9** and threshold restored to GDD canon **3 successes / 3 rounds**.

**v1.2 result, 5-batch variance:**

| Metric | Value |
|---|---|
| Party win rate | **53.5% ± 1.2%** |
| Alignment win split | L 17.5 · N 17.4 · C 17.4 (within 0.1pp) |
| Class win spread | 10.9pp (paladin 41% → rogue 30%) |
| 2-player scaling | 32.5% |
| 4-player scaling | 72.0% |
| Greedy vs altruistic | 52% vs 83% (cooperation pays) |
| Greedy s3 quest % | 58% (betrayal pressure intact) |
| Altruistic s3 quest % | 0% (altruists sacrifice individual score) |

The 10.9pp class spread that remains looks like an **AI-quality issue**, not a class-balance issue: top classes (paladin, fighter, druid, wizard) have self-focused abilities the greedy policy uses well; bottom classes (cleric, bard, rogue, ranger) have other-focused or conditional abilities that need smarter play to leverage. That's [next iteration](#next-iterations-in-priority-order) #2.

### v1.3 — two new AI policies that test design hypotheses

**`tactical`** — class-ability-aware. Each class's signature ability fires only at its high-leverage moment (Cleric heals when an ally drops below half HP; Paladin calms when standing on an alerted tile; Bard inspires when a teammate is at the Final Act location; Wizard pre-buffs INT before a Neutral check). Pre-Final-Act, the policy hoards Threat-row techniques and spends them on stat bonuses just before Final Act checks.

**`opportunist`** — runs altruistic while doom < 7 (help the party survive to the Final Act), pivots to greedy once doom hits 7 or Final Act triggers (commit personal quest). Models the realistic human pivot from cooperation to self-interest under pressure.

Six-policy comparison, 2000 games × 3p × shared seeds:

| Policy | Win % | s3 quest | Class spread | Alignment (L · N · C) |
|---|---:|---:|---:|---|
| random | 9.4% | 13% | 1.1pp | 3.7 · 3.1 · 2.5 |
| greedy | 52.3% | 58% | 10.8pp | 17.5 · 17.4 · 17.4 |
| altruistic | **83.0%** | 0% | 11.5pp | **83.0 · 0 · 0** ⚠ |
| mixed | 66.5% | 39% | 9.4pp | 29.8 · 19.1 · 17.5 |
| **tactical** | **58.7%** | 26% | **8.4pp** | 18.1 · 21.1 · 19.4 |
| **opportunist** | 57.0% | 45% | **7.9pp** | 18.5 · 19.1 · 19.5 |

Findings:

- **The class-spread hypothesis held.** `tactical` cut class spread from 10.8pp → 8.4pp purely by using abilities better. The remaining 8.4pp is what real class balance looks like; that's the floor for further class-design work.
- **`opportunist` has the cleanest profile.** Highest non-greedy s3 quest completion (45%, so individual goals stay alive), tightest class spread (7.9pp), balanced alignment. It's what a thoughtful human player probably plays like.
- **`altruistic` exposed a sim degeneracy:** with all players following the same "rush leading alignment" rule and ties broken by insertion order, every game converges to Lawful. The 83% party win is real, but the L · N · C split (83/0/0) is meaningless. Worth fixing in the policy (tiebreak by player's own alignment) before reading further into altruistic numbers.
- **`tactical` dropped s3 from 58% → 26%.** Using class abilities consumes the player's action; less time committing the betrayal stage. Suggests a real-game design lever: abilities that don't consume the action slot would change the tactical/personal balance.

### v1.4 — playable UI + three follow-up mechanic changes

**Mechanic changes:**

1. **Altruistic tiebreak fixed.** When Final Act progress is tied (every game starts this way), altruistic policy now falls back to the player's own alignment rather than insertion-order default. Alignment split under altruistic is now **L 28.1 · N 28.7 · C 28.1** — perfectly flat — instead of 83/0/0.

2. **`abilitiesFree` config dial** ([state.js](src/engine/state.js)). When on, class abilities fire automatically at the top of the owner's turn (when their trigger condition is met) and don't consume the act slot. Sim findings: solves tactical's s3 problem (26% → 55%) but doesn't close class spread (top classes get the boost too). Exposed as a toggle in the new settings panel; default off.

3. **Bottom-class ability rebalance** ([actions.js](src/engine/actions.js)):
   - **Cleric** heal: now `self +2 HP + nearest hurt ally +1 HP` (was: one ally +2). Self-leverageable so greedy uses it.
   - **Bard** inspire: now `self +1 next check + ally +1 next check` (was: ally only). Self-leverageable.
   - **Rogue / Fighter** reroll: now stat-agnostic — primes a reroll for any next failed check.
   - **Ranger** wilderness: now `+1 next check always, +2 in forest/mountain` (was: terrain-only).
   - **Wizard** arcana: now explicitly `+2 next INT check` (was: generic +1).

   Bottom-class wins under greedy with `abilitiesFree=true`: cleric 32.6→35, ranger 31.2→32.2, bard 29.9→32.1, rogue 29.8→31.2. Top classes lift the same amount; remaining ~10pp spread is structural (quest-terrain match), not AI-tunable.

**UI rework for playability** — the tool is no longer just a sim viewer; you can actually play a full game by clicking:

- **Clickable map tiles** — adjacent tiles to active player highlight with a sage-green border and lift on hover; click to move.
- **Per-player action buttons** on the active player's card replace the awkward dropdown: ⚔ Event, ☾ Rest, ✦ Class ability, ⚝ Spend Favor, ↬ Use technique, ★ Try alignment resolution, ➜ End turn. Colored by intent (gold = high-leverage, soft = neutral, subtle = end-turn).
- **Final Act overlay** appears at the top of the main pane during Final Act phase with three colored progress bars (one per alignment) and a "X rounds remaining" indicator.
- **Game-over panel** at the top of the layout shows party win / loss, the resolving alignment, and a per-player scoreboard sorted by individual score with the winner highlighted. Includes a "New Game (same seed +1)" button so you can A/B variants on the same map.
- **HP bars** with damage→safe gradient on each player card. Pending-bonus and reroll-ready badges show when techniques or abilities have buffed the next check.
- **Settings panel** (collapsible) lets you sweep `doomMax`, `finalActDC`, `finalActSuccessThreshold`, `finalActWindow`, and `abilitiesFree` without code edits. "Apply & start new game" / "Reset to v1.2 defaults" buttons.
- **Threat-row tech cards** now have click-to-claim affordance with a gold border when claimable.

## Next iterations (in priority order)

## Next iterations (in priority order)

1. **Smarter greedy policy** — current heuristic-tree leaves plays on the table. Altruistic at 83% party win shows there's strategic headroom; a utility-maximizing greedy might close half the gap on its own and would also surface whether the 10.9pp class spread is a class-balance issue or an AI-quality issue.
2. **Per-class ability audit** — bottom-tier classes (cleric, bard, rogue, ranger) all have *other-focused* or *conditional* abilities. Either rewrite those abilities to be more self-leverageable, or improve the AI to use them well.
3. **4-player tightening** — 4p win rate hits 72%, which may be too forgiving. Consider scaling `finalActSuccessThreshold` with player count (3p=3, 4p=4).
4. Heat map of where parties tend to die.
5. Replay viewer — step through any seed's exact action log.
6. Manual quest-pick step (currently the engine just keeps the first of the 2 drawn).
7. Richer threat effects (currently most are HP/alert; could add lock-tile, escalate, etc.).
