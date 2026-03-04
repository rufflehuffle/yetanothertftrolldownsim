import { pool } from './tables.js';
import { state, _originallyLocked, isOriginallyLocked, saveTeamPlan, saveUnlockedOverrides } from './state.js';
import { generate41Board } from './board-generator.js';
import { render } from './render.js';
import { doRoll } from './logic.js';
import { teamBuilderActive, buildTbPicker } from './team-builder.js';

// ============================================================
// Preset storage
// ============================================================
function loadPresets() {
    try {
        const saved = localStorage.getItem('tft-presets');
        return saved ? JSON.parse(saved) : [];
    } catch { return []; }
}

function savePresets(presets) {
    try {
        localStorage.setItem('tft-presets', JSON.stringify(presets));
    } catch {}
}

// ============================================================
// Save Preset Modal
// ============================================================
const savePresetBackdrop = document.querySelector('.save-preset-backdrop');
export const savePresetInput = document.querySelector('.save-preset-input');

export function openSavePreset() {
    savePresetInput.value = '';
    savePresetBackdrop.style.display = 'flex';
    savePresetInput.focus();
}

function closeSavePreset() {
    savePresetBackdrop.style.display = 'none';
}

function doSavePreset() {
    const name = savePresetInput.value.trim();
    if (!name) { savePresetInput.focus(); return; }

    const preset = {
        id: Date.now(),
        name,
        level: state.level,
        gold: state.gold,
        board: Object.fromEntries(
            Object.entries(state.board).map(([k, v]) => [k, v ? { name: v.name, stars: v.stars } : null])
        ),
        bench: state.bench.map(u => u ? { name: u.name, stars: u.stars } : null),
        teamPlan: [...state.teamPlan],
        targetTeam: [...(state.targetTeam ?? [])],
        autoGenerateTeam: false,
        unlocks: Object.values(pool)
            .filter(c => isOriginallyLocked(c.name) && c.unlocked)
            .map(c => c.name),
    };

    const presets = loadPresets();
    presets.push(preset);
    savePresets(presets);
    closeSavePreset();
}

document.querySelector('.save-preset-close').addEventListener('click', closeSavePreset);
document.querySelector('.save-preset-cancel').addEventListener('click', closeSavePreset);
document.querySelector('.save-preset-confirm').addEventListener('click', doSavePreset);
savePresetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSavePreset();
    if (e.key === 'Escape') closeSavePreset();
});
savePresetBackdrop.addEventListener('click', (e) => {
    if (e.target === savePresetBackdrop) closeSavePreset();
});

// ============================================================
// Presets List Modal
// ============================================================
const presetsBackdrop = document.querySelector('.presets-backdrop');
const presetsList     = document.querySelector('.presets-list');

export function openPresets() {
    renderPresetsList();
    presetsBackdrop.style.display = 'flex';
}

function closePresets() {
    presetsBackdrop.style.display = 'none';
}

function renderPresetsList() {
    presetsList.innerHTML = '';
    const presets = loadPresets();

    if (presets.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'presets-empty';
        empty.textContent = 'No presets saved yet. Use Team Builder to create and save a board.';
        presetsList.appendChild(empty);
        return;
    }

    for (const preset of [...presets].reverse()) {
        const item = document.createElement('div');
        item.className = 'preset-item';

        // Meta (name, badges)
        const meta = document.createElement('div');
        meta.className = 'preset-meta';

        const pName = document.createElement('div');
        pName.className = 'preset-name';
        pName.textContent = preset.name;

        const info = document.createElement('div');
        info.className = 'preset-info';

        const lvlBadge = document.createElement('span');
        lvlBadge.className = 'preset-badge level';
        lvlBadge.textContent = `Lv ${preset.level}`;

        const goldBadge = document.createElement('span');
        goldBadge.className = 'preset-badge gold';
        goldBadge.textContent = `${preset.gold}g`;

        info.appendChild(lvlBadge);
        info.appendChild(goldBadge);
        meta.appendChild(pName);
        meta.appendChild(info);
        item.appendChild(meta);

        // Unit icons — board + bench combined, deduped by name
        const unitsEl = document.createElement('div');
        unitsEl.className = 'preset-units';

        const allUnits = [
            ...Object.values(preset.board ?? {}).filter(Boolean),
            ...(preset.bench ?? []).filter(Boolean),
        ];
        const seen = new Set();
        for (const u of allUnits) {
            if (seen.has(u.name)) continue;
            seen.add(u.name);
            const champ = pool[u.name];
            if (!champ) continue;
            const img = document.createElement('img');
            img.src = champ.icon;
            img.alt = u.name;
            img.title = u.name;
            img.className = 'preset-unit-icon';
            img.style.borderRadius = '4px';
            unitsEl.appendChild(img);
        }
        item.appendChild(unitsEl);

        // Auto-generate checkbox
        const autoLabel = document.createElement('label');
        autoLabel.className = 'preset-autogenerate';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!preset.autoGenerateTeam;
        cb.addEventListener('change', (e) => {
            e.stopPropagation();
            preset.autoGenerateTeam = cb.checked;
            const all = loadPresets();
            const p = all.find(p => p.id === preset.id);
            if (p) { p.autoGenerateTeam = cb.checked; savePresets(all); }
        });
        autoLabel.appendChild(cb);
        autoLabel.append(' AUTO GENERATE ON LOAD');
        autoLabel.addEventListener('click', e => e.stopPropagation());
        item.appendChild(autoLabel);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'preset-delete';
        delBtn.title = 'Delete preset';
        delBtn.textContent = '🗑';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const presets = loadPresets().filter(p => p.id !== preset.id);
            savePresets(presets);
            renderPresetsList();
        });
        item.appendChild(delBtn);

        // Click to load
        item.addEventListener('click', () => {
            loadPreset(preset);
            closePresets();
        });

        presetsList.appendChild(item);
    }
}

document.querySelector('.presets-close').addEventListener('click', closePresets);
presetsBackdrop.addEventListener('click', (e) => {
    if (e.target === presetsBackdrop) closePresets();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (savePresetBackdrop.style.display !== 'none') { closeSavePreset(); return; }
        if (presetsBackdrop.style.display !== 'none') { closePresets(); return; }
    }
});

// ============================================================
// Load preset
// ============================================================
export let lastLoadedPreset = null;

export function loadPreset(preset) {
    // Restore teamPlan if saved with preset
    if (preset.teamPlan) {
        // Reset all originally-locked unlocks first
        for (const name of _originallyLocked) {
            if (pool[name]) pool[name].unlocked = false;
        }
        state.teamPlan = new Set(preset.teamPlan);
        // Restore unlocks: use explicit unlocks list if present (new format),
        // otherwise derive from teamPlan (old preset format fallback)
        const unlockNames = preset.unlocks ?? preset.teamPlan.filter(n => isOriginallyLocked(n));
        for (const name of unlockNames) {
            if (pool[name]) pool[name].unlocked = true;
        }
        saveTeamPlan();
        saveUnlockedOverrides();
    }

    // Restore targetTeam
    state.targetTeam = preset.targetTeam?.length ? new Set(preset.targetTeam) : null;

    if (preset.autoGenerateTeam) {
        // Generate a fresh 4-1 board from the target team instead of loading the saved board
        const target = state.targetTeam ?? state.teamPlan;
        const result = target.size ? generate41Board(target) : null;
        if (result) {
            state.gold  = result.gold;
            state.level = result.level;
            state.xp    = 0;
            state.bench = result.bench;
            state.board = result.board;
        }
    } else {
        // Set level & XP
        state.level = preset.level;
        state.xp = 0;

        // Set gold
        state.gold = preset.gold;

        // Load board
        for (const key of Object.keys(state.board)) {
            const u = preset.board?.[key];
            state.board[key] = u ? { name: u.name, stars: u.stars } : null;
        }

        // Load bench
        state.bench = (preset.bench ?? []).map(u => u ? { name: u.name, stars: u.stars } : null);
        while (state.bench.length < 9) state.bench.push(null);
        state.bench = state.bench.slice(0, 9);
    }

    // Track as last used preset for F1 reload
    lastLoadedPreset = preset;

    // If in rolldown mode, stay there; if in team builder, refresh picker
    if (teamBuilderActive) {
        buildTbPicker();
    } else {
        doRoll(false);
    }

    render();
}
