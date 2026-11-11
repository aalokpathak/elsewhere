<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/branding/logo.svg" />
    <img src="public/branding/logo-light-bg.svg" alt="Elsewhere" width="420" />
  </picture>
</p>

<p align="center"><em>Somewhere between here and nowhere.</em></p>

<p align="center">
  <a href="https://elsewhere.pathakalok256.workers.dev/"><strong>▶ Play it live — elsewhere.pathakalok256.workers.dev</strong></a>
</p>

<p align="center">
  <img src="docs/screenshots/green-highlands-golden-hour.jpg" alt="Driving through the Green Highlands at golden hour" width="100%" />
</p>

**Elsewhere** is an endless, calm driving game for the browser. Pick a place, press *Start Driving*, and keep going for as long as you like — through rolling countryside, along a sea cliff at sunset, down empty suburban streets, or round and round a parking structure that never reaches the roof. No goals, no timer, no game over.

Everything is generated procedurally and locally: the road, terrain, trees, houses, concrete decks, sky, and every sound. The whole game is a static website.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/coastal-highway-sunset.jpg" alt="Coastal Highway at sunset" /><br /><sub><b>Coastal Highway</b> · Sunset</sub></td>
    <td width="50%"><img src="docs/screenshots/alpine-roads.jpg" alt="Alpine Roads switchbacks" /><br /><sub><b>Alpine Roads</b> · Clear Air</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/liminal-suburbia.jpg" alt="Liminal Suburbia, overcast" /><br /><sub><b>Liminal Suburbia</b> · Overcast</sub></td>
    <td><img src="docs/screenshots/parking-structure.jpg" alt="Endless Parking Structure" /><br /><sub><b>Endless Parking Structure</b> · Fluorescent</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/misty-forest-rain.jpg" alt="Misty Forest in the rain" /><br /><sub><b>Misty Forest</b> · Rain</sub></td>
    <td><img src="docs/screenshots/desert-highway-sunset.jpg" alt="Desert Highway at sunset" /><br /><sub><b>Desert Highway</b> · Sunset</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/midnight-highway.jpg" alt="Midnight Highway under the stars" /><br /><sub><b>Midnight Highway</b> · Clear Darkness</sub></td>
    <td><img src="docs/screenshots/service-corridors.jpg" alt="Service Corridors" /><br /><sub><b>Service Corridors</b> · The Hum</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/surreal-horizon.jpg" alt="Surreal Horizon with a distant monolith" /><br /><sub><b>Surreal Horizon</b> · Amber Void</sub></td>
    <td><img src="docs/screenshots/green-highlands-cinematic.jpg" alt="Drone camera in the Green Highlands" /><br /><sub><b>Green Highlands</b> · Drone camera</sub></td>
  </tr>
</table>

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/main-menu.jpg" alt="Main menu over a live drive" /><br /><sub><b>Main menu</b> — floats over a live, autopiloted drive</sub></td>
    <td width="50%"><img src="docs/screenshots/cockpit-view.jpg" alt="First-person cockpit view" /><br /><sub><b>Cockpit camera</b> — press C</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/hud-suburbia-dusk.jpg" alt="In-game HUD in Liminal Suburbia at dusk" /><br /><sub><b>Minimal HUD</b> — Liminal Suburbia at dusk</sub></td>
    <td><img src="docs/screenshots/pause-menu.jpg" alt="Pause menu" /><br /><sub><b>Pause menu</b> — new road, time &amp; weather, shareable road link</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/photo-mode.jpg" alt="Photo mode with a free orbit camera" /><br /><sub><b>Photo mode</b> — press V, orbit freely and save a high-resolution PNG</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mobile-menu.jpg" alt="Main menu on a phone" width="240" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/mobile-driving.jpg" alt="Driving on a phone with touch controls" width="240" />
  <br /><sub><b>On a phone</b> — responsive menu and multitouch steering / pedals</sub>
</p>

---

## What you can do

- **Just drive.** Ten places, each with several times of day and kinds of weather that change smoothly.
- **Or just watch.** Press **T** for auto-drive: the car follows the road by itself (↑ ↓ change its speed, steering takes the wheel back). A drive started from the menu begins this way, so you are never handed a moving car unprepared.
- **Four cameras** (**C**): chase, cockpit, hood and a wandering drone. Hold **B** to look behind, drag to look around.
- **Photo mode** (**V**): freeze the moment, orbit and zoom freely, change the lens, save a high-resolution PNG.
- **Share a road.** Every road has a number. Copy a link from the pause menu (`?env=coastal-highway&v=sunset&road=4242`) or type a road number to revisit it — same curves, same hills, same houses.
- **A solid world.** Trees, boulders, houses, fences, poles, guardrails and parked cars stop the car; dust rises off-road and spray on wet roads.
- **Optional liminal events**: rare, quiet oddities (never jump-scares), with separate switches for visual, audio and atmospheric effects.

## Quick start

Requires Node.js 20+ (developed with Node 24).

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL (default `http://localhost:5173`).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check (`tsc`) and build the static site into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests (Vitest) |
| `npm run typecheck` | Type-check only |

## Controls

| Input | Action |
| --- | --- |
| **W / ↑** | Accelerate |
| **S / ↓** | Brake, then reverse when stopped |
| **A D / ← →** | Steer |
| **Space** | Handbrake |
| **T** | Auto-drive (↑ ↓ adjust speed; steering or handbrake cancels) |
| **Q** | Cruise control (holds current speed; braking cancels) |
| **C** | Next camera: chase → cockpit → hood → drone |
| **B** (hold) | Look behind |
| **Mouse / touch drag** | Look around (eases back behind the car) |
| **V** | Photo mode |
| **L** | Headlights: auto / on / off |
| **N** | Horn |
| **R** | Recover to the road |
| **H** | Toggle HUD |
| **F** | Fullscreen |
| **M** | Mute |
| **Esc / P** | Pause |

**Touch:** an analogue steering pad on the left, *Go* and *Brake* pedals on the right (multitouch: steer and accelerate together). The HUD has buttons for auto-drive, camera, photo mode, fullscreen and pause. The pads appear on phones and tablets, or on any device as soon as you touch the screen.
**Gamepad:** left stick steers, right trigger accelerates, left trigger brakes, B is the handbrake.

Driving keys only suppress browser scrolling while you are actually driving; menus and form fields keep normal keyboard behaviour. Losing window focus pauses the drive.

## Environments

| Environment | Status | Notes |
| --- | --- | --- |
| Green Highlands | Complete | Rolling hills, woodland, fences, grass, 4 moods incl. golden hour and drizzle |
| Coastal Highway | Complete | Ocean on the right, cliffs, guardrail, islands, sunset and sea haze |
| Liminal Suburbia | Complete | Repeating houses, driveways, mailboxes, streetlights, overcast/dusk/night |
| Endless Parking Structure | Complete | Pillars, bays, ramps between levels, fluorescent fixtures, parked cars |
| Alpine Roads | Complete | Ridged mountains, switchbacks, conifers, guardrails on curves, snowfall |
| Misty Forest | Complete | Dense pine/birch, damp roads, heavy fog, rain |
| Desert Highway | Complete | Long straights, telephone wires, cacti, mesas, heat-shimmer road mirage |
| Midnight Highway | Complete | Headlights, stars, reflector posts, junction lamps, fog and rain |
| Service Corridors | Experimental | Backrooms-inspired (original) carpeted service corridors, doors, side passages |
| Surreal Horizon | Experimental | Flat pastel plains with enormous distant monoliths, arches and spheres |

"Experimental" means playable and stable but less art-directed than the others.

## Project structure

```
public/
  branding/          logo.svg, logo-light-bg.svg, logo-mark.svg, icon-512.svg, brand-guide.md
  favicon.svg, manifest.webmanifest
src/
  app/               App.tsx (React shell), game-state.ts (phase machine), share.ts (road links),
                     devTools.ts (dev only)
  config/            environments.ts, graphics.ts (presets), controls.ts, settings.ts (persistence)
  core/              seeded random, simplex noise, math helpers
  game/              GameEngine, GameLoop, WorldManager, VehicleController, CarModel,
                     CameraController, InputManager, AudioManager, AnomalySystem, Autopilot,
                     PostFX (bloom / FXAA / grading), TrailParticles, PerformanceManager,
                     ResourceManager
  world/             RoadGenerator, TerrainGenerator, ChunkBuilder, ChunkManager,
                     SceneryGenerator, SceneryRenderer, InstancePool, Colliders,
                     RoadMeshBuilder, EnvironmentManager, WeatherSystem, Sky, Water,
                     Precipitation, DistantScenery, materials/, assets/, environments/
  ui/                MainMenu, EnvironmentSelector, GameHUD, PauseMenu, PhotoMode,
                     SettingsMenu, TouchControls, LoadingScreen, PerformanceOverlay,
                     envThumbnails
  styles/global.css
docs/screenshots/    images used in this README
tests/               road, terrain/chunks/scenery, vehicle, config/settings/weather,
                     collisions/sharing/auto-drive tests
```

### How it works

- **One engine, many presets.** An environment is pure data (`src/world/environments/*`): road shape, terrain parameters, scenery layers, roadside furniture, indoor modules, atmosphere variants and ambience. The same road generator, chunk manager, car and camera serve all ten.
- **Endless road.** `RoadGenerator` integrates a centreline at a fixed 2 m step from segments whose curvature eases from one to the next, so position, heading, curvature and elevation are continuous — no seams. Heading is bounded around +Z, which guarantees the road never crosses itself and lets any world point be matched to the road with a binary search. Elevation follows a smoothed, grade-limited version of the landscape. Everything derives from the road number (seed); old road data is trimmed behind the car.
- **Terrain.** `TerrainSampler` is a deterministic height field (fbm + ridged noise) that blends to just below the road surface near the road, so the road is never buried or floating. `ChunkManager` streams 128 m chunks in LOD rings around the car with a per-frame time budget; neighbouring chunks share exact edge heights and skirts hide LOD cracks.
- **Scenery.** Placement is pure and seeded (`SceneryGenerator`), sampled on the actual rendered triangle surface so nothing floats. Rendering uses densely packed `InstancedMesh` pools with O(1) add/remove; instance transforms are re-centred periodically to stay precise on very long drives. Only scenery in the chunks nearest the car is drawn into the shadow map.
- **Collisions.** `ColliderGrid` is a small spatial hash of circles and oriented boxes, registered per chunk / road segment and removed with it. The car is two circles (one per axle) pushed out of anything they overlap.
- **The car.** One lofted surface: cross-sections interpolated along the car's length give a curved hood, tapered cabin, real wheel arches and flush glass, with a crease along the beltline.
- **React stays out of the frame loop.** The engine owns a single `requestAnimationFrame` loop; the HUD is updated by writing to DOM nodes from a 10 Hz snapshot.
- **Atmosphere.** A procedural sky (gradient, sun, self-shadowed fbm clouds, stars), fog matched to the horizon and tinted by the sun when you look toward it, soft cloud shadows drifting over land, road and vegetation, a sky-derived environment map (PMREM), sun shadows that follow the car, rain/snow particles and smooth transitions between variants. Wet roads are an approximation (darker albedo + low roughness reflecting the sky environment map); there are no real-time screen-space reflections.
- **Post-processing.** On Medium and High the scene renders to an HDR target; bright areas bloom (five small quarter- and eighth-resolution passes) and one final pass tone-maps, grades, anti-aliases (FXAA on Medium, MSAA on High) and dithers. Measured on Intel integrated graphics this costs under 1 ms a frame on Medium. Low renders directly.
- **Audio.** Entirely synthesised with the Web Audio API: engine (simple gearbox), tyre roar, gravel, wind rush, rain and thunder, horn, per-environment ambience (birds, ocean, crickets, forest, fluorescent hum, mechanical rumble, drone), slow generative music and the optional liminal sounds. The audio context starts on the first user gesture.
- **Liminal events (optional).** Rare, quiet events — a figure at the roadside that is gone when you get close, a light that flickers once, a sourceless sound, tail lights that never get closer, ambience that falls silent, fog that thickens. Separate toggles for visual, audio and atmospheric effects; *Off* disables everything.

## Settings

Saved to `localStorage` (`elsewhere.settings.v1`) and validated on load (corrupt or older data is repaired):
volumes (master, vehicle, ambience, music, liminal), graphics preset (Low/Medium/High), bloom & film effects, render resolution, adaptive resolution, performance overlay, top speed, steering and camera sensitivity, field of view, units, car colour, reduce motion, HUD and drive-time visibility, drifting time/weather, liminal intensity and toggles. Lifetime distance driven is kept too and shown on the main menu.

| Preset | What you get |
| --- | --- |
| **Low** | Shorter view, no grass, no sun shadows (a soft contact shadow keeps the car grounded), no post-processing. For older laptops and phones. |
| **Medium** | Grass and wildflowers, tree shadows near the car, bloom, FXAA, cloud shadows, dust and spray. Tuned to hold 60 fps on integrated graphics at 720p–1080p. |
| **High** | Longer view, denser scenery, wider shadows, MSAA. For dedicated graphics. |

Adaptive resolution only steps down after several seconds of sustained low frame rate (never on a single slow frame) and recovers slowly.

## Deploying for free

The live version runs on Cloudflare: **https://elsewhere.pathakalok256.workers.dev/**

The build is a static site with relative asset paths (`base: './'`), so it works at a domain root or a sub-path.

**Cloudflare Pages:** create a project from the repository, build command `npm run build`, output directory `dist`.

**GitHub Pages:** build locally (`npm run build`) and publish the `dist/` folder (for example with the `gh-pages` branch or an Actions workflow using `actions/upload-pages-artifact` + `actions/deploy-pages`). No server configuration is needed.

**Netlify / any static host:** upload `dist/`.

## Testing

`npm test` runs 43 unit tests covering road continuity, curvature/elevation limits, non-self-intersection, determinism, nearest-point queries, trimming and reset; terrain determinism, road-vs-terrain clearance, chunk edge continuity, chunk planning/recycling and scenery placement rules; vehicle acceleration, braking/reversing, coasting, steering, slopes, walls, cruise control and zero-length time steps; the collision grid, solid-scenery rules, the autopilot staying in lane, shareable road links; environment preset validity, graphics presets, settings persistence/repair/migration, weather transitions and the game phase machine.

The game was also exercised end to end in headless Chrome on Intel integrated graphics: repeated cold loads with the CPU throttled up to 12× (every load must end with a visible, animating world), real keyboard input for driving, auto-drive, cameras, photo mode, road links and collisions, a phone-sized touch layout, and 5–14 km soak drives checking that geometry, instance and collider counts stay bounded.

In development, `window.__elsewhere` exposes helpers used for automated browser checks (`drive(name, variant, frames)`, `soak(km)`) and `window.elsewhere` is the engine (`debugState()`, `debugAdvance()`, `debugPlace()`, `debugTriggerAnomaly()`). These are not included in production builds.

## Known limitations

- Service Corridors and Surreal Horizon are marked experimental: they work but have less variety than the other eight.
- Collisions are simple shapes: tree trunks, rocks and poles are circles, houses and parked cars are boxes. There is no damage model, and small props (shrubs, delineator posts) are not solid.
- Water is a stylised shader without shoreline foam; wet roads use an environment-map approximation, not true reflections.
- The desert "heat haze" is a distance mirage on the road surface rather than a screen-space distortion.
- Terrain is generated on the main thread (time-sliced); very slow devices may see distant chunks fill in while driving fast on the High preset. The very first load also compiles shaders, which can take several seconds on a cold browser.
- Frame rates were measured in headless Chrome on one Intel integrated GPU; other hardware will differ (adaptive resolution and the Low preset are the safety nets).
- Branding is SVG only; no raster (PNG) icon sizes are generated.
- Automated testing used desktop Chromium, including an emulated phone; real phones and Safari/Firefox were not tested.
