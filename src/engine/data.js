// Static content: races, classes, alignments, quests, events, threats, tile pool.
// All design data lives here so balance tuning is one-file editing.

export const STATS = ['STR', 'DEX', 'INT', 'CHA'];
export const ALIGNMENTS = ['Lawful', 'Neutral', 'Chaotic'];

export const TERRAINS = ['forest', 'mountain', 'plain', 'cavern', 'swamp', 'ruins'];

export const RACES = [
  { id: 'human', name: 'Human', bonusStat: 'CHA', bonusTerrain: 'plain', flavor: '+1 CHA in plains' },
  { id: 'elf', name: 'Elf', bonusStat: 'DEX', bonusTerrain: 'forest', flavor: '+1 DEX in forests' },
  { id: 'dwarf', name: 'Dwarf', bonusStat: 'STR', bonusTerrain: 'mountain', flavor: '+1 STR in mountains' },
  { id: 'halfling', name: 'Halfling', bonusStat: 'DEX', bonusTerrain: 'capital', flavor: '+1 DEX in towns' },
  { id: 'halforc', name: 'Half-Orc', bonusStat: 'STR', bonusTerrain: 'ruins', flavor: '+1 STR in ruins' },
  { id: 'tiefling', name: 'Tiefling', bonusStat: 'CHA', bonusTerrain: 'cavern', flavor: '+1 CHA in caverns' },
];

// Each class: primary +2, secondary +1, others +0. Signature ability is a once-per-round modifier.
export const CLASSES = [
  { id: 'fighter', name: 'Fighter', primary: 'STR', secondary: 'DEX', hp: 10, ability: 'rerollStr' },
  { id: 'rogue', name: 'Rogue', primary: 'DEX', secondary: 'INT', hp: 7, ability: 'rerollDex' },
  { id: 'wizard', name: 'Wizard', primary: 'INT', secondary: 'CHA', hp: 6, ability: 'bonusInt' },
  { id: 'cleric', name: 'Cleric', primary: 'CHA', secondary: 'INT', hp: 8, ability: 'heal' },
  { id: 'ranger', name: 'Ranger', primary: 'DEX', secondary: 'STR', hp: 9, ability: 'wildernessBonus' },
  { id: 'bard', name: 'Bard', primary: 'CHA', secondary: 'DEX', hp: 7, ability: 'inspire' },
  { id: 'paladin', name: 'Paladin', primary: 'STR', secondary: 'CHA', hp: 10, ability: 'calm' },
  { id: 'druid', name: 'Druid', primary: 'INT', secondary: 'DEX', hp: 8, ability: 'rejuvenate' },
];

export function statBlock(klass) {
  const s = { STR: 0, DEX: 0, INT: 0, CHA: 0 };
  s[klass.primary] = 2;
  s[klass.secondary] = 1;
  return s;
}

// Events. Each lists 2-3 approaches. Engine picks best-available for AI.
// `terrain: null` means it can spawn anywhere.
export const EVENTS = [
  {
    id: 'goblin-ambush', name: 'Goblin Ambush', terrain: null,
    approaches: [
      { stat: 'STR', dc: 8, onSuccess: { type: 'none' }, onFail: { hp: -2, alert: 1 } },
      { stat: 'DEX', dc: 9, onSuccess: { type: 'none' }, onFail: { hp: -1, alert: 1 } },
      { stat: 'CHA', dc: 7, onSuccess: { type: 'none' }, onFail: { hp: -1 } },
    ],
  },
  {
    id: 'hidden-shrine', name: 'Hidden Shrine', terrain: 'forest',
    approaches: [
      { stat: 'INT', dc: 9, onSuccess: { hp: 2 }, onFail: { hp: -1 } },
      { stat: 'CHA', dc: 8, onSuccess: { hp: 1 }, onFail: {} },
    ],
  },
  {
    id: 'cave-in', name: 'Cave-In', terrain: 'mountain',
    approaches: [
      { stat: 'STR', dc: 10, onSuccess: {}, onFail: { hp: -2 } },
      { stat: 'DEX', dc: 9, onSuccess: {}, onFail: { hp: -1, alert: 1 } },
    ],
  },
  {
    id: 'merchant-caravan', name: 'Merchant Caravan', terrain: null,
    approaches: [
      { stat: 'CHA', dc: 7, onSuccess: { favors: 1 }, onFail: {} },
      { stat: 'INT', dc: 9, onSuccess: { favors: 1 }, onFail: {} },
    ],
  },
  {
    id: 'wandering-spirit', name: 'Wandering Spirit', terrain: 'ruins',
    approaches: [
      { stat: 'INT', dc: 8, onSuccess: { hp: 1 }, onFail: { hp: -1 } },
      { stat: 'CHA', dc: 9, onSuccess: { favors: 1 }, onFail: { hp: -2 } },
    ],
  },
  {
    id: 'swamp-vipers', name: 'Swamp Vipers', terrain: 'swamp',
    approaches: [
      { stat: 'DEX', dc: 9, onSuccess: {}, onFail: { hp: -2 } },
      { stat: 'STR', dc: 10, onSuccess: {}, onFail: { hp: -1 } },
    ],
  },
  {
    id: 'cursed-altar', name: 'Cursed Altar', terrain: 'cavern',
    approaches: [
      { stat: 'INT', dc: 11, onSuccess: { favors: 1 }, onFail: { hp: -2, alert: 1 } },
      { stat: 'CHA', dc: 10, onSuccess: { hp: 1 }, onFail: { hp: -1 } },
    ],
  },
  {
    id: 'lost-traveler', name: 'Lost Traveler', terrain: null,
    approaches: [
      { stat: 'CHA', dc: 6, onSuccess: { favors: 1 }, onFail: {} },
      { stat: 'INT', dc: 8, onSuccess: { hp: 1 }, onFail: {} },
    ],
  },
  {
    id: 'wolf-pack', name: 'Wolf Pack', terrain: 'forest',
    approaches: [
      { stat: 'STR', dc: 9, onSuccess: {}, onFail: { hp: -2 } },
      { stat: 'DEX', dc: 8, onSuccess: {}, onFail: { hp: -1 } },
    ],
  },
  {
    id: 'rune-puzzle', name: 'Rune Puzzle', terrain: 'ruins',
    approaches: [
      { stat: 'INT', dc: 10, onSuccess: { favors: 1, hp: 1 }, onFail: { hp: -1 } },
    ],
  },
  {
    id: 'bandit-toll', name: 'Bandit Toll', terrain: 'plain',
    approaches: [
      { stat: 'STR', dc: 9, onSuccess: {}, onFail: { hp: -2 } },
      { stat: 'CHA', dc: 8, onSuccess: {}, onFail: { hp: -1, favors: -1 } },
      { stat: 'DEX', dc: 10, onSuccess: {}, onFail: { hp: -1 } },
    ],
  },
  {
    id: 'storm-front', name: 'Storm Front', terrain: 'mountain',
    approaches: [
      { stat: 'STR', dc: 8, onSuccess: {}, onFail: { hp: -1 } },
      { stat: 'INT', dc: 7, onSuccess: {}, onFail: { hp: -1 } },
    ],
  },
  {
    id: 'silent-watcher', name: 'Silent Watcher', terrain: 'cavern',
    approaches: [
      { stat: 'DEX', dc: 10, onSuccess: { favors: 1 }, onFail: { hp: -2, alert: 1 } },
      { stat: 'INT', dc: 11, onSuccess: { hp: 1, favors: 1 }, onFail: { hp: -1 } },
    ],
  },
  {
    id: 'oracle-vision', name: 'Oracle Vision', terrain: null,
    approaches: [
      { stat: 'INT', dc: 9, onSuccess: { peekDoom: true, hp: 1 }, onFail: {} },
      { stat: 'CHA', dc: 8, onSuccess: { peekDoom: true }, onFail: {} },
    ],
  },
  {
    id: 'fey-bargain', name: 'Fey Bargain', terrain: 'forest',
    approaches: [
      { stat: 'CHA', dc: 11, onSuccess: { favors: 2 }, onFail: { hp: -2 } },
      { stat: 'INT', dc: 10, onSuccess: { favors: 1 }, onFail: { hp: -1 } },
    ],
  },
];

// Threats. Each advances doom, has immediate effect, and joins the techniques row.
// `tech` = the one-shot power if claimed by a player.
export const THREATS = [
  { id: 't-wraith', name: 'Wraith Howl', doom: 1, immediate: { partyHp: -1 }, tech: { type: 'bonus', stat: 'INT', value: 2 } },
  { id: 't-shadow', name: 'Shadow Step', doom: 1, immediate: { alertEach: 1 }, tech: { type: 'bonus', stat: 'DEX', value: 2 } },
  { id: 't-roar', name: 'Beast Roar', doom: 1, immediate: { partyHp: -1, alertEach: 1 }, tech: { type: 'bonus', stat: 'STR', value: 2 } },
  { id: 't-charm', name: 'Charm Whisper', doom: 1, immediate: { drainFavors: 1 }, tech: { type: 'bonus', stat: 'CHA', value: 2 } },
  { id: 't-quake', name: 'Doom Quake', doom: 2, immediate: { partyHp: -1 }, tech: { type: 'heal', value: 2 } },
  { id: 't-blight', name: 'Creeping Blight', doom: 1, immediate: { partyHp: -1 }, tech: { type: 'heal', value: 3 } },
  { id: 't-curse', name: 'Foul Curse', doom: 2, immediate: { alertEach: 1, partyHp: -1 }, tech: { type: 'doomBack', value: 1 } },
  { id: 't-mist', name: 'Veil of Mist', doom: 1, immediate: {}, tech: { type: 'reroll' } },
  { id: 't-eyes', name: 'Eyes in the Dark', doom: 1, immediate: { alertEach: 1 }, tech: { type: 'bonus', stat: 'DEX', value: 3 } },
  { id: 't-pyre', name: 'Pyre Strike', doom: 2, immediate: { partyHp: -2 }, tech: { type: 'bonus', stat: 'STR', value: 3 } },
  { id: 't-siren', name: 'Siren Call', doom: 1, immediate: { drainFavors: 1 }, tech: { type: 'bonus', stat: 'CHA', value: 3 } },
  { id: 't-rift', name: 'Rift Tear', doom: 2, immediate: { partyHp: -1, alertEach: 1 }, tech: { type: 'bonus', stat: 'INT', value: 3 } },
];

// Generate 24 quests: 8 classes × 3 alignments. Templated for clarity.
const QUEST_TEMPLATES = {
  Lawful: {
    headline: (klass) => `${klass.name}'s Oath`,
    twist: 'Honor preserved.',
    s3PartyImpact: 'help',
    s3Description: 'Uphold the oath; aid the party.',
  },
  Neutral: {
    headline: (klass) => `${klass.name}'s Pursuit`,
    twist: 'A private bargain kept.',
    s3PartyImpact: 'neutral',
    s3Description: 'Pursue your own end; party uninvolved.',
  },
  Chaotic: {
    headline: (klass) => `${klass.name}'s Ambition`,
    twist: 'Power claimed at a cost.',
    s3PartyImpact: 'harm',
    s3Description: 'Take what you came for; the party pays.',
  },
};

// Each class is biased toward a stage-2 terrain so quests have meaningful spatial conflict.
const CLASS_TERRAIN = {
  fighter: 'plain',
  rogue: 'cavern',
  wizard: 'ruins',
  cleric: 'mountain',
  ranger: 'forest',
  bard: 'plain',
  paladin: 'mountain',
  druid: 'swamp',
};

export const QUESTS = CLASSES.flatMap((klass) =>
  ALIGNMENTS.map((alignment) => {
    const tmpl = QUEST_TEMPLATES[alignment];
    const terrain = CLASS_TERRAIN[klass.id];
    return {
      id: `q-${klass.id}-${alignment.toLowerCase()}`,
      class: klass.id,
      alignment,
      headline: tmpl.headline(klass),
      twist: tmpl.twist,
      locationRequirements: [terrain],
      stages: [
        { id: 's1', type: 'event_success', description: 'Resolve any event successfully.' },
        { id: 's2', type: 'travel_to', terrain, description: `Travel to a ${terrain} region.` },
        { id: 's3', type: 'final', description: tmpl.s3Description, partyImpact: tmpl.s3PartyImpact },
      ],
    };
  })
);

// Tile pool — 8 region archetypes drawn from at setup time.
export const TILE_POOL = [
  { id: 'tile-grove', name: 'Whispering Grove', terrain: 'forest' },
  { id: 'tile-peaks', name: 'Iron Peaks', terrain: 'mountain' },
  { id: 'tile-fields', name: 'Sunwheat Fields', terrain: 'plain' },
  { id: 'tile-deep', name: 'The Deepwood', terrain: 'forest' },
  { id: 'tile-caverns', name: 'Echoing Caverns', terrain: 'cavern' },
  { id: 'tile-mire', name: 'Black Mire', terrain: 'swamp' },
  { id: 'tile-ruins', name: 'Sunken Ruins', terrain: 'ruins' },
  { id: 'tile-crags', name: 'Wind Crags', terrain: 'mountain' },
];
