import { pool, shop_odds, xp_to_level } from './tables.js';

// ============================================================
// Shop & economy
// ============================================================
export function weightedRandom(weights) {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const rand = Math.random() * total;
    let cumulative = 0;
    for (const [key, weight] of Object.entries(weights)) {
        cumulative += weight;
        if (rand < cumulative) return key;
    }
}

export function rollShop(state) {
    const taken = {};
    for (const unit of [...state.bench, ...Object.values(state.board)]) {
        if (!unit) continue;
        const copies = unit.stars === 2 ? 3 : unit.stars === 3 ? 9 : 1;
        taken[unit.name] = (taken[unit.name] ?? 0) + copies;
    }

    const shop = [];
    for (let i = 0; i < 5; i++) {
        const costRolled = weightedRandom(shop_odds[state.level]);
        const champsOfCost = Object.values(pool).filter(x => x.cost == costRolled && x.unlocked);
        const champWeights = champsOfCost.reduce((acc, x) => {
            const remaining = x.copies_in_pool - (taken[x.name] ?? 0);
            if (remaining > 0) acc[x.name] = remaining;
            return acc;
        }, {});
        if (Object.keys(champWeights).length > 0) shop.push(weightedRandom(champWeights));
        else shop.push(null);
    }
    return shop;
}

export function doRoll(state, subtractGold=true) {
    if (subtractGold && state.gold < 2) return false;
    state.shop = rollShop(state);
    if (subtractGold) state.gold -= 2;
    return true;
}

export function addXp(state, amount) {
    if (state.level >= 10) return;
    state.xp += amount;
    while (state.level < 10) {
        const needed = xp_to_level[state.level];
        if (needed == null || state.xp < needed) break;
        state.xp -= needed;
        state.level++;
        if (state.level >= 10) { state.xp = 0; break; }
    }
}

export function buyXp(state) {
    if (state.gold < 4) return false;
    if (state.level >= 10) return false;
    state.gold -= 4;
    addXp(state, 4);
    return true;
}
