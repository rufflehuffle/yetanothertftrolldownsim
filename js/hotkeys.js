import { dispatch, history, RollCommand, BuyXpCommand, SellCommand, MoveHoveredCommand } from './commands.js';
import { getUnitAt } from './board.js';
import { hoveredSlot } from './movement.js';
import {
    isPlanning, isRound, isPaused, isRoundEnd, isFreeroll,
    startRound, pauseRound, resumeRound, returnToPlanning, exitFreeroll
} from './rolldown-state.js';
import { timerControls } from './timer.js';
import { lastLoadedPreset, loadPreset } from './teams.js';
import { dragging, endDrag } from './drag.js';
import { playSound } from './audio.js';
import { rdShopPrimaryBtn, updateOverlayContent, wasLastRoundGenerated } from './overlay.js';
import { triggerGenerate41Board } from './planner.js';
import { state } from './state.js';
import { render } from './render.js';
import { addXp } from './shop.js';

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
            addXp(state, 2); // +2 XP: round passive grant
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
            if (isRoundEnd() && (lastLoadedPreset || wasLastRoundGenerated())) {
                if (wasLastRoundGenerated()) {
                    triggerGenerate41Board();
                } else {
                    loadPreset(lastLoadedPreset);
                }
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
            const unit = getUnitAt(state, dragging);
            if (unit) dispatch(new SellCommand(unit, dragging));
            endDrag();
        } else if (!dragging && hoveredSlot) {
            const unit = getUnitAt(state, hoveredSlot);
            if (unit) dispatch(new SellCommand(unit, hoveredSlot));
        }
    }
});
