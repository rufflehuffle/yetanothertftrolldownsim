import { pool } from './tables.js';
import { state } from './state.js';
import { render, renderShopSlot } from './render.js';
import {
    getChampAt, getUnitAt, boardCount, findEmptyBoardHex,
    hoveredSlot, setHoveredSlot, sellValue
} from './logic.js';
import { applyBoardEffects } from './effects.js';
import {
    dispatch, history,
    BuyCommand, SellCommand, MoveUnitCommand
} from './commands.js';
import { tbDragging, setTbDragging } from './team-builder.js';
import { playSound } from './audio.js';
import { isPlanning, isRoundEnd } from './rolldown-state.js';

// ============================================================
// Ghost
// ============================================================
export const ghost = document.createElement('img');
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

export let dragging = null;
let dragStartX = 0, dragStartY = 0, dragMoved = false;
let dragSourceEl = null;
let shopDragActivated = false;

export function handleDragStart(e, location) {
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
        shopDragActivated = false;
        // Ghost creation deferred until mouse leaves the slot rect
    } else {
        document.body.classList.add('is-dragging');
        ghost.src = pool[champName].icon;
        ghost.classList.remove('shop-ghost');
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
        ghost.style.display = 'block';
        if (location.type === 'bench') {
            dragSourceEl = document.querySelectorAll('.bench-slot')[location.index];
        } else if (location.type === 'board') {
            dragSourceEl = document.querySelector('.' + location.key);
        }
        if (dragSourceEl) dragSourceEl.classList.add('drag-source');
    }
    if (!isShop) {
        const unit = getUnitAt(location);
        const gold = unit ? sellValue(unit) : 0;
        sellZone.textContent = gold > 0 ? `Sell for ${gold}g` : 'Sell';
    }
    playSound('unit_select.mp3');
}

export function handleDrop(location) {
    if (!dragging || dragging.type === 'shop') return;
    const isBoardBenchSwap = (dragging.type === 'board' && location.type === 'bench') ||
                             (dragging.type === 'bench' && location.type === 'board');
    if (isPlanning() && isBoardBenchSwap) { playSound('board_full.mp3'); endDrag(); return; }
    const ok = dispatch(new MoveUnitCommand(dragging, location));
    if (!ok) playSound('board_full.mp3');
    else     playSound('unit_drop.mp3');
    endDrag();
}

function findNearestHexToPoint(x, y) {
    const boardEl = document.querySelector('.board');
    const boardRect = boardEl.getBoundingClientRect();
    if (x < boardRect.left || x > boardRect.right || y < boardRect.top || y > boardRect.bottom) return null;
    let nearest = null, minDist = Infinity;
    document.querySelectorAll('.hex').forEach(hex => {
        const rect = hex.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist < minDist) { minDist = dist; nearest = hex; }
    });
    return nearest;
}

function findNearestBenchSlotToPoint(x, y) {
    const benchEl = document.querySelector('.bench');
    const benchRect = benchEl.getBoundingClientRect();
    if (x < benchRect.left || x > benchRect.right || y < benchRect.top || y > benchRect.bottom) return null;
    let nearest = null, minDist = Infinity;
    document.querySelectorAll('.bench-slot').forEach((slot, i) => {
        const rect = slot.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist < minDist) { minDist = dist; nearest = i; }
    });
    return nearest;
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

function activateShopDrag(e) {
    shopDragActivated = true;
    document.body.classList.add('is-dragging');
    shopGhostEl = shopGhostSlotEl.cloneNode(true);
    shopGhostEl.classList.add('shop-slot-ghost');
    shopGhostEl.style.left = `${e.clientX}px`;
    shopGhostEl.style.top = `${e.clientY}px`;
    document.body.appendChild(shopGhostEl);
    renderShopSlot(shopGhostSlotEl, null);
    ghost.style.display = 'none';
}

export function endDrag() {
    dragging = null;
    shopDragActivated = false;
    document.body.classList.remove('is-dragging');
    if (shopGhostEl) {
        shopGhostEl.remove();
        shopGhostEl = null;
        renderShopSlot(shopGhostSlotEl, state.shop[shopGhostSlotIndex]);
    }
    shopGhostSlotEl = null;
    shopGhostSlotIndex = -1;
    ghost.style.display = 'none';
    if (dragSourceEl) { dragSourceEl.classList.remove('drag-source'); dragSourceEl = null; }
    document.querySelectorAll('.hex.drag-hover, .bench-slot.drag-hover').forEach(h => h.classList.remove('drag-hover'));
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
    if ((isPlanning() || isRoundEnd()) && dragging.type !== 'bench') { endDrag(); return; }
    const unit = dragging.type === 'shop' ? null : getUnitAt(dragging);
    if (unit) dispatch(new SellCommand(unit, dragging));
    endDrag();
});

// ============================================================
// Shop / Bench / Hex slot listeners
// ============================================================
document.querySelectorAll('.shop-slot').forEach((slot, i) => {
    const location = { type: 'shop', index: i };
    slot.addEventListener('mousedown', (e) => handleDragStart(e, location));
    slot.addEventListener('mouseup', () => {
        if (!dragging || dragging.type !== 'shop') return;
        if (!shopDragActivated) {
            const champName = getChampAt(dragging);
            if (champName) dispatch(new BuyCommand(champName, dragging.index));
            endDrag();
        }
        // If drag was activated, global mouseup handles it via handleShopDragEnd
    });
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

document.querySelectorAll('.bench-slot, .hex, .shop-slot, .shop-container, .star-indicator, .board, .trait-panel, .star-adj, .hex-wrapper').forEach(el => {
    el.addEventListener('mousedown', (e) => e.preventDefault());
});

// ============================================================
// Global mouse events
// ============================================================
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
    if (dragging.type === 'shop' && !shopDragActivated && shopGhostSlotEl) {
        if (!isInSlotCenter(e.clientX, e.clientY, shopGhostSlotEl)) {
            activateShopDrag(e);
        }
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
        const nearest = findNearestHexToPoint(e.clientX, e.clientY);
        const nearestBenchIdx = findNearestBenchSlotToPoint(e.clientX, e.clientY);
        document.querySelectorAll('.hex.drag-hover, .bench-slot.drag-hover').forEach(h => h.classList.remove('drag-hover'));
        if (nearest) nearest.classList.add('drag-hover');
        else if (nearestBenchIdx !== null) document.querySelectorAll('.bench-slot')[nearestBenchIdx].classList.add('drag-hover');
    }
});

document.addEventListener('mouseup', (e) => {
    if (tbDragging) {
        if (hoveredSlot) {
            const champName = tbDragging;
            const existing = getUnitAt(hoveredSlot);
            if (hoveredSlot.type === 'board') {
                if (!existing && boardCount() >= state.level) {
                    playSound('board_full.mp3');
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
    if (dragging?.type === 'shop' && shopDragActivated) handleShopDragEnd(e);
    else if (dragging && dragging.type !== 'shop' && isOverHud(e.clientX, e.clientY)) {
        if (!isPlanning() && !isRoundEnd() || (isPlanning() && dragging.type === 'bench')) {
            const unit = getUnitAt(dragging);
            if (unit) dispatch(new SellCommand(unit, dragging));
        }
        endDrag();
    } else if (dragging && dragging.type !== 'shop') {
        const nearestHex = findNearestHexToPoint(e.clientX, e.clientY);
        if (nearestHex) {
            const key = [...nearestHex.classList].find(c => c !== 'hex');
            handleDrop({ type: 'board', key });
        } else {
            const nearestBench = findNearestBenchSlotToPoint(e.clientX, e.clientY);
            if (nearestBench !== null) handleDrop({ type: 'bench', index: nearestBench });
            else endDrag();
        }
    } else endDrag();
});
