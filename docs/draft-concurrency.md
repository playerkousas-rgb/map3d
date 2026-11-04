# Draft concurrency and map lifecycle contract

As built 2026-11-03. Browser-only, no accounts/backend/proxy, no new runtime dependency. This extends the existing damaged-draft recovery, private-player snapshot and [bounded backup](course-budgets.md) contracts.

## Cooperative cross-tab writes

The storage key is still `map3d.orienteering.v1`; an optional root `revision` nonce makes each accepted save distinguishable even when course fields match. Legacy records without a revision are accepted. The store keeps the **exact raw value it last read/wrote** as its baseline, rather than trusting timestamps or the UI name.

On browsers with Web Locks:

1. Capture the private course/scene/area and mark it pending/dirty. A waiting lock is not a completed save. JSON backup remains available while waiting.
2. Request the origin-scoped exclusive lock named after the storage key. A newer edit aborts an older waiting request to avoid retaining unbounded queued payloads.
3. Inside the lock, re-read localStorage and compare against the baseline. A different value, including deletion, pauses autosave and preserves this page's RAM data; it never silently replaces the other version.
4. On success, advance the baseline and clear dirty/pending status only after `setItem` returns successfully. This is browser acceptance, not a permanent-backup guarantee.

`storage` (including clear), focus, visibility restoration and pageshow trigger checks. Event payloads are not trusted as the current version: the app reads the current storage value. No external course is auto-loaded over an active editor or player snapshot.

**Important boundary:** Web Locks are cooperative and same-origin. Other app versions, devtools or unrelated code that writes localStorage without this lock can still race. The app cannot make localStorage an atomic compare-and-swap against non-cooperating writers. With no Web Locks API it falls back to an immediate compare-before-write, displays a **single-editing-tab warning**, and does not claim atomic cross-tab protection. Web Locks do not provide cross-device/host synchronization.

## Explicit resolution, not automatic merge

A conflict banner provides:

- The current page's normal course JSON backup, retaining private notes.
- The saved version's exact original raw data (which may be unreadable or include private data).
- **Load saved version…** — confirmation required; re-check the observed version before replacing RAM. A new version requires a new choice. Loading readable data restores scene/area, clears stale undo/redo and returns to a correctly fitted selection screen; loading a confirmed deletion produces an empty selection. Unreadable saved data cannot discard the local draft.
- **Replace saved version with this page…** — confirmation required; the exact version approved by the user is checked again **inside the write lock**. An intervening write invalidates that confirmation instead of being overwritten.

Permission/quota failures remain explicit and retryable. Retrying a conflicted page cannot silently approve a replacement. No automatic field merge, revision history archive, restore bin, cloud sync or authentication is introduced.

## Pending saves, player privacy and leaving a page

Entering a player link aborts pending private writes and invalidates their request IDs. An async callback never reads a public course and writes it as the planner draft. The private in-memory snapshot returns with an unsaved warning; retry after exit may save it if its baseline is still current. An external change during player viewing is deferred as a conflict without changing the public course or private snapshot.

`beforeunload` warns when the RAM draft is dirty, including a pending write or conflict. This is **best effort only**: browsers may require prior user activation, omit it on mobile, or kill a process without dispatching it. Closing/reloading a page after failed saves can still lose RAM data; always download a backup. A successful localStorage write is not an off-device backup.

## Leaflet 1.9.4 teardown: reproduced and repaired

The new UI stress case reproduced the previous `_leaflet_pos` failure. The actual browser stack was:

`getPosition → _getMapPanePos → _getNewPixelOrigin → _move → _onZoomTransitionEnd`.

Installed `leaflet-src.js` shows that `_animateZoom` starts a 250ms fallback timeout. `remove()` deletes `_mapPane`, while `_onZoomTransitionEnd` can still call `_move` if a CSS zoom animation was active. Auto-restore's `animate:false` alone did **not** cover a user's zoom followed by rapid player exit / keyed map replacement.

The selection map now explicitly uses the supported **`zoomAnimation={false}`** option. Zoom still works immediately, but this map no longer creates that CSS zoom-transition callback. There is no monkeypatch of Leaflet internals, global exception suppression, timeout increase or delayed navigation to hide the race. Automatic fit remains non-animated. This is a deliberate UI motion tradeoff for safe React teardown, not a guarantee against every future Leaflet bug.

## Evidence actually run

- **352 DOM-free checks**, including **27 new** state/lock queue/conflict cases in `scripts/verify-draft-conflicts.ts`. These cover baseline advancement, no write on conflict, deletion, stale confirmations, unreadable external data, unknown initial baseline after permission failure, player isolation, pending dirty state, aborting old requests, lock-time checks and retry.
- **161 real Chromium checks**, adding **33** across 390/768/1440 × 900. `scripts/verify-draft-tabs-ui.mjs` opens **two actual pages in the same browser context** with shared storage and real Web Locks. It tests simultaneous queued writes, pending/current/raw downloads, controlled intervening writes, confirmations/cancellation, scene/map restoration, deletion, corruption, player cancellation, a real cancelled beforeunload prompt and a no-lock page override. Queue ordering is deliberately controlled, not guessed using sleep.
- The lifecycle gate performs **eight actual zoom → player hash → keyed-map-remount cycles at each width (24 total)**, then drains Leaflet's known callback window. It failed with a real stack before the fix and passed after it, with the no-pageerror gate retained.
- Screenshot artifacts: `/home/user/artifacts/map3d-v0.1.0-tabs/` (**36 PNGs**). New `draft-conflict-{390,768,1440}.png` images were opened and inspected; warning text and four recovery actions are readable without the floating bottom action covering them.
- `verify`, `check`, `audit:deps` and diff whitespace checks run locally. Production dependencies: 0 advisories; full graph: 12 moderate / 0 high / 0 critical. No remote CI/deployment, physical-device, Safari/Firefox or live-provider certification.

Current completed/partial/unfinished matrix: [STATUS.md](STATUS.md).
