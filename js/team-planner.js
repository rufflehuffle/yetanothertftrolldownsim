import { pool, traits as traitTable } from './tables.js';
import { state, saveTeamPlan, saveUnlockedOverrides, isOriginallyLocked, setPlannedAsGenerateTarget } from './state.js';
import { render, computeTraits, getSortedTraitEntries, activeBreakpoint, nextBreakpoint } from './render.js';
import { generate41Board } from './board-generator.js';
import { openTeams, saveActiveTeam, lastLoadedPreset, renameTeam } from './teams.js';

// ============================================================
// Constants
// ============================================================
export const TEAM_MAX    = 10;
export const COST_TIERS  = [1, 2, 3, 4, 5];
export const COST_LABELS = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' };

// Maps cost tier → CSS modifier class on .planner-picker__unit / .planner-selected__unit
const COST_CLASS = {
    1: 'picker__unit--1-cost',
    2: 'picker__unit--2-cost',
    3: 'picker__unit--3-cost',
    4: 'picker__unit--4-cost',
    5: 'picker__unit--5-cost',
    7: 'picker__unit--5-cost'
};
const SELECTED_COST_CLASS = {
    1: 'selected__unit--1-cost',
    2: 'selected__unit--2-cost',
    3: 'selected__unit--3-cost',
    4: 'selected__unit--4-cost',
    5: 'selected__unit--5-cost',
    7: 'selected__unit--7-cost'
};

export const COST_COLORS = { 1: '#9e9e9e', 2: '#4caf50', 3: '#2196f3', 4: '#9c27b0', 5: '#ff9800' };
const TRAIT_TIER_CLASS = {
    Bronze:    'symbol--bronze',
    Silver:    'symbol--silver',
    Gold:      'symbol--gold',
    Legendary: 'symbol--legendary',
    Prismatic: 'symbol--prismatic',
};

// ============================================================
// Element refs
// ============================================================
const plannerEl         = document.querySelector('.planner');
const plannerBackdropEl = document.querySelector('.planner-backdrop');
const pickerEl          = document.querySelector('.planner-picker');
const teamGridEl        = document.querySelector('.planner-selected__team');
const traitsEl          = document.querySelector('.planner-traits');
const closeBtnEl        = document.querySelector('.planner__close-btn');
const clearBtnEl        = document.querySelector('.planner-selected__clear-btn');
const undoBtnEl         = document.querySelector('.planner-selected__undo-btn');
const unlockToggleEl    = document.querySelector('.planner-picker__unlockable-switch input');
const teamPlannerBtnEl  = document.querySelector('.planner-btn');
const generateBtnEl     = document.querySelector('.planner-selected__generate-btn'); // TODO (temp): 4-1 generator
const setTargetBtnEl    = document.querySelector('.planner-selected__set-target-btn');
const pasteBtnEl        = document.querySelector('.planner-selected__paste-btn');
const plannerTitleEl    = document.querySelector('.planner-selected__title');
const plannerEditBtnEl  = document.querySelector('.planner-selected__edit-btn');

// ============================================================
// Undo stack  (stores serialised Set snapshots)
// ============================================================
const undoStack = [];
const UNDO_LIMIT = 20;

function pushUndo() {
    undoStack.push([...state.teamPlan]);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

// ============================================================
// Picker helpers
// ============================================================

function makeLockBadge(isLocked, isUnlocked, forPicker = true) {
    const badge = document.createElement('div');
    const statusClass = isUnlocked
        ? (forPicker ? 'picker__unit-lock-status--unlocked' : 'selected__unit-lock-status--unlocked')
        : (forPicker ? 'picker__unit-lock-status--locked'   : 'selected__unit-lock-status--locked');
    badge.className = (forPicker
        ? 'planner-picker__unit-lock-status'
        : 'planner-selected__unit-lock-status') + ' ' + statusClass;

    const img = document.createElement('img');
    img.src = isUnlocked ? 'img/unlock.png' : 'img/lock.png';
    img.className = forPicker ? 'planner-picker__unit-lock-symbol' : 'planner-selected__unit-lock-symbol';
    badge.appendChild(img);
    return badge;
}

function makePickerUnit(champ) {
    const isLocked   = isOriginallyLocked(champ.name);
    const isUnlocked = isLocked && pool[champ.name].unlocked;
    const isSelected = state.teamPlan.has(champ.name);

    // Outer container (holds unit card + name)
    const container = document.createElement('div');
    container.className = 'planner-picker__unit-container';
    container.dataset.name = champ.name;

    // Unit card
    const card = document.createElement('div');
    card.className = `planner-picker__unit ${COST_CLASS[champ.cost] ?? ''}`;
    if (isSelected) card.classList.add('picker-unit--selected');

    // Champion image
    const img = document.createElement('img');
    img.className = 'planner-picker__unit-img';
    img.src = champ.icon;
    img.alt = champ.name;
    img.draggable = false;
    card.appendChild(img);

    // Trait icons row
    const traitContainer = document.createElement('div');
    traitContainer.className = 'planner-picker__unit-trait-container';
    for (const trait of champ.synergies) {
        const traitData = traitTable[trait];
        if (!traitData) continue;
        const traitImg = document.createElement('img');
        traitImg.className = 'planner-picker__unit-trait';
        traitImg.src = traitData.icon;
        traitImg.alt = trait;
        traitContainer.appendChild(traitImg);
    }
    card.appendChild(traitContainer);

    // Lock badge — only for originally-locked champions
    if (isLocked) {
        card.appendChild(makeLockBadge(isLocked, isUnlocked, true));
    }

    container.appendChild(card);

    // Name label beneath the card
    const nameEl = document.createElement('div');
    nameEl.className = 'planner-picker__unit-name';
    nameEl.textContent = champ.name;
    container.appendChild(nameEl);

    // ── Left-click: toggle team plan ──
    card.addEventListener('click', () => {
        pushUndo();
        if (state.teamPlan.has(champ.name)) {
            state.teamPlan.delete(champ.name);
            if (isOriginallyLocked(champ.name)) pool[champ.name].unlocked = false;
        } else {
            if (state.teamPlan.size >= TEAM_MAX) return;
            state.teamPlan.add(champ.name);
            if (isOriginallyLocked(champ.name)) pool[champ.name].unlocked = true;
        }
        saveTeamPlan();
        saveUnlockedOverrides();
        refreshPickerUnit(container, champ);
        renderTeamGrid();
        renderPlannerTraits();
        render();
        saveActiveTeam();
    });

    // ── Right-click: toggle unlock for locked champions ──
    if (isLocked) {
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            pool[champ.name].unlocked = !pool[champ.name].unlocked;
            saveUnlockedOverrides();
            refreshPickerUnit(container, champ);
            // Also refresh the badge in the selected grid if this unit is there
            const selectedSlot = teamGridEl.querySelector(`.planner-selected__unit[data-name="${CSS.escape(champ.name)}"]`);
            if (selectedSlot) {
                const existing = selectedSlot.querySelector('.planner-selected__unit-lock-status');
                if (existing) existing.remove();
                selectedSlot.appendChild(makeLockBadge(true, pool[champ.name].unlocked, false));
            }
        });
    }

    return container;
}

/** Re-syncs a picker unit container's visual state without rebuilding it */
function refreshPickerUnit(container, champ) {
    const isLocked   = isOriginallyLocked(champ.name);
    const isUnlocked = isLocked && pool[champ.name].unlocked;
    const isSelected = state.teamPlan.has(champ.name);

    const card = container.querySelector('.planner-picker__unit');
    card.classList.toggle('picker-unit--selected', isSelected);

    // Refresh lock badge — only for originally-locked champions
    const existingBadge = card.querySelector('.planner-picker__unit-lock-status');
    if (existingBadge) existingBadge.remove();
    if (isLocked) card.appendChild(makeLockBadge(isLocked, isUnlocked, true));
}

// ============================================================
// Build Picker
// ============================================================
export function buildPicker() {
    // Preserve the filter row (first child) and rebuild cost groups after it
    const filterRow = pickerEl.querySelector('.planner-picker__filter-container');
    pickerEl.innerHTML = '';
    if (filterRow) pickerEl.appendChild(filterRow);

    for (const cost of COST_TIERS) {
        const champs = Object.values(pool).filter(c => c.cost === cost);
        if (!champs.length) continue;

        const group = document.createElement('div');
        group.className = 'planner-picker__group';

        // Group header (cost label + gold icon)
        const header = document.createElement('div');
        header.className = 'planner-picker__group-header';
        const headerIcon = document.createElement('img');
        headerIcon.className = 'planner-picker__group-icon';
        headerIcon.src = 'https://wiki.leagueoflegends.com/en-us/images/thumb/Gold_colored_icon.png/20px-Gold_colored_icon.png?39991';
        headerIcon.alt = '';
        header.appendChild(headerIcon);
        const headerText = document.createElement('div');
        headerText.className = 'planner-picker__group-text';
        headerText.textContent = COST_LABELS[cost];
        header.appendChild(headerText);
        group.appendChild(header);

        champs.forEach(c => group.appendChild(makePickerUnit(c)));

        pickerEl.appendChild(group);
    }
}

function getCostColor(cost) {
    return COST_COLORS[cost] ?? '#ccc';
}

// ============================================================
// Team Grid (5×2 fixed slots)
// ============================================================
export function renderTeamGrid() {
    teamGridEl.innerHTML = '';

    const selected = [...state.teamPlan];

    for (let i = 0; i < TEAM_MAX; i++) {
        const name  = selected[i] ?? null;
        const champ = name ? pool[name] : null;

        const slot = document.createElement('div');
        slot.className = 'planner-selected__unit';

        if (champ) {
            slot.dataset.name = name;
            const isLocked   = isOriginallyLocked(name);
            const isUnlocked = isLocked && pool[name].unlocked;

            slot.classList.add(SELECTED_COST_CLASS[champ.cost] ?? '');

            // Trait hexagons (top-left overlay)
            const traitsOverlay = document.createElement('div');
            traitsOverlay.className = 'planner-selected__unit-traits';
            for (const trait of champ.synergies) {
                const traitData = traitTable[trait];
                if (!traitData) continue;
                const hex = document.createElement('div');
                hex.className = 'planner-selected__unit-trait';
                const tImg = document.createElement('img');
                tImg.className = 'planner-selected__unit-symbol';
                tImg.src = traitData.icon;
                tImg.alt = trait;
                hex.appendChild(tImg);
                traitsOverlay.appendChild(hex);
            }
            slot.appendChild(traitsOverlay);

            // Champion portrait
            const imgClip = document.createElement('div');
            imgClip.className = 'planner-selected__unit-img-clip';
            const img = document.createElement('img');
            img.className = 'planner-selected__unit-img';
            img.src = champ.tile;
            img.alt = name;
            img.draggable = false;
            img.addEventListener('mousedown', e => e.preventDefault());
            imgClip.appendChild(img);
            slot.appendChild(imgClip);

            // Name bar
            const nameEl = document.createElement('div');
            nameEl.className = 'planner-selected__unit-name';
            nameEl.textContent = name;
            slot.appendChild(nameEl);

            // Lock badge — only for originally-locked champions
            if (isLocked) {
                slot.appendChild(makeLockBadge(isLocked, isUnlocked, false));
            }

            // Right-click on selected slot: toggle unlock for lockable champions
            if (isLocked) {
                slot.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    pool[name].unlocked = !pool[name].unlocked;
                    saveUnlockedOverrides();
                    // Refresh badge in place
                    const existing = slot.querySelector('.planner-selected__unit-lock-status');
                    if (existing) existing.remove();
                    slot.appendChild(makeLockBadge(true, pool[name].unlocked, false));
                    // Keep picker in sync
                    const container = pickerEl.querySelector(`.planner-picker__unit-container[data-name="${CSS.escape(name)}"]`);
                    if (container) refreshPickerUnit(container, pool[name]);
                });
            }

            // Left-click to remove
            slot.addEventListener('click', () => {
                pushUndo();
                toggleTeamPlan(name);
            });
        }

        teamGridEl.appendChild(slot);
    }
}

// ============================================================
// Planner Traits panel
// ============================================================
export function renderPlannerTraits() {
    traitsEl.innerHTML = '';

    // Build trait counts from the team plan (not the board)
    const traitCounts = {};
    for (const name of state.teamPlan) {
        const champ = pool[name];
        if (!champ) continue;
        for (const syn of champ.synergies) {
            traitCounts[syn] = (traitCounts[syn] ?? 0) + 1;
        }
    }

    const entries = getSortedTraitEntries(traitCounts);

    for (const [traitName, count] of entries.slice(0, 10)) {
        const traitData = traitTable[traitName];
        if (!traitData) continue;

        const activeBP = activeBreakpoint(traitName, count);
        const isActive = activeBP > 0;

        // Determine tier name for the active breakpoint
        let tierName = 'inactive';
        if (isActive) {
            const bpIndex = traitData.breakpoints.indexOf(activeBP);
            tierName = traitData.breakpoint_tiers?.[bpIndex] ?? 'inactive';
        }

        const row = document.createElement('div');
        row.className = 'planner-traits-container' + (isActive ? ' traits-container--active' : '');

        // Hexagon symbol
        const symbol = document.createElement('div');
        symbol.className = `planner-traits__symbol ${TRAIT_TIER_CLASS[tierName] ?? 'symbol--inactive'}`;
        const symbolImg = document.createElement('img');
        symbolImg.className = 'planner-traits__symbol-img';
        symbolImg.src = traitData.icon;
        symbolImg.alt = traitName;
        symbol.appendChild(symbolImg);
        row.appendChild(symbol);

        // Count
        const countEl = document.createElement('div');
        countEl.className = 'planner-traits__count';
        countEl.style.whiteSpace = 'nowrap';
        countEl.textContent = isActive ? count : `${count} / ${traitData.breakpoints[0]}`;
        row.appendChild(countEl);

        traitsEl.appendChild(row);
    }
}

// ============================================================
// Toggle a unit in/out of the team plan (exported for external use)
// ============================================================
export function toggleTeamPlan(name) {
    if (state.teamPlan.has(name)) {
        state.teamPlan.delete(name);
        if (isOriginallyLocked(name)) pool[name].unlocked = false;
    } else {
        if (state.teamPlan.size >= TEAM_MAX) return;
        state.teamPlan.add(name);
        if (isOriginallyLocked(name)) pool[name].unlocked = true;
    }
    saveTeamPlan();
    saveUnlockedOverrides();

    // Keep picker unit in sync without a full rebuild
    const container = pickerEl.querySelector(`.planner-picker__unit-container[data-name="${CSS.escape(name)}"]`);
    if (container) refreshPickerUnit(container, pool[name]);

    renderTeamGrid();
    renderPlannerTraits();
    render();
    saveActiveTeam();
}

// ============================================================
// Open / Close
// ============================================================
function renderPlannerTitle() {
    plannerTitleEl.textContent = lastLoadedPreset?.name ?? 'Your Team';
}

export function openTeamPlanner() {
    buildPicker();
    renderTeamGrid();
    renderPlannerTraits();
    renderPlannerTitle();
    plannerEl.style.display = 'grid';
    plannerBackdropEl.style.display = 'block';
}

function closeTeamPlanner() {
    plannerEl.style.display = 'none';
    plannerBackdropEl.style.display = 'none';
}

// ============================================================
// Load a team from a shareable code
// Format: [prefix][champion slots][TFTSetXX]
//   prefix 01 → 10 × 2-char hex slots  (teamPlannerCode ≤ 0xFF, older sets)
//   prefix 02 → 10 × 3-char hex slots  (teamPlannerCode 800+, Set 16)
//   empty slot = "00" / "000"
// Example: 0232d36035003435b35735d336322000TFTSet16
// ============================================================
export function loadTeamCode(code) {
    const trimmed = (code || '').trim();
    const match = trimmed.match(/^(01|02)([0-9a-f]+)(TFTSet\d+)$/i);
    if (!match) return false;

    const [, prefix, champData] = match;
    const slotSize = prefix === '01' ? 2 : 3;          // 01→2-char slots, 02→3-char slots

    if (champData.length !== 10 * slotSize) return false; // must be exactly 10 slots

    // Extract non-empty slot codes
    const codes = [];
    for (let i = 0; i < 10; i++) {
        const val = parseInt(champData.slice(i * slotSize, (i + 1) * slotSize), 16);
        if (val !== 0) codes.push(val);
    }

    if (!codes.length) return false;

    // Build reverse lookup: teamPlannerCode → champion name
    const lookup = {};
    for (const [name, data] of Object.entries(pool)) {
        if (data.teamPlannerCode != null) lookup[data.teamPlannerCode] = name;
    }

    const names = codes
        .map(c => lookup[c])
        .filter(Boolean)
        .slice(0, TEAM_MAX);

    if (!names.length) return false;

    pushUndo();
    state.teamPlan.clear();
    for (const name of Object.keys(pool)) {
        if (isOriginallyLocked(name)) pool[name].unlocked = false;
    }
    for (const name of names) {
        state.teamPlan.add(name);
        if (isOriginallyLocked(name)) pool[name].unlocked = true;
    }
    saveTeamPlan();
    saveUnlockedOverrides();
    buildPicker();
    renderTeamGrid();
    renderPlannerTraits();
    render();
    saveActiveTeam();
    return true;
}

// ============================================================
// Wire up UI controls
// ============================================================

// Open/close
teamPlannerBtnEl?.addEventListener('click', openTeamPlanner);
closeBtnEl?.addEventListener('click', closeTeamPlanner);

// Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && plannerEl.style.display !== 'none') closeTeamPlanner();
});

// Clear button
clearBtnEl?.addEventListener('click', () => {
    pushUndo();
    state.teamPlan.clear();
    saveTeamPlan();
    // Reset any unlocked overrides that were set via the planner
    for (const name of Object.keys(pool)) {
        if (isOriginallyLocked(name)) pool[name].unlocked = false;
    }
    saveUnlockedOverrides();
    buildPicker();
    renderTeamGrid();
    renderPlannerTraits();
    render();
    saveActiveTeam();
});

// Undo button
undoBtnEl?.addEventListener('click', () => {
    if (!undoStack.length) return;
    const prev = undoStack.pop();
    state.teamPlan = new Set(prev);
    saveTeamPlan();
    buildPicker();
    renderTeamGrid();
    renderPlannerTraits();
    render();
    saveActiveTeam();
});

// Planner title edit button
plannerEditBtnEl?.addEventListener('click', () => {
    if (!lastLoadedPreset) return;
    plannerTitleEl.style.display = 'none';
    plannerEditBtnEl.style.display = 'none';
    const input = document.createElement('input');
    input.className = 'planner-selected__name-input';
    input.value = lastLoadedPreset.name;
    let committed = false;
    const finish = (cancel = false) => {
        if (committed) return;
        committed = true;
        if (!cancel) {
            const newName = input.value.trim() || lastLoadedPreset.name;
            renameTeam(lastLoadedPreset.id, newName);
        }
        plannerTitleEl.style.display = '';
        plannerEditBtnEl.style.display = '';
        input.remove();
    };
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') finish(false);
        else if (ev.key === 'Escape') finish(true);
    });
    input.addEventListener('blur', () => finish(false));
    plannerTitleEl.parentElement.insertBefore(input, plannerEditBtnEl);
    input.focus();
    input.select();
});

// ── TODO (temp): Generate 4-1 Board button ─────────────────────────────────
// Simulates a standard early-game buying curve and loads the resulting
// board + bench + gold into the main state. Close the planner so the
// user can immediately see the result.
export function triggerGenerate41Board() {
    const target = state.targetTeam ?? state.teamPlan;
    if (!target.size) return false;
    const result = generate41Board(target);
    if (!result) return false;
    state.gold  = result.gold;
    state.level = result.level;
    state.xp    = 0;
    state.bench = result.bench;
    state.board = result.board;
    closeTeamPlanner();
    render();
    return true;
}

generateBtnEl?.addEventListener('click', () => {
    triggerGenerate41Board();
});

// Target team hover preview
const targetPreviewEl = document.createElement('div');
targetPreviewEl.className = 'target-team-preview';
targetPreviewEl.style.display = 'none';
setTargetBtnEl?.appendChild(targetPreviewEl);

function refreshTargetPreview() {
    if (!state.targetTeam || state.targetTeam.size === 0) return;
    targetPreviewEl.innerHTML = '';
    for (const name of state.targetTeam) {
        const champ = pool[name];
        if (!champ) continue;
        const cell = document.createElement('div');
        cell.className = 'target-preview-unit';
        cell.dataset.cost = champ.cost;
        const img = document.createElement('img');
        img.src = champ.icon;
        img.alt = name;
        img.draggable = false;
        cell.appendChild(img);
        targetPreviewEl.appendChild(cell);
    }
    targetPreviewEl.style.display = 'grid';
}

setTargetBtnEl?.addEventListener('click', () => {
    setPlannedAsGenerateTarget();
    refreshTargetPreview();
});

setTargetBtnEl?.addEventListener('mouseenter', refreshTargetPreview);

setTargetBtnEl?.addEventListener('mouseleave', () => {
    targetPreviewEl.style.display = 'none';
});
// ── end TODO ────────────────────────────────────────────────────────────────

// Paste team code
pasteBtnEl?.addEventListener('click', async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { return; }
    const ok = loadTeamCode(text);
    if (!ok) {
        pasteBtnEl.textContent = 'INVALID CODE';
        setTimeout(() => { pasteBtnEl.textContent = 'PASTE TEAM'; }, 1500);
    }
});

// Saved teams button — show .teams panel
const savedTeamsBtnEl = document.querySelector('.planner__saved-teams-btn');
savedTeamsBtnEl?.addEventListener('click', () => {
    openTeams();
    if (plannerEl) plannerEl.style.display = 'none';
});

// Hide planner on startup
if (plannerEl) plannerEl.style.display = 'none';
