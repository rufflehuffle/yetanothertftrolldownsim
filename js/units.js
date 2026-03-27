import { pool } from './tables.js';
import { setUnitAt } from './board.js';

// ============================================================
// Champion queries
// ============================================================
export function findUnits(state, champName, stars) {
    const results = [];
    for (const [key, unit] of Object.entries(state.board)) {
        if (unit?.name === champName && unit.stars === stars)
            results.push({ location: { type: 'board', key }, unit });
    }
    state.bench.forEach((unit, i) => {
        if (unit?.name === champName && unit.stars === stars)
            results.push({ location: { type: 'bench', index: i }, unit });
    });
    return results;
}

export function isChampOnBoard(state, champName) {
    return Object.values(state.board).filter(u => u?.name == champName).length >= 1;
}

export function isChampOnBench(state, champName) {
    return state.bench.filter(u => u?.name == champName).length >= 1;
}

export function isChampAnywhere(state, champName) {
    return isChampOnBench(state, champName) || isChampOnBoard(state, champName);
}

export function removeChamps(state, champName) {
    for (const [key, unit] of Object.entries(state.board)) {
        if (unit?.name == champName) {
            setUnitAt(state, {type: 'board', key}, null);
        }
    }
    state.bench.forEach((unit, i) => {
        if (unit?.name == champName) {
            setUnitAt(state, {type: 'bench', index: i}, null);
        }
    });
}

// ============================================================
// Star-up
// ============================================================
export function checkStarUp(state, champName) {
    for (const stars of [1, 2]) {
        const matches = findUnits(state, champName, stars);
        if (matches.length < 3) continue;

        const target = matches.find(m => m.location.type === 'board') ?? matches[0];
        const others = matches.filter(m => m !== target).slice(0, 2);
        for (const { location } of others) setUnitAt(state, location, null);

        target.unit.stars = stars + 1;
        setUnitAt(state, target.location, target.unit);
        checkStarUp(state, champName);
        break;
    }
}

// ============================================================
// Buy & sell
// ============================================================
export function buyChamp(state, champName, shopIndex) {
    const firstEmpty = state.bench.findIndex(slot => slot === null);

    const isUnitOnBench = state.bench.filter(u => u?.name == champName).length >= 1;
    const isUnitOnBoard = Object.values(state.board).filter(u => u?.name == champName).length >= 1;
    const isUnitAnywhere = isUnitOnBench || isUnitOnBoard;

    // Handle bench full scenario
    if (firstEmpty === -1) {
        if (!isUnitAnywhere) return false;

        const ownedUnits = [
            ...state.bench.filter(u => u?.name === champName),
            ...Object.values(state.board).filter(u => u?.name === champName)
        ];
        const currentCopies = ownedUnits.reduce((sum, u) => sum + (u.stars === 2 ? 3 : u.stars === 3 ? 9 : 1), 0);
        const copiesInShop = state.shop.filter(u => u == champName).length;

        const allCopies = copiesInShop + currentCopies;

        const threshold = currentCopies < 3 ? 3 : currentCopies < 6 ? 6 : 9;
        if (allCopies < threshold) return false;

        const shopIndices = state.shop.flatMap((val, i) => val === champName ? [i] : []);
        for (let i=0; i<threshold-currentCopies; i++) {
            state.shop[shopIndices[i]] = null;
            state.gold -= pool[champName].cost;
        }
        for (const stars of [1, 2]) {
            const matches = findUnits(state, champName, stars);
            const target = matches.find(m => m.location.type === 'board') ?? matches[0];
            const others = matches.filter(m => m !== target).slice(0, 2);
            for (const { location } of others) setUnitAt(state, location, null);
            target.unit.stars = stars + 1;
            setUnitAt(state, target.location, target.unit);
            break;
        }
        checkStarUp(state, champName);

        return true;
    }

    state.bench[firstEmpty] = { name: champName, stars: 1 };
    state.gold -= pool[champName].cost;
    state.shop[shopIndex] = null;
    checkStarUp(state, champName);
    return true;
}

export function sellUnit(state, unit, location) {
    if (pool[unit.name].cost == 0) return false;
    state.gold += sellValue(unit);
    setUnitAt(state, location, null);
    return true;
}

export function sellValue(unit) {
    const cost = pool[unit.name].cost;
    if (unit.stars === 1) return cost;
    if (unit.stars === 2) return cost === 1 ? 3 : 3 * cost - 1;
    if (unit.stars === 3) return 9 * cost - 1;
    return cost;
}
