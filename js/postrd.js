import { pool } from './tables.js';
import { state } from './state.js';
import { getEvents } from './round.js';
import { initAnalysis } from './postrd-analysis.js';
import { calcSpeed } from './grading-speed.js';
import { calcAccuracy } from './grading-accuracy.js';
import { calcPositioning } from './grading-positioning.js';
import { calcFlexibility } from './grading-flexibility.js';
import { calcDiscipline } from './grading-discipline.js';

// ============================================================
// Pentagon geometry constants
// ============================================================
const METRICS = ['Speed', 'Discipline', 'Accuracy', 'Positioning', 'Flexibility'];

// Degrees measured from positive x-axis (SVG coords), clockwise
const AXIS_ANGLES = [-90, -18, 54, 126, 198];
const CENTER = { x: 160, y: 145 };
const NS = 'http://www.w3.org/2000/svg';

// [grade-x, grade-y, label-x, label-y, text-anchor]
const AXIS_LABEL_POS = [
    [160, 30,  160, 46,  'middle'],   // Speed
    [287, 105, 252, 120, 'start' ],   // Discipline
    [220, 232, 220, 247, 'middle'],   // Accuracy
    [100, 232, 100, 247, 'middle'],   // Positioning
    [33,  105, 68,  120, 'end'   ],   // Flexibility
];

// ============================================================
// DOM refs
// ============================================================
const modal      = document.getElementById('postrd');
const backdrop   = document.getElementById('postrd-backdrop');
const closeBtn   = document.getElementById('postrd-close');
const gradeValue = document.getElementById('postrd-grade-value');
const compUnits  = document.getElementById('postrd-comp-units');
const pentaSvg   = document.getElementById('postrd-pentagon-svg');
const histSvg    = document.getElementById('score-history-svg');
const tabs       = modal.querySelectorAll('.postrd__tab');
const panels     = modal.querySelectorAll('.postrd__panel-content');

// ============================================================
// Open / Close
// ============================================================
function openModal()  { modal.classList.add('postrd--open'); }
function closeModal() { modal.classList.remove('postrd--open'); }

closeBtn.addEventListener('click', closeModal);
backdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('postrd--open')) closeModal();
});

// ============================================================
// Tab switching
// ============================================================
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => {
            t.classList.toggle('postrd__tab--active', t === tab);
            t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        panels.forEach(panel => {
            const active = panel.id === `postrd-${target}`;
            panel.classList.toggle('postrd__panel-content--active', active);
            panel.hidden = !active;
        });
    });
});

// ============================================================
// Helpers
// ============================================================
function axisPoint(angleDeg, radius) {
    const rad = angleDeg * Math.PI / 180;
    return { x: CENTER.x + radius * Math.cos(rad), y: CENTER.y + radius * Math.sin(rad) };
}

function mk(tag, attrs = {}) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}


// ============================================================
// Final Board
// ============================================================
function renderFinalBoard() {
    compUnits.innerHTML = '';
    const units = Object.values(state.board).filter(Boolean);
    for (const unit of units) {
        const champ = pool[unit.name];
        if (!champ) continue;
        const slot = document.createElement('div');
        slot.className = `postrd-comp__unit-slot postrd-comp__unit-slot--${champ.cost}-cost`;
        const img = document.createElement('img');
        img.className = 'postrd-comp__unit-icon';
        img.src = champ.icon;
        img.alt = unit.name;
        slot.appendChild(img);
        compUnits.appendChild(slot);
    }
}

// ============================================================
// Pentagon Chart
// ============================================================
function buildPentagonSvg(scores) {
    while (pentaSvg.firstChild) pentaSvg.removeChild(pentaSvg.firstChild);

    const outerPts = AXIS_ANGLES.map(a => axisPoint(a, 90));
    const outerStr = outerPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Background fill
    pentaSvg.appendChild(mk('polygon', { points: outerStr, fill: '#060a0c' }));

    // Spokes
    for (const a of AXIS_ANGLES) {
        const pt = axisPoint(a, 90);
        pentaSvg.appendChild(mk('line', {
            x1: CENTER.x, y1: CENTER.y,
            x2: pt.x.toFixed(1), y2: pt.y.toFixed(1),
            stroke: '#1a2e34', 'stroke-width': 1,
        }));
    }

    // Grade rings (C → S)
    const rings = [
        { r: 22.5, stroke: '#1a2e34', width: 1   },
        { r: 45,   stroke: '#1a2e34', width: 1   },
        { r: 67.5, stroke: '#1a2e34', width: 1   },
        { r: 90,   stroke: '#253e47', width: 1.5 },
    ];
    for (const { r, stroke, width } of rings) {
        const pts = AXIS_ANGLES.map(a => axisPoint(a, r));
        pentaSvg.appendChild(mk('polygon', {
            points: pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
            fill: 'none', stroke, 'stroke-width': width,
        }));
    }

    // Grade tick labels along top spoke
    for (const [label, y] of [['S', 58], ['A', 80], ['B', 103], ['C', 125], ['D', 140]]) {
        const t = mk('text', {
            x: 168, y,
            fill: '#3d5560', 'font-size': 9,
            'font-family': 'Beaufort,serif', 'font-weight': 700,
        });
        t.textContent = label;
        pentaSvg.appendChild(t);
    }

    // Glow filter for score polygon
    const defs = mk('defs');
    const filter = mk('filter', { id: 'penta-glow', x: '-40%', y: '-40%', width: '180%', height: '180%' });
    const blur = mk('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 4, result: 'blur' });
    const merge = mk('feMerge');
    merge.appendChild(mk('feMergeNode', { in: 'blur' }));
    merge.appendChild(mk('feMergeNode', { in: 'SourceGraphic' }));
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
    pentaSvg.appendChild(defs);

    // Score polygon
    const scorePts = scores.map((s, i) => {
        const pt = axisPoint(AXIS_ANGLES[i], (s / 100) * 90);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }).join(' ');
    pentaSvg.appendChild(mk('polygon', {
        points: scorePts,
        fill: 'rgba(42,130,156,0.22)',
        stroke: '#42829C', 'stroke-width': 1.5, 'stroke-linejoin': 'round',
        filter: 'url(#penta-glow)',
    }));

    // Vertex dots
    for (let i = 0; i < scores.length; i++) {
        const pt = axisPoint(AXIS_ANGLES[i], (scores[i] / 100) * 90);
        pentaSvg.appendChild(mk('circle', {
            cx: pt.x.toFixed(1), cy: pt.y.toFixed(1), r: 3, fill: '#42829C',
        }));
    }

    // Axis grade letters + metric names
    for (let i = 0; i < METRICS.length; i++) {
        const [gx, gy, lx, ly, anchor] = AXIS_LABEL_POS[i];

        const gradeT = mk('text', {
            x: gx, y: gy, 'text-anchor': 'middle',
            fill: '#C8AA6E', 'font-size': 16,
            'font-family': 'Beaufort,serif', 'font-weight': 900,
        });
        gradeT.textContent = scoreToGrade(scores[i]);
        pentaSvg.appendChild(gradeT);

        const labelT = mk('text', {
            x: lx, y: ly, 'text-anchor': anchor,
            fill: '#A09B8C', 'font-size': 11,
            'font-family': 'Beaufort,serif', 'font-weight': 700, 'letter-spacing': 0.6,
        });
        labelT.textContent = METRICS[i].toUpperCase();
        pentaSvg.appendChild(labelT);
    }
}

// ============================================================
// Score History Chart
// ============================================================
function renderScoreHistory() {
    while (histSvg.firstChild) histSvg.removeChild(histSvg.firstChild);

    const scores = state.rolldownHistory;
    if (!scores.length) return;

    const container = histSvg.parentElement;
    const W   = container.clientWidth  || 320;
    const H   = container.clientHeight || 130;
    histSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const n   = scores.length;
    const PAD = { l: 26, r: 10, t: 10, b: 10 };
    const pw  = W - PAD.l - PAD.r;
    const ph  = H - PAD.t - PAD.b;

    const rawMin  = Math.min(...scores);
    const rawMax  = Math.max(...scores);
    const yMin    = Math.max(0,   Math.floor((rawMin - 5) / 5) * 5);
    const yMax    = Math.min(100, Math.ceil ((rawMax + 5) / 5) * 5);
    const yRange  = yMax - yMin || 1;

    function toX(i) { return PAD.l + (n === 1 ? pw / 2 : (i / (n - 1)) * pw); }
    function toY(v) { return PAD.t + (1 - (v - yMin) / yRange) * ph; }

    // Grid + Y labels
    for (let v = yMin; v <= yMax; v += 5) {
        const y = toY(v);
        const isMaj = v % 10 === 0;
        histSvg.appendChild(mk('line', {
            x1: PAD.l, x2: W - PAD.r, y1: y, y2: y,
            stroke: isMaj ? '#1a2e34' : '#111c21', 'stroke-width': 1,
        }));
        if (isMaj) {
            const t = mk('text', {
                x: PAD.l - 4, y: y + 3.5,
                'text-anchor': 'end', fill: '#3d5560',
                'font-size': 8, 'font-family': 'Beaufort,serif',
            });
            t.textContent = v;
            histSvg.appendChild(t);
        }
    }

    const pts = scores.map((v, i) => ({ x: toX(i), y: toY(v) }));

    if (n === 1) {
        histSvg.appendChild(mk('circle', { cx: pts[0].x, cy: pts[0].y, r: 3.5, fill: '#C8AA6E' }));
        return;
    }

    // Catmull-Rom → cubic bezier smooth path
    function smoothPath(p) {
        let d = `M ${p[0].x},${p[0].y}`;
        const t = 0.4;
        for (let i = 0; i < p.length - 1; i++) {
            const p0 = p[Math.max(i - 1, 0)];
            const p1 = p[i];
            const p2 = p[i + 1];
            const p3 = p[Math.min(i + 2, p.length - 1)];
            const cp1x = p1.x + (p2.x - p0.x) * t;
            const cp1y = p1.y + (p2.y - p0.y) * t;
            const cp2x = p2.x - (p3.x - p1.x) * t;
            const cp2y = p2.y - (p3.y - p1.y) * t;
            d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
        }
        return d;
    }

    const linePath = smoothPath(pts);

    // Area fill
    histSvg.appendChild(mk('path', {
        d: `${linePath} L ${toX(n - 1)},${H - PAD.b} L ${toX(0)},${H - PAD.b} Z`,
        fill: 'rgba(42,130,156,0.10)', stroke: 'none',
    }));

    // Line
    histSvg.appendChild(mk('path', {
        d: linePath, fill: 'none',
        stroke: '#42829C', 'stroke-width': 1.5, 'stroke-linejoin': 'round',
    }));

    // Dots
    pts.forEach((pt, i) => {
        const isLatest = i === n - 1;
        histSvg.appendChild(mk('circle', {
            cx: pt.x, cy: pt.y,
            r: isLatest ? 3.5 : 2.5,
            fill: isLatest ? '#C8AA6E' : '#42829C',
        }));
    });
}

// ============================================================
// Main entry point
// ============================================================
function scoreToGrade(score) {
    if (score >= 100) return 'S';
    if (score >= 75)  return 'A';
    if (score >= 50)  return 'B';
    if (score >= 25)  return 'C';
    return 'D';
}

function openPostRd() {
    // Numeric scores (0–100) per metric; real data replaces placeholders as metrics are implemented
    const scores = METRICS.map(() => Math.floor(Math.random() * 100));

    const events = getEvents();

    // Speed (index 0), Discipline (index 1), Accuracy (index 2), Positioning (index 3), and Flexibility (index 4) are driven by real round data
    scores[0] = calcSpeed(events);
    scores[1] = calcDiscipline(events);
    scores[2] = calcAccuracy(events);
    scores[3] = calcPositioning(state.board);
    scores[4] = calcFlexibility(events);

    // Overall grade and history score from average
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const grade = scoreToGrade(avg);
    state.rolldownHistory.push(Math.round(avg));

    // Reset to Performance tab
    tabs.forEach((t, i) => {
        t.classList.toggle('postrd__tab--active', i === 0);
        t.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    });
    panels.forEach((p, i) => {
        p.classList.toggle('postrd__panel-content--active', i === 0);
        p.hidden = i !== 0;
    });

    // Populate sections
    gradeValue.textContent = grade;
    renderFinalBoard();
    buildPentagonSvg(scores);
    renderScoreHistory();
    initAnalysis(events);

    openModal();
}

// Fires only when the timer naturally reaches 0 (not early-end)
document.addEventListener('roundcomplete', openPostRd);
