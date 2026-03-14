import { pool, shop_odds, traits as traitTable } from './tables.js';
import { isOriginallyLocked } from './state.js';
import { getBestBoard, AVG_EHP, AVG_DPS } from './board-strength.js';

// ============================================================
// Shop distribution for standard leveling curve:
//   4 on 2-1 → 5 on 2-5 → 6 on 3-2 → 7 on 3-5
//   1 Lv.2 shop, 2 Lv.3, 3 Lv.4, 4 Lv.5, 3 Lv.6, 3 Lv.7
// ============================================================
const SHOP_SEQUENCE = [2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7];

// ── Role classifications ─────────────────────────────────────
// All roles in the pool: Tank, Fighter, Assassin, Caster, Marksman, Specialist
const TANK_CLASS      = new Set(['Tank']);
const BACKLINE_ROLES  = new Set(['Caster', 'Marksman', 'Specialist']);
const FRONTLINE_ROLES = new Set(['Tank', 'Fighter', 'Assassin']);

// Gold floor below which secondary item holders are skipped
const SECONDARY_GOLD_FLOOR = 20;

// ============================================================
// buildSpread — distribute n units evenly across a row's 7 cols.
// Returns an array of hex keys, e.g. ['A1','A4','A7'] for n=3.
// Special case: n=1 → centre (col 4).
// Deduplicates columns so no slot appears twice.
// ============================================================
function buildSpread(n, row) {
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
// Local helpers — avoid circular deps with logic.js / render.js
// ============================================================
function localActiveBreakpoint(traitName, count) {
    const bp = traitTable[traitName]?.breakpoints ?? [];
    let active = 0;
    for (const b of bp) { if (count >= b) active = b; }
    return active;
}

function weightedRandom(weights) {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const rand  = Math.random() * total;
    let cumulative = 0;
    for (const [key, weight] of Object.entries(weights)) {
        cumulative += weight;
        if (rand < cumulative) return key;
    }
}

function localSellValue(unit) {
    const cost = pool[unit.name].cost;
    if (unit.stars === 2) return cost === 1 ? 3 : 3 * cost - 1;
    if (unit.stars === 3) return 9 * cost - 1;
    return cost; // 1★
}

// ============================================================
// Simulate one 5-slot shop at the given level.
// `taken` maps champName → copies already removed from the pool.
// ============================================================
function simulateShop(level, taken) {
    const shop = [];
    for (let i = 0; i < 5; i++) {
        const costWeights = {};
        for (const [cost, pct] of Object.entries(shop_odds[level])) {
            if (pct > 0) costWeights[cost] = pct;
        }
        const costRolled   = weightedRandom(costWeights); // string key; use loose == below
        const champsOfCost = Object.values(pool).filter(c => c.cost == costRolled && c.unlocked);
        const champWeights = {};
        for (const champ of champsOfCost) {
            const remaining = champ.copies_in_pool - (taken[champ.name] ?? 0);
            if (remaining > 0) champWeights[champ.name] = remaining;
        }
        shop.push(Object.keys(champWeights).length > 0 ? weightedRandom(champWeights) : null);
    }
    return shop;
}

// ============================================================
// Build trait count map from a list of champion names.
// ============================================================
export function buildTraitCounts(names) {
    const counts = {};
    for (const name of names) {
        for (const t of (pool[name]?.synergies ?? [])) {
            counts[t] = (counts[t] ?? 0) + 1;
        }
    }
    return counts;
}

// ============================================================
// Infer main carry and main tank from the planned comp.
// Carry scoring gets a +3 bonus per trait already at a breakpoint.
// ============================================================
function getMainCarryAndTank(targetNames) {
    const targetChamps = targetNames.map(n => pool[n]).filter(Boolean);
    const traitCounts  = buildTraitCounts(targetNames);

    function carryScore(champ) {
        let score = champ.synergies.reduce((s, t) => s + (traitCounts[t] ?? 0), 0);
        for (const t of champ.synergies) {
            if (localActiveBreakpoint(t, traitCounts[t] ?? 0) > 0) score += 3;
        }
        return score;
    }

    function tankScore(champ) {
        return champ.synergies.reduce((s, t) => s + (traitCounts[t] ?? 0), 0);
    }

    function pickBest(candidates, scoreFn) {
        if (!candidates.length) return null;
        const max  = Math.max(...candidates.map(scoreFn));
        const tied = candidates.filter(c => scoreFn(c) === max);
        return tied[Math.floor(Math.random() * tied.length)];
    }

    const fourCostCarries = targetChamps.filter(c => c.cost === 4 && !TANK_CLASS.has(c.role));
    const fourCostTanks   = targetChamps.filter(c => c.cost === 4 &&  TANK_CLASS.has(c.role));
    const allCarries      = targetChamps.filter(c => !TANK_CLASS.has(c.role));
    const allTanks        = targetChamps.filter(c =>  TANK_CLASS.has(c.role));

    return {
        mainCarry:   pickBest(fourCostCarries.length ? fourCostCarries : allCarries, carryScore),
        mainTank:    pickBest(fourCostTanks.length   ? fourCostTanks   : allTanks,   tankScore),
        traitCounts,
    };
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
// Backline (Caster / Marksman / Specialist):
//   • Main carry (highest cost/stars) → random D1 or D7
//   • Others → evenly spread across remaining D-row positions
//
// Frontline (Tank / Fighter / Assassin):
//   • All units spread evenly across A-row via buildSpread
//   • Main tank (TANK_CLASS, highest cost/stars):
//       odd frontline count  → A4 (centre)
//       even frontline count → second-closest spread slot to carry's
//                              column (or closest if only 2 frontliners)
//   • Other frontline → remaining spread positions
//
// Overflow / unknown roles → middle rows (B/C), then anywhere free.
// ============================================================
function placeBoardUnits(boardUnits) {
    const ROWS = ['D', 'C', 'B', 'A'];
    const COLS = [1, 2, 3, 4, 5, 6, 7];
    const boardState = {};
    for (const r of ROWS) for (const c of COLS) boardState[`${r}${c}`] = null;
    if (!boardUnits.length) return boardState;

    const sortFn = (a, b) => (pool[b.name].cost - pool[a.name].cost) || (b.stars - a.stars);

    const frontline = boardUnits.filter(u =>  FRONTLINE_ROLES.has(pool[u.name].role)).sort(sortFn);
    const backline  = boardUnits.filter(u =>  BACKLINE_ROLES.has(pool[u.name].role)).sort(sortFn);
    const others    = boardUnits.filter(u =>
        !FRONTLINE_ROLES.has(pool[u.name].role) && !BACKLINE_ROLES.has(pool[u.name].role)
    ).sort(sortFn);

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

    // ── Backline ─────────────────────────────────────────────
    let carryCol = null;
    if (mainBacklineCarry) {
        carryCol = Math.random() < 0.5 ? 1 : 7;
        assign(`D${carryCol}`, mainBacklineCarry);
    }

    if (backline.length > 1) {
        const backSpread    = buildSpread(backline.length, 'D');
        const otherCarries  = backline.filter(u => u !== mainBacklineCarry);
        const remainingBack = backSpread.filter(key => !usedKeys.has(key));
        for (let i = 0; i < otherCarries.length && i < remainingBack.length; i++) {
            assign(remainingBack[i], otherCarries[i]);
        }
    }

    // ── Frontline ────────────────────────────────────────────
    if (frontline.length > 0) {
        const frontSpread = buildSpread(frontline.length, 'A');

        if (mainFrontlineTank) {
            let tankKey;
            if (frontline.length % 2 === 1) {
                // Odd count → centre A4
                tankKey = 'A4';
            } else {
                // Even count → biased toward carry side
                if (carryCol !== null) {
                    const byProximity = [...frontSpread].sort((a, b) =>
                        Math.abs(parseInt(a[1]) - carryCol) - Math.abs(parseInt(b[1]) - carryCol)
                    );
                    // >2 units: second-closest; 2 units: closest
                    tankKey = frontSpread.length > 2 ? byProximity[1] : byProximity[0];
                } else {
                    // No backline carry: just pick centre-ish
                    tankKey = frontSpread[Math.floor(frontSpread.length / 2)];
                }
            }
            // Assign tank (fallback to first open spread slot if somehow occupied)
            if (!usedKeys.has(tankKey)) {
                assign(tankKey, mainFrontlineTank);
            } else {
                for (const key of frontSpread) {
                    if (!usedKeys.has(key)) { assign(key, mainFrontlineTank); break; }
                }
            }
        }

        // Remaining frontline → evenly spread across remaining A-row positions
        const otherFrontline      = frontline.filter(u => u !== mainFrontlineTank);
        const remainingFrontSpread = frontSpread.filter(key => !usedKeys.has(key));
        for (let i = 0; i < otherFrontline.length && i < remainingFrontSpread.length; i++) {
            assign(remainingFrontSpread[i], otherFrontline[i]);
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

// ============================================================
// Main export
//
// Assumptions:
//   • Lv.8, 80g available at 4-1 (represents total spending budget)
//   • Standard leveling curve (see SHOP_SEQUENCE above)
//   • One natural shop per round — no rolling
//   • Board effects (Tibbers / Ice Tower / Sand Soldiers) fire on
//     first unit interaction after load (applyBoardEffects lives
//     in main.js which cannot be imported here without a cycle).
// ============================================================
export function generate41Board(teamPlan) {
    const targetNames = [...teamPlan].filter(n => pool[n]);
    if (!targetNames.length) return null;

    const targetSet = new Set(targetNames);
    const { mainCarry, mainTank } = getMainCarryAndTank(targetNames);

    // Buy targets:
    //   Priority  — comp units              → always buy if affordable
    //   Secondary — any Tank, same-role/damageType carries → only buy if gold ≥ floor
    const priorityTargets = new Set(targetNames);
    const secondaryTargets = new Set(
        Object.values(pool)
            .filter(c => {
                if (targetSet.has(c.name)) return false;
                if (TANK_CLASS.has(c.role)) return true;
                if (mainCarry && c.role === mainCarry.role && c.damageType === mainCarry.damageType) return true;
                return false;
            })
            .map(c => c.name)
    );
    const buyTargets = new Set([...priorityTargets, ...secondaryTargets]);

    const NUM_CANDIDATES = 5;
    let bestResult      = null;
    let bestScore = -1;

    for (let attempt = 0; attempt < NUM_CANDIDATES; attempt++) {

        // ── Simulate shops & buy ───────────────────────────────
        let gold        = 80;
        const rawCopies = {};
        const taken     = {};

        for (const level of SHOP_SEQUENCE) {
            const shop = simulateShop(level, taken);
            for (const champName of shop) {
                if (!champName || !buyTargets.has(champName)) continue;
                const cost        = pool[champName].cost;
                const isSecondary = !priorityTargets.has(champName);
                if (gold < cost) continue;
                if (isSecondary && gold < SECONDARY_GOLD_FLOOR) continue;

                rawCopies[champName] = (rawCopies[champName] ?? 0) + 1;
                taken[champName]     = (taken[champName] ?? 0) + 1;
                gold -= cost;
            }
        }

        // ── Guaranteed copy for originally-locked comp units ──
        for (const name of targetNames) {
            if (!isOriginallyLocked(name)) continue;
            const cost = pool[name].cost;
            if (cost === 5 || cost === 7) continue;
            if (gold < cost) continue;
            rawCopies[name] = (rawCopies[name] ?? 0) + 1;
            taken[name]     = (taken[name] ?? 0) + 1;
            gold -= cost;
        }

        // ── Guaranteed 1-cost copies for planner units ────────
        const oneCosters = targetNames.filter(n => pool[n].cost === 1);
        if (oneCosters.length > 0) {
            for (const name of oneCosters) {
                if (gold < 1) break;
                rawCopies[name] = (rawCopies[name] ?? 0) + 1;
                taken[name]     = (taken[name] ?? 0) + 1;
                gold -= 1;
            }
            for (let i = 0; i < 2; i++) {
                const name = oneCosters[Math.floor(Math.random() * oneCosters.length)];
                if (gold < 1) break;
                rawCopies[name] = (rawCopies[name] ?? 0) + 1;
                taken[name]     = (taken[name] ?? 0) + 1;
                gold -= 1;
            }
        }

        // ── Cap copies at 3; sell excess ──────────────────────
        for (const [name, count] of Object.entries(rawCopies)) {
            if (count > 3) {
                gold += (count - 3) * pool[name].cost;
                rawCopies[name] = 3;
            }
        }

        // ── Star-ups: 3 copies → 1 unit at 2★ ────────────────
        const holding = [];
        for (const [name, count] of Object.entries(rawCopies)) {
            if (count === 3) {
                holding.push({ name, stars: 2 });
            } else {
                for (let i = 0; i < count; i++) holding.push({ name, stars: 1 });
            }
        }

        const sortFn = (a, b) => (pool[b.name].cost - pool[a.name].cost) || (b.stars - a.stars);
        holding.sort(sortFn);

        // ── Dedup — no duplicate names ────────────────────────
        const seenNames    = new Set();
        const dedupHolding = [];
        const extraBench   = [];

        for (const unit of holding) {
            if (seenNames.has(unit.name)) {
                extraBench.push(unit);
            } else {
                seenNames.add(unit.name);
                dedupHolding.push(unit);
            }
        }

        // ── Pick guaranteed tank and carry ────────────────────
        // Best tank: highest normalised EHP (cost/star).
        // Best carry: highest normalised DPS among units matching mainCarry's
        //             role and damageType.
        const ehpScore = u => AVG_EHP[pool[u.name]?.cost]?.[u.stars] ?? 0;
        const dpsScore = u => AVG_DPS[pool[u.name]?.cost]?.[u.stars] ?? 0;

        const bestTank = [...dedupHolding]
            .filter(u => TANK_CLASS.has(pool[u.name]?.role))
            .sort((a, b) => ehpScore(b) - ehpScore(a))[0] ?? null;

        const bestCarry = mainCarry
            ? [...dedupHolding]
                .filter(u =>
                    pool[u.name]?.role       === mainCarry.role &&
                    pool[u.name]?.damageType === mainCarry.damageType
                )
                .sort((a, b) => dpsScore(b) - dpsScore(a))[0] ?? null
            : null;

        // Require a carry matching the comp's carry archetype on the board.
        if (mainCarry && !bestCarry) continue;

        // ── Board selection ────────────────────────────────────
        const guaranteed    = [bestTank, bestCarry].filter(Boolean);
        const guaranteedSet = new Set(guaranteed);
        const remaining     = dedupHolding.filter(u => !guaranteedSet.has(u));
        const boardUnits    = [...guaranteed, ...getBestBoard(remaining, 8 - guaranteed.length)];

        // ── Score candidate board ─────────────────────────────
        // Per planner unit on board:  +(6 - cost)  [lower cost = more points]
        // Per planner unit on bench:  -(6 - cost)  [symmetric penalty]
        // Main carry on board:        +3 bonus
        // Main tank on board:         +3 bonus
        const boardNames = new Set(boardUnits.map(u => u.name));
        let plannerScore = 0;
        for (const name of targetNames) {
            const weight = 6 - pool[name].cost;
            if (boardNames.has(name))                         plannerScore += weight;
            else if (dedupHolding.some(u => u.name === name)) plannerScore -= weight;
        }
        if (mainCarry && boardNames.has(mainCarry.name)) plannerScore += 3;
        if (mainTank  && boardNames.has(mainTank.name))  plannerScore += 3;

        if (plannerScore <= bestScore) continue;

        const boardSet = new Set(boardUnits);

        // ── Bench: leftover dedup units + dedup extras ────────
        const benchUnits = [
            ...dedupHolding.filter(u => !boardSet.has(u)),
            ...extraBench,
        ];

        // ── Sell non-planner units not on board ───────────────
        const finalBench = [];
        for (const unit of benchUnits) {
            if (!targetSet.has(unit.name) && !boardNames.has(unit.name)) {
                gold += localSellValue(unit);
            } else {
                finalBench.push(unit);
            }
        }

        // ── Sell excess — 2-cost first → 3-cost → 1-cost ─────
        const SELL_PRIO = { 2: 1, 3: 2, 1: 3, 4: 4, 5: 5 };
        while (boardUnits.length + finalBench.length > 15) {
            finalBench.sort((a, b) =>
                (SELL_PRIO[pool[a.name].cost] ?? 99) - (SELL_PRIO[pool[b.name].cost] ?? 99)
            );
            gold += localSellValue(finalBench.shift());
        }

        // ── Spread placement ──────────────────────────────────
        const boardState = placeBoardUnits(boardUnits);
        const benchState = Array(9).fill(null);
        finalBench.slice(0, 9).forEach((u, i) => { benchState[i] = u; });

        bestScore = plannerScore;
        bestResult = {
            board: boardState,
            bench: benchState,
            gold:  Math.max(0, gold),
            level: 8,
        };
    }

    return bestResult;
}
