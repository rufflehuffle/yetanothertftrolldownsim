import { pool } from './data/pool.js';
import { traits as traitTable } from './data/traits.js';
import { addXp, doRoll } from './shop.js';
import { Board } from './board.js';
import { state, saveTeamPlan, saveUnlockedOverrides, isOriginallyLocked, setPlannedAsGenerateTarget, syncTeamPlanSlots } from './state.js';
import { render, computeTraits, getSortedTraitEntries, activeBreakpoint, nextBreakpoint, showTraitTooltip, positionTooltip } from './render.js';
import { generateBoard } from './board-generation/generator.js';
import { openTeams, saveActiveTeam, lastLoadedPreset, renameTeam, setPresetOverride } from './teams.js';
import { detectArchetype, ARCHETYPES, ARCHETYPE_LABEL, ARCHETYPE_ICON } from './board-generation/detect-reroll.js';
import { TANK_CLASS } from './board-generation/constants.js';
import { initFilter, getActiveFilterTraits } from './planner-filter.js';
import { isActiveRound } from './rolldown-state.js';

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
// Unit info panel (singleton, fixed-positioned on body)
// ============================================================
const unitInfoPanel = document.createElement('div');
unitInfoPanel.className = 'planner__unit-info';
document.body.appendChild(unitInfoPanel);

function showUnitInfo(champ, anchorEl) {
    unitInfoPanel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'unit-info__header';

    const panelName = document.createElement('div');
    panelName.className = 'unit-info__name';
    panelName.textContent = champ.name;
    header.appendChild(panelName);

    const panelRole = document.createElement('div');
    panelRole.className = 'unit-info__role';
    panelRole.textContent = `${champ.damageType} ${champ.role}`;
    header.appendChild(panelRole);

    unitInfoPanel.appendChild(header);

    const hr = document.createElement('hr');
    hr.className = 'unit-info__hr';
    unitInfoPanel.appendChild(hr);

    const traitsContainer = document.createElement('div');
    traitsContainer.className = 'unit-info__traits';
    for (const trait of champ.synergies) {
        const traitEl = document.createElement('div');
        traitEl.className = 'unit-info__trait';
        traitEl.textContent = trait;
        traitsContainer.appendChild(traitEl);
    }
    unitInfoPanel.appendChild(traitsContainer);

    const isLocked = isOriginallyLocked(champ.name);
    if (isLocked) {
        const lockHint = document.createElement('div');
        lockHint.className = 'unit-info__lock-hint';
        lockHint.textContent = pool[champ.name].unlocked ? 'MB2 to Lock' : 'MB2 to Unlock';
        unitInfoPanel.appendChild(lockHint);
    }

    const rect = anchorEl.getBoundingClientRect();
    unitInfoPanel.style.left = `${rect.right + 8}px`;
    unitInfoPanel.style.top = `${rect.top}px`;
    unitInfoPanel.style.display = 'block';
}

function hideUnitInfo() {
    unitInfoPanel.style.display = 'none';
}

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
const snapshotBtnEl     = document.querySelector('.planner-selected__snapshot-btn');
const teamPlannerBtnEl  = document.querySelector('.planner-btn');
const actionsBtnEl      = document.querySelector('.planner-selected__actions-btn');
const pasteBtnEl        = document.querySelector('.planner-selected__paste-btn');
const plannerTitleEl    = document.querySelector('.planner-selected__title');
const plannerEditBtnEl  = document.querySelector('.planner-selected__edit-btn');

// ============================================================
// Archetype label — inline after .planner-selected__title
// ============================================================
const archetypeLabelEl = document.createElement('div');
archetypeLabelEl.className = 'planner-archetype-label';
archetypeLabelEl.style.display = 'none';
plannerTitleEl.after(archetypeLabelEl);

let _openArchetypeDropdown = null;

function refreshArchetypeLabel() {
    archetypeLabelEl.innerHTML = '';

    const names = [...state.teamPlan].filter(n => pool[n]);
    if (!names.length) {
        archetypeLabelEl.style.display = 'none';
        return;
    }

    const override  = lastLoadedPreset?.generationOverride ?? null;
    const detected  = detectArchetype(names);
    const effective = override ?? detected;

    archetypeLabelEl.style.display = 'flex';

    const iconEl = document.createElement('img');
    iconEl.className = 'archetype-label__icon';
    iconEl.src = ARCHETYPE_ICON[effective];
    archetypeLabelEl.appendChild(iconEl);

    const textEl = document.createElement('span');
    textEl.className = 'archetype-label__text';
    textEl.textContent = ARCHETYPE_LABEL[effective];
    archetypeLabelEl.appendChild(textEl);

    if (override) {
        const lockEl = document.createElement('img');
        lockEl.className = 'archetype-label__lock';
        lockEl.src = 'img/lock.png';
        archetypeLabelEl.appendChild(lockEl);
    }
}

archetypeLabelEl.addEventListener('click', e => {
    e.stopPropagation();

    if (_openArchetypeDropdown) {
        _openArchetypeDropdown.remove();
        _openArchetypeDropdown = null;
        return;
    }

    if (!lastLoadedPreset) return;

    const dropdown = document.createElement('div');
    dropdown.className = 'archetype-dropdown';

    const currentOverride = lastLoadedPreset?.generationOverride ?? null;
    const names = [...state.teamPlan].filter(n => pool[n]);
    const detected = detectArchetype(names);

    const options = [{ key: 'auto', icon: detected ? ARCHETYPE_ICON[detected] : 'img/xp.png', label: 'Auto' },
        ...ARCHETYPES.map(a => ({ key: a, icon: ARCHETYPE_ICON[a], label: ARCHETYPE_LABEL[a] }))];

    for (const opt of options) {
        const item = document.createElement('div');
        item.className = 'archetype-dropdown__item';
        const isSelected = opt.key === 'auto' ? currentOverride === null : currentOverride === opt.key;
        if (isSelected) item.classList.add('archetype-dropdown__item--selected');

        const optIcon = document.createElement('img');
        optIcon.className = 'archetype-dropdown__icon';
        optIcon.src = opt.icon;
        item.appendChild(optIcon);

        const optText = document.createElement('span');
        optText.textContent = opt.label;
        item.appendChild(optText);

        item.addEventListener('click', ev => {
            ev.stopPropagation();
            setPresetOverride(lastLoadedPreset.id, opt.key === 'auto' ? null : opt.key);
            dropdown.remove();
            _openArchetypeDropdown = null;
            refreshArchetypeLabel();
        });

        dropdown.appendChild(item);
    }

    archetypeLabelEl.appendChild(dropdown);
    _openArchetypeDropdown = dropdown;
});

document.addEventListener('click', () => {
    if (_openArchetypeDropdown) {
        _openArchetypeDropdown.remove();
        _openArchetypeDropdown = null;
    }
    closeActionsDropdown();
});

// ============================================================
// Undo stack  (stores serialised Set snapshots)
// ============================================================
const undoStack = [];
const UNDO_LIMIT = 20;

function pushUndo() {
    undoStack.push({ plan: [...state.teamPlan], slots: [...state.teamPlanSlots] });
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
    if (isSelected) card.classList.add('picker__unit--selected');

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

    // Info panel — populate singleton and position it on hover
    card.addEventListener('mouseenter', () => showUnitInfo(champ, card));
    container.addEventListener('mouseleave', hideUnitInfo);

    // ── Left-click: toggle team plan ──
    card.addEventListener('click', () => {
        pushUndo();
        if (state.teamPlan.has(champ.name)) {
            hideUnitInfo();
            state.teamPlan.delete(champ.name);
            const si = state.teamPlanSlots.indexOf(champ.name);
            if (si !== -1) state.teamPlanSlots[si] = null;
            if (isOriginallyLocked(champ.name)) pool[champ.name].unlocked = false;
        } else {
            if (state.teamPlan.size >= TEAM_MAX) return;
            state.teamPlan.add(champ.name);
            const ei = state.teamPlanSlots.indexOf(null);
            if (ei !== -1) state.teamPlanSlots[ei] = champ.name;
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
            const hint1 = unitInfoPanel.querySelector('.unit-info__lock-hint');
            if (hint1) hint1.textContent = pool[champ.name].unlocked ? 'MB2 to Lock' : 'MB2 to Unlock';
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
    card.classList.toggle('picker__unit--selected', isSelected);

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

    const activeTraits = getActiveFilterTraits();

    if (activeTraits.length > 0) {
        // Trait-grouped mode: reverse alphabetical
        const sorted = [...activeTraits].sort((a, b) => b.localeCompare(a));
        for (const traitName of sorted) {
            const traitData = traitTable[traitName];
            if (!traitData) continue;
            const champs = Object.values(pool).filter(c => c.synergies.includes(traitName));
            if (!champs.length) continue;

            const group = document.createElement('div');
            group.className = 'planner-picker__group';

            const header = document.createElement('div');
            header.className = 'planner-picker__group-header';

            const headerIcon = document.createElement('img');
            headerIcon.className = 'planner-picker__group-icon';
            headerIcon.src = traitData.icon;
            headerIcon.alt = '';
            header.appendChild(headerIcon);

            const headerText = document.createElement('div');
            headerText.className = 'planner-picker__group-text';
            headerText.textContent = traitName;
            header.appendChild(headerText);

            group.appendChild(header);
            champs.forEach(c => group.appendChild(makePickerUnit(c)));
            pickerEl.appendChild(group);
        }
        return;
    }

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
        headerIcon.src = 'img/gold-coin.png';
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

    for (let i = 0; i < TEAM_MAX; i++) {
        const name  = state.teamPlanSlots[i] ?? null;
        const champ = name ? pool[name] : null;

        const slot = document.createElement('div');
        slot.className = 'planner-selected__unit';

        if (champ) {
            slot.dataset.name = name;
            const isLocked    = isOriginallyLocked(name);
            const isUnlocked  = isLocked && pool[name].unlocked;
            const isSatisfied = state.satisfiedPlanUnits.has(name);

            slot.classList.add(SELECTED_COST_CLASS[champ.cost] ?? '');
            if (isSatisfied) slot.classList.add('planner-selected__unit--satisfied');

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
                    const hint2 = unitInfoPanel.querySelector('.unit-info__lock-hint');
                    if (hint2) hint2.textContent = pool[name].unlocked ? 'MB2 to Lock' : 'MB2 to Unlock';
                    // Refresh badge in place
                    const existing = slot.querySelector('.planner-selected__unit-lock-status');
                    if (existing) existing.remove();
                    slot.appendChild(makeLockBadge(true, pool[name].unlocked, false));
                    // Keep picker in sync
                    const container = pickerEl.querySelector(`.planner-picker__unit-container[data-name="${CSS.escape(name)}"]`);
                    if (container) refreshPickerUnit(container, pool[name]);
                });
            }

            // Info panel on hover
            slot.addEventListener('mouseenter', () => showUnitInfo(champ, slot));
            slot.addEventListener('mouseleave', hideUnitInfo);

            // Left-click: re-add if satisfied, otherwise remove
            slot.addEventListener('click', () => {
                pushUndo();
                hideUnitInfo();
                if (isSatisfied) {
                    state.satisfiedPlanUnits.delete(name);
                    state.teamPlan.add(name);
                    saveTeamPlan();
                    renderTeamGrid();
                    render();
                    saveActiveTeam();
                } else {
                    toggleTeamPlan(name);
                }
            });
        }

        teamGridEl.appendChild(slot);
    }

    refreshArchetypeLabel();
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

    const MAX_TRAITS = 10;
    const traitRows = entries.slice(0, MAX_TRAITS);

    for (const [traitName, count] of traitRows) {
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
        symbol.addEventListener('mouseenter', (e) => showTraitTooltip(e, traitName, activeBP));
        symbol.addEventListener('mousemove', positionTooltip);
        symbol.addEventListener('mouseleave', () => { document.querySelector('.trait-tooltip').style.display = 'none'; });
        row.appendChild(symbol);

        // Count
        const countEl = document.createElement('div');
        countEl.className = 'planner-traits__count';
        countEl.style.whiteSpace = 'nowrap';
        countEl.textContent = isActive ? count : `${count} / ${traitData.breakpoints[0]}`;
        row.appendChild(countEl);

        traitsEl.appendChild(row);
    }

    // Fill remaining slots with empty hex placeholders
    for (let i = traitRows.length; i < MAX_TRAITS; i++) {
        const row = document.createElement('div');
        row.className = 'planner-traits-container';
        const symbol = document.createElement('div');
        symbol.className = 'planner-traits__symbol symbol--inactive planner-traits__symbol--empty';
        row.appendChild(symbol);
        traitsEl.appendChild(row);
    }
}

// ============================================================
// Toggle a unit in/out of the team plan (exported for external use)
// ============================================================
export function toggleTeamPlan(name) {
    if (state.teamPlan.has(name)) {
        state.teamPlan.delete(name);
        const si = state.teamPlanSlots.indexOf(name);
        if (si !== -1) state.teamPlanSlots[si] = null;
        if (isOriginallyLocked(name)) pool[name].unlocked = false;
    } else {
        if (state.teamPlan.size >= TEAM_MAX) return;
        state.teamPlan.add(name);
        const ei = state.teamPlanSlots.indexOf(null);
        if (ei !== -1) state.teamPlanSlots[ei] = name;
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
// Snapshot board → planner (replace plan with deduped board units)
// ============================================================
const SNAPSHOT_SUMMONS = new Set(['Ice Tower', 'Sand Soldier']);

export function snapshotBoardToPlanner() {
    const names = [...new Set(
        state.board.values()
            .filter(u => u !== null && !SNAPSHOT_SUMMONS.has(u.name))
            .map(u => u.name)
    )].slice(0, TEAM_MAX);

    if (!names.length) return;

    pushUndo();
    state.teamPlan.clear();
    for (const name of Object.keys(pool)) {
        if (isOriginallyLocked(name)) pool[name].unlocked = false;
    }
    for (const name of names) {
        state.teamPlan.add(name);
        if (isOriginallyLocked(name)) pool[name].unlocked = true;
    }
    syncTeamPlanSlots(names);
    saveTeamPlan();
    saveUnlockedOverrides();
    buildPicker();
    renderTeamGrid();
    renderPlannerTraits();
    render();
    saveActiveTeam();
}

// ============================================================
// Open / Close
// ============================================================
function renderPlannerTitle() {
    plannerTitleEl.textContent = lastLoadedPreset?.name ?? 'New Team';
    refreshArchetypeLabel();
}

export function openTeamPlanner() {
    buildPicker();
    renderTeamGrid();
    renderPlannerTraits();
    renderPlannerTitle();
    refreshSetTargetBtn();
    plannerEl.style.display = 'grid';
    plannerBackdropEl.style.display = 'block';
}

function closeTeamPlanner() {
    hideUnitInfo();
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
    syncTeamPlanSlots(names);
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
plannerBackdropEl?.addEventListener('click', closeTeamPlanner);

// Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && plannerEl.style.display !== 'none') closeTeamPlanner();
});

// Clear button
clearBtnEl?.addEventListener('click', () => {
    pushUndo();
    state.teamPlan.clear();
    state.teamPlanSlots.fill(null);
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
    state.teamPlan = new Set(prev.plan);
    state.teamPlanSlots = [...prev.slots];
    saveTeamPlan();
    buildPicker();
    renderTeamGrid();
    renderPlannerTraits();
    render();
    saveActiveTeam();
});

// Snapshot button
snapshotBtnEl?.addEventListener('click', snapshotBoardToPlanner);

// Planner title edit button
plannerEditBtnEl?.addEventListener('click', () => {
    if (!lastLoadedPreset) return;
    plannerTitleEl.style.display = 'none';
    const input = document.createElement('input');
    input.className = 'planner-selected__name-input';
    input.spellcheck = false;
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
    plannerEditBtnEl.after(input);
    input.focus();
    input.select();
});

// ============================================================
// Satisfied plan units — units already 2-starred after board gen
// that are not 3-star targets. These are suppressed from shop
// badges and greyed in the planner grid.
// ============================================================
function computeSatisfiedPlanUnits() {
    state.satisfiedPlanUnits = new Set();

    const planNames = state.teamPlanSlots.filter(Boolean);
    if (!planNames.length) return;

    const override  = lastLoadedPreset?.generationOverride ?? null;
    const archetype = override ?? detectArchetype(planNames);

    // Build exempt set: 3-star targets that should never be removed
    const exempt = new Set();
    const rerollCost = archetype === 'lv5' ? 1 : archetype === 'lv6' ? 2 : archetype === 'lv7' ? 3 : null;
    if (rerollCost !== null) {
        for (const name of planNames) {
            const champ = pool[name];
            if (!champ) continue;
            if (champ.cost === rerollCost) {
                exempt.add(name);
            } else if (rerollCost < 3 && champ.cost === rerollCost + 1 && TANK_CLASS.has(champ.role)) {
                exempt.add(name);
            }
        }
    }

    // Collect names of all 2-star units on board and bench
    const twoStarNames = new Set();
    for (const unit of state.board.values()) {
        if (unit && unit.stars === 2) twoStarNames.add(unit.name);
    }
    for (const unit of state.bench) {
        if (unit && unit.stars === 2) twoStarNames.add(unit.name);
    }

    // Any non-exempt planner unit already at 2-star is satisfied
    for (const name of planNames) {
        if (!exempt.has(name) && twoStarNames.has(name)) {
            state.satisfiedPlanUnits.add(name);
        }
    }
}

// Generate 4-1 Board button ─────────────────────────────────
// Simulates a standard early-game buying curve and loads the resulting
// board + bench + gold into the main state. Close the planner so the
// user can immediately see the result.
export function triggerGenerate41Board() {
    const target = state.targetTeam ?? state.teamPlan;
    if (!target.size) return false;
    const result = generateBoard(target, lastLoadedPreset?.generationOverride ?? null);
    if (!result) return false;
    state.gold  = result.gold;
    state.level = result.level;
    state.xp    = result.xp;
    addXp(state, 2); // +2 XP: odd-interval pre-round grant
    state.bench = result.bench;
    state.board = Board.from(result.board);
    state.boardGenerated = true;
    computeSatisfiedPlanUnits();
    doRoll(state, false);
    closeTeamPlanner();
    render();
    document.dispatchEvent(new CustomEvent('teamplanchange'));
    return true;
}

// Target team hover preview element (reused across dropdown opens)
const targetPreviewEl = document.createElement('div');
targetPreviewEl.className = 'target-team-preview';
targetPreviewEl.style.display = 'none';

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

function refreshSetTargetBtn() {
    const hasTarget = !!(state.targetTeam?.size);
    actionsBtnEl?.classList.toggle('has-target', hasTarget);
}

// Actions dropdown (GENERATE + SET AS TARGET)
let _openActionsDropdown = null;

function closeActionsDropdown() {
    if (_openActionsDropdown) {
        _openActionsDropdown.remove();
        _openActionsDropdown = null;
    }
}

actionsBtnEl?.addEventListener('click', e => {
    e.stopPropagation();
    if (_openActionsDropdown) { closeActionsDropdown(); return; }

    const hasTarget = !!(state.targetTeam?.size);
    const dropdown = document.createElement('div');
    dropdown.className = 'actions-dropdown';

    // ── GENERATE item ──────────────────────────────────────────
    const generateItem = document.createElement('div');
    generateItem.className = 'actions-dropdown__item actions-item--generate';
    if (isActiveRound()) generateItem.classList.add('is-disabled');
    if (hasTarget) generateItem.classList.add('has-target');

    const generateText = document.createElement('span');
    generateText.textContent = 'GENERATE';
    generateItem.appendChild(generateText);

    const generateTooltip = document.createElement('div');
    generateTooltip.className = 'generate-item__tooltip btn-panel';
    generateTooltip.innerHTML =
        '<div class="btn-panel__title">Generate Board</div>' +
        '<div class="btn-panel__rule"></div>' +
        '<div class="btn-panel__desc generate-desc--plan">Builds a pre-rolldown board for your planned team.</div>' +
        '<div class="btn-panel__desc generate-desc--target">Builds a pre-rolldown board for your target team.</div>';
    generateItem.appendChild(generateTooltip);

    generateItem.addEventListener('click', ev => {
        ev.stopPropagation();
        if (generateItem.classList.contains('is-disabled')) return;
        triggerGenerate41Board();
        closeActionsDropdown();
    });

    // ── SET AS TARGET item ─────────────────────────────────────
    const setTargetItem = document.createElement('div');
    setTargetItem.className = 'actions-dropdown__item actions-item--set-target';
    if (hasTarget) setTargetItem.classList.add('has-target');

    const setTargetText = document.createElement('span');
    setTargetText.textContent = 'SET AS TARGET';
    setTargetItem.appendChild(setTargetText);

    const setTargetTooltip = document.createElement('div');
    setTargetTooltip.className = 'set-target-item__tooltip btn-panel';
    setTargetTooltip.innerHTML =
        '<div class="btn-panel__title">Set as Target</div>' +
        '<div class="btn-panel__rule"></div>' +
        '<div class="btn-panel__desc">Locks your current plan as the Generate target.</div>';
    setTargetItem.appendChild(setTargetTooltip);

    targetPreviewEl.style.display = 'none';
    setTargetItem.appendChild(targetPreviewEl);

    setTargetItem.addEventListener('click', ev => {
        ev.stopPropagation();
        setPlannedAsGenerateTarget();
        refreshTargetPreview();
        refreshSetTargetBtn();
        const nowHasTarget = !!(state.targetTeam?.size);
        generateItem.classList.toggle('has-target', nowHasTarget);
        setTargetItem.classList.toggle('has-target', nowHasTarget);
    });

    setTargetItem.addEventListener('mouseenter', refreshTargetPreview);
    setTargetItem.addEventListener('mouseleave', () => { targetPreviewEl.style.display = 'none'; });

    dropdown.appendChild(generateItem);
    dropdown.appendChild(setTargetItem);
    actionsBtnEl.appendChild(dropdown);
    _openActionsDropdown = dropdown;
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

// Clear button: wipe the entire team plan
clearBtnEl?.addEventListener('click', () => {
    pushUndo();
    state.teamPlan.clear();
    state.teamPlanSlots.fill(null);
    saveTeamPlan();
    buildPicker();
    renderTeamGrid();
    renderPlannerTraits();
    render();
    saveActiveTeam();
});

// Wire up filter modal
initFilter(document.querySelector('.planner-picker__filter-btn'));
document.addEventListener('filterchange', buildPicker);

// Hide planner on startup
if (plannerEl) plannerEl.style.display = 'none';
