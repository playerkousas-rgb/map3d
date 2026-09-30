<p align='center'>
<h1 align='center'>🗺️ map3d</h1>
<p align='center'>Generate real-world 3D maps & 3D-printable GPX models / 生成真實世界 3D 地圖與可列印 GPX 模型</p>
</p>

![img](./.github/screenshot.png)

## About The Project

A 3D mapping tool built with [React-Three-Fiber](https://github.com/pmndrs/react-three-fiber), merging the features of the original [cartesiancs/map3d](https://github.com/cartesiancs/map3d) and my earlier `building3d` project into one:

**Mode 1 — Map → 3D Buildings（地圖 → 3D 建築）**

- Select an area on the map (OpenStreetMap / Leaflet)
- Fetch buildings & roads from the Overpass API
- Render real-world 3D buildings (height from OSM `height` / `building:levels` tags)
- Roads rendered as solid meshes with widths based on highway type
- Click a building to see its OSM info (name, height, address, translations...)
- A base plate is generated underneath so exports are 3D-printable
- Place / address search on the map (OpenStreetMap Nominatim)
- Automatic fallback to mirror Overpass servers when the main one is busy (429 / 5xx / timeout)

**Mode 2 — GPX → 3D Print Model（GPX → 3D 列印模型）**

- Import a hiking / cycling GPX track (drag & drop)
- Generates a solid 3D model: base plate + track ribbon following the elevation profile, with start/end markers
- Adjustable elevation exaggeration, track width and base thickness
- Track statistics: distance, elevation gain, elevation range
- Track without elevation? One click fills it in from terrain data (Open-Meteo / Copernicus DEM, fallback OpenTopoData SRTM)
- One-click STL export, ready for slicing & printing

**Mode 3 — 3D City Orienteering（3D 城市定向 · 手機優先）**

- Three steps like the building mode: ① circle the course area on the map → ② get the 3D scene (buildings, roads and terrain load with a visible status and per-item retry) → ③ place the controls in the 3D city
- Checkpoints are drawn as the orienteering symbols — △ start, ○ control (with its number), ◎ finish — standing on the terrain, with the course line between them
- Place by tapping the ground, drag a marker to move it, tap it to delete; each control carries a code, name, clue and score
- Live leg information in the HM20C grid-reference style used on paper: `50Q KK 0834 6805`, 6-figure `KK 083 680`, planar leg distance and grid **and** magnetic bearing (3.1°W)
- Ground is textured with the Lands Department Map API (iB20000 / HM20C-series basemap, aerial photography, or the OpenTopoMap countryside layer) draped over real terrain from Copernicus DEM / SRTM
- A 1 km UTM grid traced along the hills, so distances can be judged in the scene
- Courses import and export as JSON — the same shape the Scout System / HKMAP planner writes, so a course drafted on the desktop imports straight into the phone
- One-tap **GLB / STL export** of the scene (ground, city, course line and markers) for a 3D print or for sharing
- **Share with players（分享給玩家）** — one tap builds a `#play=…` link that carries the area and the whole course (compressed into the URL, nothing uploaded). Players open it and land straight in the 3D city in a read-only *player view*: they can orbit, tap a control to read its code / clue / grid reference, and export the GLB, but nothing can be moved or edited, and the link never overwrites a course saved on their own phone

**Mobile-first UI（手機優先）**

The whole app is built to be driven with one thumb: 44 px minimum touch targets, `100dvh` layout with safe-area insets for notches and home indicators, panels that slide up as a draggable bottom sheet on phones and become side panels on a wide screen, and an on-screen camera rail (fit / top / tilt / zoom) beside the usual one-finger orbit and two-finger pinch.

**Export formats:** GLB / glTF / OBJ / STL

**Bilingual UI:** English / 繁體中文 (toggle in the top bar)

> [!IMPORTANT]
> 📢 <strong>This project cannot guarantee the accuracy of the data.</strong> Map data comes from OpenStreetMap; some building heights may be missing or incorrect. In the orienteering mode the 3D ground is drawn from the Lands Department Map API and the scene keeps the required credit *Map from Lands Department · Aerial Photograph from Lands Department* on screen; the underlying data is used under the [Lands Department Map API terms](https://portal.csdi.gov.hk/csdi-webpage/doc/TNC). Terrain heights come from Copernicus DEM / SRTM and are indicative only — always check the official map and the ground before an event.

## Development

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build + bundle budget check (`dist/`) |
| `npm run lint` | ESLint |
| `npm run guard` | Repository hygiene check (junk / oversized / unused files, deps, Vercel config) |
| `npm run verify` | Runs the orienteering verification harness (geodesy vs PROJ, course maths, tile maths, terrain sampling, geometry builders) |
| `npm run check` | `lint` + `guard` + `verify` + `build` — run before every push (CI runs it too) |
| `npm run clean` | Remove build output, caches and untracked junk (`-- --all` also removes `node_modules`, `-- --dry-run` only lists) |

## Deployment (Vercel) & slimming guards / 部署與瘦身防呆

- **`vercel.json`** pins the Vite build (`npm run build` → `dist/`) — only `dist/` is served. Hashed files in `/assets/` are cached for a year (`immutable`), and vendor code (React / three.js / Leaflet) is split into separate chunks, so a deploy that only changes app code makes returning visitors re-download ~50 kB instead of the whole ~1.4 MB bundle.
- **`.vercelignore`** keeps `.git`, `node_modules`, local builds, logs, backups (`*.bak *.tmp *.old`…), test `uploads/`, docs and screenshots out of Vercel.
- **Ignored Build Step** (`scripts/vercel-ignore-build.mjs`): pushes that only touch docs (`*.md`, `docs/`, `.github/`) don't trigger a new build. Anything uncertain always builds; set `FORCE_BUILD=1` to force. Requires *Automatically expose System Environment Variables* (on by default).
- **`scripts/slim-guard.mjs`** (防呆) fails `npm run check`, CI and the Vercel build when:
  - backup / temp / log files, `dist/`, `node_modules/` or `uploads/` are committed
  - a file is > 1 MB, a `public/` asset is > 500 kB or not referenced anywhere
  - build-only tools (Vite, TypeScript, `@types/*`, ESLint, Tailwind…) land in `dependencies`
  - `package-lock.json` is out of sync or carries orphan entries
  - `.vercelignore` is missing required entries or would hide build inputs; `vercel.json` points to the wrong output
  - `dist/` exceeds its size budget, or ships source maps / `.d.ts` / junk files

  Budgets live at the top of the script. Emergency escape hatch: `SLIM_GUARD=warn`.

## Credits

- Original map3d project by [cartesiancs](https://github.com/cartesiancs/map3d) (MIT License), created by Hyeong Jun Huh [(GitHub)](https://github.com/DipokalLab)
- Multi-format export & solid-mesh road ideas merged from my `building3d` project
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (Overpass API, Nominatim); elevation data from [Open-Meteo](https://open-meteo.com/) (Copernicus DEM GLO-90) and [OpenTopoData](https://www.opentopodata.org/) (SRTM)
- Orienteering mode built on the data model and conventions of [Scout System · 香港城市定向地圖 (HKMAP)](https://github.com/playerkousas-rgb/HKMAP): the △ ○ ◎ control symbols, HM20C-style UTM grid references (`KK 0794 6642`), the 3.1°W magnetic declination and a course-JSON layout that round-trips between the two apps
- Base map tiles © Hong Kong Special Administrative Region Government, Lands Department (Map API, iB20000-series); the countryside layer © [OpenTopoMap](https://opentopomap.org/) (CC-BY-SA)

## License

MIT License

---

**Copyright © Scout System**
