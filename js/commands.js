import { state } from './state.js';
import { applyBoardEffects } from './effects.js';
import {
    doRoll, buyXp, buyChamp, sellUnit, moveUnit,
    getUnitAt, boardCount, findEmptyBoardHex,
    hoveredSlot
} from './logic.js';
import { pool } from './tables.js';

// ============================================================
// State snapshot / restore
// ============================================================
function snapshotState() {
    return {
        gold:  state.gold,
        level: state.level,
        xp:    state.xp,
        shop:  [...state.shop],
        bench: state.bench.map(u => u ? { ...u } : null),
        board: Object.fromEntries(
            Object.entries(state.board).map(([k, v]) => [k, v ? { ...v } : null])
        ),
    };
}

function restoreState(snap) {
    state.gold  = snap.gold;
    state.level = snap.level;
    state.xp    = snap.xp;
    state.shop  = [...snap.shop];
    state.bench = snap.bench.map(u => u ? { ...u } : null);
    for (const k of Object.keys(state.board)) {
        const u = snap.board[k];
        state.board[k] = u ? { ...u } : null;
    }
    applyBoardEffects(); // re-validates summons and calls render()
}

// ============================================================
// Command History
// ============================================================
class CommandHistory {
    constructor() {
        this._past   = [];
        this._future = [];
        this._limit  = 50;
        this._listeners = [];
    }

    addListener(fn) { this._listeners.push(fn); }
    _notify() { this._listeners.forEach(fn => fn()); }

    dispatch(cmd) {
        const ok = cmd.execute();
        if (!ok) return false;
        this._past.push(cmd);
        if (this._past.length > this._limit) this._past.shift();
        this._future = [];
        this._notify();
        return true;
    }

    undo() {
        const cmd = this._past.pop();
        if (!cmd) return;
        cmd.undo();
        this._future.push(cmd);
        this._notify();
    }

    redo() {
        const cmd = this._future.pop();
        if (!cmd) return;
        const ok = cmd.execute();
        if (ok) {
            this._past.push(cmd);
            this._notify();
        }
    }

    clear() {
        this._past   = [];
        this._future = [];
    }
}

export const history = new CommandHistory();
export function dispatch(cmd) { return history.dispatch(cmd); }

// ============================================================
// Command classes
// ============================================================
export class RollCommand {
    execute() {
        if (state.gold < 2) return false;
        this._snap = snapshotState();
        return doRoll(true) !== false;
    }
    undo() { if (this._snap) restoreState(this._snap); }
}

export class BuyXpCommand {
    execute() {
        if (state.gold < 4 || state.level >= 10) return false;
        this._snap = snapshotState();
        return buyXp() !== false;
    }
    undo() { if (this._snap) restoreState(this._snap); }
}

export class BuyCommand {
    constructor(champName, shopIndex) {
        this._name = champName;
        this._idx  = shopIndex;
    }
    execute() {
        if (!this._name || state.gold < pool[this._name].cost) return false;
        this._snap = snapshotState();
        return buyChamp(this._name, this._idx) !== false;
    }
    undo() { if (this._snap) restoreState(this._snap); }
}

export class SellCommand {
    constructor(unit, location) {
        this._unit = unit;
        this._loc  = location;
    }
    execute() {
        if (!this._unit || pool[this._unit.name].cost === 0) return false;
        this._snap = snapshotState();
        sellUnit(this._unit, this._loc);
        applyBoardEffects(); // calls render() internally
        return true;
    }
    undo() { if (this._snap) restoreState(this._snap); }
}

export class MoveUnitCommand {
    constructor(from, to) {
        this._from = from;
        this._to   = to;
    }
    execute() {
        this._snap = snapshotState();
        return moveUnit(this._from, this._to);
    }
    undo() { if (this._snap) restoreState(this._snap); }
}

export class MoveHoveredCommand {
    constructor() {
        this._slot = hoveredSlot;
    }
    execute() {
        if (!this._slot) return false;
        let from, to;
        if (this._slot.type === 'bench') {
            const unit = state.bench[this._slot.index];
            if (!unit) return false;
            const key = findEmptyBoardHex();
            if (!key) return false;
            from = { type: 'bench', index: this._slot.index };
            to   = { type: 'board', key };
        } else if (this._slot.type === 'board') {
            const unit = state.board[this._slot.key];
            if (!unit) return false;
            const i = state.bench.findIndex(s => s === null);
            if (i === -1) return false;
            from = { type: 'board', key: this._slot.key };
            to   = { type: 'bench', index: i };
        } else {
            return false;
        }
        this._snap = snapshotState();
        return moveUnit(from, to);
    }
    undo() { if (this._snap) restoreState(this._snap); }
}
