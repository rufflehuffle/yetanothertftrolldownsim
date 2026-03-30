import { pool } from '../data/pool.js';
import { FRONTLINE_ROLES, BACKLINE_ROLES, TANK_CLASS, TWO_RANGE_UNITS } from './constants.js';

// ============================================================
// buildSpread — distribute n units evenly across a row's 7 cols.
// Returns an array of hex keys, e.g. ['A1','A4','A7'] for n=3.
// Special case: n=1 → centre (col 4).
// Deduplicates columns so no slot appears twice.
// ============================================================
export function buildSpread(n, row) {
    if (n <= 0) return [];
    if (n === 1) return [`${row}4`];
    const seen      = new Set();
    const positions = [];
    for (let i = 0; i < n; i++) {
        const col = Math.round(1 + i * 6 / (n - 1));
        const key = `${row}${col}`;
        if (!seen.has(key)) { seen.add(key); positions.push(key); }
    }
    return positions;
}

// ============================================================
// Assign board units to hex positions with even spread placement.
//
// Board layout (A = front row / top, D = back row / bottom):
//   A1  A2  A3  A4  A5  A6  A7  ← frontline (no offset)
//     B1  B2  B3  B4  B5  B6  B7  (offset)
//   C1  C2  C3  C4  C5  C6  C7  (no offset)
//     D1  D2  D3  D4  D5  D6  D7  ← backline (offset)
//
// 2-range units (Graves, Gwen, Fiddlesticks, Bel'Veth) → B1 or B7:
//   • They ARE the main carry → random B1/B7; tank anchors A2/A6 on same side.
//   • Main carry is melee → same side as the melee carry corner (A1→B1, A7→B7).
//   • Main carry is ranged → same side as the D-row carry (D1→B1, D7→B7).
//   • Second 2-range unit → opposite B corner.
//
// Backline (Caster / Marksman / Specialist):
//   • Main carry (highest cost/stars) → random D1 or D7
//   • Others → evenly spread across remaining D-row positions
//
// Frontline (Tank / Fighter / Assassin, excluding 2-range):
//   • Melee carry case: fills inward from carry's corner with alternating tank/melee.
//   • Ranged/2-range carry case: melee carries fill A1/A3/A5/A7 (or A7/A5/A3/A1)
//     on the carry's side; tanks fill A2/A4/A6 (or A6/A4/A2).
//
// Overflow / unknown roles → middle rows (B/C), then anywhere free.
// ============================================================
export function placeBoardUnits(boardUnits, carryUnit = null) {
    const ROWS = ['D', 'C', 'B', 'A'];
    const COLS = [1, 2, 3, 4, 5, 6, 7];
    const boardState = {};
    for (const r of ROWS) for (const c of COLS) boardState[`${r}${c}`] = null;
    if (!boardUnits.length) return boardState;

    const sortFn = (a, b) => (pool[b.name].cost - pool[a.name].cost) || (b.stars - a.stars);

    // 2-range units go to B1/B7, not A-row
    const twoRange  = boardUnits.filter(u =>  TWO_RANGE_UNITS.has(u.name));
    const frontline = boardUnits.filter(u =>  FRONTLINE_ROLES.has(pool[u.name].role) && !TWO_RANGE_UNITS.has(u.name)).sort(sortFn);
    const backline  = boardUnits.filter(u =>  BACKLINE_ROLES.has(pool[u.name].role)).sort(sortFn);

    // Main backline carry = highest-priority backline unit
    const mainBacklineCarry = backline[0] ?? null;
    // Main frontline tank  = highest-priority Tank-role unit (null if no Tanks on board)
    const mainFrontlineTank = frontline.find(u => TANK_CLASS.has(pool[u.name].role)) ?? null;

    const usedKeys = new Set();
    const placed   = new Set();

    function assign(key, unit) {
        boardState[key] = unit;
        usedKeys.add(key);
        placed.add(unit);
    }

    const isTwoRangeMainCarry = carryUnit && TWO_RANGE_UNITS.has(carryUnit.name);
    let twoRangeSide = null; // 'left' | 'right' — resolved after backline placement

    // ── Backline ─────────────────────────────────────────────
    let carryCol = null;
    if (mainBacklineCarry) {
        carryCol = Math.random() < 0.5 ? 1 : 7;
        assign(`D${carryCol}`, mainBacklineCarry);
    }

    if (backline.length > 1) {
        // Cluster remaining backline on the same side as the main carry:
        //   2 total → D1/D3 or D5/D7   (skip the inner slot)
        //   3 total → D1/D2/D3 or D5/D6/D7
        //   4+      → fill toward centre then opposite side
        const otherCarries  = backline.filter(u => u !== mainBacklineCarry);
        const clusterSlots  = carryCol <= 3
            ? ['D3', 'D2', 'D4', 'D5', 'D7', 'D6']
            : ['D5', 'D6', 'D4', 'D3', 'D1', 'D2'];
        const remainingBack = clusterSlots.filter(key => !usedKeys.has(key));
        for (let i = 0; i < otherCarries.length && i < remainingBack.length; i++) {
            assign(remainingBack[i], otherCarries[i]);
        }
    }

    // ── Frontline ────────────────────────────────────────────
    // Case 1: 2-range IS the main carry — mirror the backline carry's side if present,
    // otherwise pick randomly. Resolved here (after backline) so both sides agree.
    if (isTwoRangeMainCarry && twoRange.length > 0) {
        twoRangeSide = carryCol !== null
            ? (carryCol <= 3 ? 'left' : 'right')
            : (Math.random() < 0.5 ? 'left' : 'right');
    }

    // For tank focus: when 2-range is the main carry, anchor to its side;
    // otherwise use the backline carry col (may still be null if no backline carry).
    const frontlineCarryCol = isTwoRangeMainCarry
        ? (twoRangeSide === 'left' ? 1 : 7)
        : carryCol;

    // 2-range units are excluded from isMeleeCarry even though they have frontline roles
    const isMeleeCarry = carryUnit &&
        FRONTLINE_ROLES.has(pool[carryUnit.name]?.role) &&
        !TANK_CLASS.has(pool[carryUnit.name]?.role) &&
        !TWO_RANGE_UNITS.has(carryUnit.name);

    let meleeSide = null; // captured so 2-range units can mirror the melee carry's side

    if (frontline.length > 0) {
        if (isMeleeCarry) {
            // Main melee carry → A1 or A7; mirrors the backline carry's side when present
            // so melee and ranged carries are always on the same flank.
            const side = carryCol !== null
                ? (carryCol <= 3 ? 'left' : 'right')
                : (Math.random() < 0.5 ? 'left' : 'right');
            meleeSide = side;

            const mainMeleeUnit = frontline.find(u => u.name === carryUnit.name) ?? frontline[0];
            const otherMelee    = frontline.filter(u => u !== mainMeleeUnit && !TANK_CLASS.has(pool[u.name].role));
            const tanks         = frontline.filter(u => TANK_CLASS.has(pool[u.name].role));

            // Build the ordered sequence: main carry first, then round-robin tank/carry
            const sequence = [mainMeleeUnit];
            const meleeQ   = [...otherMelee];
            const tankQ    = [...tanks];
            let wantTank   = true;
            while (meleeQ.length || tankQ.length) {
                if (wantTank && tankQ.length) {
                    sequence.push(tankQ.shift());
                    wantTank = false;
                } else if (meleeQ.length) {
                    sequence.push(meleeQ.shift());
                    wantTank = true;
                } else {
                    sequence.push(tankQ.shift());
                }
            }

            const aSlots = side === 'left'
                ? ['A1','A2','A3','A4','A5','A6','A7']
                : ['A7','A6','A5','A4','A3','A2','A1'];
            for (let i = 0; i < sequence.length && i < aSlots.length; i++) {
                assign(aSlots[i], sequence[i]);
            }
        } else {
            if (frontlineCarryCol !== null) {
                // Backline or 2-range main carry: melee carries fill corner-skipping slots
                // (A1/A3 or A7/A5) so they flank the carry; tanks fill the gaps (A2/A4/A6).
                const side = frontlineCarryCol <= 3 ? 'left' : 'right';

                const meleeCarries = frontline.filter(u => !TANK_CLASS.has(pool[u.name].role));
                const tanks        = frontline.filter(u =>  TANK_CLASS.has(pool[u.name].role));

                const meleeSlots = side === 'left'
                    ? ['A1', 'A3', 'A5', 'A7']
                    : ['A7', 'A5', 'A3', 'A1'];

                for (let i = 0; i < meleeCarries.length && i < meleeSlots.length; i++) {
                    assign(meleeSlots[i], meleeCarries[i]);
                }
                const inwardSlots = side === 'left'
                    ? ['A1','A2','A3','A4','A5','A6','A7']
                    : ['A7','A6','A5','A4','A3','A2','A1'];
                const remainingTankSlots = inwardSlots.filter(k => !usedKeys.has(k));
                for (let i = 0; i < tanks.length && i < remainingTankSlots.length; i++) {
                    assign(remainingTankSlots[i], tanks[i]);
                }
            } else {
                // No carry reference at all: even spread, tank toward centre.
                const frontSpread = buildSpread(frontline.length, 'A');

                if (mainFrontlineTank) {
                    const tankKey = frontline.length % 2 === 1
                        ? 'A4'
                        : frontSpread[Math.floor(frontSpread.length / 2)];
                    if (!usedKeys.has(tankKey)) {
                        assign(tankKey, mainFrontlineTank);
                    } else {
                        for (const key of frontSpread) {
                            if (!usedKeys.has(key)) { assign(key, mainFrontlineTank); break; }
                        }
                    }
                }

                const otherFrontline       = frontline.filter(u => u !== mainFrontlineTank);
                const remainingFrontSpread = frontSpread.filter(key => !usedKeys.has(key));
                for (let i = 0; i < otherFrontline.length && i < remainingFrontSpread.length; i++) {
                    assign(remainingFrontSpread[i], otherFrontline[i]);
                }
            }
        }
    }

    // ── 2-range units → B1 / B7 ──────────────────────────────
    if (twoRange.length > 0) {
        if (twoRangeSide === null) {
            // Case 2: main carry is melee → B-corner on same side as melee carry
            // Case 3: main carry is ranged → B-corner on same side as D-row carry
            if (meleeSide !== null) {
                twoRangeSide = meleeSide;
            } else if (carryCol !== null) {
                twoRangeSide = carryCol <= 3 ? 'left' : 'right';
            } else {
                twoRangeSide = Math.random() < 0.5 ? 'left' : 'right';
            }
        }

        const primaryKey   = twoRangeSide === 'left' ? 'B1' : 'B7';
        const secondaryKey = twoRangeSide === 'left' ? 'B2' : 'B6';

        for (let i = 0; i < twoRange.length; i++) {
            const key = i === 0 ? primaryKey : secondaryKey;
            if (!usedKeys.has(key)) assign(key, twoRange[i]);
            // 3+ 2-range units fall through to overflow below
        }
    }

    // ── Fallback — overflow / edge-case roles ─────────────────
    const middleSlots  = ['C4','B4','C3','B3','C5','B5','C2','B2','C6','B6','C1','B1','C7','B7'];
    const allHexSlots  = ROWS.flatMap(r => COLS.map(c => `${r}${c}`));
    const fallbackSlots = [...new Set([...middleSlots, ...allHexSlots])];

    for (const u of boardUnits) {
        if (!placed.has(u)) {
            for (const key of fallbackSlots) {
                if (!usedKeys.has(key)) { assign(key, u); break; }
            }
        }
    }

    return boardState;
}
