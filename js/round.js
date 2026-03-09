import { state } from './state.js';

// ============================================================
// Round Event Log — Event Sourcing
// ============================================================
// Stores an append-only sequence of immutable events that
// occurred during a rolldown round. Events are timestamped
// in milliseconds relative to the start of the round.
//
// Lifecycle events fire automatically via the 'rdmodechange'
// CustomEvent dispatched by rolldown-state.js.
//
// Action events are pushed by commands.js after each
// successful command execution.
// ============================================================

const _events = [];
let _startTime = null;

function _elapsed() {
    return _startTime ? Date.now() - _startTime : 0;
}

function _snapshot() {
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

// ── Public API ───────────────────────────────────────────────

/** Append an action event. Called by commands.js after each successful execute(). */
export function record(event) {
    _events.push({ t: _elapsed(), ...event });
}

/** Return a shallow copy of the event log. */
export function getEvents() {
    return [..._events];
}

/** Clear the log (e.g. when loading a preset mid-freeroll). */
export function clearRound() {
    _events.length = 0;
    _startTime = null;
}

// ── Lifecycle handlers (private) ─────────────────────────────

function _startRound() {
    _events.length = 0;
    _startTime = Date.now();
    _events.push({ type: 'round:start', t: 0, ..._snapshot() });
}

function _pauseRound() {
    _events.push({ type: 'round:pause', t: _elapsed() });
}

function _resumeRound() {
    _events.push({ type: 'round:resume', t: _elapsed() });
}

function _endRound() {
    const { gold, level, bench, board } = _snapshot();
    _events.push({ type: 'round:end', t: _elapsed(), gold, level, bench, board });
    _startTime = null;
}

// ── Roll History Analysis ─────────────────────────────────────

/**
 * Groups a round's event log by roll, returning a structured history.
 *
 * @param {object[]} events - Array returned by getEvents()
 * @returns {{
 *   initialState: object|null,
 *   preRollActions: object[],
 *   rolls: Array<{
 *     rollNumber: number,
 *     t: number,
 *     shop: string[],
 *     actions: object[],
 *     unitsSeen: Record<string, number>,
 *     unitsBought: Record<string, number>,
 *     board: Record<string, {name:string,stars:number}|null>,
 *     bench: ({name:string,stars:number}|null)[]
 *   }>
 * }}
 *
 * Board/bench state is reconstructed by simulating each action from
 * the round:start snapshot. For `buy` events the bench slot is inferred
 * (first empty slot) because the event doesn't record the target slot.
 * Star-up merges are not simulated.
 */
export function groupEventsByRoll(events) {
    const LIFECYCLE = new Set(['round:start', 'round:pause', 'round:resume', 'round:end']);

    // ── Seed initial state ────────────────────────────────────
    const startEvent = events.find(e => e.type === 'round:start');
    const initialState = startEvent ? {
        gold:  startEvent.gold,
        level: startEvent.level,
        xp:    startEvent.xp,
        shop:  [...startEvent.shop],
        bench: startEvent.bench.map(u => u ? { ...u } : null),
        board: Object.fromEntries(
            Object.entries(startEvent.board).map(([k, v]) => [k, v ? { ...v } : null])
        ),
    } : null;

    // ── Working state for board/bench simulation ──────────────
    let workingBench = initialState
        ? initialState.bench.map(u => u ? { ...u } : null)
        : [];
    let workingBoard = initialState
        ? Object.fromEntries(
            Object.entries(initialState.board).map(([k, v]) => [k, v ? { ...v } : null])
          )
        : {};

    // Ported from logic.js — operate on working state instead of global state
    function _findUnits(name, stars) {
        const results = [];
        for (const [key, unit] of Object.entries(workingBoard)) {
            if (unit?.name === name && unit.stars === stars)
                results.push({ location: { type: 'board', key }, unit });
        }
        workingBench.forEach((unit, i) => {
            if (unit?.name === name && unit.stars === stars)
                results.push({ location: { type: 'bench', index: i }, unit });
        });
        return results;
    }

    function _setUnitAt(location, unit) {
        if (location.type === 'bench') workingBench[location.index] = unit;
        if (location.type === 'board') workingBoard[location.key]   = unit;
    }

    function _checkStarUp(champName) {
        for (const stars of [1, 2]) {
            const matches = _findUnits(champName, stars);
            if (matches.length < 3) continue;
            const target = matches.find(m => m.location.type === 'board') ?? matches[0];
            const others = matches.filter(m => m !== target).slice(0, 2);
            for (const { location } of others) _setUnitAt(location, null);
            target.unit.stars = stars + 1;
            _setUnitAt(target.location, target.unit);
            _checkStarUp(champName);
            break;
        }
    }

    function _applyAction(event) {
        if (event.type === 'buy') {
            const slot = workingBench.indexOf(null);
            if (slot !== -1) {
                // Normal buy: place 1-star on bench, then check for star-up cascade
                workingBench[slot] = { name: event.champName, stars: 1 };
                _checkStarUp(event.champName);
            } else {
                // Bench-full buy: shop copy is consumed; star up existing copies in place
                // (mirrors buyChamp's bench-full branch in logic.js)
                for (const stars of [1, 2]) {
                    const matches = _findUnits(event.champName, stars);
                    if (matches.length === 0) continue;
                    const target = matches.find(m => m.location.type === 'board') ?? matches[0];
                    const others = matches.filter(m => m !== target).slice(0, 2);
                    for (const { location } of others) _setUnitAt(location, null);
                    target.unit.stars = stars + 1;
                    _setUnitAt(target.location, target.unit);
                    break;
                }
                _checkStarUp(event.champName);
            }
        } else if (event.type === 'sell') {
            const loc = event.location;
            if (loc.type === 'board') workingBoard[loc.key]    = null;
            else if (loc.type === 'bench') workingBench[loc.index] = null;
        } else if (event.type === 'move') {
            // moveUnit does a swap — mirrors logic.js moveUnit behaviour
            const unitA = event.from.type === 'board'
                ? workingBoard[event.from.key]
                : workingBench[event.from.index];
            const unitB = event.to.type === 'board'
                ? workingBoard[event.to.key]
                : workingBench[event.to.index];
            _setUnitAt(event.from, unitB ? { ...unitB } : null);
            _setUnitAt(event.to,   unitA ? { ...unitA } : null);
        }
    }

    function _snapshotState() {
        return {
            board: Object.fromEntries(
                Object.entries(workingBoard).map(([k, v]) => [k, v ? { ...v } : null])
            ),
            bench: workingBench.map(u => u ? { ...u } : null),
        };
    }

    // ── Scan events ───────────────────────────────────────────
    const result = { initialState, preRollActions: [], rolls: [] };
    const unitsSeen  = {};
    const unitsBought = {};
    let currentActions = [];
    let firstRollSeen = false;

    for (const event of events) {
        if (LIFECYCLE.has(event.type)) continue;

        if (event.type === 'roll') {
            if (!firstRollSeen) {
                // Actions before the first roll
                result.preRollActions = currentActions;
                firstRollSeen = true;
            } else {
                // Actions that followed the previous roll — finalise that entry
                const prev = result.rolls[result.rolls.length - 1];
                prev.actions = currentActions;
                Object.assign(prev, _snapshotState());
            }
            currentActions = [];

            // Accumulate cumulative shop exposure
            for (const champ of event.shopAfter) {
                if (champ) unitsSeen[champ] = (unitsSeen[champ] || 0) + 1;
            }

            result.rolls.push({
                rollNumber:  result.rolls.length + 1,
                t:           event.t,
                shop:        [...event.shopAfter],
                actions:     [],          // filled when next roll/end is reached
                unitsSeen:   { ...unitsSeen },
                unitsBought: { ...unitsBought },
                board:       null,        // filled when next roll/end is reached
                bench:       null,
            });
        } else {
            if (event.type === 'buy')
                unitsBought[event.champName] = (unitsBought[event.champName] || 0) + 1;
            _applyAction(event);
            currentActions.push(event);
        }
    }

    // ── Finalise last roll (or pre-roll buffer if no rolls) ───
    if (result.rolls.length > 0) {
        const last = result.rolls[result.rolls.length - 1];
        last.actions = currentActions;
        Object.assign(last, _snapshotState());
    } else {
        result.preRollActions = currentActions;
    }

    return result;
}

// ── Wire to rolldown-state rdmodechange event ─────────────────

document.addEventListener('rdmodechange', ({ detail: { from, to } }) => {
    if (to === 'round'    && from !== 'paused')  _startRound();
    if (to === 'paused'   && from === 'round')   _pauseRound();
    if (to === 'round'    && from === 'paused')  _resumeRound();
    if (to === 'roundEnd')                        _endRound();
});
