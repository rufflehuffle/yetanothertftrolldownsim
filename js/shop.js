import { pool } from './data/pool.js';
import { shop_odds } from './data/shop-odds.js';
import { xp_to_level } from './data/xp.js';

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

export function rollShop(state, threeStarred, copiesOwned) {
    const shop = [];
    for (let i = 0; i < 5; i++) {
        const rolledCost = weightedRandom(shop_odds[state.level]);
        // Exclude 3-starred champions from the candidate pool
        const eligibleChampions = Object.values(pool).filter(
            champ => champ.cost == rolledCost && champ.unlocked && !threeStarred.has(champ.name)
        );
        // Weight each eligible champion by remaining copies in the shared pool
        const remainingWeights = eligibleChampions.reduce((weights, champ) => {
            const remainingCopies = champ.copies_in_pool - (copiesOwned[champ.name] ?? 0);
            if (remainingCopies > 0) weights[champ.name] = remainingCopies;
            return weights;
        }, {});
        if (Object.keys(remainingWeights).length > 0) shop.push(weightedRandom(remainingWeights));
        else shop.push(null);
    }
    return shop;
}

export function doRoll(state, subtractGold=true) {
    if (subtractGold && state.gold < 2) return false;
    state.shop = rollShop(state, state.board.getThreeStarredChampions(state.bench), state.board.countOwnedCopies(state.bench));
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
