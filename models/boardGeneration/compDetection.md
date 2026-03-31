# Comp Detection

How the board generator identifies which comp archetype (and therefore which generation curve) to use.

**Router:** `js/board-generation/generator.js` — `generateBoard(teamPlan, override?)`

Pass `override` (one of `ARCHETYPES` from `detect-reroll.js`) to bypass auto-detection.
Omit or pass `null` to use the auto-detection logic below.

```
if is1CostReroll  → 'lv5'   → generate31Board  (Lv.4,  60g at 3-1)
if is2CostReroll  → 'lv6'   → generate32Board  (Lv.5, 100g at 3-2)
if is3CostReroll  → 'lv7'   → generate51Board  (Lv.7,  80g at 5-1)
if isFast9        → 'fast9' → generate52Board  (Lv.8, 150g at 5-2)
else (default)    → 'fast8' → generate41Board  (Lv.7, 140g at 4-1)
```

**UI labels** (`detect-reroll.js` — `ARCHETYPE_LABEL`, `ARCHETYPE_ICON`):

| Archetype | Display label | Icon |
|-----------|--------------|------|
| `lv5` | Lv. 5 | `img/reroll.png` |
| `lv6` | Lv. 6 | `img/reroll.png` |
| `lv7` | Lv. 7 | `img/reroll.png` |
| `fast8` | Fast 8 | `img/xp.png` |
| `fast9` | Fast 9 | `img/xp.png` |

The detected archetype is shown inline (icon + label) after the comp name in the planner header and the teams panel list. The planner label is clickable: a dropdown lets the user pin an override (`generationOverride` field on the preset, persisted to localStorage).

---

## Shared Detection Heuristic (Reroll Archetypes)

All cost-reroll checks use the same two-condition test (in `detect-reroll.js`):

1. The comp contains **≥ 3 units** of the target cost tier.
2. Among those, **≥ 2 have full trait saturation** — every one of their synergies hits an active breakpoint in the full comp's trait counts.

Both conditions must be true. Checks are evaluated in priority order (1-cost → 2-cost → 3-cost) so a mixed comp always resolves to its lowest cost reroll.

---

## 1-Cost Reroll

**Detection:** `is1CostReroll` — ≥3 one-cost units, ≥2 fully saturated.

**File:** `js/board-generation/reroll-generator-1cost.js` → `generate31Board`

**Budget:** Lv.4, 60g at 3-1. Shop sequence: `[2,3,3,3,3,3,4,4,4,4]`.

**Pre-seeding:** 3 copies of the main 1-cost carry (free) → stars up to 2★ before shops run.

**Cost filter:** Skips 3-cost+ units during shop simulation to preserve rolling gold.

### Carry / Tank Selection (`detect-reroll.js` → `get1CostCarryAndTank`)

Only 1-cost units are considered. Sorted by **active trait count** (descending, ties broken randomly).

| Role | Rule |
|------|------|
| **Main carry** | 1-cost non-Tank with the most active traits |
| **Main tank** | 1-cost Tank with the most active traits |

---

## 2-Cost Reroll

**Detection:** `is2CostReroll` — ≥3 two-cost units, ≥2 fully saturated.

**File:** `js/board-generation/reroll-generator.js` → `generate32Board`

**Budget:** Lv.5, 100g at 3-2. Shop sequence: `[2,3,3,3,4,4,4,5,5,5,5]`. XP cap: 18 (2 short of Lv.6).

**Pre-seeding:** 1 free copy each of main carry and main tank.

**Cost filter:** Skips 4-cost+ units during shop simulation.

### Carry / Tank Selection (`detect-reroll.js` → `get2CostCarryAndTank`)

Only 2-cost units are considered. Sorted by **active trait count** (descending, ties broken randomly).

| Role | Rule |
|------|------|
| **Main carry** | 2-cost non-Tank with the most active traits |
| **Duo carry** | 2-cost non-Tank with the second-most active traits |
| **Main tank** | 2-cost Tank with the most active traits |
| **Duo tank** | Set only when tied with main tank (same active count) |

---

## 3-Cost Reroll

**Detection:** `is3CostReroll` — ≥3 three-cost units, ≥2 fully saturated.

**File:** `js/board-generation/reroll-generator-3cost.js` → `generate51Board`

**Budget:** Lv.7, 80g at 5-1. Shop sequence: `[2,3,3,3,4,4,4,5,5,5,5,5,6,6,6,6,7×11]` (includes +6 slow-roll shops at 4-2).

**Pre-seeding:** 1 free copy of each 3-cost unit in the comp.

**Cost filter:** Skips 5-cost units during shop simulation.

### Carry / Tank Selection (`detect-reroll.js` → `get3CostCarryAndTank`)

Only 3-cost units are considered. Sorted by **active trait count** (descending, ties broken randomly).

| Role | Rule |
|------|------|
| **Main carry** | 3-cost non-Tank with the most active traits |
| **Main tank** | 3-cost Tank with the most active traits |

---

## Fast 9

**Detection:** `isFast9` — comp contains **≥ 2 five-cost units** (indicating Lv.8 shop odds are needed).

**File:** `js/board-generation/fast9-generator.js` → `generate52Board`

**Budget:** Lv.8, 150g at 5-2. Shop sequence: `[2,3,3,3,4,4,4,5,5,5,5,5,6,6,6,7,7,7,7,8×8]`.

**Pre-seeding:** None.

### Carry / Tank Selection (`carry-tank.js` → `getFast9CarryAndTank`)

| Role | Candidates | Scoring |
|------|-----------|---------|
| **Main carry** | Prefer 5-cost non-Tanks; fall back to all non-Tanks | `traitCount + 3` bonus per active-breakpoint trait |
| **Main tank** | Prefer 5-cost Tanks; fall back to all Tanks | `traitCount` only |

---

## Fast 8 (Default / Fast 4-1)

**Detection:** Fallback — any comp that doesn't match a more specific archetype.

**File:** `js/board-generation/generator.js` → `generate41Board`

**Budget:** Lv.7, 140g at 4-1. Shop sequence: `[2,3,3,4,4,4,5,5,5,5,6,6,6,7,7,7]`. XP cap: 58 (just shy of Lv.8).

### Carry / Tank Selection (`carry-tank.js` → `getMainCarryAndTank`)

| Role | Candidates | Scoring |
|------|-----------|---------|
| **Main carry** | Prefer 4-cost non-Tanks; fall back to all non-Tanks | `traitCount + 3` bonus per active-breakpoint trait |
| **Main tank** | Prefer 4-cost Tanks; fall back to all Tanks | `traitCount` only (no breakpoint bonus) |

Ties broken randomly.

### Board Scoring (shared across all archetypes)

```
totalScore = plannerScore + carryTraitScore + tankTraitScore + activeTraitCount
```

- **plannerScore:** +(6 − cost) per planner unit on board, −(6 − cost) if on bench, +3 bonus for main carry / main tank on board
- **carryTraitScore:** +2 per active-breakpoint trait of the main carry (if on board)
- **tankTraitScore:** +2 per active-breakpoint trait of the main tank (if on board)
- **activeTraitCount:** +1 per distinct trait at an active breakpoint on the board

Boards where any non-planned unit has zero active traits are rejected.
