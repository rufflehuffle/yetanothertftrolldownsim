import { state } from './state.js';
import { render } from './render.js';
import { playSound } from './audio.js';
import { applyBoardEffects } from './effects.js';
import { getUnitAt, boardCount, findEmptyBoardHex } from './board.js';
import { doRoll, buyXp } from './shop.js';
import { buyChamp, sellUnit } from './units.js';
import { moveUnit, hoveredSlot } from './movement.js';
import { pool } from './data/pool.js';
import { record } from './round.js';

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
        board: state.board.snapshot(),
    };
}

function restoreState(snap) {
    state.gold  = snap.gold;
    state.level = snap.level;
    state.xp    = snap.xp;
    state.shop  = [...snap.shop];
    state.bench = snap.bench.map(u => u ? { ...u } : null);
    state.board.restore(snap.board);
    applyBoardEffects(state);
    render();
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
        const ok = doRoll(state, true) !== false;
        if (ok) {
            playSound('roll.mp3');
            render();
            record({ type: 'roll', goldBefore: this._snap.gold, goldAfter: state.gold, shopBefore: [...this._snap.shop], shopAfter: [...state.shop], bench: this._snap.bench, board: this._snap.board, teamPlan: [...state.teamPlan], level: this._snap.level });
            document.dispatchEvent(new CustomEvent('shoproll'));
        }
        return ok;
    }
    undo() { if (this._snap) restoreState(this._snap); }
}

export class BuyXpCommand {
    execute() {
        if (state.gold < 4 || state.level >= 10) return false;
        this._snap = snapshotState();
        const ok = buyXp(state) !== false;
        if (ok) {
            render();
            record({ type: 'buyXp', goldBefore: this._snap.gold, goldAfter: state.gold, levelBefore: this._snap.level, xpBefore: this._snap.xp, levelAfter: state.level, xpAfter: state.xp });
        }
        return ok;
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
        const ok = buyChamp(state, this._name, this._idx) !== false;
        if (ok) {
            playSound('buy.mp3');
            render();
            record({ type: 'buy', champName: this._name, cost: pool[this._name].cost, shopIndex: this._idx, goldBefore: this._snap.gold, goldAfter: state.gold });
        }
        return ok;
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
        sellUnit(state, this._unit, this._loc);
        applyBoardEffects(state);
        playSound('sell.mp3');
        render();
        record({ type: 'sell', champName: this._unit.name, stars: this._unit.stars, location: this._loc, goldGained: state.gold - this._snap.gold, goldBefore: this._snap.gold, goldAfter: state.gold });
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
        const unit = getUnitAt(state, this._from);
        const ok = moveUnit(state, this._from, this._to);
        if (ok) {
            applyBoardEffects(state);
            render();
            if (unit) record({ type: 'move', champName: unit.name, stars: unit.stars, from: this._from, to: this._to });
        }
        return ok;
    }
    undo() { if (this._snap) restoreState(this._snap); }
}

export class ResetBoardCommand {
    execute() {
        if (state.board.values().every(v => v === null)) return false;
        this._snap = snapshotState();
        state.board.clear();
        applyBoardEffects(state);
        render();
        return true;
    }
    undo() { if (this._snap) restoreState(this._snap); }
}

export class MoveHoveredCommand {
    constructor() {
        this._slot = hoveredSlot;
    }
    execute() {
        if (!this._slot) return false;
        let from, to, unit;
        if (this._slot.type === 'bench') {
            unit = state.bench[this._slot.index];
            if (!unit) return false;
            const key = findEmptyBoardHex(state);
            if (!key) return false;
            from = { type: 'bench', index: this._slot.index };
            to   = { type: 'board', key };
        } else if (this._slot.type === 'board') {
            unit = state.board.get(this._slot.key);
            if (!unit) return false;
            const i = state.bench.findIndex(s => s === null);
            if (i === -1) return false;
            from = { type: 'board', key: this._slot.key };
            to   = { type: 'bench', index: i };
        } else {
            return false;
        }
        this._snap = snapshotState();
        const ok = moveUnit(state, from, to);
        if (ok) {
            applyBoardEffects(state);
            render();
            if (unit) record({ type: 'move', champName: unit.name, stars: unit.stars, from, to });
        }
        return ok;
    }
    undo() { if (this._snap) restoreState(this._snap); }
}
