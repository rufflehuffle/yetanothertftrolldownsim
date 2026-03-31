import { pool } from './data/pool.js';
import { traits as traitTable } from './data/traits.js';
import { state, isOriginallyLocked } from './state.js';
import { render } from './render.js';
import { getUnitAt, findEmptyBoardHex } from './board.js';
import { COST_TIERS, COST_LABELS, COST_COLORS } from './planner.js';

// ============================================================
// Team Builder state
// ============================================================
export let teamBuilderActive = false;
export let tbDragging = null;  // champion name being dragged from TB picker
export function setTbDragging(val) { tbDragging = val; }

// Ghost element is passed in from main.js when openTeamBuilder is called
let _ghost = null;

// ============================================================
// Unit hover hint
// ============================================================
const tbHintPanel = document.createElement('div');
tbHintPanel.className = 'tb-unit-hint';
document.body.appendChild(tbHintPanel);

function showTbHint(champ, anchorEl) {
    tbHintPanel.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'tb-unit-hint__header';

    const icon = document.createElement('img');
    icon.className = 'tb-unit-hint__icon';
    icon.src = champ.icon;
    icon.alt = champ.name;
    header.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'tb-unit-hint__info';

    const nameEl = document.createElement('div');
    nameEl.className = 'tb-unit-hint__name';
    nameEl.textContent = champ.name;
    info.appendChild(nameEl);

    const roleEl = document.createElement('div');
    roleEl.className = 'tb-unit-hint__role';
    roleEl.textContent = `${champ.damageType} ${champ.role}`;
    info.appendChild(roleEl);

    header.appendChild(info);
    tbHintPanel.appendChild(header);

    const hr = document.createElement('hr');
    hr.className = 'tb-unit-hint__hr';
    tbHintPanel.appendChild(hr);

    const traitsEl = document.createElement('div');
    traitsEl.className = 'tb-unit-hint__traits';
    for (const trait of champ.synergies) {
        const traitData = traitTable[trait];
        const row = document.createElement('div');
        row.className = 'tb-unit-hint__trait';
        if (traitData) {
            const traitIcon = document.createElement('img');
            traitIcon.className = 'tb-unit-hint__trait-icon';
            traitIcon.src = traitData.icon;
            traitIcon.alt = '';
            row.appendChild(traitIcon);
        }
        const traitName = document.createElement('span');
        traitName.className = 'tb-unit-hint__trait-name';
        traitName.textContent = trait;
        row.appendChild(traitName);
        traitsEl.appendChild(row);
    }
    tbHintPanel.appendChild(traitsEl);

    const rect = anchorEl.getBoundingClientRect();
    tbHintPanel.style.display = 'block';
    const hintH = tbHintPanel.offsetHeight;
    const top = Math.min(rect.top, window.innerHeight - hintH - 8);
    tbHintPanel.style.top = `${top}px`;
    tbHintPanel.style.left = `${rect.left - 8}px`;
    tbHintPanel.style.transform = 'translateX(-100%)';
}

function hideTbHint() {
    tbHintPanel.style.display = 'none';
}

const tbPickerPanel    = document.querySelector('.tb-picker-panel');
const tbPickerInner    = document.querySelector('.tb-picker-inner');
const tbBuilderButton  = document.querySelector('.builder-btn');
const tbRolldownButton = document.querySelector('.rolldown-btn');

// ============================================================
// Star adjuster controls (injected into every hex-wrapper)
// ============================================================
document.querySelectorAll('.hex-wrapper').forEach(wrapper => {
    const adj = document.createElement('div');
    adj.className = 'star-adj';
    adj.innerHTML = `<button class="star-adj-minus" title="Lower star level">−</button><button class="star-adj-plus" title="Raise star level">+</button>`;
    wrapper.appendChild(adj);
});

function getLocationFromWrapper(wrapper) {
    const hex = wrapper.querySelector('.hex');
    if (hex) {
        const key = [...hex.classList].find(c => c !== 'hex');
        return key ? { type: 'board', key } : null;
    }
    const bench = wrapper.querySelector('[class*="bench-slot"]');
    if (bench) {
        const match = [...bench.classList].join(' ').match(/bench-slot-(\d+)/);
        if (match) return { type: 'bench', index: parseInt(match[1]) - 1 };
    }
    return null;
}

document.querySelectorAll('.hex-wrapper').forEach(wrapper => {
    const minusBtn = wrapper.querySelector('.star-adj-minus');
    const plusBtn  = wrapper.querySelector('.star-adj-plus');

    minusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!teamBuilderActive) return;
        const loc = getLocationFromWrapper(wrapper);
        if (!loc) return;
        const unit = getUnitAt(state, loc);
        if (!unit) return;
        if (unit.stars > 1) { unit.stars--; render(); }
    });

    plusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!teamBuilderActive) return;
        const loc = getLocationFromWrapper(wrapper);
        if (!loc) return;
        const unit = getUnitAt(state, loc);
        if (!unit) return;
        if (unit.stars < 3) { unit.stars++; render(); }
    });
});

// ============================================================
// TB picker
// ============================================================
export function buildTbPicker() {
    tbPickerInner.innerHTML = '';

    for (const cost of COST_TIERS) {
        const champs = Object.values(pool)
            .filter(c => c.cost === cost && !isOriginallyLocked(c.name));
        const lockedChamps = Object.values(pool)
            .filter(c => c.cost === cost && isOriginallyLocked(c.name));
        const all = [...champs, ...lockedChamps];
        if (!all.length) continue;

        const group = document.createElement('div');
        group.className = 'tb-cost-group';

        const label = document.createElement('div');
        label.className = 'tb-cost-label';
        const labelIcon = document.createElement('img');
        labelIcon.className = 'tb-cost-label-icon';
        labelIcon.src = 'img/gold-coin.png';
        labelIcon.alt = '';
        const labelText = document.createElement('div');
        labelText.className = 'tb-cost-label-text';
        labelText.textContent = COST_LABELS[cost];
        labelText.style.color = COST_COLORS[cost];
        label.appendChild(labelIcon);
        label.appendChild(labelText);
        group.appendChild(label);

        const row = document.createElement('div');
        row.className = 'tb-cost-units';

        for (const champ of all) {
            const el = document.createElement('div');
            el.className = 'tb-unit';
            el.title = champ.name;
            el.style.borderColor = (COST_COLORS[cost] ?? '#444') + '88';
            const img = document.createElement('img');
            img.src = champ.icon;
            img.alt = champ.name;
            // if (isOriginallyLocked(champ.name)) img.style.filter = 'brightness(0.4) saturate(0.2)';
            el.appendChild(img);
            el.addEventListener('mouseenter', () => showTbHint(champ, el));
            el.addEventListener('mouseleave', hideTbHint);

            // Drag from picker — also handles click (no-drag mouseup)
            let tbDragMoved = false;
            el.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                if (!teamBuilderActive) return;
                hideTbHint();
                e.preventDefault();
                e.stopPropagation();
                tbDragMoved = false;
                tbDragging = champ.name;
                _ghost.src = champ.icon;
                _ghost.style.left = `${e.clientX}px`;
                _ghost.style.top = `${e.clientY}px`;
                _ghost.style.display = 'block';
            });
            el.addEventListener('mousemove', () => {
                if (tbDragging === champ.name) tbDragMoved = true;
            });
            // Click (mouseup without meaningful drag) — place directly
            el.addEventListener('mouseup', (e) => {
                if (!teamBuilderActive || tbDragging !== champ.name) return;
                if (!tbDragMoved) {
                    tbDragging = null;
                    _ghost.style.display = 'none';
                    const benchIdx = state.bench.findIndex(s => s === null);
                    if (benchIdx !== -1) {
                        state.bench[benchIdx] = { name: champ.name, stars: 1 };
                    } else {
                        const boardKey = findEmptyBoardHex(state);
                        if (boardKey) state.board.set(boardKey, { name: champ.name, stars: 1 });
                    }
                    render();
                    e.stopPropagation();
                }
            });

            row.appendChild(el);
        }

        group.appendChild(row);
        tbPickerInner.appendChild(group);
    }
}

// ============================================================
// Open / close
// ============================================================

// onSave callback is passed from main.js to avoid circular dep with presets.js
export function openTeamBuilder(ghost, onSave) {
    _ghost = ghost;
    teamBuilderActive = true;
    document.dispatchEvent(new CustomEvent('tbmodechange'));
    document.body.classList.add('team-builder-mode');
    tbBuilderButton.classList.add('active');
    tbBuilderButton.style.display = 'none';
    tbRolldownButton.style.display = 'flex';

    // Add Save button to panel header if not already there
    let saveBtn = tbPickerPanel.querySelector('.tb-save-btn');
    if (!saveBtn) {
        saveBtn = document.createElement('button');
        saveBtn.className = 'tb-save-btn';
        saveBtn.textContent = '💾 Save Preset';
        saveBtn.addEventListener('click', onSave);
        tbPickerPanel.querySelector('.tb-picker-header').appendChild(saveBtn);
    }

    buildTbPicker();
    tbPickerPanel.style.display = 'flex';
}

export function closeTeamBuilder() {
    hideTbHint();
    teamBuilderActive = false;
    document.dispatchEvent(new CustomEvent('tbmodechange'));
    document.body.classList.remove('team-builder-mode');
    tbBuilderButton.classList.remove('active');
    tbBuilderButton.style.display = 'flex';
    tbRolldownButton.style.display = 'none';
    tbPickerPanel.style.display = 'none';
}
