# Grading

Each metric is scored 0–100. The five scores are displayed as a pentagon chart in the post-RD modal.

---

## Speed

> `js/grading/speed.js` — `calcSpeed(events)`

**Formula:** `(rollsPerSecond / 0.667 × 70) + (APM / 80 × 30) + rollBonus`, capped at 100.

Targets: 1/1.5 ≈ 0.667 rolls/second (roll component weight 70), 80 APM (APM component weight 30).

| Component | Description |
|-----------|-------------|
| `rollsPerSecond / 0.667 × 70` | Rolldown speed score (rolls from first to last roll event) |
| `APM / 80 × 30` | Actions per minute score (buys, sells, moves, rolls — not buyXp) |
| `rollBonus` | +5 for ≥10 rolls, +10 for ≥15 rolls, +20 for ≥20 rolls |

Only the highest roll-volume tier applies. APM counts: buys, sells, moves (non-bench-to-bench), rolls. `buyXp` is excluded.

| Function | Visibility | Signature |
|----------|------------|-----------|
| `_roundDurationMs` | private | `(events)` |
| `_calcApm` | private | `(events)` |
| `calcRolldownSpeed` | export | `(events)` |
| `calcSpeed` | export | `(events)` |

---

## Accuracy

> `js/grading/accuracy.js` — `calcAccuracy(events)`

**Formula:** `max(0, 100 − Σ weight)` where each missed unit's weight = `avgShopsForCopies(unit, 1, ...) × 2 / 5`.

A unit counts as **missed** when all conditions hold at roll time:
1. Appears in the shop after a roll
2. Player had enough gold to afford it (`goldAfter >= cost`)
3. Player already owns a copy (on board, bench, or in teamPlan)
4. Player did not buy it before the next roll
5. If the unit is **not** in the planner: it must also appear on the final board OR share the cost of the main carry or main tank (non-planner units not meeting this qualifier are ignored)
6. The player does not already have a 2★ copy on board or bench

Penalty is weighted by pool scarcity: rarer units (fewer expected shops to find another copy) carry a higher weight. Units unavailable at the current level (`avgShopsForCopies = Infinity`) have weight 0.

| Function | Visibility | Signature |
|----------|------------|-----------|
| `findMissedUnits` | export | `(events)` → `{ rollNumber, champName, cost, goldAvailable, weight }[]` |
| `calcAccuracy` | export | `(events)` |

---

## Discipline

> `js/grading/discipline.js` — `calcDiscipline(events)`

Discipline measures whether each roll was worth the 2 gold it cost, relative to the board's current upgrade potential.

**Formula:** `max(0, 100 − 5 × penalty)` where `penalty = Σ (gpsp − 1) × multiplier` across all rolls.

Per-roll logic:
1. Compute `gpsp = avgGoldPerStrengthPoint(...)` for the roll's board/bench snapshot.
2. If `gpsp ≤ 1` or `gpsp = Infinity`, skip (no penalty).
3. If the player has **no** 2★ copy of their main carry **and** no 2★ copy of their main tank, skip (rolling to hit first key upgrades is not penalised).
4. `basePenalty = gpsp − 1`. `multiplier = 5` if **both** carry and tank are 2★; otherwise `multiplier = 1`.
5. `penalty += basePenalty × multiplier`.

### avgGoldPerStrengthPoint

Expected gold cost to gain 1 board strength point from the current state. Three upgrade paths are evaluated simultaneously per roll:

| Path | Description |
|------|-------------|
| Board 1★ units | Star up to 2★ in place — strength gain stays on board |
| Bench-only 1★ units | Star up to 2★ — may displace the weakest board unit |
| Planner units not yet owned | Buy one 1★ copy — may displace the weakest board unit |

Strength gain per path is simulated via `maxBoardStrength` on the post-change state. Pool probabilities from `shop_odds` are used to estimate expected copies per roll. Result is `2 / (total expected strength gained per roll)`.

### Board strength model (`maxBoardStrength`)

Selects the best board-sized subset of all owned units by `_unitStrength` score, then applies role weights to the top tank and top carry:

| Role | Weight |
|------|--------|
| Strongest Tank | ×8 |
| Strongest non-Tank unit | ×5 |
| All other units | ×1 |

### _unitStrength score table

| Stars | Cost | Score |
|-------|------|-------|
| 2★ | ≥7 | 12 |
| 1★ | ≥7 | 11 |
| 2★ | 5 | 10 |
| 2★ | 4 | 9 |
| 1★ | 5 | 8 |
| 2★ | 3 | 6 |
| 1★ | 4 | 5 |
| 2★ | 2 | 4 |
| 2★ | 1 | 3 |
| 1★ | 3 | 3 |
| 1★ | 2 | 2 |
| 1★ | 1 | 1 |

### Planner role helpers

`_plannerTankName(teamPlan, board)` — strongest Tank-role unit in the planner, falling back to the strongest Tank on the board.

`_plannerCarryName(teamPlan, board)` — strongest non-Tank unit in the planner, falling back to the strongest non-Tank on the board.

| Function | Visibility | Signature |
|----------|------------|-----------|
| `_has2Star` | private | `(unitName, board, bench)` |
| `_plannerTankName` | private | `(teamPlan, board)` |
| `_plannerCarryName` | private | `(teamPlan, board)` |
| `_unitStrength` | private | `(name, stars)` |
| `avgShopsForCopies` | re-export | `(unitName, copiesNeeded, board, bench, level)` — from `helper.js` |
| `maxBoardStrength` | export | `(board, bench)` |
| `avgGoldPerStrengthPoint` | export | `(board, bench, level, teamPlan)` |
| `calcDiscipline` | export | `(events)` |
| `isMissingOneStar` | export | `(unitName, board, bench)` |
| `isRollingWhileMissingMainCarry` | export | `(board, bench, teamPlan)` |
| `isRollingWhileMissingMainTank` | export | `(board, bench, teamPlan)` |
| `avgGoldToTwoStar` | export | `(unitName, board, bench, level)` |
| `avgGoldToTwoStarMainCarry` | export | `(board, bench, level, teamPlan)` |
| `avgGoldToTwoStarMainTank` | export | `(board, bench, level, teamPlan)` |
| `avgGoldToTwoStarAnyTankAtCost` | export | `(cost, board, bench, level)` |

---

## Positioning

> `js/grading/positioning.js` — `calcPositioning(board)`

Evaluated on the final board state at round end.

### Boolean checks (−10 if false)

| Check | Penalty |
|-------|---------|
| Main ranged carry is in D1 or D7 | −10 |
| Strongest melee carry is adjacent to strongest tank | −10 |
| Main tank is in the A-row zone in front of the corner carry | −10 |

### Per-unit checks (−5 per unit)

| Check | Penalty |
|-------|---------|
| Melee carry (Fighter/Assassin) placed in D row | −5 each |
| Ranged carry (Marksman/Caster/Specialist) not in D row | −5 each |
| Melee carry with no adjacent tank | −5 each |

**Formula:** `max(0, 100 − boolPenalty − unitPenalty)`

Expected A-row zones for `mainTankInFrontOfCornerCarry`: D1 carry → A1–A4; D7 carry → A4–A7.

| Function | Visibility | Signature |
|----------|------------|-----------|
| `_adjacentHexes` | private | `(key)` |
| `_unitStrength` | private | `(unit)` |
| `_boardUnits` | private | `(board)` |
| `_strongest` | private | `(units, rolePredicate)` |
| `meleeInBackRow` | export | `(board)` |
| `rangedNotInBackRow` | export | `(board)` |
| `mainCarryInCorner` | export | `(board)` |
| `meleeCarriesNotNextToTank` | export | `(board)` |
| `strongestMeleeCarryNextToStrongestTank` | export | `(board)` |
| `mainTankInFrontOfCornerCarry` | export | `(board)` |
| `calcPositioning` | export | `(board)` |

---

## Flexibility

> `js/grading/flexibility.js` — `calcFlexibility(events)`

Flexibility measures how often the player pivoted to a stronger tank when one appeared in the shop.

**Formula:** `max(0, 100 − 15 × missedCount)`

### Alternate tank criteria

A shop unit qualifies as an alternate tank if all three conditions hold:

| Condition | Description |
|-----------|-------------|
| Tank-role | Unit's role must be `Tank` |
| Synergy-fieldable | Has ≥1 tank synergy trait (Defender, Bruiser, Juggernaut, Warden) whose first breakpoint is reachable when combined with existing board + bench units |
| Stronger at 2★ | `_unitStrength(unit, 2)` strictly exceeds the planner tank's reference strength (actual stars if fielded, otherwise 1★) |
| Equal or higher cost | Unit cost ≥ planner tank cost |

The **planner tank** is the strongest Tank-role unit in the team planner. If a 2★ tank of equal-or-higher cost is already on the board, that unit becomes the reference instead.

| Function | Visibility | Signature |
|----------|------------|-----------|
| `_unitStrength` | private | `(name, stars)` |
| `_plannerTank` | private | `(teamPlan, board)` → `{ name, refStrength }` |
| `_traitCount` | private | `(traitName, board, bench)` |
| `findAlternateTanks` | export | `(shop, board, bench, teamPlan)` |
| `findMissedAlternateTanks` | export | `(events)` |
| `calcFlexibility` | export | `(events)` |

---

## Helper

> `js/grading/helper.js` — shared pool-probability utilities

Stateless helpers for computing shop probabilities from the TFT pool model. Importable by any grading module.

| Function | Visibility | Signature |
|----------|------------|-----------|
| `_countOwnedCopies` | export | `(unitName, board, bench)` |
| `_totalRemainingByCost` | export | `(costTier, board, bench)` |
| `avgShopsForCopies` | export | `(unitName, copiesNeeded, board, bench, level)` |
| `plannerCarryName` | export | `(teamPlan, board)` → strongest non-Tank in planner (board fallback) |
| `plannerTankName` | export | `(teamPlan, board)` → strongest Tank in planner (board fallback) |
