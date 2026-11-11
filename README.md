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
| Space / W / ▲ | Hop during the run (one hop; it comes back 5 seconds after you use it). The hop shoves you forward too, hardest when you're stuck, so it gets you out of craters |
| R | Restart |

## SKOOSH

Giant cans of SKOOSH (Scots for a fizzy drink: fizzy ginger, extra fizz) float over the road at the start of the long runs: on the Royal Mile after the Fringe stage (a straight shot at the World's End wall), as you enter the Grassmarket, and at the top of Leith Walk. Drive through one for 4 seconds of shove up to about 58 mph, engine or no engine.

## On phones

Phones and tablets get their own version automatically (`src/core/Platform.ts`): the browser's user agent says it's a phone or tablet *and* it has a touchscreen. iPads, which call themselves a Mac, are caught by the touchscreen check. Add `?mobile=1` or `?mobile=0` to the URL to force one version; the choice is remembered.

- **Steer by tilting** the phone in landscape like a steering wheel. Whatever angle you're holding it at when the swing starts counts as straight ahead. There's a sensitivity slider on the title screen. iPhones ask permission for the tilt sensor when you press PLAY; if there's no sensor (or you say no), ◀ ▶ buttons appear instead.
- **Tap** to kick (the same three-tap swing) and press the **HOP** button to hop.
- Landscape only (portrait shows a "turn your phone sideways" screen). Android goes fullscreen and buzzes on big hits.
- Lighter on the hardware: lower resolution (dropped further on the fly if the frame rate sags below 40 fps), smaller shadows, shorter draw distance, half the background crowds, a smaller backdrop city, fewer pieces of debris, and every model built with fewer segments.

On every device, people standing more than a short distance away are swapped for a low-detail copy frozen in their pose, and switch back to the full posable figure as you get close or the moment they're knocked flying.

## Nods to the local games industry

No names or logos, just homages: troupes of **wee marchers** (green hair, blue robes) cross the street in single file, turning at the kerb, with a blocker in the middle and one floating down on an umbrella; they pop when hit, and flattening a whole troupe is NONE SAVED. Smash **POLIS cars** and old **police boxes** to raise a **wanted level** (★ in the HUD, plus a siren); five stars pays out. There are **PIXEL RAMPAGE** arcade cabinets on the pavements, with a top-down city on the screen. They're on both the Royal Mile and the long course.

## The launch

Click to start and the camera swings round 90° to watch the Big Boot™ from the side. The swing meter is an arc that follows the boot: the marker rides up as the leg winds back (click for power), then falls with it (click in the green right where the boot meets the vehicle). Contact gives a rumble and a short freeze, then the camera follows the vehicle away and swings round behind it.

## Career and stages

There's no route select: the course always follows the same progression, and each goal opens the next stretch plus a new vehicle. Progress is saved in the browser (`localStorage`).

| Goal | Unlocks |
| --- | --- |
| Score 5,000 in one run | Stage 2 — the Grassmarket Diversion · Leaf-Blower Trolley |
| Bank 25,000 career points | Stage 3 — Up to Princes Street · Granny McLeod's Mobility Scooter |
| Reach the East End of Princes Street | Stage 4 — Leith Walk & the Shore · Golf Buggy |
| Drive off Starbank Road into the Forth | Sir Saltalot, the council gritter: seven tonnes, a snowplough, the fastest thing in the garage |

From stage 2 the Royal Mile is shut at the George IV Bridge junction and you follow the diversion: Victoria Street → the Grassmarket → King's Stables Road → Lothian Road → Princes Street → Leith Street → Leith Walk → Great Junction Street → Starbank Road → off the slipway into the sea. Side streets are barriered off, and each stage ends at a ROAD CLOSED hoarding.

Motorised vehicles freewheel down to the Grassmarket, then their engine starts for the climb (and cuts out if Hamish falls off). The plain trolley has no engine, so with it the course stops at the Grassmarket whatever you've unlocked. The title screen is the garage: pick a vehicle, see the next goal.

## Set pieces

### Stage 1 — The Royal Mile

Castle Esplanade launch · whisky barrel pyramid · the piper & tartan shop · St Giles' crown spire (veer right into Parliament Square and knock out the scaffolding) · Adam Smith statue (market correction) · Mercat Cross unicorn · Heart of Midlothian (take the wee ramp and land on it) · Fringe stage ramp · Tron Kirk market in Hunter Square (haggis hat-trick, phone box) · World's End wall · Canongate Tolbooth clock (branch right and hit the ramp) · Holyrood Palace gates.

### Stages 2–4 — the long way round (`src/level/Diversion.ts`)

George IV Bridge diversion (signs, an occupied portaloo) · Victoria Street's painted shops, Victoria Terrace and the broom shop (BROOM BROOM) · Grassmarket beer garden (ROUND'S ON YOU), the Covenanters' Memorial and the ENGINES ON gantry · King's Stables Road under the castle crags, parked cars and a traffic warden · the Caledonian Hotel · Princes Street: the sunken gardens (lawns, railway and a parked train, the Mound with its two galleries, the Ross Fountain, the floral clock, Waverley's glass roof, castle rock rising to the Old Town), the Scott Monument, the Christmas market, a big wheel that rolls away when you knock its legs out, and a tram coming the other way · the Balmoral clock · the "Walnut Whip" · Leith Walk on derby day: fans down both pavements, bunting, a green cycle lane with commuters who set off as you arrive (the bikes fly off separately), stewards' cone chicanes, a burst sack of footballs and the fan zone's giant inflatables, a ramp that jumps you into a Hearts v Hibs squabble across the road (a scoreboard counts each side knocked over; at full time the side with more fans still standing wins), then the polis, the pie stalls and a cone slalom down to the Foot of the Walk · Queen Victoria at the Foot of the Walk (WE ARE NOT AMUSED) · Newhaven lighthouse · the Starbank sea wall and slipway, and SPLASHDOWN in the Forth.

## Shop interiors

Every ground-floor shop window shows a room behind the glass using interior mapping, the trick open-world games use for city windows. At start-up four little 3D rooms (a pub, a gift shop, a café and a kilt shop) are built and rendered once into cubemaps (`src/art/Interiors.ts`). Each window is then a single flat quad whose shader traces the view ray into an imaginary box room and looks the hit point up in the cubemap, so the rooms have depth and parallax as you drive past. All windows share one material, so they batch into a handful of draw calls.

## Models

Everything is modelled in code (`src/art/Model.ts`): shapes are lofted through cross-sections, lathed, swept along paths and extruded, rather than stacked from boxes and spheres. A finished model is merged into a handful of meshes, with every plain coloured surface stored as vertex colour on a shared material, so a prop is three or four draw calls instead of forty. Chrome, paint and glass reflect a small generated sky.

People (`src/art/Humanoid.ts`) are one skinned body and a head. The body and head are sculpted once per shape (legwear, sleeves, build, hair) and shared; each person owns only their colours, and their height and build are applied through the skeleton. Hats, scarves, cameras and bagpipes are in `src/art/Accessories.ts`; cars, the tram and the digger in `src/art/Motors.ts`.

`viewer.html` (dev server only, e.g. `/viewer.html?m=people`) is a turntable for looking at models under the game's lighting; `window.cam(yaw, pitch, distance)` moves the camera.

## Code map

- `src/game/` — game flow (`Game.ts`: title/attract mode, tour, aim, run, results), career save (`Career.ts`), swing meter, camera, scoring, commentary
- `src/vehicle/` — the five vehicles (`Vehicles.ts`), the Rapier ray-cast vehicle that drives them (`Trolley.ts`) and Hamish's ragdoll
- `src/destruction/` — breakable parts: fixed-until-hit, collapse cascades, fracturing into chunks, debris cap
- `src/world/` — street geometry (`Road.ts`: both courses, laid out as a path you can bend), craterable terrain, static scenery batching, sky and backdrop
- `src/level/` — tenement generator, Edinburgh set pieces, Princes Street Gardens (`Gardens.ts`), the Big Boot launcher, the Royal Mile and long-course layouts with their tours
- `src/props/` — bins, bollards, barrels, scaffolding, tourists, pigeons
- `src/art/` — the modelling toolkit, people, accessories and road vehicles; procedural canvas textures (sandstone, cobbles, tartan, shop signs…)

Add `?debug` to the URL to expose test helpers in the console: `autopilot()`, `launchOnly()`, `drive(frames)`, `F(n)` frame stepping (pauses the live loop), and `setCareer(tier, vehicle)` to jump to any stage, e.g. `setCareer(4, 'buggy')`.
