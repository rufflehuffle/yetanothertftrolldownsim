## Module Map

| File | Role |
|------|------|
| `state.js` | Singleton `state` + localStorage helpers |
| `data/` | Read-only game data: pool, traits, shop_odds, xp_to_level — see [`data/CLAUDE.md`](data/CLAUDE.md) |
| `board.js` | **Pure.** `Board` class, constants, queries (`boardCount`, `findEmptyBoardHex`), unit accessors — no app imports |
| `shop.js` | **Pure.** Shop rolling, economy (`doRoll`, `addXp`, `buyXp`) — imports only `tables.js` |
| `units.js` | **Pure.** Champion queries, star-up, buy/sell — imports `tables.js` + `board.js` |
| `movement.js` | **Pure.** `moveUnit`, hovered-slot state — imports only `board.js` |
| `effects.js` | Board summons: Ice Tower, Sand Soldiers, Tibbers — imports `render.js` (computeTraits), `board.js`, `units.js` |
| `render.js` | DOM rendering: shop, board, bench, traits, XP bar |
| `commands.js` | **Orchestrator.** Command pattern, undo/redo — imports `state`, `render`, `audio`, all logic modules |
| `round.js` | Append-only event log consumed by grading + post-RD analysis |
| `rolldown-state.js` | Mode state machine + `rdmodechange` event |
| `timer.js` | Countdown; fills board from bench on expiry |
| `main.js` | Entry point: wires modules, sets start guard, kicks off first roll |
| `drag.js` | Drag/drop: shop buy, board/bench swap, team-builder placement |
| `hotkey-bindings.js` | Rebindable action store — `getKey(id)`, `setKey(id, key)`, `resetBindings()`, `matches(e, id)`; persists to localStorage |
| `hotkeys.js` | All keyboard shortcuts — reads live bindings via `matches()` from `hotkey-bindings.js` |
| `hotkeys-modal.js` | Hotkeys modal — dynamic render, click-to-rebind UX, reset button; opens via options-btn |
| `hud.js` | Level dropdown, gold input, builder button |
| `overlay.js` | Shop overlay (Start/Reset) and pause overlay |
| `popup.js` | No-comp popup when board and planner are both empty |
| `planner.js` | Team planner modal (max 10 units) |
| `planner-filter.js` | Trait filter modal for planner picker |
| `team-builder.js` | Freeform unit placement side panel |
| `teams.js` | Saved presets: save/load/rename/delete, auto-naming |
| `board-generation/` | Board generator; see [`board-generation/CLAUDE.md`](board-generation/CLAUDE.md) |
| `board-strength.js` | EHP×DPS board scoring used by board-generation |
| `postrd/` | Post-RD modal and analysis; see [`postrd/CLAUDE.md`](postrd/CLAUDE.md) |
| `grading/` | Five grading modules; see [`grading/CLAUDE.md`](grading/CLAUDE.md) |

**Dependency rules:**
- `state.js` imports `Board` from `board.js`; `tables.js` has no app imports
- `board.js`, `shop.js`, `units.js`, `movement.js` are **pure** — all functions take `state` as first parameter, no side effects (no render/audio calls). Only import from `tables.js` and each other
- `commands.js` is the **orchestrator** — the only module that wires state + logic + render + audio together
- `effects.js` exists to keep summon logic separate from `units.js`; takes `state` param, caller renders
- **Always `dispatch(cmd)`** — never call logic functions directly from UI code unless outside rolldown mode (e.g. team-builder, planner setup)

---

## State

```js
state = {
  gold, level, xp,
  shop: string[5],            // champion names or null
  bench: Array(9),            // null | { name, stars }
  board: Board,               // Board instance (see Board Class below)
  teamPlan: Set,              // planned champion names
  teamPlanSlots: Array(10),   // ordered slots for planner grid
  targetTeam: Set | null,     // board-gen override
  rolldownHistory: number[],  // scores from completed rolldowns
}
```

**Location format:** `{ type: 'board', key: 'A1' }` | `{ type: 'bench', index: 0 }` | `{ type: 'shop', index: 0 }`

**Board rows:** A = front/tanks, D = back/carries. B and D rows are offset right by half a hex.

---

## Board Class (`board.js`)

`state.board` is a `Board` instance that manages 28 hex slots (A1–A7, B1–B7, C1–C7, D1–D7). Each slot holds `null` or `{ name, stars }`. Slots are stored internally in `_slots` — never access `_slots` directly from outside `board.js`.

### Slot access

```js
board.get('A1')              // → null | { name, stars }
board.set('A1', { name: 'Lux', stars: 1 })
board.set('A1', null)        // clear a single slot
```

### Iteration

```js
board.keys()                 // → ['D1', 'D2', ..., 'A7']  (string[])
board.values()               // → [null, { name, stars }, ...]  (array)
board.entries()              // → [['D1', null], ['D2', { name, stars }], ...]
```

These return plain arrays, so `.filter()`, `.map()`, `.some()`, `.every()` all work directly.

### Snapshot and restore

```js
const snap = board.snapshot()     // → plain { A1: null, A2: { ... }, ... } (deep copy)
board.restore(snap)               // load from a plain object snapshot (deep copy in)
board.clear()                     // null all 28 slots
```

`snapshot()` returns a plain object suitable for JSON serialization, undo history, and passing to subsystems (grading, postrd) that expect `board[key]` / `Object.values(board)`.

### Shop-related methods

```js
board.getThreeStarredChampions(state.bench)   // → Set<string> of 3-starred champion names
board.countOwnedCopies(state.bench)           // → { champName: copyCount, ... }
```

Both scan bench + board. Copy counts: 1-star = 1, 2-star = 3, 3-star = 9.

### Construction

```js
new Board()              // empty board (all slots null) — used by state.js
Board.from(plainObj)     // create Board from a plain { A1: ..., D7: ... } object
```

`Board.from()` is used when receiving plain board objects from external sources (board generator, localStorage).

### Boundary rules

| Context | Board form | How to convert |
|---------|-----------|----------------|
| Live game state (`state.board`) | `Board` instance | — |
| Undo snapshots (`commands.js`) | Plain object | `board.snapshot()` to save, `board.restore(snap)` to load |
| Round event log (`round.js`) | Plain object | `board.snapshot()` |
| Saved presets (`teams.js`) | Plain object | `board.snapshot()` to save, `board.restore(obj)` to load |
| Board generator results | Plain object | `Board.from(result.board)` |
| Grading / postrd subsystems | Plain object | Always pass `board.snapshot()` at the boundary |

**Key rule:** grading and postrd modules never receive a `Board` instance. Always convert to a plain object with `snapshot()` before passing to those subsystems.

---

## Key Invariants

- **Always `dispatch(cmd)`** — never call `buyChamp`, `sellUnit`, `moveUnit` directly from UI code
- **Logic functions are pure** — take `state` as first param, return success/failure. Caller handles `render()`, `playSound()`, `applyBoardEffects(state)`
- **`applyBoardEffects(state)` after board mutations** — called by commands after `moveUnit`/`sellUnit`; caller must also call `render()`
- **`boardCount(state)` excludes** Ice Tower and Sand Soldier (summon tokens, not real units)
- **Board cap:** `boardCount(state) >= state.level` blocks placing a non-board unit onto an empty hex
- **`history.clear()` after** `loadPreset()` and team-builder drops
- **Star-up is recursive** — `checkStarUp(state, champName)` handles 1★→2★→3★ in a single buy
- **Use Board API for `state.board`** — `.get(key)` / `.set(key, unit)` for slot access, `.values()` / `.entries()` / `.keys()` for iteration. Never use bracket access (`state.board[key]`) or `Object.values(state.board)`.
- **Snapshot at subsystem boundaries** — pass `state.board.snapshot()` (not the Board instance) to grading, postrd, serialization, and undo history

---

## Mode State Machine

```
planning ──► round ──► paused
    ▲           │         │
    └── roundEnd ◄─────────┘
planning ──► freeroll ──► planning | roundEnd
```

Body CSS: `rd-planning`, `rd-round`, `rd-paused`, `rd-roundEnd`, `rd-freeroll`
Event: `rdmodechange` `{ detail: { from, to } }`

---

## Effects (`effects.js`)

| Condition | Effect |
|-----------|--------|
| Freljord ≥3 on board | Summon Ice Tower at B2 |
| Azir on board | Summon 2× Sand Soldiers at A1, A2 |
| Annie on board | Summon Tibbers on bench[0] |

`applyBoardEffects()` always ends with `render()`. All summons are removed when their condition no longer holds.

---

## Grading

See [`grading/CLAUDE.md`](grading/CLAUDE.md) for full grading module documentation.

---

## data/ Reference

See [`data/CLAUDE.md`](data/CLAUDE.md) for schemas, URL patterns, and read guidance.
