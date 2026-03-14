# TFT Rolldown App
**Stack:** Vanilla JS ES modules, no build step | **Dirs:** `js/` (scripts), `style/` (CSS)

## Workflow
Work in batches grouped by category. For multi-category requests, state the order upfront before starting. Pause after each batch for approval. Fix reported bugs before proceeding.

---

## Module Map

| File | Role |
|------|------|
| `js/state.js` | Singleton `state` + localStorage helpers |
| `js/tables.js` | Read-only data: pool, traits, shop_odds, xp_to_level (see `js/CLAUDE.md`) |
| `js/logic.js` | Game mechanics: rolls, buys, sells, moves, star-ups |
| `js/effects.js` | Board summons: Ice Tower, Sand Soldiers, Tibbers |
| `js/render.js` | DOM rendering: shop, board, bench, traits, XP bar |
| `js/commands.js` | Command pattern: `dispatch`, undo/redo, event recording |
| `js/round.js` | Append-only event log consumed by grading + post-RD analysis |
| `js/rolldown-state.js` | Mode state machine + `rdmodechange` event |
| `js/timer.js` | Countdown; fills board from bench on expiry |
| `js/main.js` | Entry point: wires modules, sets start guard, kicks off first roll |
| `js/drag.js` | Drag/drop: shop buy, board/bench swap, team-builder placement |
| `js/hotkeys.js` | All keyboard shortcuts |
| `js/hud.js` | Level dropdown, gold input, builder button |
| `js/overlay.js` | Shop overlay (Start/Reset) and pause overlay |
| `js/popup.js` | No-comp popup when board and planner are both empty |
| `js/planner.js` | Team planner modal (max 10 units) |
| `js/planner-filter.js` | Trait filter modal for planner picker |
| `js/team-builder.js` | Freeform unit placement side panel |
| `js/teams.js` | Saved presets: save/load/rename/delete, auto-naming |
| `js/board-generator.js` | Simulate 2-1→4-1 curve, generate realistic board |
| `js/board-strength.js` | EHP×DPS board scoring used by board-generator |
| `js/postrd.js` | Post-RD modal: pentagon chart + score history |
| `js/postrd-analysis.js` | Post-RD analysis tab: board snapshots per roll |
| `js/grading-*.js` | Five grading modules (see Grading section) |

**Dependency rules:**
- `state.js` and `tables.js` are leaf nodes — no imports from other app modules
- `effects.js` exists to break a `logic.js → main.js` circular dep; never inline summons elsewhere
- `render.js` is called by logic/effects/commands — never calls back into them

---

## State

```js
state = {
  gold, level, xp,
  shop: string[5],            // champion names or null
  bench: Array(9),            // null | { name, stars }
  board: { A1..D7 },          // null | { name, stars }
  teamPlan: Set,              // planned champion names
  teamPlanSlots: Array(10),   // ordered slots for planner grid
  targetTeam: Set | null,     // board-gen override
  rolldownHistory: number[],  // scores from completed rolldowns
}
```

**Location format:** `{ type: 'board', key: 'A1' }` | `{ type: 'bench', index: 0 }` | `{ type: 'shop', index: 0 }`

**Board rows:** A = front/tanks, D = back/carries. B and D rows are offset right by half a hex.

---

## Key Invariants

- **Always `dispatch(cmd)`** — never call `buyChamp`, `sellUnit`, `moveUnit` directly from UI code
- **`applyBoardEffects()` after board mutations** — `moveUnit()` calls it internally; `sellUnit()` does not
- **`boardCount()` excludes** Ice Tower and Sand Soldier (summon tokens, not real units)
- **Board cap:** `boardCount() >= state.level` blocks placing a non-board unit onto an empty hex
- **`history.clear()` after** `loadPreset()` and team-builder drops
- **Star-up is recursive** — `checkStarUp()` handles 1★→2★→3★ in a single buy

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

All `calcXxx(events)` → 0–100. Input: `round.getEvents()`.

| Module | Penalty |
|--------|---------|
| `grading-speed.js` | Low APM (+ roll-count bonus) |
| `grading-accuracy.js` | −5 per missed buyable shop unit |
| `grading-discipline.js` | −5 per gold/strength-point above 1.0 |
| `grading-positioning.js` | 6 layout checks (melee front, carry back, adjacency) |
| `grading-flexibility.js` | −15 per missed synergy-tank upgrade |

---

## Board Strength Model

`Σ Tank EHP × Σ DPS`. Strongest tank and carry each get a 5× item multiplier. Trait bonus: ×1.25 per active breakpoint, multiplicative across traits. Full methodology in `models/boardStrengthModel.md`.

### Normalized averages (1-cost 1★ = 1.0)

| Cost | EHP 1★ | EHP 2★ | EHP 3★ | DPS 1★ | DPS 2★ | DPS 3★ |
|------|--------|--------|--------|--------|--------|--------|
| 1 | 1.0 | 1.67 | 2.9 | 1.0 | 1.52 | 2.28 |
| 2 | 1.49 | 2.39 | 4.12 | 1.24 | 1.93 | 3.28 |
| 3 | 1.88 | 3.05 | 5.09 | 1.59 | 2.38 | 4.0 |
| 4 | 2.74 | 4.64 | 14.51 | 2.14 | 3.21 | 10.31 |
| 5 | 1.44 | 2.41 | 5.25 | 1.86 | 2.79 | 10.14 |

4-cost 3★ spikes (EHP: Nasus/Skarner/Taric/Wukong; DPS: Lissandra/Lux/Ziggs) reflect true breakpoint scaling, not model error. 5-cost EHP is below 4-cost because Ornn and Tahm Kench have weak ability-based survivability. Zilean 3★ DPS is a significant underestimate (death-explosion excluded).
