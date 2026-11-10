import * as THREE from 'three';
import { G } from '../ctx';
import { buildStreet, bayFacades, guideWalls, Reserved } from './Buildings';
import * as SP from './SetPieces';
import { scaffold } from '../props/Props';
import { toWorld } from '../world/Road';
import { skooshCan } from '../props/Pickups';
import { marchers, policeCar, policeBox, arcadeCabinet } from '../props/Homages';

export interface TourInfo {
  name: string;
  pts: string;
  blurb: string;
  s: number;
  cam: [number, number, number];
  look: [number, number, number];
}

export const TOUR: TourInfo[] = [
  { name: 'The Castle Esplanade', pts: 'LAUNCH PAD', blurb: 'Line up, give it the Big Boot™, and let gravity do the rest.', s: -14, cam: [-24, 3, 5], look: [-48, 0, 9] },
  { name: 'The Auld Scunner Whisky Experience', pts: '80 per barrel · 1,500 BARREL BOWLING', blurb: 'Fifteen barrels of eighteen-year-old single malt. Knock over eight for a strike.', s: 45, cam: [33, -3, 3.2], look: [45, 1, 1.4] },
  { name: 'The Piper & The Tartan Tat Emporium', pts: '900 PIPER · 150 per window', blurb: "He's been playing 'Scotland the Brave' since 6am. Plate glass and kilted mannequins.", s: 97, cam: [84, 1.5, 3], look: [97, -5, 1.8] },
  { name: "St Giles' Cathedral", pts: '5,000 CROWN JEWEL', blurb: 'Veer right into Parliament Square, knock out the scaffolding, and the 15th-century crown spire comes down. Mind yer heid.', s: 150, cam: [126, -3, 9], look: [166, 14, 20] },
  { name: 'Adam Smith, Father of Economics', pts: '2,000 · MARKET CORRECTION 1,500', blurb: 'Clip his plinth and watch the invisible hand of the market knock him flat.', s: 190, cam: [180, 3, 3.5], look: [190, 9.4, 3.6] },
  { name: 'The Mercat Cross', pts: '2,500 UNICORN', blurb: "Clip the drum and topple Scotland's national animal into the street.", s: 208, cam: [195, 2.5, 4], look: [208, 8.8, 5.5] },
  { name: 'The Heart of Midlothian', pts: '250 · 1,500 if you HOP onto it', blurb: "Locals spit on it for luck. Take the wee ramp and land on it instead.", s: 228, cam: [220, -0.5, 4], look: [228, -2, 0] },
  { name: 'Fringe Festival Stage', pts: '1,500 FRINGE BENEFIT', blurb: 'Hit the ramp, fly off the stage, land in the front row. Five stars.', s: 293, cam: [277, 1, 3.5], look: [294, -4.5, 1.6] },
  { name: 'Tron Kirk Market', pts: 'HAGGIS HAT-TRICK 1,200 · PHONE BOX', blurb: 'Swing right into Hunter Square: haggis stall, red phone box, fudge. Three haggis is a hat-trick.', s: 350, cam: [328, 1, 4.5], look: [350, 5.5, 1.4] },
  { name: "The World's End", pts: '1,200 THROUGH THE WALL', blurb: 'The old Flodden Wall. In 1513 it was the edge of the world. Now it is in your way.', s: 425, cam: [412, 0.5, 2.6], look: [425, 0, 0.8] },
  { name: 'Canongate Tolbooth Clock', pts: '2,000 CLOCK', blurb: 'Branch right, hit the ramp (hop for extra height) and clock the clock.', s: 484, cam: [470, 2.5, 3], look: [484, 8, 3] },
  { name: 'Palace of Holyroodhouse', pts: '1,500 per GATE · FINISH', blurb: 'Burst through the royal gates to finish. The King is not in. Probably.', s: 585, cam: [566, 0, 4], look: [590, 0, 2] },
];

export interface Level {
  /** Name for the tour card and the invoice. */
  name: string;
  tour: TourInfo[];
  stops: { cam: THREE.Vector3; look: THREE.Vector3 }[];
  /** World spots the backdrop city must stay clear of (gardens, the sea...). */
  keepOut?: (x: number, z: number) => boolean;
}

export function tourStops(tour: TourInfo[]) {
  return tour.map((t) => ({ cam: toWorld(t.cam[0], t.cam[1], t.cam[2]), look: toWorld(t.look[0], t.look[1], t.look[2]) }));
}

export function buildRoyalMile(): Level {
  const reserved: Reserved[] = [
    { side: 1, s0: 36, s1: 56 },
    { side: -1, s0: 88, s1: 106 },
    // side bays on the right (built by bayFacades)
    { side: 1, s0: 134, s1: 222 },
    { side: -1, s0: 336, s1: 368 },
    { side: -1, s0: 415, s1: 433 },
    { side: 1, s0: 332, s1: 372 },
    { side: 1, s0: 466, s1: 506 },
  ];
  buildStreet(reserved, -4, 570);
  bayFacades([[142, 198], [478, 498]]);
  guideWalls(-4, 570);

  SP.castleEsplanade();
  SP.whiskyPyramid(47, 1.0);
  SP.piperAndTartan(96);
  SP.stGiles();
  SP.adamSmith(190, 9.4);
  SP.mercatCross(208, 8.8);
  SP.heartOfMidlothian(228, -2.0);
  SP.fringeStage();
  SP.tronKirk();
  SP.worldsEnd(425);
  SP.tolbooth(488);
  SP.holyrood();
  // a can of SKOOSH for the long run down from the Tron to the World's End
  skooshCan(318, 0);
  // nods to the local games industry: wee marchers, the polis, an arcade cabinet
  marchers(252, 8);
  marchers(445, 7);
  policeCar(120, -4.2);
  policeBox(172, -6.6);
  policeBox(395, 6.5);
  policeCar(540, 4.2);
  policeCar(574, -4.4, 0.4);
  arcadeCabinet(266, -6.7);
  arcadeCabinet(452, 6.6);

  // more buskers working the Mile: mimes and pipers out by the kerb
  G.crowd.tourist(150, 5.2, 'mime');
  G.crowd.tourist(300, -5.0, 'piper');
  G.crowd.tourist(410, -5.2, 'mime');
  G.crowd.tourist(520, 5.0, 'piper');

  // extra scaffolding on a couple of ordinary lands
  scaffold(116, 124, -6.7, 6);
  scaffold(256, 262, 6.7, 6);
  scaffold(462, 470, -6.7, 6);

  SP.scatter([
    [-60, 6], [38, 56], [88, 106], [140, 200], [203, 214], [224, 232], [280, 310], [334, 368], [418, 434], [484, 506], [565, 700],
  ]);

  return { name: 'The Royal Mile', tour: TOUR, stops: tourStops(TOUR) };
}
