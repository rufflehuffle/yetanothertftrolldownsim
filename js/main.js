import { pool } from './tables.js';
import { state } from './state.js';
import { render, computeTraits } from './render.js';
import {
    doRoll, buyXp, buyChamp, getChampAt, getUnitAt, setUnitAt,
    boardCount, findEmptyBoardHex, moveHovered, sellHovered,
    hoveredSlot, setHoveredSlot, sellUnit, sellValue,
    findUnits, isChampOnBoard, removeChamps, isChampAnywhere
} from './logic.js';
import './team-planner.js';
import { teamBuilderActive, tbDragging, setTbDragging, openTeamBuilder, closeTeamBuilder } from './team-builder.js';
import { openSavePreset, openPresets, loadPreset, lastLoadedPreset, savePresetInput } from './presets.js';
import { playSound } from './audio.js';
import {
    getRdMode, setRdMode,
    isPlanning, isRound, isPaused, isRoundEnd, isFreeroll,
    startRound, pauseRound, resumeRound, finishRound, returnToPlanning,
    enterFreeroll, exitFreeroll
} from './rolldown-state.js';


// Handle Summons
export function applyBoardEffects() {
    handleFreljordTower();
    handleAzirSoldiers();
    handleTibbers();
}

function handleFreljordTower() {
    const { traitCounts } = computeTraits();
    const freljordCount = traitCounts['Freljord'] ?? 0;
    const hasTower = isChampOnBoard('Ice Tower');
    if (freljordCount >= 3 && !hasTower) {
        setUnitAt({type: 'board', key: 'B2'}, {name: 'Ice Tower', stars: 1})
    } else if (freljordCount < 3 && hasTower) {
        removeChamps('Ice Tower')
    }
    render();
}

function handleAzirSoldiers() {
    if (isChampOnBoard('Azir') && !isChampOnBoard('Sand Soldier')) {
        setUnitAt({type: 'board', key: 'A1'}, {name: 'Sand Soldier', stars: 1})
        setUnitAt({type: 'board', key: 'A2'}, {name: 'Sand Soldier', stars: 1})
    } else if (!isChampOnBoard('Azir') && isChampOnBoard('Sand Soldier')) {
        removeChamps('Sand Soldier')
    }
    render();
}

function handleTibbers() {
    if (isChampOnBoard('Annie') && !isChampAnywhere('Tibbers')) {
        setUnitAt({type: 'bench', index: 0}, {name: 'Tibbers', stars: 1})
    } else if (!isChampOnBoard('Annie')) {
        removeChamps('Tibbers')
    }
    render();
}

// ============================================================
// Ghost
// ============================================================
const ghost = document.createElement('img');
ghost.classList.add('drag-ghost');
ghost.draggable = false;
document.body.appendChild(ghost);

// ============================================================
// Sell Zone & drag state
// ============================================================
const sellZone = document.querySelector('.sell-zone');
const shopEl   = document.querySelector('.shop');

function isOverShop(x, y) {
    const rect = shopEl.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

let dragging   = null;
let dragStartX = 0, dragStartY = 0, dragMoved = false;

function handleDragStart(e, location) {
    const champName = getChampAt(location);
    if (!champName) return;
    dragging = location;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragMoved = false;
    const isShop = location.type === 'shop';
    ghost.src = isShop ? pool[champName].tile : pool[champName].icon;
    ghost.style.width = isShop ? '170px' : '80px';
    ghost.style.height = isShop ? '120px' : '92px';
    ghost.style.clipPath = isShop ? 'none' : 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
    ghost.style.display = 'block';
    // Show sell value on the zone for board/bench units (not shop slots)
    if (!isShop) {
        const unit = getUnitAt(location);
        const gold = unit ? sellValue(unit) : 0;
        sellZone.textContent = gold > 0 ? `Sell for ${gold}g` : 'Sell';
    }
    playSound('unit_select.mp3')
}

function handleDrop(location) {
    if (!dragging || dragging.type === 'shop') return;
    const draggedUnit = getUnitAt(dragging);
    const targetUnit  = getUnitAt(location);
    if (location.type === 'board' && dragging.type !== 'board' && !targetUnit && boardCount() >= state.level) {
        playSound('board_full.mp3');
        endDrag();
        return;
    }
    setUnitAt(dragging, targetUnit);
    setUnitAt(location, draggedUnit);
    endDrag();
    playSound('unit_drop.mp3')
    applyBoardEffects();
    render();
}

function handleShopDragEnd() {
    if (!dragging || dragging.type !== 'shop') return;
    const champName = getChampAt(dragging);
    if (champName && state.gold >= pool[champName].cost) {
        buyChamp(champName, dragging.index);
    }
    endDrag();
}

function endDrag() {
    dragging = null;
    ghost.style.display = 'none';
    sellZone.style.display = 'none';
    sellZone.classList.remove('active');
    sellZone.textContent = 'Sell';
}

// ============================================================
// Sell Zone events
// ============================================================
sellZone.addEventListener('mouseenter', () => {
    if (dragging) sellZone.classList.add('active');
});
sellZone.addEventListener('mouseleave', () => {
    sellZone.classList.remove('active');
});
sellZone.addEventListener('mouseup', () => {
    if (!dragging) return;
    // Block selling before the round starts
    if (isPlanning() || isRoundEnd()) { endDrag(); return; }
    const unit = dragging.type === 'shop' ? null : getUnitAt(dragging);
    if (unit) {
        sellUnit(unit, dragging)
    }
    endDrag();
    applyBoardEffects();
    render();
});

// ============================================================
// Event Listeners
// ============================================================
document.querySelector('select[name="level"]').addEventListener('change', (e) => {
    state.level = Number(e.target.value);
    state.xp = 0;
    applyBoardEffects();
    render();
});

document.querySelectorAll('.shop-slot').forEach((slot, i) => {
    const location = { type: 'shop', index: i };
    slot.addEventListener('mousedown', (e) => handleDragStart(e, location));
    slot.addEventListener('mouseup', () => {
        if (!dragging || dragging.type !== 'shop') return;
        if (!dragMoved) {
            const champName = getChampAt(dragging);
            if (champName && state.gold >= pool[champName].cost) buyChamp(champName, dragging.index);
            endDrag();
        }
    });
});

document.querySelector('.roll-button').addEventListener('click', () => {
    if (isPlanning() || isRoundEnd()) return;
    doRoll();
});
document.querySelector('.buy-xp-button').addEventListener('click', () => {
    if (isPlanning() || isRoundEnd()) return;
    buyXp();
});

document.querySelectorAll('.bench-slot').forEach((slot, i) => {
    const location = { type: 'bench', index: i };
    slot.addEventListener('mouseenter', () => setHoveredSlot(location));
    slot.addEventListener('mouseleave', () => setHoveredSlot(null));
    slot.addEventListener('mousedown', (e) => handleDragStart(e, location));
    slot.addEventListener('mouseup', () => handleDrop(location));
});

document.querySelectorAll('.hex').forEach(hex => {
    const key = [...hex.classList].find(c => c !== 'hex');
    const location = { type: 'board', key };
    hex.addEventListener('mouseenter', () => setHoveredSlot(location));
    hex.addEventListener('mouseleave', () => setHoveredSlot(null));
    hex.addEventListener('mousedown', (e) => handleDragStart(e, location));
    hex.addEventListener('mouseup', () => handleDrop(location));
});

document.addEventListener('mousemove', (e) => {
    if (tbDragging) {
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
        return;
    }
    if (!dragging) return;
    if (!dragMoved) {
        const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
        if (Math.hypot(dx, dy) > 4) dragMoved = true;
    }
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
    if (dragging.type !== 'shop') {
        const overShop = isOverShop(e.clientX, e.clientY);
        sellZone.style.display = overShop ? 'flex' : 'none';
        if (!overShop) sellZone.classList.remove('active');
    }
});

document.addEventListener('mouseup', (e) => {
    if (tbDragging) {
        if (hoveredSlot) {
            const champName = tbDragging;
            const existing = getUnitAt(hoveredSlot);
            if (hoveredSlot.type === 'board') {
                if (!existing && boardCount() >= state.level) {
                    playSound('board_full.mp3')
                    const benchIdx = state.bench.findIndex(s => s === null);
                    if (benchIdx !== -1) state.bench[benchIdx] = { name: champName, stars: 1 };
                } else if (!existing) {
                    state.board[hoveredSlot.key] = { name: champName, stars: 1 };
                } else {
                    const benchIdx = state.bench.findIndex(s => s === null);
                    if (benchIdx !== -1) state.bench[benchIdx] = existing;
                    state.board[hoveredSlot.key] = { name: champName, stars: 1 };
                }
            } else if (hoveredSlot.type === 'bench') {
                if (!existing) {
                    state.bench[hoveredSlot.index] = { name: champName, stars: 1 };
                } else {
                    const benchIdx = state.bench.findIndex(s => s === null);
                    if (benchIdx !== -1) state.bench[benchIdx] = { name: champName, stars: 1 };
                }
            }
            applyBoardEffects();
            render();
        } else {
            const benchIdx = state.bench.findIndex(s => s === null);
            if (benchIdx !== -1) {
                state.bench[benchIdx] = { name: tbDragging, stars: 1 };
                applyBoardEffects();
                render();
            } else {
                const boardKey = findEmptyBoardHex();
                if (boardKey) { state.board[boardKey] = { name: tbDragging, stars: 1 }; applyBoardEffects(); render(); }
            }
        }
        setTbDragging(null);
        ghost.style.display = 'none';
        return;
    }
    if (dragging?.type === 'shop' && dragMoved) handleShopDragEnd();
    else endDrag();
});

// Hotkeys
document.addEventListener('keydown', (e) => {
    if (document.activeElement === savePresetInput) return;

    if (e.key === 'F1') {
        e.preventDefault();
        if (lastLoadedPreset) loadPreset(lastLoadedPreset);
        return;
    }
    // Space: start round from planning, or resume from paused
    if (e.key === ' ') {
        e.preventDefault();
        if (isPlanning()) {
            timerControls.start();
            startRound();
        } else if (isPaused()) {
            timerControls.resume();
            resumeRound();
        }
        return;
    }
    // Escape: pause the round
    if (e.key === 'Escape') {
        if (isRound()) {
            timerControls.pause();
            pauseRound();
        }
        return;
    }
    if (e.key === 'd') {
        if (!e.repeat) {
            if (isRoundEnd() && lastLoadedPreset) {
                // In roundEnd: D resets to last preset instead of rolling
                loadPreset(lastLoadedPreset);
                timerControls.reset();
                returnToPlanning();
                updateOverlayContent();
            } else if (!isPlanning() && !isRoundEnd()) {
                doRoll();
            }
        }
    }
    if (e.key === 'f' || e.key === 'F') { if (!e.repeat && !isPlanning() && !isRoundEnd()) buyXp() };
    if (e.key === 'w') {
        moveHovered();
        applyBoardEffects();
        render();
    }
    if (e.key === 'e') {
        // Block selling before the round starts
        if (isPlanning() || isRoundEnd()) return;
        if (dragging && dragging.type !== 'shop') {
            const unit = getUnitAt(dragging);
            if (unit) {
                sellUnit(unit, dragging)
            }
            endDrag();
            applyBoardEffects();
            render();
        } else if (!dragging) {
            sellHovered();
            applyBoardEffects();
        }
    }
});

document.querySelectorAll('.bench-slot, .hex, .shop-slot, .shop-container, .star-indicator, .board, .trait-panel').forEach(el => {
    el.addEventListener('mousedown', (e) => e.preventDefault());
});

// ============================================================
// Team Builder & Presets button wiring
// ============================================================
document.querySelector('.team-builder-button').addEventListener('click', () => openTeamBuilder(ghost, openSavePreset));
document.querySelector('.rolldown-mode-button').addEventListener('click', closeTeamBuilder);
document.querySelector('.presets-button').addEventListener('click', openPresets);

// ============================================================
// Rolldown UI Overlays
// ============================================================
const rdShopOverlayHint       = document.querySelector('.rd-shop-overlay__hint');
const rdShopOverlayPresetName = document.querySelector('.rd-shop-overlay__preset-name');
const rdShopPrimaryBtn        = document.querySelector('.rd-shop-overlay__primary-btn');
const rdOverlayTbBtn       = document.querySelector('.rd-overlay-tb-btn');
const rdOverlayPresetsBtn  = document.querySelector('.rd-overlay-presets-btn');
const rdOverlayFreerollBtn = document.querySelector('.rd-overlay-freeroll-btn');
const rdOverlayRoundendFreerollBtn = document.querySelector('.rd-overlay-roundend-freeroll-btn');
const rdPauseEndBtn        = document.querySelector('.rd-pause-overlay__end-btn');
const rdPauseResetBtn      = document.querySelector('.rd-pause-overlay__reset-btn');
const rdPauseFreerollBtn   = document.querySelector('.rd-pause-overlay__freeroll-btn');

function updateOverlayContent() {
    const mode = getRdMode();
    if (mode === 'planning') {
        rdShopOverlayHint.textContent = 'Space to start';
        rdShopOverlayPresetName.textContent = '';
        rdShopPrimaryBtn.textContent = '▶  Start Round';
        rdShopPrimaryBtn.style.display = '';
        rdShopPrimaryBtn.disabled = false;
        rdOverlayTbBtn.style.display = '';
        rdOverlayPresetsBtn.style.display = '';
        rdOverlayFreerollBtn.style.display = '';
        rdOverlayRoundendFreerollBtn.style.display = 'none';
    } else if (mode === 'roundEnd') {
        rdShopOverlayHint.textContent = lastLoadedPreset ? 'Press D to reset' : '';
        // Preset name on its own line in gold
        rdShopOverlayPresetName.textContent = lastLoadedPreset ? lastLoadedPreset.name : '';
        rdShopPrimaryBtn.textContent = lastLoadedPreset ? '↺  Reset to Preset' : '↺  Reset Timer';
        rdShopPrimaryBtn.style.display = '';
        rdShopPrimaryBtn.disabled = false;
        rdOverlayTbBtn.style.display = 'none';
        rdOverlayPresetsBtn.style.display = 'none';
        rdOverlayFreerollBtn.style.display = 'none';
        rdOverlayRoundendFreerollBtn.style.display = '';
    } else {
        rdOverlayRoundendFreerollBtn.style.display = 'none';
    }
    // Sync pause overlay reset button
    if (rdPauseResetBtn) {
        rdPauseResetBtn.disabled = !lastLoadedPreset;
        rdPauseResetBtn.textContent = lastLoadedPreset ? `↺  ${lastLoadedPreset.name}` : 'Reset to Preset';
    }
}

// Primary button: Start Round (planning) or Reset Preset (roundEnd)
rdShopPrimaryBtn.addEventListener('click', () => {
    const mode = getRdMode();
    if (mode === 'planning') {
        timerControls.start();
        startRound();
    } else if (mode === 'roundEnd') {
        if (lastLoadedPreset) loadPreset(lastLoadedPreset);
        timerControls.reset();
        returnToPlanning();
    }
});

// Secondary overlay buttons mirror the fixed sidebar buttons
rdOverlayTbBtn.addEventListener('click', () => {
    if (isPlanning()) openTeamBuilder(ghost, openSavePreset);
});
rdOverlayPresetsBtn.addEventListener('click', () => {
    if (isPlanning()) openPresets();
});
rdOverlayFreerollBtn.addEventListener('click', () => {
    if (isPlanning()) enterFreeroll();
});
rdOverlayRoundendFreerollBtn.addEventListener('click', () => {
    if (isRoundEnd()) {
        timerControls.reset();
        returnToPlanning();
        enterFreeroll();
        updateOverlayContent();
    }
});

// Pause overlay: Reset to last preset
rdPauseResetBtn.addEventListener('click', () => {
    if (!lastLoadedPreset) return;
    timerControls.reset();
    loadPreset(lastLoadedPreset);
    returnToPlanning();
    updateOverlayContent();
});

// Pause overlay: End Round Early
rdPauseEndBtn.addEventListener('click', () => {
    timerControls.reset();
    finishRound();       // → roundEnd (board locks)
    returnToPlanning();  // → planning immediately (no board to fill from bench here)
    updateOverlayContent();
});

// Pause overlay: enter Free Roll mode
rdPauseFreerollBtn.addEventListener('click', () => {
    timerControls.reset();
    enterFreeroll();
});

// Keep overlay content fresh on every mode change
document.addEventListener('rdmodechange', () => updateOverlayContent());

// Init overlay content
updateOverlayContent();


document.querySelector('.planner-selected__clear-btn')
    ?.addEventListener('click', () => {
        state.teamPlan.clear();
        saveTeamPlan();
        buildPicker();
        renderTeamPlannerSelected();
    });

// ============================================================
// Gold Editor
// ============================================================
(function () {
    const goldEl = document.querySelector('.gold');

    function startGoldEdit() {
        const current = state.gold;
        const input = document.createElement('input');
        input.type = 'number';
        input.value = current;
        input.className = 'gold-input';
        input.min = 0;
        goldEl.replaceWith(input);
        input.select();

        function commit() {
            const val = parseInt(input.value, 10);
            state.gold = isNaN(val) ? current : Math.max(0, val);
            input.replaceWith(goldEl);
            render();
        }

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { input.replaceWith(goldEl); }
        });
        input.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    }

    goldEl.addEventListener('click', () => { if (teamBuilderActive) startGoldEdit(); });
    goldEl.addEventListener('dblclick', () => { if (!teamBuilderActive) startGoldEdit(); });
})();

// ============================================================
// Round Timer
// ============================================================

// timerControls is populated by the IIFE below and exposed for overlay wiring
export let timerControls = {};

(function () {
    const timerValueEl  = document.querySelector('.timer-value');
    const timerInput    = document.querySelector('.timer-input');
    const timerStartBtn = document.querySelector('.timer-start-btn');
    const timerResetBtn = document.querySelector('.timer-reset-btn');
    const progressFill  = document.querySelector('.top-timer-progress-fill');

    let totalMs    = 30000; // total duration in milliseconds
    let remainingMs = 30000; // ms left at last pause/start
    let startedAt  = null;  // Date.now() when the current run began
    let rafId      = null;
    let running    = false;
    let expired    = false;

    // How many ms are actually left right now (accounts for time elapsed since startedAt)
    function currentRemainingMs() {
        if (!running || startedAt === null) return remainingMs;
        return Math.max(0, remainingMs - (Date.now() - startedAt));
    }

    function showInput() {
        timerInput.style.display = '';
        timerValueEl.style.display = 'none';
    }

    function showText() {
        timerInput.style.display = 'none';
        timerValueEl.style.display = '';
    }

    function updateDisplay() {
        const ms = currentRemainingMs();
        const secs = Math.ceil(ms / 1000);
        timerValueEl.textContent = `${secs}`;
        const pct = totalMs > 0 ? (ms / totalMs) * 100 : 0;
        progressFill.style.width = `${pct}%`;
        timerValueEl.classList.toggle('timer-running',  running && !expired);
        timerValueEl.classList.toggle('timer-warning',  running && !expired && secs <= 5 && secs > 0);
        timerValueEl.classList.toggle('timer-expired',  expired);
        progressFill.classList.toggle('timer-warning',  secs <= 5 && secs > 0 && !expired);
        progressFill.classList.toggle('timer-expired',  expired);
    }

    function fillBoardFromBench() {
        for (let i = 0; i < state.bench.length; i++) {
            if (boardCount() >= state.level) break;
            const unit = state.bench[i];
            if (!unit) continue;
            const targetKey = findEmptyBoardHex();
            if (!targetKey) break;
            state.board[targetKey] = unit;
            state.bench[i] = null;
        }
        applyBoardEffects();
        render();
    }

    function lockBoard() {
        expired = true;
        remainingMs = 0;
        document.body.classList.add('timer-locked');
        fillBoardFromBench();
        finishRound();
    }

    function unlockBoard() {
        expired = false;
        document.body.classList.remove('timer-locked');
    }

    function tick() {
        if (!running) return;
        const ms = currentRemainingMs();
        updateDisplay();
        if (ms <= 0) {
            running = false;
            rafId = null;
            timerStartBtn.textContent = '▶';
            timerStartBtn.classList.remove('running');
            lockBoard();
            updateDisplay();
            return;
        }
        rafId = requestAnimationFrame(tick);
    }

    function runRaf() {
        running = true;
        startedAt = Date.now();
        timerStartBtn.textContent = '⏸';
        timerStartBtn.classList.add('running');
        showText();
        // No CSS transition while running — rAF drives the bar directly
        progressFill.style.transition = 'none';
        rafId = requestAnimationFrame(tick);
        updateDisplay();
    }

    function stopRaf() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        // Snapshot how much time was actually left when we stopped
        remainingMs = currentRemainingMs();
        startedAt = null;
        running = false;
        timerStartBtn.textContent = '▶';
        timerStartBtn.classList.remove('running');
    }

    function startTimer() {
        if (running || expired) return;
        const parsed = parseInt(timerInput.value, 10);
        totalMs = ((isNaN(parsed) || parsed < 1) ? 30 : parsed) * 1000;
        remainingMs = totalMs;
        runRaf();
    }

    // Resume from pause — picks up from wherever remainingMs is
    function resumeTimer() {
        if (running || expired || remainingMs <= 0) return;
        runRaf();
    }

    function pauseTimer() {
        stopRaf();
        // Smooth short transition now that the bar is static
        progressFill.style.transition = 'width 0.15s ease, background 0.4s';
        updateDisplay();
    }

    function resetTimer() {
        stopRaf();
        unlockBoard();
        const parsed = parseInt(timerInput.value, 10);
        totalMs = ((isNaN(parsed) || parsed < 1) ? 30 : parsed) * 1000;
        remainingMs = totalMs;
        timerInput.value = Math.round(totalMs / 1000);
        progressFill.style.transition = 'width 0.3s ease, background 0.4s';
        showInput();
        updateDisplay();
    }

    timerStartBtn.addEventListener('click', () => {
        if (expired) return;
        if (running) {
            pauseTimer();
            if (isRound()) pauseRound();
        } else {
            if (isPaused()) {
                resumeTimer();
                resumeRound();
            } else if (isFreeroll()) {
                // Exit freeroll and start a fresh timed round
                exitFreeroll('planning');
                startTimer();
                startRound();
            } else {
                startTimer();
                if (isPlanning()) startRound();
            }
        }
    });

    timerResetBtn.addEventListener('click', () => {
        resetTimer();
        if (isRoundEnd()) returnToPlanning();
        else if (!isPlanning()) setRdMode('planning');
    });

    timerInput.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    showInput();
    updateDisplay();

    // Expose timer controls for overlays and external callers
    timerControls.start         = startTimer;
    timerControls.resume        = resumeTimer;
    timerControls.pause         = pauseTimer;
    timerControls.reset         = resetTimer;
    timerControls.lock          = lockBoard;
    timerControls.unlock        = unlockBoard;
    timerControls.isRunning     = () => running;
    timerControls.isExpired     = () => expired;
    timerControls.getRemaining  = () => Math.ceil(currentRemainingMs() / 1000);
    timerControls.setDuration   = (secs) => {
        timerInput.value = secs;
        if (!running && !expired) {
            totalMs = secs * 1000;
            remainingMs = totalMs;
            updateDisplay();
        }
    };
})();

// ============================================================
// State machine → side effects
// ============================================================
document.addEventListener('rdmodechange', ({ detail: { from, to } }) => {
    // Pause the visual timer when the state machine moves to paused
    if (to === 'paused' && from === 'round') {
        if (timerControls.isRunning?.()) timerControls.pause();
    }
    // Resume the visual timer when the state machine moves back to round
    if (to === 'round' && from === 'paused') {
        if (!timerControls.isRunning?.() && !timerControls.isExpired?.()) timerControls.resume();
    }
    // roundEnd: board is already locked by lockBoard(); nothing extra needed here.
    // planning: board should be unlocked and timer reset so the next round can start
    if (to === 'planning') {
        if (timerControls.isExpired?.()) timerControls.reset();
    }
    // Freeroll: clear expired lock if somehow set
    if (to === 'freeroll') {
        if (timerControls.isExpired?.()) timerControls.unlock();
    }
});

// ============================================================
// Init
// ============================================================
doRoll(false);