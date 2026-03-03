import { pool, shop_odds, xp_to_level } from './tables.js';
import { state } from './state.js';
import { render } from './render.js';
import { playSound } from './audio.js';
import { applyBoardEffects } from './main.js'

// ============================================================
// Board utilities
// ============================================================
export const BOARD_ROWS = ['D', 'C', 'B', 'A'];
export const BOARD_COLS = [1, 2, 3, 4, 5, 6, 7];

export function boardCount() {
    return Object.values(state.board).filter(u => u !== null)
    .filter(u => u.name !== 'Ice Tower')
    .filter(u => u.name !== 'Sand Soldier')
    .length;
}

export function findEmptyBoardHex() {
    if (boardCount() >= state.level) return null;
    for (const row of BOARD_ROWS) {
        for (const col of BOARD_COLS) {
            const key = `${row}${col}`;
            if (!state.board[key]) return key;
        }
    }
    return null;
}

// ============================================================
// Unit location accessors
// ============================================================
export function getChampAt(location) {
    // location -> {type: 'board', key: 'A2'} {type: 'shop', index: 0}
    // returns -> 'Swain'
    if (location.type === 'bench') return state.bench[location.index]?.name ?? null;
    if (location.type === 'board') return state.board[location.key]?.name ?? null;
    if (location.type === 'shop')  return state.shop[location.index];
}

export function getUnitAt(location) {
    // location -> {type: 'board', key: 'A2'} {type: 'bench', index: 0}
    // returns -> {name: 'Swain', stars: 1}
    if (location.type === 'bench') return state.bench[location.index];
    if (location.type === 'board') return state.board[location.key];
}

export function setUnitAt(location, unit) {
    if (location.type === 'bench') state.bench[location.index] = unit;
    if (location.type === 'board') state.board[location.key] = unit;
}

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

export function rollShop() {
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

export function doRoll(subtractGold=true) {
    if (state.gold < 2) return;
    state.shop = rollShop();
    if (subtractGold) {
        state.gold -= 2;
        playSound('roll.mp3')
    }
    render();
}

export function addXp(amount) {
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

export function buyXp() {
    if (state.gold < 4) return;
    if (state.level >= 10) return;
    state.gold -= 4;
    addXp(4);
    render();
}

// ============================================================
// Champion management
// ============================================================
export function findUnits(champName, stars) {
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

export function isChampOnBoard(champName) {
    return Object.values(state.board).filter(u => u?.name == champName).length >= 1
}

export function isChampOnBench(champName) {
    return state.bench.filter(u => u?.name == champName).length >= 1
}

export function isChampAnywhere(champName) {
    return isChampOnBench(champName) || isChampOnBoard(champName)
}

export function removeChamps(champName) {
    // Finds all instances of a champion on the board and bench and removes them
    for (const [key, unit] of Object.entries(state.board)) {
        if (unit?.name == champName) {
            setUnitAt({type: 'board', key}, null)
        }
    }
    state.bench.forEach((unit, i) => {
        if (unit?.name == champName) {
            setUnitAt({type: 'bench', index: i}, null)
        }
    })
}

export function checkStarUp(champName) {
    for (const stars of [1, 2]) {
        const matches = findUnits(champName, stars);
        if (matches.length < 3) continue;

        const target = matches.find(m => m.location.type === 'board') ?? matches[0];
        const others = matches.filter(m => m !== target).slice(0, 2);
        for (const { location } of others) setUnitAt(location, null);

        target.unit.stars = stars + 1;
        setUnitAt(target.location, target.unit);
        checkStarUp(champName);
        break;
    }
}

export function buyChamp(champName, shopIndex) {
    const firstEmpty = state.bench.findIndex(slot => slot === null);

    const isUnitOnBench = state.bench.filter(u => u?.name == champName).length >= 1;
    const isUnitOnBoard = Object.values(state.board).filter(u => u?.name == champName).length >= 1;
    const isUnitAnywhere = isUnitOnBench || isUnitOnBoard;

    // Handle bench full scenario
    if (firstEmpty === -1) {
        if (!isUnitAnywhere) return;
        
        const ownedUnits = [
            ...state.bench.filter(u => u?.name === champName),
            ...Object.values(state.board).filter(u => u?.name === champName)
        ];
        const currentCopies = ownedUnits.reduce((sum, u) => sum + (u.stars === 2 ? 3 : u.stars === 3 ? 9 : 1), 0);
        const copiesInShop = state.shop.filter(u => u == champName).length;

        const allCopies = copiesInShop + currentCopies;

        // Check if copies in shop + copies on board == 3 / 6 / 9
        // In full bench scenario:
        //      Check for upgrade possibility:
        //      Thresholds: 3 / 6 / 9
        //      Would current copies + copies in shop bring me over the threshold?
        //          - If yes, buy units from the shop until threshold is met

        const threshold = currentCopies < 3 ? 3 : currentCopies < 6 ? 6 : 9;
        if (allCopies < threshold) return;

        const shopIndices = state.shop.flatMap((val, i) => val === champName ? [i] : []);
        for (let i=0; i<threshold-currentCopies; i++) {
            state.shop[shopIndices[i]] = null;
            state.gold -= pool[champName].cost;
        }
        for (const stars of [1, 2]) {
            const matches = findUnits(champName, stars);
            const target = matches.find(m => m.location.type === 'board') ?? matches[0];
            const others = matches.filter(m => m !== target).slice(0, 2);
            for (const { location } of others) setUnitAt(location, null);
            target.unit.stars = stars + 1;
            setUnitAt(target.location, target.unit);
            break;
        }
        playSound('buy.mp3');
        checkStarUp(champName);
        render();
    
        return;
    }

    state.bench[firstEmpty] = { name: champName, stars: 1 };
    state.gold -= pool[champName].cost;
    state.shop[shopIndex] = null;
    checkStarUp(champName);
    playSound('buy.mp3');
    render();
}

export function sellUnit(unit, location) {
    if (pool[unit.name].cost == 0) return;
    state.gold += sellValue(unit);
    setUnitAt(location, null);
    playSound('sell.mp3');
}

export function sellValue(unit) {
    const cost = pool[unit.name].cost;
    if (unit.stars === 1) return cost;
    if (unit.stars === 2) return cost === 1 ? 3 : 3 * cost - 1;
    if (unit.stars === 3) return 9 * cost - 1;
    return cost;
}

// ============================================================
// Hovered slot (set by main.js event listeners)
// ============================================================
export let hoveredSlot = null;
export function setHoveredSlot(slot) { hoveredSlot = slot; }

export function moveHovered() {
    if (!hoveredSlot) return;
    if (hoveredSlot.type === 'bench') {
        const unit = state.bench[hoveredSlot.index];
        if (!unit) return;
        const targetKey = findEmptyBoardHex();
        if (!targetKey) return;
        state.board[targetKey] = unit;
        state.bench[hoveredSlot.index] = null;
    } else if (hoveredSlot.type === 'board') {
        const unit = state.board[hoveredSlot.key];
        if (!unit) return;
        const firstEmpty = state.bench.findIndex(s => s === null);
        if (firstEmpty === -1) return;
        state.bench[firstEmpty] = unit;
        state.board[hoveredSlot.key] = null;
    }
    render();
}

export function sellHovered() {
    if (!hoveredSlot) return;
    const unit = getUnitAt(hoveredSlot);
    if (!unit) return;
    sellUnit(unit, hoveredSlot);
    render();
}