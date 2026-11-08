# Downhill Bam!

A comedic physics game: thwack a shopping trolley (and Hamish, its kilted passenger) down Edinburgh's Royal Mile with a golf swing, smash everything you can, and get the biggest score — and council damage invoice — you can.

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
| Click / Space | Swing meter: start → set power → set accuracy (hit the green) |
| Space / W / ▲ | Hop during the run (1 hop, earn more on big hits) |
| R | Restart |

## Set pieces (Stage 1 — The Royal Mile)

Castle Esplanade launch · whisky barrel pyramid · the piper & tartan shop · St Giles' crown spire (veer right into Parliament Square and knock out the scaffolding) · Adam Smith statue (market correction) · Mercat Cross unicorn · Heart of Midlothian (take the wee ramp and land on it) · Fringe stage ramp · Tron Kirk market in Hunter Square (haggis hat-trick, phone box) · World's End wall · Canongate Tolbooth clock (branch right and hit the ramp) · Holyrood Palace gates.

## Code map

- `src/game/` — game flow (`Game.ts`), swing meter, camera, scoring, commentary
- `src/vehicle/` — trolley (Rapier ray-cast vehicle) and Hamish's ragdoll
- `src/destruction/` — breakable parts: fixed-until-hit, collapse cascades, fracturing into chunks, debris cap
- `src/world/` — street geometry (`Road.ts`), craterable terrain, static scenery batching
- `src/level/` — tenement generator, Edinburgh set pieces, level layout and intro tour
- `src/props/` — bins, bollards, barrels, scaffolding, tourists, pigeons
- `src/art/` — procedural canvas textures (sandstone, cobbles, tartan, shop signs…)

Add `?debug` to the URL to expose test helpers (`autopilot()`, `launchOnly()`, `F(n)` frame stepping) in the console.
