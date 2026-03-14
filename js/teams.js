import { pool, traits as traitTable } from './tables.js';
import { state, _originallyLocked, isOriginallyLocked, saveTeamPlan, saveUnlockedOverrides, syncTeamPlanSlots } from './state.js';
import { generate41Board, buildTraitCounts } from './board-generator.js';
import { render } from './render.js';
import { doRoll } from './logic.js';
import { teamBuilderActive, buildTbPicker } from './team-builder.js';
import { history } from './commands.js';
import { openTeamPlanner, loadTeamCode } from './team-planner.js';

// ============================================================
// Auto team name — "<Most Active Trait> <Main Carry Name>"
// Deterministic (alphabetical tiebreaking) so the name stays
// stable across repeated saves.
// ============================================================
function generateTeamName(teamPlanNames) {
    const names = [...teamPlanNames].filter(n => pool[n]);
    if (!names.length) return 'New Team';

    const traitCounts = buildTraitCounts(names);

    // Most active trait: prefer those at a breakpoint, then highest count, then alphabetical
    let bestTrait = null, bestCount = 0, bestIsActive = false;
    for (const [trait, count] of Object.entries(traitCounts)) {
        const bp = traitTable[trait]?.breakpoints ?? [];
        const isActive = bp.some(b => count >= b);
        if (
            !bestTrait ||
            (isActive && !bestIsActive) ||
            (isActive === bestIsActive && count > bestCount) ||
            (isActive === bestIsActive && count === bestCount && trait < bestTrait)
        ) {
            bestTrait = trait;
            bestCount = count;
            bestIsActive = isActive;
        }
    }

    // Main carry: highest-scoring non-Tank; prefer 4-cost; alphabetical tiebreak
    const carries = names.map(n => pool[n]).filter(c => c && c.role !== 'Tank');
    const carryScore = (champ) => {
        let s = champ.synergies.reduce((acc, t) => acc + (traitCounts[t] ?? 0), 0);
        for (const t of champ.synergies) {
            const bp = traitTable[t]?.breakpoints ?? [];
            if (bp.some(b => (traitCounts[t] ?? 0) >= b)) s += 3;
        }
        return s;
    };
    const fourCostCarries = carries.filter(c => c.cost === 4);
    const carryPool = fourCostCarries.length ? fourCostCarries : carries;
    const mainCarry = carryPool.reduce((best, c) => {
        if (!best) return c;
        const diff = carryScore(c) - carryScore(best);
        return diff > 0 || (diff === 0 && c.name < best.name) ? c : best;
    }, null);

    const carryName = mainCarry?.name ?? names[0];
    return bestTrait ? `${bestTrait} ${carryName}` : carryName;
}

// ============================================================
// Team storage
// ============================================================
function loadTeams() {
    try {
        const saved = localStorage.getItem('tft-presets');
        return saved ? JSON.parse(saved) : [];
    } catch { return []; }
}

function saveTeams(teams) {
    try {
        localStorage.setItem('tft-presets', JSON.stringify(teams));
    } catch {}
}

function uniqueTeamName(base, teams) {
    const names = new Set(teams.map(t => t.name));
    if (!names.has(base)) return base;
    let i = 2;
    while (names.has(`${base} (${i})`)) i++;
    return `${base} (${i})`;
}

export function renameTeam(id, newName) {
    const all = loadTeams();
    const t = all.find(t => t.id === id);
    if (!t) return;
    t.name = newName;
    t.nameIsAuto = false;
    saveTeams(all);
    if (lastLoadedPreset?.id === id) {
        lastLoadedPreset.name = newName;
        const titleEl = document.querySelector('.planner-selected__title');
        if (titleEl) titleEl.textContent = newName;
    }
}

// ============================================================
// Panel elements
// ============================================================
const teamsEl         = document.querySelector('.teams');
const teamsCloseBtnEl = document.querySelector('.teams__close-btn');
const teamsBackdropEl = document.querySelector('.planner-backdrop');
const teamsList       = document.querySelector('.teams__list');
const teamsPasteBtnEl = document.querySelector('.teams__paste-btn');

function isEmptyTeam(team) {
    const hasBoard = team.board && Object.values(team.board).some(Boolean);
    const hasPlan  = team.teamPlan?.length > 0;
    return !hasBoard && !hasPlan;
}

function openTeams() {
    const teams = loadTeams();
    const pruned = teams.filter(t => {
        if (isEmptyTeam(t)) {
            if (lastLoadedPreset?.id === t.id) lastLoadedPreset = null;
            return false;
        }
        return true;
    });
    if (pruned.length !== teams.length) saveTeams(pruned);

    renderTeamsList();
    teamsEl.style.display = 'flex';
    teamsBackdropEl.style.display = 'block';
}

function closeTeams() {
    teamsEl.style.display = 'none';
    teamsBackdropEl.style.display = 'none';
}

// Aliased exports so main.js needs no rename changes
export { openTeams };
export const openPresets    = openTeams;
export const openSavePreset = openTeams;

teamsCloseBtnEl.addEventListener('click', closeTeams);
teamsBackdropEl.addEventListener('click', (e) => {
    if (e.target === teamsBackdropEl) closeTeams();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && teamsEl.style.display !== 'none') closeTeams();
});

// ============================================================
// Kebab dropdown — close any open one on outside click
// ============================================================
let openKebabMenu = null;

document.addEventListener('click', () => {
    if (openKebabMenu) {
        openKebabMenu.remove();
        openKebabMenu = null;
    }
});

// ============================================================
// Active team — save continuously on any state change
// ============================================================
export let lastLoadedPreset = null;

export function saveActiveTeam() {
    if (!lastLoadedPreset) {
        const existing = loadTeams();
        const team = {
            id: Date.now(),
            name: uniqueTeamName(generateTeamName(state.teamPlan), existing),
            nameIsAuto: true,
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
        existing.push(team);
        saveTeams(existing);
        lastLoadedPreset = team;
        return;
    }
    const all = loadTeams();
    const t = all.find(t => t.id === lastLoadedPreset.id);
    if (!t) return;

    t.board = Object.fromEntries(
        Object.entries(state.board).map(([k, v]) => [k, v ? { name: v.name, stars: v.stars } : null])
    );
    t.bench      = state.bench.map(u => u ? { name: u.name, stars: u.stars } : null);
    t.level      = state.level;
    t.gold       = state.gold;
    t.teamPlan   = [...state.teamPlan];
    t.targetTeam = [...(state.targetTeam ?? [])];
    t.unlocks    = Object.values(pool)
        .filter(c => isOriginallyLocked(c.name) && c.unlocked)
        .map(c => c.name);

    if (t.nameIsAuto !== false) {
        const autoName = uniqueTeamName(generateTeamName(state.teamPlan), all.filter(x => x.id !== t.id));
        if (autoName !== t.name) {
            t.name = autoName;
            const titleEl = document.querySelector('.planner-selected__title');
            if (titleEl) titleEl.textContent = autoName;
        }
    }

    Object.assign(lastLoadedPreset, t);
    saveTeams(all);
}

history.addListener(saveActiveTeam);

// ============================================================
// NEW button — create blank team and open planner
// ============================================================
document.querySelector('.teams__new-btn').addEventListener('click', () => {
    const teams = loadTeams();
    const team = {
        id: Date.now(),
        name: uniqueTeamName(generateTeamName(state.teamPlan), teams),
        nameIsAuto: true,
        level: state.level,
        gold: state.gold,
        board: Object.fromEntries(Object.keys(state.board).map(k => [k, null])),
        bench: Array(9).fill(null),
        teamPlan: [],
        targetTeam: [],
        autoGenerateTeam: false,
        unlocks: [],
    };

    teams.push(team);
    saveTeams(teams);

    _applyTeam(team);
    closeTeams();
    openTeamPlanner();
});

// ============================================================
// PASTE TEAM button — read clipboard, create new team, apply code
// ============================================================
teamsPasteBtnEl.addEventListener('click', async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { return; }

    if (!text.trim().match(/^(01|02)[0-9a-f]+(TFTSet\d+)$/i)) {
        teamsPasteBtnEl.innerHTML = 'INVALID CODE';
        setTimeout(() => { teamsPasteBtnEl.innerHTML = '<img src="img/paste.png"/>PASTE TEAM'; }, 1500);
        return;
    }

    const allTeams = loadTeams();
    const team = {
        id: Date.now(),
        name: uniqueTeamName(generateTeamName(state.teamPlan), allTeams),
        nameIsAuto: true,
        level: state.level,
        gold: state.gold,
        board: Object.fromEntries(Object.keys(state.board).map(k => [k, null])),
        bench: Array(9).fill(null),
        teamPlan: [],
        targetTeam: [],
        autoGenerateTeam: false,
        unlocks: [],
    };
    allTeams.push(team);
    saveTeams(allTeams);
    _applyTeam(team);
    closeTeams();
    openTeamPlanner();
    loadTeamCode(text);
});

// ============================================================
// Render teams list using .team__row DOM pattern
// ============================================================
function renderTeamsList() {
    teamsList.innerHTML = '';
    const teams = loadTeams();

    if (teams.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'teams__empty';
        empty.textContent = 'No teams saved. Click NEW to start a new team.';
        teamsList.appendChild(empty);
        return;
    }

    for (const team of [...teams].reverse()) {
        const row = document.createElement('div');
        row.className = 'team__row';

        // Container: name + meta + unit icons — click to load + open planner
        const container = document.createElement('div');
        container.className = 'team__container';

        const nameRow = document.createElement('div');
        nameRow.style.display = 'flex';
        nameRow.style.alignItems = 'baseline';
        nameRow.style.gap = '0.5rem';

        const nameEl = document.createElement('div');
        nameEl.className = 'team__name';
        nameEl.textContent = team.name;

        const levelEl = document.createElement('div');
        levelEl.className = 'team__level';
        levelEl.textContent = `Lv ${team.level}`;

        const goldEl = document.createElement('div');
        goldEl.className = 'team__gold';
        goldEl.textContent = `${team.gold}g`;

        nameRow.appendChild(nameEl);

        nameRow.appendChild(levelEl);
        nameRow.appendChild(goldEl);
        container.appendChild(nameRow);

        // Unit slots sourced from teamPlan (planner units)
        const unitsEl = document.createElement('div');
        unitsEl.className = 'team__units';

        const planNames = team.teamPlan ?? [];
        for (let i = 0; i < 10; i++) {
            const slot = document.createElement('div');
            if (i < planNames.length) {
                const champ = pool[planNames[i]];
                if (champ) {
                    slot.className = `team__unit-slot unit-slot--${champ.cost}-cost`;
                    const img = document.createElement('img');
                    img.src = champ.icon;
                    img.alt = planNames[i];
                    img.title = planNames[i];
                    img.className = 'team__unit-icon';
                    slot.appendChild(img);
                } else {
                    slot.className = 'team__unit-slot';
                }
            } else {
                slot.className = 'team__unit-slot';
            }
            unitsEl.appendChild(slot);
        }
        container.appendChild(unitsEl);

        container.addEventListener('click', () => {
            loadPreset(loadTeams().find(t => t.id === team.id) ?? team);
            closeTeams();
            openTeamPlanner();
        });

        row.appendChild(container);

        // Active switch — sets team as active without closing panel
        const switchLabel = document.createElement('label');
        switchLabel.className = 'team__active-switch';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = lastLoadedPreset?.id === team.id;
        cb.addEventListener('change', (e) => {
            e.stopPropagation();
            if (!cb.checked) {
                _deactivateTeam();
                teamsList.querySelectorAll('.team__active-switch input').forEach(other => {
                    other.checked = false;
                });
                return;
            }
            loadPreset(loadTeams().find(t => t.id === team.id) ?? team);
            // Update all other switches in the list
            teamsList.querySelectorAll('.team__active-switch input').forEach(other => {
                other.checked = (other === cb);
            });
        });
        const slider = document.createElement('div');
        slider.className = 'team__active-switch-slider';
        const icon = document.createElement('div');
        icon.className = 'team__active-switch-icon';
        const sym = document.createElement('img');
        sym.className = 'team__active-switch-symbol';
        sym.src = 'img/team_planner.png';
        icon.appendChild(sym);
        switchLabel.appendChild(cb);
        switchLabel.appendChild(slider);
        switchLabel.appendChild(icon);
        switchLabel.addEventListener('click', e => e.stopPropagation());
        row.appendChild(switchLabel);

        // Kebab — dropdown with auto-generate toggle + delete
        const kebab = document.createElement('div');
        kebab.className = 'team__kebab';
        kebab.addEventListener('click', (e) => {
            e.stopPropagation();

            if (openKebabMenu) {
                const prev = openKebabMenu;
                openKebabMenu.remove();
                openKebabMenu = null;
                if (prev.dataset.teamId === String(team.id)) return;
            }

            const menu = document.createElement('div');
            menu.className = 'team__kebab-menu';
            menu.dataset.teamId = String(team.id);

            const freshTeam = loadTeams().find(t => t.id === team.id) ?? team;

            const autoLabel = document.createElement('label');
            autoLabel.className = 'team__kebab-option';
            const autoCb = document.createElement('input');
            autoCb.type = 'checkbox';
            autoCb.checked = !!freshTeam.autoGenerateTeam;
            autoCb.addEventListener('change', (ev) => {
                ev.stopPropagation();
                if (autoCb.checked) { loadBoardCb.checked = false; }
                const all = loadTeams();
                const t = all.find(t => t.id === team.id);
                if (t) { t.autoGenerateTeam = autoCb.checked; if (autoCb.checked) t.loadSavedBoard = false; saveTeams(all); }
            });
            autoLabel.appendChild(autoCb);
            autoLabel.append(' Auto-generate on load');
            autoLabel.addEventListener('click', e => e.stopPropagation());
            menu.appendChild(autoLabel);
            menu.appendChild(document.createElement('hr'));

            const loadBoardLabel = document.createElement('label');
            loadBoardLabel.className = 'team__kebab-option';
            const loadBoardCb = document.createElement('input');
            loadBoardCb.type = 'checkbox';
            loadBoardCb.checked = !!freshTeam.loadSavedBoard;
            loadBoardCb.addEventListener('change', (ev) => {
                ev.stopPropagation();
                if (loadBoardCb.checked) { autoCb.checked = false; }
                const all = loadTeams();
                const t = all.find(t => t.id === team.id);
                if (t) { t.loadSavedBoard = loadBoardCb.checked; if (loadBoardCb.checked) t.autoGenerateTeam = false; saveTeams(all); }
            });
            loadBoardLabel.appendChild(loadBoardCb);
            loadBoardLabel.append(' Load saved board');
            loadBoardLabel.addEventListener('click', e => e.stopPropagation());
            menu.appendChild(loadBoardLabel);
            menu.appendChild(document.createElement('hr'));

            const deleteBtn = document.createElement('div');
            deleteBtn.className = 'team__kebab-option team__kebab-delete';
            deleteBtn.textContent = 'Delete team';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const updated = loadTeams().filter(t => t.id !== team.id);
                saveTeams(updated);
                if (lastLoadedPreset?.id === team.id) lastLoadedPreset = null;
                menu.remove();
                openKebabMenu = null;
                renderTeamsList();
            });
            menu.appendChild(deleteBtn);

            kebab.appendChild(menu);
            openKebabMenu = menu;
        });

        row.appendChild(kebab);
        teamsList.appendChild(row);
    }
}

// ============================================================
// Internal: deactivate current team — clears planner, keeps board
// ============================================================
function _deactivateTeam() {
    lastLoadedPreset = null;
    try { localStorage.removeItem('tft-last-preset'); } catch {}

    state.teamPlan.clear();
    syncTeamPlanSlots([]);
    state.targetTeam = null;
    for (const name of Object.keys(pool)) {
        if (isOriginallyLocked(name)) pool[name].unlocked = false;
    }
    saveTeamPlan();
    saveUnlockedOverrides();
    render();
    history.clear();
}

// ============================================================
// Internal: apply team state without opening/closing panels
// ============================================================
function _applyTeam(team, emptyBoard = false) {
    if (team.teamPlan) {
        for (const name of _originallyLocked) {
            if (pool[name]) pool[name].unlocked = false;
        }
        state.teamPlan = new Set(team.teamPlan);
        syncTeamPlanSlots(team.teamPlan);
        const unlockNames = team.unlocks ?? team.teamPlan.filter(n => isOriginallyLocked(n));
        for (const name of unlockNames) {
            if (pool[name]) pool[name].unlocked = true;
        }
        saveUnlockedOverrides();
    }

    state.targetTeam = team.targetTeam?.length ? new Set(team.targetTeam) : null;
    state.level = team.level;
    state.xp    = 0;
    state.gold  = team.gold;

    for (const key of Object.keys(state.board)) {
        const u = emptyBoard ? null : team.board?.[key];
        state.board[key] = u ? { name: u.name, stars: u.stars } : null;
    }

    const benchSrc = emptyBoard ? [] : (team.bench ?? []);
    state.bench = benchSrc.map(u => u ? { name: u.name, stars: u.stars } : null);
    while (state.bench.length < 9) state.bench.push(null);
    state.bench = state.bench.slice(0, 9);

    if (team.teamPlan) saveTeamPlan(); // fires teamplanchange after board/bench are set

    lastLoadedPreset = team;
    try { localStorage.setItem('tft-last-preset', team.id); } catch {}

    if (teamBuilderActive) {
        buildTbPicker();
    } else {
        doRoll(false);
    }

    render();
    history.clear();
}

export function loadPreset(team) {
    if (team.autoGenerateTeam) {
        // Override board/bench with a generated 4-1 layout
        const target = team.targetTeam?.length ? new Set(team.targetTeam) : new Set(team.teamPlan ?? []);
        const result = target.size ? generate41Board(target) : null;
        if (result) {
            const generated = {
                ...team,
                gold:  result.gold,
                level: result.level,
                bench: result.bench,
                board: result.board,
            };
            _applyTeam(generated);
            lastLoadedPreset = team; // keep original as the tracked preset
            return;
        }
    }
    _applyTeam(team, !team.loadSavedBoard);
}

// ============================================================
// Seed default presets into localStorage if not already present
// ============================================================
function _presetsEmpty() {
    try { return loadTeams().length === 0; } catch { return true; }
}
if (_presetsEmpty()) {
    fetch('default-presets.json')
        .then(r => r.json())
        .then(data => {
            if (_presetsEmpty()) {
                localStorage.setItem('tft-presets', JSON.stringify(data));
            }
        })
        .catch(() => {});
}
