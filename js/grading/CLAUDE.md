## Grading Modules

All `calcXxx(events)` → 0–100. Input: `round.getEvents()`.

| Module | Penalty |
|--------|---------|
| `speed.js` | Low APM (+ roll-count bonus) |
| `accuracy.js` | −(expectedRolls × 2) per missed buyable shop unit |
| `discipline.js` | −5 per gold/strength-point above 1.0 |
| `positioning.js` | 6 layout checks (melee front, carry back, adjacency) |
| `flexibility.js` | −15 per missed synergy-tank upgrade |
| `helper.js` | Shared pool-probability utilities (no score) |

### speed.js

`calcSpeed(events)` → `(rollsPerSecond / targetRollsPerSecond × 70) + (APM / targetAPM × 30) + rollBonus`. Targets: 1/1.5 r/s, 80 APM. Roll bonus: +5/+10/+20 for ≥10/15/20 rolls. Capped at 100.

### accuracy.js

`calcAccuracy(events)` → penalty per missed unit = `avgShopsForCopies(unit, 1, ...) × 2 / 5` (0 if unit unavailable in pool).
`findMissedUnits(events)` → raw missed-unit array; each entry includes a `weight` field.
Non-planner units only count if they appear on the final board OR share cost with the main carry/tank.

### discipline.js

`calcDiscipline(events)` → penalty per roll: `(gpsp − 1) × multiplier`, summed × 5, subtracted from 100.
- Skip roll if neither the main carry nor main tank has a 2★ copy yet.
- `multiplier = 5` if both carry and tank are 2★; `multiplier = 1` if only one is.

Key exports:
- `avgGoldPerStrengthPoint(board, bench, level, teamPlan)` — gold cost per 1 board strength point gained
- `maxBoardStrength(board, bench)` — optimal strength from best board-sized unit subset
- `avgShopsForCopies` — re-exported from `helper.js`

### positioning.js

`calcPositioning(board)` → layout check penalties.

Penalty schedule:
- −10 per failed boolean check: `mainCarryInCorner`, `strongestMeleeCarryNextToStrongestTank`, `mainTankInFrontOfCornerCarry`
- −5 per misplaced unit: `meleeInBackRow`, `rangedNotInBackRow`, `meleeCarriesNotNextToTank`

### flexibility.js

`calcFlexibility(events)` → −15 per missed alternate tank.

Key exports:
- `findAlternateTanks(shop, board, bench, teamPlan)` — Tank-role shop units that are synergy-fieldable, stronger at 2★, and equal-or-higher cost than the planner tank
- `findMissedAlternateTanks(events)` → alternate tanks that appeared but weren't bought

### helper.js

Shared pool-probability utilities for grading modules.

Key exports:
- `avgShopsForCopies(unitName, copiesNeeded, board, bench, level)` — expected shops to see N more copies of a unit
- `_countOwnedCopies(unitName, board, bench)` — total physical copies across board + bench
- `_totalRemainingByCost(costTier, board, bench)` — remaining pool copies for a cost tier
- `plannerCarryName(teamPlan, board)` — name of the strongest non-Tank in the planner (or board fallback)
- `plannerTankName(teamPlan, board)` — name of the strongest Tank in the planner (or board fallback)
