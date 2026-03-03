import { pool } from './tables.js';
import { state } from './state.js';
import { render, computeTraits } from './render.js';
import {
    doRoll, buyXp, buyChamp, getChampAt, getUnitAt, setUnitAt,
    boardCount, findEmptyBoardHex, moveHovered, sellHovered,
    hoveredSlot, setHoveredSlot, sellUnit,
    findUnits, isChampOnBoard, removeChamps, isChampAnywhere
} from './logic.js';
import './team-planner.js';
import { teamBuilderActive, tbDragging, setTbDragging, openTeamBuilder, closeTeamBuilder } from './team-builder.js';
import { openSavePreset, openPresets, loadPreset, lastLoadedPreset, savePresetInput } from './presets.js';
import { playSound } from './audio.js';

// Track rolldown
const rolldown = {
    actions: [
        // Example action:
        // {
        //   type: "start" | "buy" | "sell" | "roll" | "move" | "complete"
        //   unit: "Swain",
        //   timestamp: 12.4,
        //   boardState: [...],
        //   benchState: [...],
        //   shopState: [...],
        //   goldRemaining: 14
        // }
    ],
    shops: []
}

function writeActionToRolldown(rolldown, unit_acted_on=null, action_type, time, state) {
    const action = {
        type: action_type,
        unit: unit_acted_on, // {name: "Swain", star: 1}
        timestamp: time,
        // Save state post-change
        boardState: JSON.parse(JSON.stringify(state.board)),
        benchState: JSON.parse(JSON.stringify(state.bench)),
        shopState: JSON.parse(JSON.stringify(state.shop)),
        goldRemaining: state.gold
    }
    if (action_type == "roll") {
        rolldown.shops.push(JSON.parse(JSON.stringify(state.shop)))
    }
    rolldown.actions.push(action)
}

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
        // TODO: Need to keep track of Ice Tower location in the state and respawn there on 2nd placement
        //       Add 2nd Freljord tower
        //       Have Freljord tower not count towards unit count
        // BUG: Setting location like this will destroy whatever's at that hex, need to make a helper function to find the closest empty hex
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
    // BUG: Dragging Tibbers on and off the board with Annie on the field duplicates Tibbers
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
const sellZone      = document.querySelector('.sell-zone');
const shopContainer = document.querySelector('.hud');

function isOverShop(x, y) {
    const rect = shopContainer.getBoundingClientRect();
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

document.querySelector('.roll-button').addEventListener('click', doRoll);
document.querySelector('.buy-xp-button').addEventListener('click', buyXp);

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
        // Drop onto hovered slot
        if (hoveredSlot) {
            const champName = tbDragging;
            const existing = getUnitAt(hoveredSlot);
            if (hoveredSlot.type === 'board') {
                if (!existing && boardCount() >= state.level) {
                    // board full, try bench
                    playSound('board_full.mp3')
                    const benchIdx = state.bench.findIndex(s => s === null);
                    if (benchIdx !== -1) state.bench[benchIdx] = { name: champName, stars: 1 };
                } else if (!existing) {
                    state.board[hoveredSlot.key] = { name: champName, stars: 1 };
                } else {
                    // swap: push existing to bench if possible
                    const benchIdx = state.bench.findIndex(s => s === null);
                    if (benchIdx !== -1) state.bench[benchIdx] = existing;
                    state.board[hoveredSlot.key] = { name: champName, stars: 1 };
                }
            } else if (hoveredSlot.type === 'bench') {
                if (!existing) {
                    state.bench[hoveredSlot.index] = { name: champName, stars: 1 };
                } else {
                    // place at first empty bench
                    const benchIdx = state.bench.findIndex(s => s === null);
                    if (benchIdx !== -1) state.bench[benchIdx] = { name: champName, stars: 1 };
                }
            }
            applyBoardEffects();
            render();
        } else {
            // Not over a slot — place on first empty bench/board
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
    // Disable hotkeys when typing in preset name input
    if (document.activeElement === savePresetInput) return;

    if (e.key === 'F1') {
        e.preventDefault();
        if (lastLoadedPreset) loadPreset(lastLoadedPreset);
        // TODO: Break timer out of that weird segregated code at the bottom
        // resetTimer();
        return;
    }
    if (e.key === 'd') { if (!e.repeat) doRoll() };
    if (e.key === 'f' || e.key === 'F') { if (!e.repeat) buyXp() };
    if (e.key === 'w') {
        moveHovered();
        applyBoardEffects();
        render();
    }
    // Sell unit
    if (e.key === 'e') {
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
(function () {
    const timerValueEl  = document.querySelector('.timer-value');
    const timerInput    = document.querySelector('.timer-input');
    const timerStartBtn = document.querySelector('.timer-start-btn');
    const timerResetBtn = document.querySelector('.timer-reset-btn');
    const progressFill  = document.querySelector('.top-timer-progress-fill');

    let totalSeconds = 30;
    let remaining    = 30;
    let intervalId   = null;
    let running      = false;
    let expired      = false;

    function showInput() {
        timerInput.style.display = '';
        timerValueEl.style.display = 'none';
    }

    function showText() {
        timerInput.style.display = 'none';
        timerValueEl.style.display = '';
    }

    function updateDisplay() {
        timerValueEl.textContent = `${remaining}`;

        // Progress bar depletes from right: full = 100%, empty = 0%
        const pct = totalSeconds > 0 ? (remaining / totalSeconds) * 100 : 0;
        progressFill.style.width = `${pct}%`;

        timerValueEl.classList.toggle('timer-running',  running && !expired);
        timerValueEl.classList.toggle('timer-warning',  running && !expired && remaining <= 5 && remaining > 0);
        timerValueEl.classList.toggle('timer-expired',  expired);
        progressFill.classList.toggle('timer-warning',  remaining <= 5 && remaining > 0 && !expired);
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
        document.body.classList.add('timer-locked');
        fillBoardFromBench();
    }

    function unlockBoard() {
        expired = false;
        document.body.classList.remove('timer-locked');
    }

    function stopTimer() {
        clearInterval(intervalId);
        intervalId = null;
        running = false;
        timerStartBtn.textContent = '▶';
        timerStartBtn.classList.remove('running');
    }

    function startTimer() {
        if (running || expired) return;

        const parsed = parseInt(timerInput.value, 10);
        totalSeconds = (isNaN(parsed) || parsed < 1) ? 30 : parsed;
        remaining = totalSeconds;

        running = true;
        timerStartBtn.textContent = '⏸';
        timerStartBtn.classList.add('running');
        showText();

        progressFill.style.transition = 'width 1s linear, background 0.4s';

        intervalId = setInterval(() => {
            remaining--;
            updateDisplay();
            if (remaining <= 0) {
                stopTimer();
                lockBoard();
                updateDisplay();
            }
        }, 1000);
        updateDisplay();
    }

    function pauseTimer() {
        stopTimer();
        progressFill.style.transition = 'width 0.3s ease, background 0.4s';
        updateDisplay();
    }

    function resetTimer() {
        stopTimer();
        unlockBoard();
        const parsed = parseInt(timerInput.value, 10);
        totalSeconds = (isNaN(parsed) || parsed < 1) ? 30 : parsed;
        remaining = totalSeconds;
        timerInput.value = totalSeconds;
        progressFill.style.transition = 'width 0.3s ease, background 0.4s';
        showInput();
        updateDisplay();
    }

    timerStartBtn.addEventListener('click', () => {
        if (expired) return;
        if (running) pauseTimer();
        else startTimer();
    });

    timerResetBtn.addEventListener('click', resetTimer);

    timerInput.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    // Init: show input
    showInput();
    updateDisplay();
})();

// ============================================================
// Init
// ============================================================
doRoll(false);