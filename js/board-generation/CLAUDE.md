## Board Generation — Module Map

| File | Role |
|------|------|
| `constants.js` | Role sets (`TANK_CLASS`, `FRONTLINE_ROLES`, `BACKLINE_ROLES`, `TWO_RANGE_UNITS`), `SHOP_SEQUENCE`, `SECONDARY_GOLD_FLOOR` |
| `helpers.js` | `localActiveBreakpoint`, `weightedRandom`, `localSellValue`, `buildTraitCounts` |
| `shop-sim.js` | `simulateShop` — weighted pool draw for one 5-slot shop at a given level |
| `carry-tank.js` | `getMainCarryAndTank` (prefers 4-cost), `getFast9CarryAndTank` (prefers 5-cost) — infer best carry and tank from the planned comp |
| `detect-reroll.js` | `is1CostReroll`, `is2CostReroll`, `is3CostReroll`, `isFast9` — comp detection; `get1CostCarryAndTank`, `get2CostCarryAndTank`, `get3CostCarryAndTank` — cost-tier carry/tank selection; `detectArchetype(targetNames)` — unified archetype resolver returning one of `ARCHETYPES`; `ARCHETYPES`, `ARCHETYPE_LABEL`, `ARCHETYPE_ICON` — display metadata used by UI. **⚠ Note:** `is1CostReroll`, `is3CostReroll`, and `isFast9` heuristics are AI-assisted first drafts — validate against real comps before relying on them. |
| `positioning.js` | `buildSpread`, `placeBoardUnits` — hex layout logic |
| `generator.js` | `generateBoard(teamPlan, override?)` router + `generate41Board` (Fast 8); re-exports `buildTraitCounts`. Pass `override` (one of `ARCHETYPES`) to bypass auto-detection. |
| `reroll-generator.js` | `generate32Board` — 2-cost reroll (Lv.5, 100g at 3-2) |
| `reroll-generator-1cost.js` | `generate31Board` — 1-cost reroll (Lv.4, 60g at 3-1) |
| `reroll-generator-3cost.js` | `generate51Board` — 3-cost reroll (Lv.7, 80g at 5-1) |
| `fast9-generator.js` | `generate52Board` — Fast 9 (Lv.8, 150g at 5-2) |
| `../board-strength.js` | `getBestBoard`, `AVG_EHP`, `AVG_DPS` — EHP×DPS scoring consumed by generator files |
| `../board-generator.js` | Re-export shim so existing importers (`planner.js`, `teams.js`) need no changes |

---

## Algorithm Overview (`generate41Board`)

**Inputs:** `teamPlan` (Set of champion names)

**Budget:** Lv.7, 140g at 4-1. Standard curve: `[2,3,3,4,4,4,5,5,5,5,6,6,6,7,7,7]`.

**Steps per attempt (up to 1000 attempts, keep best 5):**
1. **Shop simulation** (`shop-sim.js`) — draw 16 shops weighted by pool odds; buy priority targets freely, secondary targets only if gold ≥ `SECONDARY_GOLD_FLOOR` (20g).
2. **Guarantees** — one free copy for originally-locked units (cost ≤ 4); extra 1-cost copies for planner 1-costs (one per 1-costers + 2 random extras).
3. **Cap at 3 copies** — sell excess copies at cost (1★ price); then star-up: 3 copies → 1× 2★ unit.
4. **Dedup** — one slot per champion name; overflow goes to extra bench.
5. **Carry / tank selection** — `bestTank` = highest AVG_EHP Tank-role unit; `bestCarry` = highest AVG_DPS unit matching main carry's role + damageType + comp traits. Attempt is rejected if `mainCarry` exists but no matching carry was acquired.
6. **Board fill** (`../board-strength.js`) — `getBestBoard` fills remaining 5 slots by trait-weighted EHP×DPS score.
7. **Scoring** — reject boards where any unit has no active trait breakpoint; score = planner coverage + carry/tank trait bonuses + active trait count.
8. **Placement** (`positioning.js`) — assigns hex keys; carry to D-corner, tanks to A-row, melee carries to A-corner.
9. **Sell overflow** — non-planner bench units sold; total trimmed to ≤ 15 (board + bench) to leave one spare bench slot.
10. **XP buy** — spend leftover gold on XP (4g/4XP) while buying would leave gold ≥ 50 and XP has not yet reached 58.

**Output:** `{ board, bench, gold, xp, level: 7 }` or `null` if no valid board found.

---

## Buy Targets

- **Priority** — all comp units (from `teamPlan`); always bought when affordable.
- **Secondary** — any frontline-role unit OR any unit sharing a trait with the comp; skipped when gold < `SECONDARY_GOLD_FLOOR`.

---

## Scoring Formula

```
totalScore = plannerScore + carryTraitScore + tankTraitScore + activeTraitCount
```

- `plannerScore`: +(6 − cost) per planner unit on board; −(6 − cost) if on bench; +3 bonus for main carry / main tank on board
- `carryTraitScore`: +2 per active-breakpoint trait of the main carry (if on board)
- `tankTraitScore`: +2 per active-breakpoint trait of the main tank (if on board)
- `activeTraitCount`: +1 per distinct trait at an active breakpoint across the whole board

Boards where any unit has zero active traits are rejected outright.

---

## Positioning Rules (`placeBoardUnits`)

Board layout — A = front row, D = back row; B and D rows offset right by half a hex:

```
A1  A2  A3  A4  A5  A6  A7  ← frontline
  B1  B2  B3  B4  B5  B6  B7
C1  C2  C3  C4  C5  C6  C7
  D1  D2  D3  D4  D5  D6  D7  ← backline
```

- **Backline carry** → random D1 or D7; remaining backline cluster on the same side (D3/D2/D4… or D5/D6/D4…).
- **Melee carry** → random A1 or A7 (mirrors backline carry's side when present); frontline fills inward with alternating tank/melee.
- **Frontline (ranged or 2-range main carry)** → melee carries fill A1/A3/A5/A7 (or A7/A5/A3/A1) on carry's side (stronger → weaker); tanks fill A2/A4/A6 (or A6/A4/A2).
- **No carry reference** → frontline spread evenly via `buildSpread`; tank placed at centre (odd count → A4) or nearest centre spread slot (even count).
- **2-range units** (Graves, Gwen, Fiddlesticks, Bel'Veth) → always B1 or B7; excluded from A-row:
  - They **are** the main carry → same side as the D-row carry (or random if no backline carry).
  - Main carry is **melee** → same B-corner as the melee carry (A1 → B1, A7 → B7).
  - Main carry is **ranged** → same B-corner as the D-row carry (D1 → B1, D7 → B7).
  - Second 2-range unit → B2 or B6 (adjacent on the same side, not opposite corner).
- **Overflow / unknown roles** → middle rows B/C (C4, B4, C3, B3, …), then any free hex.

### Known Bug
`placeBoardUnits` line 171: when `frontlineCarryCol` is set but `mainFrontlineTank` is null (all frontliners are Fighters/Assassins), `assign('A2'|'A6', null)` is called, wasting one A-row slot. Fix: guard with `if (mainFrontlineTank)` before assigning the anchor.
