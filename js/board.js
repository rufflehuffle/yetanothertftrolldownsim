// ============================================================
// Board constants
// ============================================================
export const BOARD_ROWS = ['D', 'C', 'B', 'A'];
export const BOARD_COLS = [1, 2, 3, 4, 5, 6, 7];

// ============================================================
// Board queries
// ============================================================
export function boardCount(state) {
    return Object.values(state.board).filter(u => u !== null)
    .filter(u => u.name !== 'Ice Tower')
    .filter(u => u.name !== 'Sand Soldier')
    .length;
}

export function findEmptyBoardHex(state) {
    if (boardCount(state) >= state.level) return null;
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
export function getChampAt(state, location) {
    if (location.type === 'bench') return state.bench[location.index]?.name ?? null;
    if (location.type === 'board') return state.board[location.key]?.name ?? null;
    if (location.type === 'shop')  return state.shop[location.index];
}

export function getUnitAt(state, location) {
    if (location.type === 'bench') return state.bench[location.index];
    if (location.type === 'board') return state.board[location.key];
}

export function setUnitAt(state, location, unit) {
    if (location.type === 'bench') state.bench[location.index] = unit;
    if (location.type === 'board') state.board[location.key] = unit;
}
