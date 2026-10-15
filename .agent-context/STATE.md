# Phase 4 plan and review

Baseline: c708d4eb742a3587b155b808a4bb5fbde6763c87, main, clean; origin https://github.com/kaijiHou/metro.git. User request: C:/Users/13772/.codex/attachments/463215de-dc5d-445d-9ce2-015525946328/已粘贴的文本.txt.

Reviewed App, MapCanvas lifecycle/handlers/sources/DOM markers; CitySearch and CityNetworkPanel openCity; transit/catalog parsing; MetroProject v2; MetroStore persistence/history/scenarios; ProjectPanel import/export; styles, CI, architecture/provenance docs. Existing map movement only saves view; presentation hides marker DOM and blocks clicks, own project still draws. CitySearch explicit city results currently switch project via CityNetworkPanel; never connect viewport loading to this path.

## Design and impact
1. Dedicated read-only viewport loader, max 4 concurrent and 12 cache projects, generation/abort, city bounds intersection, ~250ms moveend debounce. GeoJSON sources for catalog/network/stations separate from editor. Low zoom city dots. Current project city excluded from background; browse own current project read-only. Project unchanged by panning. Return-current-city uses catalog target only.
2. Station selection/detail isolated from editor. OSM query on demand; stop_area relation association by matching station names (and proximity only as bounded candidate filter), not assign arbitrary nearby entrances. Stable OSM IDs; distinguish probable vs verified. No reliable match => explicit empty state. Timeout, cache, serial rate limits, retry, race cancellation. Source/layers exits isolated. UI import path for independently validated official/user records.
3. Top navigation transit/travel, same map technology and reusable base map lifecycle; keep current editor mounted or shared map, no duplicate full map business. Footprints isolated Dexie DB (not MetroProject/localStorage). Boundaries only licensed city-level geometries with auditable code mappings; no subway-catalog-as-all-cities trick.
4. City photos local Blob+thumbnail, URL lifecycle, transactions, visit state independent, cover cleanup, quotas/errors. JSZip backup validation/path/size/count/atomic import merge/replace. Public default photos only with explicit license metadata; genuine city placeholders otherwise.
5. GPS future roadmap document only.
6. npm ci/lint/test/build/audit, real E2E, snapshot counts 5 cities, docs, commit+push main, green CI. Never assert an unrun test passed.

## Data research
geoBoundaries gbOpen CHN ADM2 API is NOT prefecture level: 2391 units, 2017, PDDL v1.0, source National Administration of Surveying Mapping and Geoinformation / Revolutionary GIS. Must inspect/aggregate with prov/pref code mapping or select another licensed source; never call these city-level unexamined.
Dexie registry latest 4.4.6 Apache-2.0. JSZip registry latest 3.10.2 MIT OR GPL-3.0-or-later; choose MIT. Need verify package/audit on install. No new dependencies installed yet.

## UI design
Preserve current teal (#087b8c), ink (#172b3c), pale map gray (#edf2f5); visited cities jade (#238673), wishlist amber (#c59436). Segoe UI/Microsoft YaHei display/body; numbers tabular. Signature: city silhouette-filled footprint atlas + personal photo strip, quiet two-tab navigation. Reuse controls and panels, mobile drawer stacking and keyboard focus.

## State and next actions
No business code changed yet. Review/plan phase complete. First implement and verify viewport roaming + station exits, then city boundary/photos/ZIP. Need examine CHN ADM2 property schema and available higher-level mapping. Full user requirements include fallback: at minimum steps 2+3 must be fully completed, unfinished footprint/backup explicitly NOT COMPLETE; continue toward full scope if feasible.


## Implemented and verified first delivery (2026-10-15)

Completed viewport roaming and read-only exits only, using user-explicit minimum delivery fallback. Full travel scope NOT COMPLETE: boundary gazetteer code mapping and Taiwan province-as-city issue remain, photos/Dexie/ZIP absent, no placeholder travel nav. docs/TRAVEL_FOOTPRINT.md records research and constraints. No new dependencies or changes to public/transit. Root and /metro/ builds verified. Real Overpass request returned504; UI fixtures do not prove live coverage.

Files: src/services/{browseNetworkLoader,mapBrowseLayers,exitInfo}.ts; src/store/viewStore.ts; src/utils/{viewportCities,browseGeojson}.ts; StationDetailDrawer; MapCanvas/App/CityNetworkPanel/CitySearch/ProjectPanel; docs navigation/exit/travel/data/architecture/readme/testing. Sources separate, cache12/concurrency4/debounce250ms; visible count not capped at cache; antimeridian repeated worlds; browse removes DOM markers; pending planning city request canceled on browse. Exit rate1.5s/cache24h100/force retry/abort/import generation checks. Cache includes city/id/name/coordinates. UI buttons consistent, checkbox sizing/mobile overlap corrected, toast does not cover nav.

94 unit tests, lint0warnings, Node24.19.0 npmci successful (existing eslint9.36 deprecation warning), audit0vulnerabilities, root+subpath builds success (known large bundle warning). Phase4 real Chrome isolated E2E23 + error/mobile4 + production /metro/ smoke passed. Default Node20.12 caused engine warnings; initial npmci failedEPERM while Vite running, stopped own server, reinstalled successfully using bundled localNode24. CI changed node24. Dev server restarted127.0.0.1:5173; preview5174 /metro/ for smoke. Regression snapshotJSON identical baseline for Wuhan13/289 Changsha7/151 Beijing27/410 Shanghai24/418 Guangzhou23/332.

Validation scripts and machine-readable result JSON are tracked; png/log/raw candidate boundary are ignored. No personal photos. Next: commit/pushmain, inspect Actions corresponding HEAD; final report explicitly marks first delivery and missing scope. Do not start GPS implementation.
