import { state } from './state.js';
import { doRoll } from './logic.js';
import { setStartGuard } from './rolldown-state.js';
import { updateNoCompPopup } from './popup.js';
import './drag.js';
import './overlay.js';
import './hotkeys.js';
import './hud.js';
import './teams.js';

// Block starting a round when board and planner are both empty
setStartGuard(() => {
    const boardEmpty = Object.values(state.board).every(v => v === null);
    return !(boardEmpty && state.teamPlan.size === 0);
});

// Init
doRoll(false);
updateNoCompPopup();
