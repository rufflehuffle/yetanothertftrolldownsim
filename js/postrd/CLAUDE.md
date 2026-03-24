## Post-RD Modal & Analysis

Opened after every completed rolldown. Two tabs: **Performance** (pentagon chart, score history) and **Analysis** (board snapshot replay, rolldown review).

---

## Module Map

| File | Role |
|------|------|
| `postrd.js` | Modal shell: open/close, pentagon chart, score history, entry point |
| `analysis.js` | Public API: `initAnalysis`, re-exports `goToSnapshot` |
| `review.js` | Navigation state, `renderSnap`, rolldown review panel, arrow-key nav |
| `renderers.js` | Stateless DOM writers: board, bench, shop, traits, speed stats |
| `html-builders.js` | HTML string builders for hex, bench, shop, trait elements |
| `snapshots.js` | `buildSnapshots` — event log to snapshot array |
| `animation.js` | FLIP move ghosts + responsive hex sizing |
| `helpers.js` | Shared utilities: `scoreToGrade`, star/cost/trait colors, champion lookups |
| `mistakes.js` | Mistake builders per grading category (shared by review + overview) |
| `overview.js` | Score Breakdown tab (not yet wired into the modal) |

---

## Dependency Graph

```
postrd.js  (entry — loaded by index.html)
  ├─ analysis.js   (public API)
  │    ├─ snapshots.js
  │    ├─ animation.js
  │    ├─ renderers.js
  │    └─ review.js
  │         ├─ renderers.js
  │         ├─ animation.js
  │         ├─ mistakes.js
  │         └─ helpers.js
  └─ helpers.js
```

- `helpers.js` is a leaf — no imports from other postrd modules.
- `mistakes.js` imports only from `../grading/*.js` — no postrd cross-deps.
- `review.js` owns all mutable navigation state; other modules access it via exported getters/setters.

---

## Key Data Structures

### Snapshot

Built by `snapshots.js` from the round event log. Each snapshot captures state at a meaningful point:

```js
{
  label: 'Start' | 'Roll N' | 'End',
  board: { A1..D7 },       // same shape as state.board
  bench: Array(9),
  shop: string[5],
  shopBought: boolean[5],   // true for slots the player purchased
  gold: number,
  level: number,
}
```

### Mistake

Returned by builders in `mistakes.js`. Each mistake links to a snapshot for navigation:

```js
{
  text: string,              // display text, e.g. "[Accuracy] Skipped Lux (3g) in shop"
  snapshotLabel: string|null, // "Roll 3", "End", or null (non-navigable)
  highlightType: 'speed'|'discipline'|'accuracy'|'positioning'|'flexibility',
  champName?: string,        // for accuracy/flexibility highlights
  unitNames?: string[],      // for discipline highlights
  isBonus?: boolean,         // positive item (not a mistake)
}
```

---

## Navigation State (review.js)

All mutable state for the analysis tab lives in `review.js` as module-level variables:

| Variable | Type | Purpose |
|----------|------|---------|
| `_snapshots` | `Snapshot[]` | All snapshots for the current round |
| `_current` | `number` | Index of the currently displayed snapshot |
| `_reviewMode` | `boolean` | `true` when the log screen is showing |
| `_allMoments` | `array` | `[startSentinel, ...mistakes, endSentinel]` for PREV/NEXT nav |
| `_reviewMistakeIdx` | `number` | Index into `_allMoments` (-1 = none active) |
| `_highlightHexes` | `Map|null` | Board keys to highlight on current snapshot |
| `_highlightShopSlots` | `Set|null` | Shop indices to highlight on current snapshot |
| `_cancelAnimation` | `fn|null` | Cancels in-flight fast-forward animation |

External modules use exported getters/setters (`setSnapshots`, `setCurrent`, `setReviewMode`, `cancelPendingAnim`).

---

## Grade Scale (helpers.js)

`scoreToGrade(0–100)` maps to: D- D D+ C- C C+ B- B B+ A- A A+ S- S S+

Thresholds: 6 13 20 26 33 40 46 53 60 66 73 80 87 94

---

## Review Panel Flow

```
[Overview screen]          [Log screen]
  Overall grade      ←BACK    ROUND group (speed items)
  Per-metric grades  START→   Roll N groups (navigable mistakes)
                              End group (positioning)
                              ← PREV | NEXT →
```

- **START REVIEW** switches from overview to log, sets `_reviewMode = true`, rewinds to snapshot 0.
- **PREV/NEXT** step through `_allMoments` (sentinels at Start/End bookend the mistake list).
- Clicking a mistake in the log calls `activateMistake(idx)` which animates through intermediate snapshots via FLIP ghosts.
- Arrow keys navigate snapshots in normal mode, mistakes in review mode.
