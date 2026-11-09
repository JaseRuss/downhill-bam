# Downhill Bam!

A comedic physics game: boot a shopping trolley (and Hamish, its kilted passenger) down Edinburgh's Royal Mile with a giant kilted leg, smash everything you can, and get the biggest score — and council damage invoice — you can. Points bank into a career that opens up the rest of the city, a stage at a time, all the way to the Firth of Forth.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Controls

| Key | Action |
| --- | --- |
| A / D or ◀ ▶ | Aim before the swing · steer during the run · swivel when nearly stopped |
| Click / Space | The Big Boot: start the wind-up → set power → time the kick (hit the green as the boot comes down) |
| Space / W / ▲ | Hop during the run (one hop; it comes back 5 seconds after you use it) |
| R | Restart |

## The launch

Click to start and the camera swings round 90° to watch the Big Boot™ from the side. The swing meter is an arc that follows the boot: the marker rides up as the leg winds back (click for power), then falls with it (click in the green right where the boot meets the vehicle). Contact gives a rumble and a short freeze, then the camera follows the vehicle away and swings round behind it.

## Career and stages

There's no route select: the course always follows the same progression, and each goal opens the next stretch plus a new vehicle. Progress is saved in the browser (`localStorage`).

| Goal | Unlocks |
| --- | --- |
| Score 10,000 in one run | Stage 2 — the Grassmarket Diversion · Leaf-Blower Trolley |
| Bank 50,000 career points | Stage 3 — Up to Princes Street · Granny McLeod's Mobility Scooter |
| Reach the East End of Princes Street | Stage 4 — Leith Walk & the Shore · Golf Buggy |
| Drive off Starbank Road into the Forth | Clawfoot Bathtub |

From stage 2 the Royal Mile is shut at the George IV Bridge junction and you follow the diversion: Victoria Street → the Grassmarket → King's Stables Road → Lothian Road → Princes Street → Leith Street → Leith Walk → Great Junction Street → Starbank Road → off the slipway into the sea. Side streets are barriered off, and each stage ends at a ROAD CLOSED hoarding.

Motorised vehicles freewheel down to the Grassmarket, then their engine starts for the climb (and cuts out if Hamish falls off). The plain trolley has no engine, so with it the course stops at the Grassmarket whatever you've unlocked. The title screen is the garage: pick a vehicle, see the next goal.

## Set pieces

### Stage 1 — The Royal Mile

Castle Esplanade launch · whisky barrel pyramid · the piper & tartan shop · St Giles' crown spire (veer right into Parliament Square and knock out the scaffolding) · Adam Smith statue (market correction) · Mercat Cross unicorn · Heart of Midlothian (take the wee ramp and land on it) · Fringe stage ramp · Tron Kirk market in Hunter Square (haggis hat-trick, phone box) · World's End wall · Canongate Tolbooth clock (branch right and hit the ramp) · Holyrood Palace gates.

### Stages 2–4 — the long way round (`src/level/Diversion.ts`)

George IV Bridge diversion (signs, an occupied portaloo) · Victoria Street's painted shops, Victoria Terrace and the broom shop (BROOM BROOM) · Grassmarket beer garden (ROUND'S ON YOU), the Covenanters' Memorial and the ENGINES ON gantry · King's Stables Road under the castle crags, parked cars and a traffic warden · the Caledonian Hotel · Princes Street: the sunken gardens (lawns, railway and a parked train, the Mound with its two galleries, the Ross Fountain, the floral clock, Waverley's glass roof, castle rock rising to the Old Town), the Scott Monument, the Christmas market, a big wheel that rolls away when you knock its legs out, and a tram coming the other way · the Balmoral clock · the "Walnut Whip" · Leith Walk tram works (diggers, skips, closures to slalom) · Queen Victoria at the Foot of the Walk (WE ARE NOT AMUSED) · Newhaven lighthouse · the Starbank sea wall and slipway, and SPLASHDOWN in the Forth.

## Code map

- `src/game/` — game flow (`Game.ts`: title/attract mode, tour, aim, run, results), career save (`Career.ts`), swing meter, camera, scoring, commentary
- `src/vehicle/` — the five vehicles (`Vehicles.ts`), the Rapier ray-cast vehicle that drives them (`Trolley.ts`) and Hamish's ragdoll
- `src/destruction/` — breakable parts: fixed-until-hit, collapse cascades, fracturing into chunks, debris cap
- `src/world/` — street geometry (`Road.ts`: both courses, laid out as a path you can bend), craterable terrain, static scenery batching, sky and backdrop
- `src/level/` — tenement generator, Edinburgh set pieces, Princes Street Gardens (`Gardens.ts`), the Big Boot launcher, the Royal Mile and long-course layouts with their tours
- `src/props/` — bins, bollards, barrels, scaffolding, tourists, pigeons
- `src/art/` — procedural canvas textures (sandstone, cobbles, tartan, shop signs…)

Add `?debug` to the URL to expose test helpers in the console: `autopilot()`, `launchOnly()`, `drive(frames)`, `F(n)` frame stepping (pauses the live loop), and `setCareer(tier, vehicle)` to jump to any stage, e.g. `setCareer(4, 'buggy')`.
