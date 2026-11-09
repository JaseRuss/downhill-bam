import * as THREE from 'three';
import { G } from '../ctx';
import type { HUD } from '../ui/HUD';

export interface LogItem {
  label: string;
  count: number;
  points: number;
}

/** Quips for the damage invoice. */
const COSTS: Record<string, [number, string]> = {
  'Whisky Barrel': [1850, 'Whisky barrel (18yr, now 0yr)'],
  'Communal Bin': [420, 'Communal bin, contents redistributed'],
  Bollard: [260, 'Bollard (historic, allegedly)'],
  'Lamp Post': [1900, 'Victorian lamp post'],
  'Tourist Bowled': [0, 'Tourist inconvenienced (apology letter)'],
  'Pigeon Panic': [5, 'Pigeon relocation fee'],
  'A-Board': [45, 'Pavement sign ("HAGGIS SUPPER £14")'],
  'Shop Window': [780, 'Shop window, plate glass'],
  Mannequin: [220, 'Mannequin (kilted, now unkilted)'],
  'Bagpiper Bowled': [600, 'Bagpipes, deflated'],
  'Market Stall': [350, 'Market stall'],
  Haggis: [12, 'Haggis (free range)'],
  'Phone Box': [3400, 'Red telephone box'],
  'Wall Brick': [35, 'Old Town wall brick'],
  Scaffolding: [300, 'Scaffolding (was holding things up)'],
  'Crown Spire': [185000, 'Crown spire, St Giles\' Cathedral, c.1495'],
  'Adam Smith': [210000, 'Statue of Adam Smith (cost passed on to the consumer)'],
  'MARKET CORRECTION!': [0, 'Economic consultancy ("it was always going to fall")'],
  'Mercat Cross': [480000, 'Mercat Cross unicorn, national animal'],
  'Fringe Stage': [900, 'Fringe venue (seated 4, generously)'],
  'Tolbooth Clock': [64000, 'Canongate Tolbooth clock'],
  'Palace Gates': [125000, 'Gates, Palace of Holyroodhouse (Royal)'],
  'Traffic Cone': [8, 'Traffic cone (we found it on a statue)'],
  Bench: [380, 'Memorial bench'],
  'Crowd Barrier': [90, 'Crowd barrier'],
  'Ghost Tour Guide': [0, 'Ghost tour guide (now actually spooked)'],
  'EJECTED!': [0, 'Ambulance (non-emergency, mostly laughing)'],
  'KILT LIFT!': [0, 'Counselling for witnesses'],
  // the long course
  'Diversion Sign': [70, 'Diversion sign (now diverted)'],
  Portaloo: [1200, 'Portaloo, occupied (deep clean + therapy)'],
  Broomstick: [40, 'Broomstick (non-flying, as it turns out)'],
  'BROOM BROOM!': [0, 'Quidditch league complaint'],
  'Picnic Bench': [260, 'Beer garden bench'],
  Pint: [6, 'Pint of heavy, spilt'],
  "ROUND'S ON YOU!": [480, 'Replacement round for the whole beer garden'],
  'Drinker Spilled': [0, 'Drinker relocated (still holding pint)'],
  'Memorial Railing': [150, 'Memorial railing'],
  'Covenanters Memorial': [24000, "Covenanters' Memorial (a very stern letter)"],
  'Parked Car': [3800, 'Parked car (fully comprehensive, hopefully)'],
  'Traffic Warden': [0, 'Traffic warden (has issued you a ticket)'],
  'Hotel Doorman': [0, 'Doorman of the Caledonian (top hat recovered)'],
  'Big Wheel Leg': [900, 'Big wheel support leg'],
  'Big Wheel': [380000, 'Big wheel, Princes Street (now somewhere else)'],
  'Ticket Booth': [600, 'Big wheel ticket booth'],
  'TRAM-BOOZLED!': [16000000, 'Tram (another one, sorry)'],
  Scarf: [25, 'Cashmere scarf (ish)'],
  Fudge: [4, 'Tablet, crumbled'],
  'ENGINE ON!': [0, 'Noise complaint'],
  Digger: [42000, 'Mini digger (tram works)'],
  Skip: [800, 'Skip, unskipped'],
  Rubble: [2, 'Tram-works rubble (it was rubble before)'],
  'Road Works Fence': [55, 'Road works fencing'],
  'Road Works Sign': [90, 'TRAM WORKS sign'],
  Workie: [0, 'Workie (on a break anyway)'],
  'Queen Victoria': [260000, 'Statue of Queen Victoria (Royal, again)'],
  'WE ARE NOT AMUSED!': [0, 'Formal apology to the Palace'],
  'SPLASHDOWN!': [7500, 'Coastguard callout, Firth of Forth'],
  'FINISHED!': [0, 'Finish line repainting'],
  'Hearts Fan': [0, 'Hearts fan (claims it was a dive)'],
  'Hibs Fan': [0, 'Hibs fan (wants it checked by VAR)'],
  'DERBY DAY!': [9500, 'Police overtime, Edinburgh derby'],
  'IRN BREW!': [1, 'One can of IRN BREW (no deposit returned)'],
};

export class Scoring {
  score = 0;
  combo = 0;
  mult = 1;
  lastHit = -10;
  log = new Map<string, LogItem>();
  biggest = { pts: 0, label: '' };

  constructor(private hud: HUD) {}

  award(label: string, base: number, pos: THREE.Vector3, byPlayer = true, kind = '') {
    const now = G.time;
    if (now - this.lastHit < 1.6) this.combo++;
    else this.combo = 1;
    this.lastHit = now;
    this.mult = 1 + Math.min(4, Math.floor((this.combo - 1) / 3) * 0.5);
    const pts = Math.round(base * this.mult);
    this.score += pts;
    const item = this.log.get(label) ?? { label, count: 0, points: 0 };
    item.count++;
    item.points += pts;
    this.log.set(label, item);
    const size = pts >= 2000 ? 'huge' : pts >= 400 ? 'big' : '';
    this.hud.popup(`${label === 'Smashed' ? '' : label + ' '}+${pts.toLocaleString()}`, pos, size);
    this.hud.setScore(this.score);
    this.hud.setCombo(this.mult, this.combo);
    G.sfx.coin(1 + Math.min(1, this.combo * 0.04));
    if (pts > this.biggest.pts) this.biggest = { pts, label };
    if (pts >= 2000) G.bigMoment(pts >= 4000 ? 1 : 0.6);
    if (!kind) {
      if (this.combo > 0 && this.combo % 8 === 0) G.commentary.say('combo');
      else if (pts >= 400) G.commentary.maybe('big', 0.5);
      else G.commentary.maybe('hit', 0.18);
    }
    return pts;
  }

  update() {
    if (this.combo && G.time - this.lastHit > 1.6) {
      this.combo = 0;
      this.mult = 1;
      this.hud.setCombo(1, 0);
    }
  }

  invoice() {
    const rows: { desc: string; qty: number; cost: number }[] = [];
    for (const item of this.log.values()) {
      const [unit, desc] = COSTS[item.label] ?? [Math.round(80 + (hash(item.label) % 900)), item.label];
      rows.push({ desc, qty: item.count, cost: unit * item.count });
    }
    rows.sort((a, b) => b.cost - a.cost);
    return rows;
  }
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
