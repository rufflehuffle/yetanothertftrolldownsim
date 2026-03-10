import { pool } from './tables.js';
import { state, saveTeamPlan } from './state.js';
import { render, renderShopSlot } from './render.js';
import {
    doRoll, getChampAt, getUnitAt,
    boardCount, findEmptyBoardHex,
    hoveredSlot, setHoveredSlot, sellValue
} from './logic.js';
import { applyBoardEffects } from './effects.js';
import {
    dispatch, history,
    RollCommand, BuyXpCommand, BuyCommand, SellCommand,
    MoveUnitCommand, MoveHoveredCommand
} from './commands.js';
import { triggerGenerate41Board } from './team-planner.js';
import { tbDragging, setTbDragging, openTeamBuilder, closeTeamBuilder } from './team-builder.js';
import { openSavePreset, openPresets, loadPreset, lastLoadedPreset } from './teams.js';
import { playSound } from './audio.js';
import {
    getRdMode, setRdMode,
    isPlanning, isRound, isPaused, isRoundEnd, isFreeroll,
    startRound, pauseRound, resumeRound, finishRound, returnToPlanning,
    enterFreeroll, exitFreeroll, setStartGuard
} from './rolldown-state.js';
import { timerControls } from './timer.js';
import './teams.js';
import { updateNoCompPopup } from './popup.js';

// Block starting a round when board and planner are both empty
setStartGuard(() => {
    const boardEmpty = Object.values(state.board).every(v => v === null);
    return !(boardEmpty && state.teamPlan.size === 0);
});


// ============================================================
// Ghost
// ============================================================
const ghost = document.createElement('img');
ghost.classList.add('drag-ghost');
ghost.draggable = false;
ghost.style.display = 'none';
document.body.appendChild(ghost);
let shopGhostEl = null, shopGhostSlotEl = null, shopGhostSlotIndex = -1;

// ============================================================
// Sell Zone & drag state
// ============================================================
const sellZone = document.querySelector('.sell-zone');
const hudEl    = document.querySelector('.hud');

function isOverHud(x, y) {
    const rect = hudEl.getBoundingClientRect();
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
    if (isShop) {
        const slotEl = document.querySelectorAll('.shop-slot')[location.index];
        shopGhostSlotEl = slotEl;
        shopGhostSlotIndex = location.index;
        shopGhostEl = slotEl.cloneNode(true);
        shopGhostEl.classList.add('shop-slot-ghost');
        shopGhostEl.style.left = `${e.clientX}px`;
        shopGhostEl.style.top = `${e.clientY}px`;
        document.body.appendChild(shopGhostEl);
        renderShopSlot(slotEl, null);
        ghost.style.display = 'none';
    } else {
        ghost.src = pool[champName].icon;
        ghost.classList.remove('shop-ghost');
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
        ghost.style.display = 'block';
    }
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
    const ok = dispatch(new MoveUnitCommand(dragging, location));
    if (!ok) playSound('board_full.mp3');
    else     playSound('unit_drop.mp3');
    endDrag();
}

function isInSlotCenter(x, y, slotEl) {
    const rect = slotEl.getBoundingClientRect();
    return x >= rect.left + rect.width * 0.25 &&
           x <= rect.left + rect.width * 0.75 &&
           y >= rect.top + rect.height * 0.25 &&
           y <= rect.top + rect.height * 0.75;
}

function handleShopDragEnd(e) {
    if (!dragging || dragging.type !== 'shop') return;
    const champName = getChampAt(dragging);
    if (champName && !isInSlotCenter(e.clientX, e.clientY, shopGhostSlotEl)) {
        dispatch(new BuyCommand(champName, dragging.index));
    }
    endDrag();
}

function endDrag() {
    dragging = null;
    if (shopGhostEl) {
        shopGhostEl.remove();
        shopGhostEl = null;
        renderShopSlot(shopGhostSlotEl, state.shop[shopGhostSlotIndex]);
        shopGhostSlotEl = null;
        shopGhostSlotIndex = -1;
    }
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
    if (unit) dispatch(new SellCommand(unit, dragging));
    endDrag();
});

// ============================================================
// Event Listeners
// ============================================================
(function () {
    const levelDropdown = document.querySelector('.level-dropdown');
    const levelDisplay  = document.querySelector('.level-display');

    levelDisplay.addEventListener('click', (e) => {
        e.stopPropagation();
        levelDropdown.classList.toggle('open');
    });

    levelDropdown.querySelectorAll('.level-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const chosen = Number(opt.dataset.value);
            if (chosen !== state.level) {
                state.level = chosen;
                state.xp = 0;
                applyBoardEffects();
                render();
            }
            levelDropdown.classList.remove('open');
        });
    });

    document.addEventListener('click', () => {
        levelDropdown.classList.remove('open');
    });
})();

document.querySelectorAll('.shop-slot').forEach((slot, i) => {
    const location = { type: 'shop', index: i };
    slot.addEventListener('mousedown', (e) => handleDragStart(e, location));
    slot.addEventListener('mouseup', () => {
        if (!dragging || dragging.type !== 'shop') return;
        if (!dragMoved) {
            const champName = getChampAt(dragging);
            if (champName) dispatch(new BuyCommand(champName, dragging.index));
            endDrag();
        }
    });
});

document.querySelector('.roll-button').addEventListener('click', () => {
    if (isPlanning() || isRoundEnd()) return;
    dispatch(new RollCommand());
});
document.querySelector('.buy-xp-button').addEventListener('click', () => {
    if (isPlanning() || isRoundEnd()) return;
    dispatch(new BuyXpCommand());
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
    const activeGhost = shopGhostEl || ghost;
    activeGhost.style.left = `${e.clientX}px`;
    activeGhost.style.top = `${e.clientY}px`;
    if (shopGhostEl) {
        shopGhostEl.style.opacity = isInSlotCenter(e.clientX, e.clientY, shopGhostSlotEl) ? '1' : '0.8';
    }
    if (dragging.type !== 'shop') {
        const overShop = isOverHud(e.clientX, e.clientY);
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
        history.clear();
        return;
    }
    if (dragging?.type === 'shop' && dragMoved) handleShopDragEnd(e);
    else if (dragging && dragging.type !== 'shop' && isOverHud(e.clientX, e.clientY)) {
        if (!isPlanning() && !isRoundEnd()) {
            const unit = getUnitAt(dragging);
            if (unit) dispatch(new SellCommand(unit, dragging));
        }
        endDrag();
    } else endDrag();
});

// Hotkeys
document.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
        e.preventDefault();
        if (lastLoadedPreset) loadPreset(lastLoadedPreset);
        return;
    }
    // Space: start round from planning, pause/resume during round
    if (e.key === ' ' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        if (isPlanning() && !rdShopPrimaryBtn.disabled) {
            timerControls.start();
            startRound();
        } else if (isPaused()) {
            timerControls.resume();
            resumeRound();
        } else if (isRound()) {
            timerControls.pause();
            pauseRound();
        }
        return;
    }
    // Escape: exit free roll, or pause the round
    if (e.key === 'Escape') {
        if (isFreeroll()) {
            exitFreeroll();
        } else if (isRound()) {
            timerControls.pause();
            pauseRound();
        }
        return;
    }
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
        return;
    }
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        history.redo();
        return;
    }
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'd' || e.key === 'D') {
        if (!e.repeat) {
            if (isRoundEnd() && lastLoadedPreset) {
                // In roundEnd: D resets to last preset instead of rolling
                loadPreset(lastLoadedPreset);
                timerControls.reset();
                returnToPlanning();
                updateOverlayContent();
            } else if (!isPlanning() && !isRoundEnd()) {
                dispatch(new RollCommand());
            }
        }
    }
    if (e.key === 'f' || e.key === 'F') { if (!e.repeat && !isPlanning() && !isRoundEnd()) dispatch(new BuyXpCommand()); }
    if (e.key === 'w' || e.key === 'W') {
        dispatch(new MoveHoveredCommand());
    }
    if (e.key === 'e' || e.key === 'E') {
        // Block selling before the round starts
        if (isPlanning() || isRoundEnd()) return;
        if (dragging && dragging.type !== 'shop') {
            const unit = getUnitAt(dragging);
            if (unit) dispatch(new SellCommand(unit, dragging));
            endDrag();
        } else if (!dragging && hoveredSlot) {
            const unit = getUnitAt(hoveredSlot);
            if (unit) dispatch(new SellCommand(unit, hoveredSlot));
        }
    }
});

document.querySelectorAll('.bench-slot, .hex, .shop-slot, .shop-container, .star-indicator, .board, .trait-panel').forEach(el => {
    el.addEventListener('mousedown', (e) => e.preventDefault());
});

// ============================================================
// Team Builder & Presets button wiring
// ============================================================
document.querySelector('.builder-btn').addEventListener('click', () => openTeamBuilder(ghost, openSavePreset));
document.querySelector('.rolldown-btn').addEventListener('click', closeTeamBuilder);

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
const rdOverlayGenerateBtn         = document.querySelector('.rd-overlay-generate-btn');
const rdPauseEndBtn        = document.querySelector('.rd-pause-overlay__end-btn');
const rdPauseResetBtn      = document.querySelector('.rd-pause-overlay__reset-btn');
const rdPauseFreerollBtn   = document.querySelector('.rd-pause-overlay__freeroll-btn');

function updateOverlayContent() {
    const mode = getRdMode();
    if (mode === 'planning') {
        const canStart = !(Object.values(state.board).every(v => v === null) && state.teamPlan.size === 0);
        rdShopOverlayHint.textContent = 'Space to start';
        rdShopOverlayPresetName.textContent = '';
        rdShopPrimaryBtn.textContent = '▶  Start Round';
        rdShopPrimaryBtn.style.display = '';
        rdShopPrimaryBtn.disabled = !canStart;
        rdOverlayTbBtn.style.display = '';
        rdOverlayPresetsBtn.style.display = '';
        rdOverlayFreerollBtn.style.display = '';
        rdOverlayRoundendFreerollBtn.style.display = 'none';
        rdOverlayGenerateBtn.style.display = 'none';
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
        rdOverlayGenerateBtn.style.display = '';
    } else {
        rdOverlayRoundendFreerollBtn.style.display = 'none';
        rdOverlayGenerateBtn.style.display = 'none';
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
rdOverlayGenerateBtn.addEventListener('click', () => {
    if (!isRoundEnd()) return;
    const applied = triggerGenerate41Board();
    if (!applied) return;
    timerControls.reset();
    returnToPlanning();
    updateOverlayContent();
});

// Pause overlay: Reset to last preset
rdPauseResetBtn.addEventListener('click', () => {
    if (!lastLoadedPreset) return;
    loadPreset(lastLoadedPreset);
    timerControls.reset();
    setRdMode('planning');
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

// Keep overlay content fresh on every mode change and state change
document.addEventListener('rdmodechange', () => updateOverlayContent());
history.addListener(updateOverlayContent);
document.addEventListener('teamplanchange', updateOverlayContent);

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
// Gold Editor (persistent input)
// ============================================================
(function () {
    // Persistent input: always visible in planning/roundEnd/team-builder modes
    const goldInput = document.querySelector('.gold-persistent');
    let persistentOriginal = state.gold;
    goldInput.addEventListener('focus', () => {
        persistentOriginal = state.gold;
        goldInput.select();
    });
    goldInput.addEventListener('blur', () => {
        const val = parseInt(goldInput.value, 10);
        state.gold = isNaN(val) ? persistentOriginal : Math.max(0, val);
        render();
    });
    goldInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); goldInput.blur(); }
        if (e.key === 'Escape') { goldInput.value = state.gold; goldInput.blur(); }
    });
    goldInput.addEventListener('mousedown', (e) => e.stopPropagation());
    goldInput.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
})();


// ============================================================
// Init
// ============================================================
doRoll(false);
updateNoCompPopup();