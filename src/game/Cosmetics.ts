/**
 * Optional extras earned from side objectives: a costume and a hat for Hamish, and a bolt-on for
 * whatever he's riding. None of them change how anything drives.
 */
export type Slot = 'costume' | 'hat' | 'vehicle';

/** Running totals the side objectives count against (kept in the career save). */
export interface Tally {
  wizard: number;
  hearts: number;
  hibs: number;
  marcher: number;
  /** Runs in which every polis car on the course was hit. */
  cleanSweeps: number;
}

/** What one run adds to the tally. */
export interface RunTally {
  downs: Partial<Record<'wizard' | 'hearts' | 'hibs' | 'marcher', number>>;
  /** Polis cars hit, and how many were on the course. */
  police: [number, number];
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
];

export const freshTally = (): Tally => ({ wizard: 0, hearts: 0, hibs: 0, marcher: 0, cleanSweeps: 0 });

/** What's currently equipped; the career keeps this in step with the save. */
export const LOOK: Partial<Record<Slot, string>> = {};
