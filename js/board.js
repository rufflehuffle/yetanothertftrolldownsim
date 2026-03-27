// ============================================================
// Board constants
// ============================================================
export const BOARD_ROWS = ['D', 'C', 'B', 'A'];
export const BOARD_COLS = [1, 2, 3, 4, 5, 6, 7];

// ============================================================
// Board class
// ============================================================
export class Board {
    constructor() {
        this._slots = {};
        for (const row of BOARD_ROWS) {
            for (const col of BOARD_COLS) {
                this._slots[`${row}${col}`] = null;
            }
        }
    }

    get(key)       { return this._slots[key]; }
    set(key, unit) { this._slots[key] = unit; }

    keys()    { return Object.keys(this._slots); }
    values()  { return Object.values(this._slots); }
    entries() { return Object.entries(this._slots); }

    // Deep copy of slots as a plain object (for snapshots, serialization, postrd/grading)
    snapshot() {
        return Object.fromEntries(
            this.entries().map(([k, v]) => [k, v ? { ...v } : null])
        );
    }

    // Restore slot values from a plain object snapshot
    restore(obj) {
        for (const k of this.keys()) {
            const u = obj[k];
            this._slots[k] = u ? { ...u } : null;
        }
    }

    clear() {
        for (const k of this.keys()) this._slots[k] = null;
    }

    // Returns a Set of champion names that have reached 3 stars (bench + board)
    getThreeStarredChampions(bench) {
        const threeStarred = new Set();
        for (const unit of [...bench, ...this.values()]) {
            if (unit?.stars === 3) threeStarred.add(unit.name);
        }
        return threeStarred;
    }

    // Returns a map of champion name -> number of copies owned (bench + board)
    countOwnedCopies(bench) {
        const copiesOwned = {};
        for (const unit of [...bench, ...this.values()]) {
            if (!unit) continue;
            const copies = unit.stars === 2 ? 3 : unit.stars === 3 ? 9 : 1;
            copiesOwned[unit.name] = (copiesOwned[unit.name] ?? 0) + copies;
        }
        return copiesOwned;
    }

    // Create a Board from a plain object (e.g. from board generator results)
    static from(obj) {
        const board = new Board();
        for (const [k, v] of Object.entries(obj)) {
            if (k in board._slots) board._slots[k] = v;
        }
        return board;
    }
}

// ============================================================
// Board queries
// ============================================================
export function boardCount(state) {
    return state.board.values().filter(u => u !== null)
    .filter(u => u.name !== 'Ice Tower')
    .filter(u => u.name !== 'Sand Soldier')
    .length;
}

export function findEmptyBoardHex(state) {
    if (boardCount(state) >= state.level) return null;
    for (const row of BOARD_ROWS) {
        for (const col of BOARD_COLS) {
            const key = `${row}${col}`;
            if (!state.board.get(key)) return key;
        }
    }
    return null;
}

// ============================================================
// Unit location accessors
// ============================================================
export function getChampAt(state, location) {
    if (location.type === 'bench') return state.bench[location.index]?.name ?? null;
    if (location.type === 'board') return state.board.get(location.key)?.name ?? null;
    if (location.type === 'shop')  return state.shop[location.index];
}

export function getUnitAt(state, location) {
    if (location.type === 'bench') return state.bench[location.index];
    if (location.type === 'board') return state.board.get(location.key);
}

export function setUnitAt(state, location, unit) {
    if (location.type === 'bench') state.bench[location.index] = unit;
    if (location.type === 'board') state.board.set(location.key, unit);
}
