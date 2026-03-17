## Module Map

| File | Role |
|------|------|
| `state.js` | Singleton `state` + localStorage helpers |
| `tables.js` | Read-only data: pool, traits, shop_odds, xp_to_level (see tables.js Reference below) |
| `logic.js` | Game mechanics: rolls, buys, sells, moves, star-ups |
| `effects.js` | Board summons: Ice Tower, Sand Soldiers, Tibbers |
| `render.js` | DOM rendering: shop, board, bench, traits, XP bar |
| `commands.js` | Command pattern: `dispatch`, undo/redo, event recording |
| `round.js` | Append-only event log consumed by grading + post-RD analysis |
| `rolldown-state.js` | Mode state machine + `rdmodechange` event |
| `timer.js` | Countdown; fills board from bench on expiry |
| `main.js` | Entry point: wires modules, sets start guard, kicks off first roll |
| `drag.js` | Drag/drop: shop buy, board/bench swap, team-builder placement |
| `hotkeys.js` | All keyboard shortcuts |
| `hud.js` | Level dropdown, gold input, builder button |
| `overlay.js` | Shop overlay (Start/Reset) and pause overlay |
| `popup.js` | No-comp popup when board and planner are both empty |
| `planner.js` | Team planner modal (max 10 units) |
| `planner-filter.js` | Trait filter modal for planner picker |
| `team-builder.js` | Freeform unit placement side panel |
| `teams.js` | Saved presets: save/load/rename/delete, auto-naming |
| `board-generator.js` | Re-export shim → `board-generation/generator.js`; see [`board-generation/CLAUDE.md`](board-generation/CLAUDE.md) |
| `board-strength.js` | EHP×DPS board scoring used by board-generation |
| `postrd.js` | Post-RD modal: pentagon chart + score history |
| `postrd-analysis.js` | Post-RD analysis tab: board snapshots per roll |
| `grading-*.js` | Five grading modules (see Grading section below) |

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

## tables.js Reference

File: `js/tables.js` — 1303 lines. Use `offset`/`limit` to avoid loading the full 60 KB.

### Line Ranges
| Object        | Lines     | Description                   |
|---------------|-----------|-------------------------------|
| `pool`        | 1–1231    | 103 champion objects          |
| `traits`      | 1232–1281 | 50+ trait objects             |
| `shop_odds`   | 1283–1293 | Level 2–10 shop probabilities |
| `xp_to_level` | 1295–1303 | XP required per level         |

### Champion Schema (pool)
Each of 103 champions follows this exact structure — do not read the file to discover fields:
```js
{
  unlocked: bool,
  cost: 1|2|3|4|5,
  name: string,
  teamPlannerCode: number,   // ~range 1–840
  copies_in_pool: number,    // usually 30
  synergies: string[],       // trait names
  tile: string,              // ddragon CDN URL (see pattern)
  icon: string,              // metatft CDN URL (see pattern)
  role: string,              // e.g. Caster, Tank, Assassin, Marksman
  damageType: 'Magic'|'Attack'
}
```
URL patterns (never read file just for these):
- tile: `https://ddragon.leagueoflegends.com/cdn/16.4.1/img/tft-champion/TFT16_{Name}_splash_centered_0.TFT_Set16.png`
- icon: `https://cdn.metatft.com/file/metatft/champions/tft16_{name_lowercase}.png`

### Trait Schema (traits)
```js
{ icon: string, breakpoints: number[], breakpoint_tiers: string[] }
```

### Read Guidance
- Find a champion: `Grep pattern="ChampionName" path="js/tables.js"`
- Read only traits: `Read js/tables.js offset=1232 limit=50`
- Read shop_odds / xp_to_level: `Read js/tables.js offset=1283`
- Full read only when adding/removing champions or doing bulk edits
