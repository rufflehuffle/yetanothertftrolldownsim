import { pool, shop_odds, traits as traitTable } from './tables.js';
import { isOriginallyLocked } from './state.js';

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

// Tank-adjacent synergy traits (for expanded tank holder detection)
const TANK_SYNERGY_TRAITS = new Set(['Defender', 'Bruiser', 'Juggernaut', 'Warden']);

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
// Find item holder candidates outside the comp (expanded criteria).
//   (a) Tank-role units sharing a trait with the main tank
//   (b) Frontline units with an active TANK_SYNERGY_TRAIT in the comp
//   (c) Taric — always added
//   (d) Same-role + same-damageType as main carry
// ============================================================
function getItemHolderNames(targetNames, mainCarry, mainTank, traitCounts) {
    const targetSet = new Set(targetNames);
    const holders   = new Set();

    if (mainTank) {
        const tankTraits = new Set(mainTank.synergies);
        for (const champ of Object.values(pool)) {
            if (targetSet.has(champ.name)) continue;
            if (!TANK_CLASS.has(champ.role)) continue;
            if (champ.synergies.some(t => tankTraits.has(t))) holders.add(champ.name);
        }
    }

    const activeTankSynTraits = [...TANK_SYNERGY_TRAITS].filter(
        t => localActiveBreakpoint(t, traitCounts[t] ?? 0) > 0
    );
    if (activeTankSynTraits.length > 0) {
        for (const champ of Object.values(pool)) {
            if (targetSet.has(champ.name)) continue;
            if (!FRONTLINE_ROLES.has(champ.role)) continue;
            if (champ.synergies.some(t => activeTankSynTraits.includes(t))) {
                holders.add(champ.name);
            }
        }
    }

    if (!targetSet.has('Taric') && pool['Taric']) holders.add('Taric');

    if (mainCarry) {
        for (const champ of Object.values(pool)) {
            if (targetSet.has(champ.name)) continue;
            if (champ.role       !== mainCarry.role)       continue;
            if (champ.damageType !== mainCarry.damageType) continue;
            holders.add(champ.name);
        }
    }

    return [...holders];
}

// ============================================================
// Find units that push main carry / tank traits to first breakpoint.
// Only adds the highest-cost candidates needed to fill each trait gap.
// ============================================================
function getTraitFillerNames(targetNames, mainCarry, mainTank, traitCounts) {
    const targetSet = new Set(targetNames);
    const fillers   = new Set();

    for (const unit of [mainCarry, mainTank]) {
        if (!unit) continue;
        for (const trait of unit.synergies) {
            const bps = traitTable[trait]?.breakpoints;
            if (!bps?.length) continue;
            const firstBP      = bps[0];
            const currentCount = traitCounts[trait] ?? 0;
            if (currentCount >= firstBP) continue;

            const needed     = firstBP - currentCount;
            const candidates = Object.values(pool)
                .filter(c => !targetSet.has(c.name) && c.synergies.includes(trait))
                .sort((a, b) => b.cost - a.cost);

            for (let i = 0; i < Math.min(needed, candidates.length); i++) {
                fillers.add(candidates[i].name);
            }
        }
    }
    return [...fillers];
}

// ============================================================
// Assign board units to hex positions with even spread placement.
//
// Board layout (A = front row, D = back row):
//   D1  D2  D3  D4  D5  D6  D7    ← backline
//     C1  C2  C3  C4  C5  C6  C7
//       B1  B2  B3  B4  B5  B6  B7
//         A1  A2  A3  A4  A5  A6  A7  ← frontline
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

    // ── Derive helpers & buy targets ──────────────────────────
    const { mainCarry, mainTank, traitCounts } = getMainCarryAndTank(targetNames);

    const itemHolderNames  = getItemHolderNames(targetNames, mainCarry, mainTank, traitCounts);
    const traitFillerNames = getTraitFillerNames(targetNames, mainCarry, mainTank, traitCounts);
    const traitFillerSet   = new Set(traitFillerNames);

    // Two-tier buy priority:
    //   Priority  — comp units + trait fillers + Taric → always buy if affordable
    //   Secondary — other item holders               → only buy if gold ≥ floor
    const priorityTargets = new Set([
        ...targetNames,
        ...traitFillerNames,
        ...(['Taric'].filter(n => !targetSet.has(n) && pool[n])),
    ]);
    const buyTargets = new Set([...priorityTargets, ...itemHolderNames]);

    // ── Simulate shops & buy ───────────────────────────────────
    let gold        = 80;
    const rawCopies = {};  // champName → copies bought
    const taken     = {};  // champName → copies removed from pool

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

    // ── Guaranteed copy for originally-locked comp units ──────
    for (const name of targetNames) {
        if (!isOriginallyLocked(name)) continue;
        const cost = pool[name].cost;
        if (cost === 5 || cost === 7) continue;
        if (gold < cost) continue;
        rawCopies[name] = (rawCopies[name] ?? 0) + 1;
        taken[name]     = (taken[name] ?? 0) + 1;
        gold -= cost;
    }

    // ── Guaranteed 1-cost copies for planner units ─────────────
    const oneCosters = targetNames.filter(n => pool[n].cost === 1);
    if (oneCosters.length > 0) {
        // Phase A: 1 guaranteed copy for each 1-cost planner unit
        for (const name of oneCosters) {
            if (gold < 1) break;
            rawCopies[name] = (rawCopies[name] ?? 0) + 1;
            taken[name]     = (taken[name] ?? 0) + 1;
            gold -= 1;
        }
        // Phase B: 2 extra copies distributed randomly
        for (let i = 0; i < 2; i++) {
            const name = oneCosters[Math.floor(Math.random() * oneCosters.length)];
            if (gold < 1) break;
            rawCopies[name] = (rawCopies[name] ?? 0) + 1;
            taken[name]     = (taken[name] ?? 0) + 1;
            gold -= 1;
        }
    }

    // ── Cap copies at 3; sell excess ──────────────────────────
    for (const [name, count] of Object.entries(rawCopies)) {
        if (count > 3) {
            gold += (count - 3) * pool[name].cost;
            rawCopies[name] = 3;
        }
    }

    // ── Star-ups: 3 copies → 1 unit at 2★ ────────────────────
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

    // ── Dedup — no duplicate names on the board ─────
    // Keep the highest-starred occurrence; push extras to extraBench.
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

    // ── Board selection (strength heuristic) ──────────────────
    // Tier table (base score):
    //   2★7c=12 > 1★7c=11 > 2★5c=10 > 2★4c=9 > 1★5c=8
    //   > 1★4c(main carry)=7 > 2★3c=6 > 1★4c=5 > 2★2c=4
    //   > 2★1c=1★3c=3 > 1★2c=2 > 1★1c=1
    // Tiebreaker fraction: planner +0.2 > item holder +0.1 > trait filler +0.0
    const holderSet = new Set(itemHolderNames);

    const unitStrengthScore = (unit) => {
        const cost  = pool[unit.name].cost;
        const stars = unit.stars;
        const isMainCarry = mainCarry && unit.name === mainCarry.name;
        let base;
        if      (stars === 2 && cost >= 7)                        base = 12;
        else if (stars === 1 && cost >= 7)                        base = 11;
        else if (stars === 2 && cost === 5)                       base = 10;
        else if (stars === 2 && cost === 4)                       base =  9;
        else if (stars === 1 && cost === 5)                       base =  8;
        else if (stars === 1 && cost === 4 && isMainCarry)        base =  7;
        else if (stars === 2 && cost === 3)                       base =  6;
        else if (stars === 1 && cost === 4)                       base =  5;
        else if (stars === 2 && cost === 2)                       base =  4;
        else if ((stars === 2 && cost === 1) || (stars === 1 && cost === 3)) base = 3;
        else if (stars === 1 && cost === 2)                       base =  2;
        else                                                      base =  1;
        const tier = targetSet.has(unit.name) ? 0.2
                   : holderSet.has(unit.name) ? 0.1
                   :                            0.0;
        return base + tier;
    };

    // True if adding this unit to the board would push any of its traits
    // to a new (higher) breakpoint given the current board trait counts.
    const addsTraitBreakpoint = (unit, currentCounts) => {
        for (const trait of pool[unit.name].synergies) {
            const before = currentCounts[trait] ?? 0;
            if (localActiveBreakpoint(trait, before + 1) > localActiveBreakpoint(trait, before)) {
                return true;
            }
        }
        return false;
    };

    // Item holders and trait fillers that don't activate a new breakpoint
    // receive this penalty, pushing them below even weak comp units.
    const HOLDER_FILLER_NO_TRAIT_PENALTY = 8;

    const effectiveScore = (unit, currentCounts) => {
        const base = unitStrengthScore(unit);
        if (!targetSet.has(unit.name) && !addsTraitBreakpoint(unit, currentCounts)) {
            return base - HOLDER_FILLER_NO_TRAIT_PENALTY;
        }
        return base;
    };

    // Sort all candidates by base strength descending.
    const sortedByStrength = [...dedupHolding]
        .sort((a, b) => unitStrengthScore(b) - unitStrengthScore(a));

    // Guarantee the strongest tank (TANK_CLASS) and strongest carry (non-tank)
    // each get a board slot before the greedy fill runs.
    const bestTank  = sortedByStrength.find(u =>  TANK_CLASS.has(pool[u.name].role)) ?? null;
    const bestCarry = sortedByStrength.find(u => !TANK_CLASS.has(pool[u.name].role)) ?? null;

    const boardUnitSet = new Set();
    const boardUnits   = [];

    const claimBoard = (unit) => {
        if (!unit || boardUnitSet.has(unit)) return;
        boardUnits.push(unit);
        boardUnitSet.add(unit);
    };

    claimBoard(bestTank);
    claimBoard(bestCarry);

    // Greedy fill: at each step pick the highest effective-scored remaining unit.
    // Effective score penalises holders/fillers that don't add a new breakpoint.
    const remaining = sortedByStrength.filter(u => !boardUnitSet.has(u));
    while (boardUnits.length < 8 && remaining.length > 0) {
        const currentCounts = buildTraitCounts(boardUnits.map(u => u.name));
        let bestScore = -Infinity;
        let bestIdx   = 0;
        for (let i = 0; i < remaining.length; i++) {
            const s = effectiveScore(remaining[i], currentCounts);
            if (s > bestScore) { bestScore = s; bestIdx = i; }
        }
        claimBoard(remaining[bestIdx]);
        remaining.splice(bestIdx, 1);
    }

    const boardSet   = new Set(boardUnits);
    const boardNames = new Set(boardUnits.map(u => u.name));

    // Units not selected for board go to bench (plus dedup extras)
    const benchUnits = [
        ...dedupHolding.filter(u => !boardSet.has(u)),
        ...extraBench,
    ];

    // ── Sell non-planner units not on board ───────────────────
    // Only planner (comp) unit copies are kept on bench.
    const finalBench = [];
    for (const unit of benchUnits) {
        if (!targetSet.has(unit.name) && !boardNames.has(unit.name)) {
            gold += localSellValue(unit);
        } else {
            finalBench.push(unit);
        }
    }

    // ── Sell excess — 2-cost first → 3-cost → 1-cost ─────────
    const SELL_PRIO = { 2: 1, 3: 2, 1: 3, 4: 4, 5: 5 };
    while (boardUnits.length + finalBench.length > 15) {
        finalBench.sort((a, b) =>
            (SELL_PRIO[pool[a.name].cost] ?? 99) - (SELL_PRIO[pool[b.name].cost] ?? 99)
        );
        gold += localSellValue(finalBench.shift());
    }

    // ── Spread placement ────────────────────────────
    const boardState = placeBoardUnits(boardUnits);

    const benchState = Array(9).fill(null);
    finalBench.slice(0, 9).forEach((u, i) => { benchState[i] = u; });

    return {
        board: boardState,
        bench: benchState,
        gold:  Math.max(0, gold),
        level: 8,
    };
}
