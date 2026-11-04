# Course editing and backup contract

As built 2026-11-03. This closes the previously documented mismatch between manual editing, JSON backup generation and strict reimport. It does not introduce a backend or guarantee physical-device performance at the limits.

## One bounded course model

`COURSE_LIMITS` in `src/utils/course.ts` is authoritative:

- **1,000,000 UTF-8 bytes**, including the JSON backup envelope, version, ISO timestamp and course. This is decimal 1 MB, not 1 MiB and not JavaScript string length.
- **2,000 total points**, including start and finish. Moving an existing start/finish at the count limit is still allowed.
- **4,000 UTF-16 code units per text field**, including IDs and course metadata. This matches JavaScript string length; many emoji count as two units. A CJK character can be one UTF-16 unit but three UTF-8 bytes. JSON escapes also consume output bytes.
- Finite numeric coordinates within latitude ±90 / longitude ±180, finite scores, supported modes/kinds, nonempty unique control IDs and valid string fields. The map/share area has its separate ±85 latitude contract.

The canonical editor/export validator is strict: it does not coerce numbers into text or discard unknown fields from a manual candidate. Legacy JSON import keeps its existing normalization of supported wrappers/missing fields. **After normalization, import also validates the complete backup budget**, since generated IDs/default fields can make a small input too large to back up. Unsupported extras in legacy files are not a general-purpose arbitrary JSON storage feature.

## Reject before changing state

Normal `setName`, point add/update/move, replace, undo and redo paths validate the candidate before changing the course, selected point, history or durable storage. Failure changes only the visible `courseError` feedback, with a dismiss action. It does not silently trim text, remove controls or create an undo entry for a failed change. Deleting/shrinking a valid course frees capacity. Successful edits clear the warning.

The front name input no longer has an inconsistent 80-character HTML cap. Both views rely on the same store boundary and retain the previous value after rejecting an oversized paste. Control-editor fields use border-box sizing and may shrink within flex rows. If a newly visible warning changes the header height, the focused label/input is scrolled fully into the body viewport rather than being clipped underneath it.

This is an application-entry-point contract, not security isolation from users deliberately mutating Zustand state through devtools. Safe export nevertheless validates again and produces no JSON download if invalid external state has bypassed the editing boundary. Both UI JSON download paths use that guarded action; the raw unreadable-draft recovery download intentionally remains byte-for-byte raw text.

## Backups must preserve data, not formatting

`courseToJson` validates schema, then attempts indented output. If indentation alone exceeds the byte budget, it emits compact JSON; if compact output also exceeds the limit, it fails. No control, note or character is dropped to fit. Date strings have their ordinary 24-character ISO representation in current tests.

Explicit blank control codes remain blank after reimport. Missing legacy codes are auto-numbered. Empty optional meeting/cutoff/contact strings remain empty instead of disappearing. Undefined optional fields are naturally omitted by JSON; property insertion order is not data. Private notes remain in backups, while new player links still omit them.

Own `map3d-orienteering` version-1 backups support empty courses. Generic empty input still rejects unless the internal persisted-draft reader explicitly permits it. A damaged/over-budget legacy persisted draft remains protected by the original-text recovery workflow; updating the app never silently truncates it to obtain an editable course.

## Evidence

`npm run verify` now passes **325** checks, adding 44 in `scripts/verify-course-budget.ts`:

- Exact 1,000,000 and 1,000,001 UTF-8 byte fixtures, independently measured with a complete envelope.
- Indented/compact behavior, normalization growth, 2,000/2,001 points, 4,000/4,001 code units, CJK/emoji/JSON escaping.
- Full field preservation, blank codes/metadata, invalid schema/coordinates/scores/IDs and safe export failure.
- Rejected edits leave selection, history, course and localStorage unchanged, including **no additional storage writes**.
- Valid deletion, existing-start movement, undo/redo and exact-limit restoration remain usable.

`scripts/verify-course-budget-ui.mjs` adds 15 checks to the **128-check** isolated Chromium suite at 390/768/1440 × 900. It uses actual file inputs, name/clue editing, real JSON downloads and reimports. The exact-byte browser fixture has 80 total points; all private fields are deeply compared, not just counted. Focused labels/inputs are checked against the scroll viewport and editor bounds and hit-tested with `elementFromPoint`. This is not a 2,000-point physical-phone performance result.

Final screenshots (33 total, mocked network): `/home/user/artifacts/map3d-v0.1.0-budgets/`, including `{course-limit-front,course-limit-panel}-{390,768,1440}.png`. Actual image review led to the header/focus and input-box fixes above.

Subsequent work implements cooperative Web Locks/conflict recovery and fixes a reproduced Leaflet zoom teardown path; see [draft concurrency](draft-concurrency.md). Current superset: 352 unit / 161 Chromium checks. No-lock parallel editing, non-cooperating writers, physical-device/other-browser coverage, development dependency advisories and live/provider/deployment gaps remain explicit in [STATUS.md](STATUS.md).
