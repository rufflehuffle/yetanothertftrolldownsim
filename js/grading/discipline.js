// ============================================================
// discipline.js — Discipline Scoring Helpers
// ============================================================

import { pool, shop_odds } from '../tables.js';
import { _countOwnedCopies, _totalRemainingByCost, avgShopsForCopies, plannerCarryName, plannerTankName } from './helper.js';

/** Returns true if a 2★ copy of `unitName` exists on board or bench. */
function _has2Star(unitName, board, bench) {
    for (const unit of Object.values(board)) {
        if (unit?.name === unitName && unit.stars === 2) return true;
    }
    for (const unit of bench) {
        if (unit?.name === unitName && unit.stars === 2) return true;
    }
    return false;
}

export { avgShopsForCopies };

// ── Board-strength weights ─────────────────────────────────────
// The primary tank absorbs ~75% of incoming damage; the primary carry
// deals ~50% of team damage. Their individual strength scores are
// multiplied by these weights to reflect that outsized impact.
const TANK_WEIGHT  = 8;   // strongest Tank-role unit on the board
const CARRY_WEIGHT = 5;   // strongest damage-carry (Marksman or Assassin)
const isCarryRole  = role => role !== 'Tank';

// ── Helpers ───────────────────────────────────────────────────

/** Strength score for a unit at a given star level (mirrors flexibility.js).  */
function _unitStrength(name, stars) {
    const cost = pool[name]?.cost ?? 1;
    if      (stars === 2 && cost >= 7)                                return 12;
    else if (stars === 1 && cost >= 7)                                return 11;
    else if (stars === 2 && cost === 5)                               return 10;
    else if (stars === 2 && cost === 4)                               return  9;
    else if (stars === 1 && cost === 5)                               return  8;
    else if (stars === 2 && cost === 3)                               return  6;
    else if (stars === 1 && cost === 4)                               return  5;
    else if (stars === 2 && cost === 2)                               return  4;
    else if ((stars === 2 && cost === 1) || (stars === 1 && cost === 3)) return 3;
    else if (stars === 1 && cost === 2)                               return  2;
    else                                                              return  1;
}

// ── Function 1 ────────────────────────────────────────────────

/**
 * Maximum possible board strength achievable by optimally choosing which units
 * from the current board and bench to field (board size is inferred from
 * the number of units currently on the board).
 *
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @returns {number} Sum of _unitStrength for the best board-sized subset of all owned units
 */
export function maxBoardStrength(board, bench) {
    const boardUnits = Object.values(board).filter(Boolean);
    const boardSize  = boardUnits.length;
    if (boardSize === 0) return 0;

    const allUnits = [...boardUnits, ...bench.filter(Boolean)];
    allUnits.sort((a, b) => _unitStrength(b.name, b.stars) - _unitStrength(a.name, a.stars));

    const selected = allUnits.slice(0, boardSize);

    // Identify the single strongest tank and carry in the selected lineup.
    // These units receive extra weight to reflect their outsized combat impact.
    let bestTank  = null;
    let bestCarry = null;
    for (const u of selected) {
        const role = pool[u.name]?.role;
        const s    = _unitStrength(u.name, u.stars);
        if (role === 'Tank' &&
            (!bestTank || s > _unitStrength(bestTank.name, bestTank.stars)))  bestTank  = u;
        if (isCarryRole(role) &&
            (!bestCarry || s > _unitStrength(bestCarry.name, bestCarry.stars))) bestCarry = u;
    }

    return selected.reduce((sum, u) => {
        const s      = _unitStrength(u.name, u.stars);
        const weight = u === bestTank ? TANK_WEIGHT : u === bestCarry ? CARRY_WEIGHT : 1;
        return sum + s * weight;
    }, 0);
}

// ── Function 3 ────────────────────────────────────────────────

/**
 * Average gold needed to increase the current board strength by 1 strength point.
 *
 * Each roll simultaneously advances all viable upgrade paths:
 *  • Board 1★ units   — upgrading to 2★ stays on the same hex.
 *  • Bench-only 1★    — upgrading to 2★ may displace the weakest board unit.
 *  • Planner units not yet acquired — buying one copy (1★) may displace
 *    the weakest board unit; copiesNeeded = 1.
 *
 * Strength gain for each path is computed via maxBoardStrength on the
 * simulated post-change state.
 *
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @param {number}                       level    - Current player level (2–10)
 * @param {string[]}                     teamPlan - Champion names from the planner snapshot
 * @returns {number} Gold per 1 board strength point (Infinity if no upgrades are viable)
 */
export function avgGoldPerStrengthPoint(board, bench, level, teamPlan = []) {
    const odds            = shop_odds[Math.min(Math.max(level, 2), 10)];
    const currentStrength = maxBoardStrength(board, bench);

    let totalStrengthPerShop = 0;
    const seen = new Set();

    // Board 1★ units — upgrade stays on board at that hex
    for (const [key, unit] of Object.entries(board)) {
        if (!unit || unit.stars !== 1 || seen.has(unit.name)) continue;
        seen.add(unit.name);

        const newBoard     = { ...board, [key]: { ...unit, stars: 2 } };
        const strengthGain = maxBoardStrength(newBoard, bench) - currentStrength;
        if (strengthGain <= 0) continue;

        const data = pool[unit.name];
        if (!data) continue;

        const owned        = _countOwnedCopies(unit.name, board, bench);
        const copiesNeeded = Math.max(0, 3 - owned);
        if (copiesNeeded === 0) continue;

        const remaining = Math.max(0, data.copies_in_pool - owned);
        if (remaining < copiesNeeded) continue;

        const tierOdds = odds[data.cost] ?? 0;
        if (tierOdds === 0) continue;

        const totalRemaining = _totalRemainingByCost(data.cost, board, bench);
        if (totalRemaining === 0) continue;

        const p = tierOdds * (remaining / totalRemaining);
        totalStrengthPerShop += (5 * p / copiesNeeded) * strengthGain;
    }

    // Bench-only 1★ units — may displace the weakest board unit when upgraded
    for (let i = 0; i < bench.length; i++) {
        const unit = bench[i];
        if (!unit || unit.stars !== 1 || seen.has(unit.name)) continue;
        seen.add(unit.name);

        const newBench     = bench.map((u, j) => j === i ? { ...u, stars: 2 } : u);
        const strengthGain = maxBoardStrength(board, newBench) - currentStrength;
        if (strengthGain <= 0) continue;

        const data = pool[unit.name];
        if (!data) continue;

        const owned        = _countOwnedCopies(unit.name, board, bench);
        const copiesNeeded = Math.max(0, 3 - owned);
        if (copiesNeeded === 0) continue;

        const remaining = Math.max(0, data.copies_in_pool - owned);
        if (remaining < copiesNeeded) continue;

        const tierOdds = odds[data.cost] ?? 0;
        if (tierOdds === 0) continue;

        const totalRemaining = _totalRemainingByCost(data.cost, board, bench);
        if (totalRemaining === 0) continue;

        const p = tierOdds * (remaining / totalRemaining);
        totalStrengthPerShop += (5 * p / copiesNeeded) * strengthGain;
    }

    // Planner units not yet on board or bench — buying one 1★ copy may
    // displace the weakest board unit
    for (const name of teamPlan) {
        if (!name || seen.has(name)) continue;
        seen.add(name);

        const data = pool[name];
        if (!data) continue;

        // Simulate fielding a fresh 1★ copy alongside the current bench
        const newBench     = [...bench, { name, stars: 1 }];
        const strengthGain = maxBoardStrength(board, newBench) - currentStrength;
        if (strengthGain <= 0) continue;

        // Only need 1 copy to field it
        const remaining = Math.max(0, data.copies_in_pool - _countOwnedCopies(name, board, bench));
        if (remaining < 1) continue;

        const tierOdds = odds[data.cost] ?? 0;
        if (tierOdds === 0) continue;

        const totalRemaining = _totalRemainingByCost(data.cost, board, bench);
        if (totalRemaining === 0) continue;

        const p = tierOdds * (remaining / totalRemaining);
        totalStrengthPerShop += 5 * p * strengthGain;   // copiesNeeded = 1
    }

    if (totalStrengthPerShop === 0) return Infinity;

    // 2 gold per roll ÷ expected strength gained per roll
    return 2 / totalStrengthPerShop;
}

// ── Discipline Score ──────────────────────────────────────────

/**
 * Scores how efficiently the player rolled relative to their board's upgrade
 * potential across the rolldown.
 *
 * Penalty schedule: −5 per unit of avgGoldPerStrengthPoint above 1, summed
 * across all rolls (floor 0).
 *
 * @param {object[]} events - Array returned by round.getEvents()
 * @returns {number} Discipline score (0–100)
 */
export function calcDiscipline(events) {
    const rollEvents = events.filter(e => e.type === 'roll');
    let penalty = 0;
    for (const roll of rollEvents) {
        const { board, bench, level, teamPlan } = roll;

        const gpsp = avgGoldPerStrengthPoint(board, bench, level, teamPlan);
        if (!isFinite(gpsp) || gpsp <= 1) continue;
        const basePenalty = gpsp - 1;

        const carryName = plannerCarryName(teamPlan, board);
        const tankName  = plannerTankName(teamPlan, board);

        const has2StarCarry = carryName ? _has2Star(carryName, board, bench) : false;
        const has2StarTank  = tankName  ? _has2Star(tankName,  board, bench) : false;

        // No penalty until the player has at least one 2★ key unit
        if (!has2StarCarry && !has2StarTank) continue;

        // 5× only when both carry and tank are 2★; 1× when only one is
        const multiplier = (has2StarCarry && has2StarTank) ? 5 : 1;

        penalty += basePenalty * multiplier;
    }
    return Math.max(0, 100 - 5 * penalty);
}

// plannerCarryName and plannerTankName live in helper.js (shared across grading modules)

// ── 1★ missing detection ──────────────────────────────────────

/**
 * Returns true if the player has zero physical copies of `unitName`
 * (i.e. no 1★ or 2★ version exists on board or bench).
 *
 * @param {string}                       unitName
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @returns {boolean}
 */
export function isMissingOneStar(unitName, board, bench) {
    return _countOwnedCopies(unitName, board, bench) === 0;
}

/**
 * Returns true if the player is rolling while they have no copy of their
 * main carry (strongest non-Tank in the team planner).
 *
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @param {string[]}                     teamPlan
 * @returns {boolean}
 */
export function isRollingWhileMissingMainCarry(board, bench, teamPlan) {
    const carry = plannerCarryName(teamPlan, board);
    return carry ? isMissingOneStar(carry, board, bench) : false;
}

/**
 * Returns true if the player is rolling while they have no copy of their
 * main tank (strongest Tank in the team planner).
 *
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @param {string[]}                     teamPlan
 * @returns {boolean}
 */
export function isRollingWhileMissingMainTank(board, bench, teamPlan) {
    const tank = plannerTankName(teamPlan, board);
    return tank ? isMissingOneStar(tank, board, bench) : false;
}

// ── Average gold to 2★ helpers ────────────────────────────────

/**
 * Average total gold needed to obtain enough copies of `unitName` to 2★ it.
 *
 * Cost = (expected rolls to see `copiesNeeded` copies × 2 gold/roll)
 *      + (copies still needed × unit cost)
 *
 * Returns 0 if the player already owns ≥3 copies (can 2★ now).
 * Returns Infinity if copies are unavailable at the current level.
 *
 * @param {string}                       unitName
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @param {number}                       level
 * @returns {number}
 */
export function avgGoldToTwoStar(unitName, board, bench, level) {
    const data = pool[unitName];
    if (!data) return Infinity;

    const owned        = _countOwnedCopies(unitName, board, bench);
    const copiesNeeded = Math.max(0, 3 - owned);
    if (copiesNeeded === 0) return 0;

    const shops = avgShopsForCopies(unitName, copiesNeeded, board, bench, level);
    if (!isFinite(shops)) return Infinity;

    return shops * 2 + copiesNeeded * data.cost;
}

/**
 * Average gold to 2★ the main carry (strongest non-Tank in the team planner).
 *
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @param {number}                       level
 * @param {string[]}                     teamPlan
 * @returns {number}
 */
export function avgGoldToTwoStarMainCarry(board, bench, level, teamPlan) {
    const carry = plannerCarryName(teamPlan, board);
    return carry ? avgGoldToTwoStar(carry, board, bench, level) : Infinity;
}

/**
 * Average gold to 2★ the main tank (strongest Tank in the team planner).
 *
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @param {number}                       level
 * @param {string[]}                     teamPlan
 * @returns {number}
 */
export function avgGoldToTwoStarMainTank(board, bench, level, teamPlan) {
    const tank = plannerTankName(teamPlan, board);
    return tank ? avgGoldToTwoStar(tank, board, bench, level) : Infinity;
}

/**
 * Minimum average gold to 2★ any Tank-role unit at the given cost tier.
 *
 * Returns the lowest `avgGoldToTwoStar` across all tanks at this cost,
 * representing the cheapest available 2★ tank option right now.
 *
 * @param {number}                       cost
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @param {number}                       level
 * @returns {number}
 */
export function avgGoldToTwoStarAnyTankAtCost(cost, board, bench, level) {
    let min = Infinity;
    for (const [name, data] of Object.entries(pool)) {
        if (data.role !== 'Tank' || data.cost !== cost) continue;
        const g = avgGoldToTwoStar(name, board, bench, level);
        if (g < min) min = g;
    }
    return min;
}

// ── Temporary debug hook ──────────────────────────────────────

import { getEvents } from '../round.js';

document.addEventListener('roundcomplete', () => {
    const rolls = getEvents().filter(e => e.type === 'roll');
    console.log('[grading/discipline]', rolls.map((roll, i) => ({
        roll: i + 1,
        gpsp: Math.round(avgGoldPerStrengthPoint(roll.board, roll.bench, roll.level, roll.teamPlan) * 100) / 100,
    })));
});
