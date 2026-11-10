import type { VehicleId } from '../vehicle/Vehicles';

/**
 * Persistent progress, kept in localStorage: the career points bank, best scores, which stretch of
 * the course is open, and which vehicles are in the garage.
 */
export interface CareerData {
  bank: number;
  runs: number;
  best: Record<string, number>;
  goals: string[];
  vehicles: VehicleId[];
  vehicle: VehicleId;
  splashes: number;
}

export interface RunSummary {
  score: number;
  tier: number;
  finished: boolean;
  splash: boolean;
}

export interface Goal {
  id: string;
  title: string;
  /** What it unlocks, in words. */
  reward: string;
  tier?: number;
  vehicle?: VehicleId;
  /** Current progress and target (for the progress bar). */
  progress(d: CareerData, run?: RunSummary): [number, number];
  done(d: CareerData, run?: RunSummary): boolean;
}

export const STAGES = [
  { tier: 1, name: 'The Royal Mile', finish: 'Holyrood Palace' },
  { tier: 2, name: 'The Grassmarket Diversion', finish: 'the Grassmarket' },
  { tier: 3, name: 'Up to Princes Street', finish: 'the East End of Princes Street' },
  { tier: 4, name: 'Leith Walk & the Shore', finish: 'the Firth of Forth' },
];

const best = (d: CareerData) => Math.max(0, ...Object.values(d.best));

export const GOALS: Goal[] = [
  {
    id: 'grassmarket',
    title: 'Score 5,000 in one run',
    reward: 'The Grassmarket Diversion + the Leaf-Blower Trolley',
    tier: 2,
    vehicle: 'blower',
    progress: (d, r) => [Math.max(best(d), r?.score ?? 0), 5000],
    done: (d, r) => Math.max(best(d), r?.score ?? 0) >= 5000,
  },
  {
    id: 'princes',
    title: 'Bank 25,000 career points',
    reward: "Up to Princes Street + Granny McLeod's Mobility Scooter",
    tier: 3,
    vehicle: 'scooter',
    progress: (d) => [d.bank, 25000],
    done: (d) => d.bank >= 25000,
  },
  {
    id: 'leith',
    title: 'Reach the East End of Princes Street',
    reward: 'Leith Walk & the Shore + the Golf Buggy',
    tier: 4,
    vehicle: 'buggy',
    progress: (_d, r) => [r && r.tier >= 3 && r.finished ? 1 : 0, 1],
    done: (_d, r) => !!(r && r.tier >= 3 && r.finished),
  },
  {
    id: 'forth',
    title: 'Drive off Starbank Road into the Forth',
    reward: 'Sir Saltalot, the Council Gritter',
    vehicle: 'gritter',
    progress: (d, r) => [d.splashes + (r?.splash ? 1 : 0) > 0 ? 1 : 0, 1],
    done: (d, r) => d.splashes > 0 || !!r?.splash,
  },
  {
    id: 'bigrun',
    title: 'Score 30,000 in one run',
    reward: 'Bragging rights (and a gold-plated invoice)',
    progress: (d, r) => [Math.max(best(d), r?.score ?? 0), 30000],
    done: (d, r) => Math.max(best(d), r?.score ?? 0) >= 30000,
  },
];

const KEY = 'downhillbam.career.v1';

function fresh(): CareerData {
  return { bank: 0, runs: 0, best: {}, goals: [], vehicles: ['trolley'], vehicle: 'trolley', splashes: 0 };
}

export class Career {
  data: CareerData;

  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...fresh(), ...JSON.parse(raw) };
      else {
        // carry over a best score from before the career existed
        const old = Number(localStorage.getItem('downhillbam.best.royalmile') || 0);
        if (old) this.data.best[1] = old;
      }
    } catch {}
    // the bathtub was retired: anyone who'd earned it gets the gritter
    const old = this.data.vehicles as string[];
    if (old.includes('bathtub')) this.data.vehicles = [...old.filter((v) => v !== 'bathtub'), 'gritter'] as VehicleId[];
    if ((this.data.vehicle as string) === 'bathtub') this.data.vehicle = 'gritter';
    if (!this.data.vehicles.includes(this.data.vehicle)) this.data.vehicle = 'trolley';
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {}
  }

  /** How much of the course is open: 1 = Royal Mile only … 4 = all the way to the sea. */
  get tier() {
    let t = 1;
    for (const g of GOALS) if (g.tier && this.data.goals.includes(g.id)) t = Math.max(t, g.tier);
    return t;
  }

  bestFor(tier: number) {
    return this.data.best[tier] ?? 0;
  }

  /** The next goal still to do (goals are done in order). */
  get next(): Goal | undefined {
    return GOALS.find((g) => !this.data.goals.includes(g.id));
  }

  setVehicle(v: VehicleId) {
    if (!this.data.vehicles.includes(v)) return;
    this.data.vehicle = v;
    this.save();
  }

  /** Bank a finished run. Returns the goals completed by it. */
  record(run: RunSummary) {
    const d = this.data;
    d.runs++;
    d.bank += run.score;
    const prevBest = d.best[run.tier] ?? 0;
    const record = run.score > prevBest;
    if (record) d.best[run.tier] = run.score;
    if (run.splash) d.splashes++;
    const newly: Goal[] = [];
    // goals unlock in order; one run can tick off several
    for (const g of GOALS) {
      if (d.goals.includes(g.id)) continue;
      if (!g.done(d, run)) break;
      d.goals.push(g.id);
      if (g.vehicle && !d.vehicles.includes(g.vehicle)) d.vehicles.push(g.vehicle);
      newly.push(g);
    }
    this.save();
    return { newly, record, prevBest };
  }

  reset() {
    this.data = fresh();
    this.save();
  }
}
