import { dispatch, history, RollCommand, BuyXpCommand, SellCommand, MoveHoveredCommand } from './commands.js';
import { hoveredSlot, getUnitAt } from './logic.js';
import {
    isPlanning, isRound, isPaused, isRoundEnd, isFreeroll,
    startRound, pauseRound, resumeRound, returnToPlanning, exitFreeroll
} from './rolldown-state.js';
import { timerControls } from './timer.js';
import { lastLoadedPreset, loadPreset } from './teams.js';
import { dragging, endDrag } from './drag.js';
import { playSound } from './audio.js';
import { rdShopPrimaryBtn, updateOverlayContent } from './overlay.js';
import { state } from './state.js';
import { render } from './render.js';
import { addXp } from './logic.js';

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
            addXp(2); // +2 XP: round passive grant
            render();
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
                loadPreset(lastLoadedPreset);
                timerControls.reset();
                returnToPlanning();
                updateOverlayContent();
            } else if (!isPlanning() && !isRoundEnd()) {
                dispatch(new RollCommand());
            }
        }
    }
    if (e.key === 'f' || e.key === 'F') { if (!e.repeat && !isRoundEnd()) dispatch(new BuyXpCommand()); }
    if (e.key === 'w' || e.key === 'W') {
        if (isPlanning()) { playSound('board_full.mp3'); return; }
        dispatch(new MoveHoveredCommand());
    }
    if (e.key === 'e' || e.key === 'E') {
        if (isRoundEnd()) return;
        const activeSlot = (dragging && dragging.type !== 'shop') ? dragging : hoveredSlot;
        if (isPlanning() && activeSlot?.type !== 'bench') return;
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
