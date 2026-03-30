import { pool } from '../data/pool.js';
import { traits as traitTable } from '../data/traits.js';

export function localActiveBreakpoint(traitName, count) {
    const bp = traitTable[traitName]?.breakpoints ?? [];
    let active = 0;
    for (const b of bp) { if (count >= b) active = b; }
    return active;
}

export function weightedRandom(weights) {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const rand  = Math.random() * total;
    let cumulative = 0;
    for (const [key, weight] of Object.entries(weights)) {
        cumulative += weight;
        if (rand < cumulative) return key;
    }
}

export function localSellValue(unit) {
    const cost = pool[unit.name].cost;
    if (unit.stars === 2) return cost === 1 ? 3 : 3 * cost - 1;
    if (unit.stars === 3) return 9 * cost - 1;
    return cost; // 1★
}

// Build trait count map from a list of champion names.
export function buildTraitCounts(names) {
    const counts = {};
    for (const name of names) {
        for (const t of (pool[name]?.synergies ?? [])) {
            counts[t] = (counts[t] ?? 0) + 1;
        }
    }
    return counts;
}
