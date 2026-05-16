// Skill check resolution: 2d6 + stat bonus + class/race/technique modifiers vs DC.
// Critical = nat 12 (double-6). Fumble = nat 2 (snake eyes).

export function statBonus(player, stat, terrain = null) {
  let bonus = player.stats[stat] || 0;
  if (player.race?.bonusStat === stat && terrain && player.race.bonusTerrain === terrain) {
    bonus += 1;
  }
  return bonus;
}

export function rollCheck(state, player, stat, dc, opts = {}) {
  const terrain = opts.terrain ?? null;
  const extraBonus = opts.extraBonus ?? 0;

  const d1 = state.rng.d6();
  const d2 = state.rng.d6();
  const raw = d1 + d2;
  const bonus = statBonus(player, stat, terrain) + extraBonus;
  const total = raw + bonus;

  let outcome;
  if (raw === 12) outcome = 'critical';
  else if (raw === 2) outcome = 'fumble';
  else if (total >= dc) outcome = 'success';
  else outcome = 'failure';

  return { d1, d2, raw, bonus, total, dc, outcome, stat };
}

// Pick the best approach for an AI: highest expected margin (bonus - dc).
export function pickBestApproach(player, event, terrain) {
  let best = null;
  let bestScore = -Infinity;
  for (const a of event.approaches) {
    const b = statBonus(player, a.stat, terrain);
    const score = b - a.dc;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

export function applyEffect(state, player, effect) {
  if (!effect) return;
  if (effect.hp != null) {
    player.hp = Math.max(0, Math.min(player.maxHp, player.hp + effect.hp));
    if (player.hp === 0) player.incapacitated = true;
  }
  if (effect.partyHp != null) {
    state.players.forEach((p) => {
      if (!p.incapacitated) {
        p.hp = Math.max(0, Math.min(p.maxHp, p.hp + effect.partyHp));
        if (p.hp === 0) p.incapacitated = true;
      }
    });
  }
  if (effect.alert != null) {
    const loc = state.map.allLocations.find((l) => l.id === player.location);
    if (loc) loc.alert = Math.max(0, loc.alert + effect.alert);
  }
  if (effect.alertEach != null) {
    state.map.regions.forEach((r) => { r.alert = Math.max(0, r.alert + effect.alertEach); });
  }
  if (effect.favors != null) {
    player.favors = Math.max(0, player.favors + effect.favors);
  }
  if (effect.drainFavors != null) {
    state.players.forEach((p) => { p.favors = Math.max(0, p.favors - effect.drainFavors); });
  }
  if (effect.doom != null) {
    state.doomClock = Math.max(0, state.doomClock + effect.doom);
  }
}
