import { pool } from '../data/pool.js';
import { shop_odds } from '../data/shop-odds.js';
import { weightedRandom } from './helpers.js';

// Simulate one 5-slot shop at the given level.
// `taken` maps champName → copies already removed from the pool.
export function simulateShop(level, taken) {
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
