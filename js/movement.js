import { getUnitAt, setUnitAt, boardCount, findEmptyBoardHex } from './board.js';

// ============================================================
// Unit movement
// ============================================================
export function moveUnit(state, from, to) {
    const unitA = getUnitAt(state, from);
    const unitB = getUnitAt(state, to);
    // Block moving a non-board unit onto an empty board hex when board is full
    if (to.type === 'board' && from.type !== 'board' && !unitB && boardCount(state) >= state.level) {
        return false;
    }
    setUnitAt(state, from, unitB);
    setUnitAt(state, to, unitA);
    return true;
}

// ============================================================
// Hovered slot (set by drag.js event listeners)
// ============================================================
export let hoveredSlot = null;
export function setHoveredSlot(slot) { hoveredSlot = slot; }
