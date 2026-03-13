// ============================================================
// grading-discipline.js — Discipline Scoring Helpers
// ============================================================

import { pool, shop_odds } from './tables.js';

// ── Board-strength weights ─────────────────────────────────────
// The primary tank absorbs ~75% of incoming damage; the primary carry
// deals ~50% of team damage. Their individual strength scores are
// multiplied by these weights to reflect that outsized impact.
const TANK_WEIGHT  = 8;   // strongest Tank-role unit on the board
const CARRY_WEIGHT = 5;   // strongest damage-carry (Marksman or Assassin)
const isCarryRole  = role => role !== 'Tank';

// ── Helpers ───────────────────────────────────────────────────

/** Strength score for a unit at a given star level (mirrors grading-flexibility.js). */
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

/**
 * Count how many physical copies of a unit the player owns across board and bench.
 * A 1★ unit = 1 copy; a 2★ unit = 3 copies.
 *
 * @param {string}                       unitName
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @returns {number}
 */
function _countOwnedCopies(unitName, board, bench) {
    let count = 0;
    for (const unit of Object.values(board)) {
        if (unit?.name === unitName) count += unit.stars === 2 ? 3 : 1;
    }
    for (const unit of bench) {
        if (unit?.name === unitName) count += unit.stars === 2 ? 3 : 1;
    }
    return count;
}

/**
 * Count total remaining copies in the pool for a given cost tier,
 * accounting for all units already owned on board and bench.
 *
 * @param {number}                       costTier
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @returns {number}
 */
function _totalRemainingByCost(costTier, board, bench) {
    let total = 0;
    for (const [name, data] of Object.entries(pool)) {
        if (data.cost !== costTier) continue;
        total += Math.max(0, data.copies_in_pool - _countOwnedCopies(name, board, bench));
    }
    return total;
}

// ── Function 1 ────────────────────────────────────────────────

/**
 * Average number of shops needed to see `copiesNeeded` more copies of `unitName`
 * in the shop, given that the current board and bench deplete the shared pool.
 *
 * Uses the standard TFT probability model:
 *   p(slot = unit) = shop_odds[level][cost] × (remaining_unit / remaining_cost_tier)
 *   expected shops = copiesNeeded / (5 × p)
 *
 * @param {string}                       unitName
 * @param {number}                       copiesNeeded  - Additional copies to see in shop
 * @param {Object.<string,{name,stars}>} board
 * @param {({name,stars}|null)[]}        bench
 * @param {number}                       level         - Current player level (2–10)
 * @returns {number} Expected shops (Infinity if the copies cannot appear in pool)
 */
export function avgShopsForCopies(unitName, copiesNeeded, board, bench, level) {
    if (copiesNeeded <= 0) return 0;

    const data = pool[unitName];
    if (!data) return Infinity;

    const owned           = _countOwnedCopies(unitName, board, bench);
    const remainingUnit   = Math.max(0, data.copies_in_pool - owned);
    if (remainingUnit < copiesNeeded) return Infinity;

    const odds      = shop_odds[Math.min(Math.max(level, 2), 10)];
    const tierOdds  = odds[data.cost] ?? 0;
    if (tierOdds === 0) return Infinity;

    const totalRemaining = _totalRemainingByCost(data.cost, board, bench);
    if (totalRemaining === 0) return Infinity;

    // P(a single shop slot shows this unit)
    const p = tierOdds * (remainingUnit / totalRemaining);
    if (p === 0) return Infinity;

    // Each shop has 5 independent slots; expected copies per shop = 5p
    return copiesNeeded / (5 * p);
}

// ── Function 2 ────────────────────────────────────────────────

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
        const gpsp = avgGoldPerStrengthPoint(roll.board, roll.bench, roll.level, roll.teamPlan);
        if (isFinite(gpsp) && gpsp > 1) penalty += gpsp - 1;
    }
    return Math.max(0, 100 - 5 * penalty);
}

// ── Temporary debug hook ──────────────────────────────────────

import { getEvents } from './round.js';

document.addEventListener('roundcomplete', () => {
    const rolls = getEvents().filter(e => e.type === 'roll');
    console.log('[grading-discipline] Roll event log:', rolls);
    rolls.forEach((roll, i) => {
        const gpsp = avgGoldPerStrengthPoint(roll.board, roll.bench, roll.level, roll.teamPlan);
        console.log(`[grading-discipline] Roll ${i + 1} avgGoldPerStrengthPoint: ${Math.round(gpsp * 100) / 100}`);
    });
});