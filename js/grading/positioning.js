// ============================================================
// positioning.js — Positioning Scoring
// ============================================================
//
// Board layout (A = front row / top, D = back row / bottom):
//   A1  A2  A3  A4  A5  A6  A7  ← frontline (no offset)
//     B1  B2  B3  B4  B5  B6  B7  (offset)
//   C1  C2  C3  C4  C5  C6  C7  (no offset)
//     D1  D2  D3  D4  D5  D6  D7  ← backline (offset)
//
// x-positions (col 1-indexed, 1 hex unit apart):
//   A(c) = c−1,  B(c) = c−0.5,  C(c) = c−1,  D(c) = c−0.5
// Cross-row adjacency rules:
//   • Non-offset rows (A, C): adjacent cols in offset row are [col−1, col]
//   • Offset rows (B, D):     adjacent cols in non-offset row are [col, col+1]
// ──────────────────────────────────────────────────────────────

import { pool } from '../tables.js';
import { TWO_RANGE_UNITS } from '../board-generation/constants.js';

const RANGED_ROLES      = new Set(['Marksman', 'Caster', 'Specialist']);
const MELEE_CARRY_ROLES = new Set(['Fighter', 'Assassin']);
const TANK_ROLES_POS    = new Set(['Tank']);

const _ROW_ORDER = ['A', 'B', 'C', 'D'];

/**
 * Returns all valid adjacent hex keys for a board position.
 * B and D rows are offset; A and C rows are not.
 */
function _adjacentHexes(key) {
    const row      = key[0];
    const col      = parseInt(key.slice(1));
    const rowIdx   = _ROW_ORDER.indexOf(row);
    const isOffset = row === 'B' || row === 'D';
    const result   = [];

    // Same row
    if (col > 1) result.push(`${row}${col - 1}`);
    if (col < 7) result.push(`${row}${col + 1}`);

    // Cross-row: non-offset → [col-1, col]; offset → [col, col+1]
    const lo = isOffset ? col     : col - 1;
    const hi = isOffset ? col + 1 : col;

    function pushIfValid(r, c) {
        if (c >= 1 && c <= 7) result.push(`${r}${c}`);
    }

    if (rowIdx > 0) {
        const fwd = _ROW_ORDER[rowIdx - 1];
        pushIfValid(fwd, lo);
        pushIfValid(fwd, hi);
    }

    if (rowIdx < _ROW_ORDER.length - 1) {
        const bwd = _ROW_ORDER[rowIdx + 1];
        pushIfValid(bwd, lo);
        pushIfValid(bwd, hi);
    }

    return result;
}

/**
 * Strength score for a board unit (cost × stars tier, no tiebreakers).
 * Mirrors the heuristic in board-generation/generator.js unitStrengthScore.
 */
function _unitStrength(unit) {
    const cost  = pool[unit.name]?.cost ?? 1;
    const stars = unit.stars;
    if      (stars === 2 && cost >= 7)                            return 12;
    else if (stars === 1 && cost >= 7)                            return 11;
    else if (stars === 2 && cost === 5)                           return 10;
    else if (stars === 2 && cost === 4)                           return  9;
    else if (stars === 1 && cost === 5)                           return  8;
    else if (stars === 2 && cost === 3)                           return  6;
    else if (stars === 1 && cost === 4)                           return  5;
    else if (stars === 2 && cost === 2)                           return  4;
    else if ((stars === 2 && cost === 1) || (stars === 1 && cost === 3)) return 3;
    else if (stars === 1 && cost === 2)                           return  2;
    else                                                          return  1;
}

/** Returns occupied board slots as { name, stars, hex, role } objects. */
function _boardUnits(board) {
    return Object.entries(board)
        .filter(([, u]) => u !== null)
        .map(([hex, u]) => ({ name: u.name, stars: u.stars, hex, role: pool[u.name]?.role }));
}

/** Returns the highest-strength unit matching a role predicate, or null. */
function _strongest(units, rolePredicate) {
    const candidates = units.filter(u => rolePredicate(u.role));
    if (!candidates.length) return null;
    return candidates.reduce((best, u) =>
        _unitStrength(u) > _unitStrength(best) ? u : best
    );
}

// ── 0. Melee carries in back row ──────────────────────────────

/**
 * Returns melee carries (Fighter / Assassin) placed in the back row (D hexes).
 *
 * @param {object} board - { [hex]: { name, stars } | null }
 * @returns {{ name: string, stars: number, hex: string, role: string }[]}
 *   Empty array means no melee carries are misplaced in the back row.
 */
export function meleeInBackRow(board) {
    return _boardUnits(board)
        .filter(u => MELEE_CARRY_ROLES.has(u.role) && u.hex.startsWith('D'));
}

// ── 1. Ranged carries not in back row ─────────────────────────

/**
 * Returns ranged carries (Marksman / Caster / Specialist) not in the D row.
 *
 * @param {object} board - { [hex]: { name, stars } | null }
 * @returns {{ name: string, stars: number, hex: string, role: string }[]}
 *   Empty array means all ranged carries are correctly in the back row.
 */
export function rangedNotInBackRow(board) {
    return _boardUnits(board)
        .filter(u => RANGED_ROLES.has(u.role) && !u.hex.startsWith('D'));
}

// ── 2. Main ranged carry in corner hex ────────────────────────

/**
 * Checks whether the main ranged carry (highest-strength ranged unit)
 * is placed in a corner hex (D1 or D7).
 *
 * @param {object} board - Board state
 * @returns {boolean} false if the main carry is ranged AND not in D1 / D7;
 *   true otherwise (no ranged carry, or carry is correctly cornered).
 */
export function mainCarryInCorner(board) {
    const mainCarry = _strongest(_boardUnits(board), r => RANGED_ROLES.has(r));
    if (!mainCarry) return true;
    return mainCarry.hex === 'D1' || mainCarry.hex === 'D7';
}

// ── 3. Melee carries not adjacent to any tank ──────────────────

/**
 * Returns melee carries (Fighter / Assassin) with no adjacent tank.
 *
 * @param {object} board - Board state
 * @returns {{ name: string, stars: number, hex: string, role: string }[]}
 *   Empty array means every melee carry has at least one adjacent tank.
 */
export function meleeCarriesNotNextToTank(board) {
    const units     = _boardUnits(board);
    const tankHexes = new Set(
        units.filter(u => TANK_ROLES_POS.has(u.role)).map(u => u.hex)
    );

    return units.filter(u => {
        if (!MELEE_CARRY_ROLES.has(u.role)) return false;
        // 2-range units at B-corners: extend valid tank hexes to include the
        // diagonal A-row slot that is one step inward (B7→A6, B1→A2).
        const extraHexes = TWO_RANGE_UNITS.has(u.name) && u.hex === 'B7' ? ['A6']
                         : TWO_RANGE_UNITS.has(u.name) && u.hex === 'B1' ? ['A2']
                         : [];
        const neighbours = [..._adjacentHexes(u.hex), ...extraHexes];
        return !neighbours.some(h => tankHexes.has(h));
    });
}

// ── 4. Strongest melee carry adjacent to strongest tank ────────

/**
 * Checks whether the strongest melee carry is within one hex of
 * the strongest tank on the board.
 *
 * @param {object} board - Board state
 * @returns {boolean} true if either role is absent on the board, or the
 *   strongest melee carry IS adjacent to the strongest tank; false otherwise.
 */
export function strongestMeleeCarryNextToStrongestTank(board) {
    const units     = _boardUnits(board);
    const bestMelee = _strongest(units, r => MELEE_CARRY_ROLES.has(r));
    const bestTank  = _strongest(units, r => TANK_ROLES_POS.has(r));
    if (!bestMelee || !bestTank) return true;
    const extraHexes = TWO_RANGE_UNITS.has(bestMelee.name) && bestMelee.hex === 'B7' ? ['A6']
                     : TWO_RANGE_UNITS.has(bestMelee.name) && bestMelee.hex === 'B1' ? ['A2']
                     : [];
    return [..._adjacentHexes(bestMelee.hex), ...extraHexes].includes(bestTank.hex);
}

// ── 5. Main tank in front of corner ranged carry ───────────────

/**
 * Checks whether the main tank (strongest Tank-role unit) is in the
 * A-row zone directly in front of the corner carry.
 *
 * Rules by carry position:
 *   D1 (ranged)  → tank must be in A1, A2, A3, A4
 *   D7 (ranged)  → tank must be in A4, A5, A6, A7
 *   B1 (2-range) → tank must be at A1 or A2
 *   B7 (2-range) → tank must be at A6 or A7
 *
 * @param {object} board - Board state
 * @returns {boolean} true if the carry is not in a corner, or either role is
 *   absent, or the main tank IS in the expected front zone; false otherwise.
 */
export function mainTankInFrontOfCornerCarry(board) {
    const units    = _boardUnits(board);
    const mainTank = _strongest(units, r => TANK_ROLES_POS.has(r));

    // D-row ranged carry: tank must be in the front zone on the carry's side
    const mainCarry = _strongest(units, r => RANGED_ROLES.has(r));
    if (mainCarry && (mainCarry.hex === 'D1' || mainCarry.hex === 'D7')) {
        if (!mainTank) return true;
        const frontHexes = mainCarry.hex === 'D1'
            ? new Set(['A1', 'A2', 'A3', 'A4'])
            : new Set(['A4', 'A5', 'A6', 'A7']);
        if (!frontHexes.has(mainTank.hex)) return false;
    }

    // 2-range carry at B7: tank must be at A6 or A7
    const b7Carry = units.find(u => TWO_RANGE_UNITS.has(u.name) && u.hex === 'B7');
    if (b7Carry && mainTank && mainTank.hex !== 'A6' && mainTank.hex !== 'A7') return false;

    // 2-range carry at B1: tank must be at A1 or A2
    const b1Carry = units.find(u => TWO_RANGE_UNITS.has(u.name) && u.hex === 'B1');
    if (b1Carry && mainTank && mainTank.hex !== 'A1' && mainTank.hex !== 'A2') return false;

    return true;
}

// ── Mistake hex set (for board highlighting) ──────────────────

/**
 * Returns a Set of hex keys for all units involved in positioning mistakes.
 * Used by the post-RD review to overlay red highlights on the board.
 */
export function positioningMistakeHexes(board) {
    const hexes = new Set();
    const units = _boardUnits(board);

    for (const u of meleeInBackRow(board))           hexes.add(u.hex);
    for (const u of rangedNotInBackRow(board))        hexes.add(u.hex);
    for (const u of meleeCarriesNotNextToTank(board)) hexes.add(u.hex);

    if (!mainCarryInCorner(board)) {
        const u = _strongest(units, r => RANGED_ROLES.has(r));
        if (u) hexes.add(u.hex);
    }
    if (!strongestMeleeCarryNextToStrongestTank(board)) {
        const u = _strongest(units, r => MELEE_CARRY_ROLES.has(r));
        if (u) hexes.add(u.hex);
    }
    if (!mainTankInFrontOfCornerCarry(board)) {
        const u = _strongest(units, r => TANK_ROLES_POS.has(r));
        if (u) hexes.add(u.hex);
    }

    return hexes;
}

// ── Positioning Score ─────────────────────────────────────────

/**
 * Scores board positioning out of 100.
 *
 * Penalty schedule:
 *   −10 per yes/no mistake (boolean checks that return false)
 *   −5  per misplaced unit (array checks; each returned unit is one mistake)
 *
 * Checks:
 *   Boolean (−10 each): mainCarryInCorner, strongestMeleeCarryNextToStrongestTank,
 *                        mainTankInFrontOfCornerCarry
 *   Per-unit (−5 each): meleeInBackRow, rangedNotInBackRow, meleeCarriesNotNextToTank
 *
 * Deduplication: a unit already penalised by a −10 check is excluded from −5
 * checks. Within the −5 tier, each unit hex is counted at most once.
 * Higher-value mistakes are always prioritised.
 *
 * @param {object} board - { [hex]: { name, stars } | null }
 * @returns {number} Positioning score (0–100)
 */
export function calcPositioning(board) {
    const units = _boardUnits(board);

    // ── Boolean (−10) checks — record which hex each failure owns ──
    const boolPenaltyHexes = new Set();
    let boolPenalty = 0;

    if (!mainCarryInCorner(board)) {
        boolPenalty += 10;
        const u = _strongest(units, r => RANGED_ROLES.has(r));
        if (u) boolPenaltyHexes.add(u.hex);
    }
    if (!strongestMeleeCarryNextToStrongestTank(board)) {
        boolPenalty += 10;
        const u = _strongest(units, r => MELEE_CARRY_ROLES.has(r));
        if (u) boolPenaltyHexes.add(u.hex);
    }
    if (!mainTankInFrontOfCornerCarry(board)) {
        boolPenalty += 10;
        const u = _strongest(units, r => TANK_ROLES_POS.has(r));
        if (u) boolPenaltyHexes.add(u.hex);
    }

    // ── Per-unit (−5) checks — deduplicate by hex, skip −10 hexes ──
    const seen = new Set();
    const unitMistakes = [
        ...meleeInBackRow(board),
        ...rangedNotInBackRow(board),
        ...meleeCarriesNotNextToTank(board),
    ].filter(u => {
        if (boolPenaltyHexes.has(u.hex) || seen.has(u.hex)) return false;
        seen.add(u.hex);
        return true;
    });

    return Math.max(0, 100 - boolPenalty - unitMistakes.length * 5);
}

// ── Temporary debug hook ──────────────────────────────────────

import { state } from '../state.js';

document.addEventListener('roundcomplete', () => {
    const board = state.board.snapshot();
    console.log(`[grading/positioning] corner=${mainCarryInCorner(board)} adjTank=${strongestMeleeCarryNextToStrongestTank(board)} tankFront=${mainTankInFrontOfCornerCarry(board)} | meleeBack:`, meleeInBackRow(board), '| rangedFront:', rangedNotInBackRow(board), '| meleeCarryNoTank:', meleeCarriesNotNextToTank(board));
});
