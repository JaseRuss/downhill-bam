/**
 * Optional extras earned from side objectives: a costume and a hat for Hamish, and a bolt-on for
 * whatever he's riding. None of them change how anything drives.
 */
export type Slot = 'costume' | 'hat' | 'face' | 'vehicle';

/** Running totals the side objectives count against (kept in the career save). */
export interface Tally {
  wizard: number;
  hearts: number;
  hibs: number;
  marcher: number;
  /** Runs in which every polis car on the course was hit. */
  cleanSweeps: number;
  piper: number;
  mime: number;
  ghost: number;
  influencer: number;
  /** Runs that reached the finish without breaking anything or hitting anyone. */
  clean: number;
  ejects: number;
  splashes: number;
  /** Flocks of pigeons or gulls sent up. */
  flocks: number;
}

/** The people who count towards something when knocked over. */
export const CROWD_KEYS = ['wizard', 'hearts', 'hibs', 'marcher', 'piper', 'mime', 'ghost', 'influencer'] as const;

/** What one run adds to the tally. */
export interface RunTally {
  downs: Partial<Record<(typeof CROWD_KEYS)[number], number>>;
  /** Polis cars hit, and how many were on the course. */
  police: [number, number];
  clean: boolean;
  ejects: number;
  splash: boolean;
  flocks: number;
}

export interface Cosmetic {
  id: string;
  slot: Slot;
  name: string;
  blurb: string;
  /** The objective, in words. */
  how: string;
  progress(t: Tally): [number, number];
}

export const SLOTS: { slot: Slot; title: string; none: string }[] = [
  { slot: 'costume', title: 'COSTUME', none: 'The usual: a white shirt that has seen things.' },
  { slot: 'hat', title: 'HAT', none: 'The usual: a tartan tam.' },
  { slot: 'face', title: 'FACE', none: 'The usual: a beard and a grin.' },
  { slot: 'vehicle', title: 'VEHICLE', none: 'Nothing bolted on.' },
];

export const COSMETICS: Cosmetic[] = [
  {
    id: 'maroon', slot: 'costume', name: 'Maroon Top', blurb: 'Gorgie colours. Half of Leith Walk will hate it.',
    how: 'Knock over 50 Hearts fans', progress: (t) => [t.hearts, 50],
  },
  {
    id: 'green', slot: 'costume', name: 'Green Top', blurb: 'Leith colours. The other half will hate it.',
    how: 'Knock over 50 Hibs fans', progress: (t) => [t.hibs, 50],
  },
  {
    id: 'marcher', slot: 'costume', name: 'Wee Marcher Get-Up', blurb: 'A blue top and green hair. He walks in a straight line now.',
    how: 'Pop 20 wee marchers', progress: (t) => [t.marcher, 20],
  },
  {
    id: 'wizard', slot: 'hat', name: 'Wizard Hat', blurb: 'Pointy. Adds nothing to his spellcasting.',
    how: 'Knock over 50 wizard fans', progress: (t) => [t.wizard, 50],
  },
  {
    id: 'siren', slot: 'vehicle', name: 'Polis Siren', blurb: 'A flashing blue light. Silent, so strictly speaking legal.',
    how: 'Hit every polis car in a single run', progress: (t) => [Math.min(1, t.cleanSweeps), 1],
  },
  {
    id: 'mime', slot: 'costume', name: 'Mime Get-Up', blurb: 'Stripes, white face, white gloves. He will not be quiet about it.',
    how: 'Knock over 10 mimes', progress: (t) => [t.mime, 10],
  },
  {
    id: 'feather', slot: 'hat', name: 'Feather Bonnet', blurb: 'Off a piper. He no longer needs it.',
    how: 'Knock over 10 pipers', progress: (t) => [t.piper, 10],
  },
  {
    id: 'top', slot: 'hat', name: 'Top Hat', blurb: 'Formerly of a ghost tour. Slightly haunted.',
    how: 'Knock over the ghost tour guide in 10 runs', progress: (t) => [t.ghost, 10],
  },
  {
    id: 'bucket', slot: 'hat', name: 'Bucket Hat', blurb: 'Still damp. Smells of the Forth.',
    how: 'Go into the Forth 5 times', progress: (t) => [t.splashes, 5],
  },
  {
    id: 'helmet', slot: 'hat', name: 'Crash Helmet', blurb: 'Bought after the twenty-fifth time. Does nothing.',
    how: 'Get thrown out 25 times', progress: (t) => [t.ejects, 25],
  },
  {
    id: 'halo', slot: 'hat', name: 'Halo', blurb: 'For the one time he never touched a thing.',
    how: 'Reach the finish with nothing broken and nobody hit', progress: (t) => [Math.min(1, t.clean), 1],
  },
  {
    id: 'shades', slot: 'face', name: 'Shades', blurb: 'Liberated from an influencer. Good side only.',
    how: 'Knock over 30 influencers', progress: (t) => [t.influencer, 30],
  },
  {
    id: 'gull', slot: 'vehicle', name: 'Pet Gull', blurb: 'Rides on the back. Wants your chips.',
    how: 'Scatter 20 flocks of pigeons or gulls', progress: (t) => [t.flocks, 20],
  },
];

export const freshTally = (): Tally => ({
  wizard: 0, hearts: 0, hibs: 0, marcher: 0, cleanSweeps: 0,
  piper: 0, mime: 0, ghost: 0, influencer: 0, clean: 0, ejects: 0, splashes: 0, flocks: 0,
});

/** A tally with one run's numbers added (the original is left alone). */
export function addRun(t: Tally, r: RunTally): Tally {
  const out = { ...t };
  for (const k of CROWD_KEYS) out[k] += r.downs[k] ?? 0;
  const [hit, total] = r.police;
  if (total > 0 && hit >= total) out.cleanSweeps++;
  if (r.clean) out.clean++;
  if (r.splash) out.splashes++;
  out.ejects += r.ejects;
  out.flocks += r.flocks;
  return out;
}

/** What's currently equipped; the career keeps this in step with the save. */
export const LOOK: Partial<Record<Slot, string>> = {};
