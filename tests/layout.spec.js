// @ts-check
const { test, expect } = require('@playwright/test');

// Common desktop viewport sizes grouped by category
const VIEWPORT_GROUPS = [
  {
    group: 'standard',
    viewports: [
      { width: 1920, height: 1080, label: '1920x1080' },
      { width: 1280, height: 1200, label: '1280x1200' },
      { width: 1536, height: 864,  label: '1536x864'  },
      { width: 1366, height: 768,  label: '1366x768'  },
      { width: 1280, height: 720,  label: '1280x720'  },
    ],
  },
  {
    group: 'low-res',
    viewports: [
      { width: 800, height: 600, label: '800x600' },
    ],
  },
  {
    group: '4K',
    viewports: [
      { width: 3840, height: 2160, label: '3840x2160' },
    ],
  },
  {
    group: 'QHD',
    viewports: [
      { width: 2560, height: 1440, label: '2560x1440' },
    ],
  },
];

// Fixed-positioned elements visible on the home screen before any modal opens.
// Excluded intentionally:
//   .no-comp-popup   — position:absolute child of .board, designed to overlay it
//   .trait-tooltip   — display:none until hover
//   .planner / .teams / .tb-picker-panel — display:none modals
const ELEMENTS = [
  { selector: '.top-timer-bar', label: 'top-timer-bar' },
  { selector: '.trait-panel',   label: 'trait-panel'   },
  { selector: '.hud',           label: 'hud'           },
  { selector: '.toolbar',       label: 'toolbar'       },
  { selector: '.board',         label: 'board'         },
  { selector: '.bench',         label: 'bench'         },
];

// Allow 2px tolerance to absorb 1px borders and sub-pixel rounding.
const TOLERANCE = 2;

// Eight trait names that each contribute a unique trait (one unit each covers one trait).
// Using names that map to real CSS icons but the layout test only cares about element geometry.
const EIGHT_TRAITS = [
  'Arcanist', 'Bilgewater', 'Bruiser', 'Demacia',
  'Freljord', 'Noxus', 'Piltover', 'Zaun',
];

for (const { group, viewports } of VIEWPORT_GROUPS) {
  test.describe(`${group} — trait panel`, () => {
  for (const vp of viewports) {
  test(`no collisions at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Inject trait rows — cap at 6 for short viewports (mirrors JS truncation in the app).
    const maxTraits = vp.height < 800 ? 6 : 8;
    const traits = EIGHT_TRAITS.slice(0, maxTraits);
    await page.evaluate((traits) => {
      const panel = /** @type {HTMLElement} */ (document.querySelector('.trait-panel'));
      if (!panel) return;
      panel.innerHTML = '';
      for (const name of traits) {
        const row = document.createElement('div');
        row.className = 'trait-row trait-active';
        row.innerHTML =
          `<div class="trait-icon-wrap trait-icon-active"><img src="" alt="${name}"></div>` +
          `<span class="trait-count">2</span>` +
          `<div class="trait-info">` +
            `<span class="trait-name">${name}</span>` +
            `<span class="trait-pips"><span class="pip-active">2</span> ＞ <span>4</span></span>` +
          `</div>`;
        panel.appendChild(row);
      }
    }, traits);

    const vw = vp.width;
    const vh = vp.height;

    const { collisions, oob } = await page.evaluate(({ elements, tolerance, vw, vh }) => {
      function getRect(selector) {
        const el = document.querySelector(selector);
        if (!el) return null;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return { top: r.top, right: r.right, bottom: r.bottom, left: r.left,
                 width: r.width, height: r.height };
      }

      const results = elements.map(({ selector, label }) => ({ label, rect: getRect(selector) }));
      const visible = results.filter(e => e.rect !== null);

      const collisions = [];
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const a = visible[i], b = visible[j];
          // rect is guaranteed non-null here because visible is filtered above
          const ar = /** @type {NonNullable<ReturnType<typeof getRect>>} */ (a.rect);
          const br = /** @type {NonNullable<ReturnType<typeof getRect>>} */ (b.rect);
          const overlapX = ar.left + tolerance < br.right && br.left + tolerance < ar.right;
          const overlapY = ar.top  + tolerance < br.bottom && br.top  + tolerance < ar.bottom;
          if (overlapX && overlapY) {
            collisions.push(
              `"${a.label}" collides with "${b.label}"\n` +
              `  ${a.label}: top=${ar.top.toFixed(1)} right=${ar.right.toFixed(1)} ` +
                `bottom=${ar.bottom.toFixed(1)} left=${ar.left.toFixed(1)}\n` +
              `  ${b.label}: top=${br.top.toFixed(1)} right=${br.right.toFixed(1)} ` +
                `bottom=${br.bottom.toFixed(1)} left=${br.left.toFixed(1)}`
            );
          }
        }
      }

      // Check trait panel stays within screen bounds.
      const oob = [];
      const tp = getRect('.trait-panel');
      if (tp) {
        if (tp.left   < -tolerance) oob.push(`left edge out of bounds: ${tp.left.toFixed(1)}`);
        if (tp.top    < -tolerance) oob.push(`top edge out of bounds: ${tp.top.toFixed(1)}`);
        if (tp.right  > vw + tolerance) oob.push(`right edge out of bounds: ${tp.right.toFixed(1)} > ${vw}`);
        if (tp.bottom > vh + tolerance) oob.push(`bottom edge out of bounds: ${tp.bottom.toFixed(1)} > ${vh}`);
      }

      return { collisions, oob };
    }, { elements: ELEMENTS, tolerance: TOLERANCE, vw, vh });

    expect(
      collisions,
      `Collisions detected at ${vp.label} with 8 traits:\n\n${collisions.join('\n\n')}`
    ).toHaveLength(0);

    expect(
      oob,
      `Trait panel out of screen bounds at ${vp.label}:\n\n${oob.join('\n')}`
    ).toHaveLength(0);
  });
  }
  });
}

for (const { group, viewports } of VIEWPORT_GROUPS) {
  test.describe(group, () => {
  for (const vp of viewports) {
  test(`no layout collisions at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    // networkidle ensures ES module scripts (main.js, preload.js) have executed
    // and initial DOM rendering is fully settled before measuring rects.
    await page.goto('/', { waitUntil: 'networkidle' });

    const results = await page.evaluate((elements) => {
      function getRect(selector) {
        const el = document.querySelector(selector);
        if (!el) return null;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return null;
        const r = el.getBoundingClientRect();
        // Skip elements with no rendered size (e.g. empty .trait-panel)
        if (r.width === 0 || r.height === 0) return null;
        return { top: r.top, right: r.right, bottom: r.bottom, left: r.left,
                 width: r.width, height: r.height };
      }

      return elements.map(({ selector, label }) => ({ label, rect: getRect(selector) }));
    }, ELEMENTS);

    const visible = results.filter(e => e.rect !== null);

    const collisions = [];
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i];
        const b = visible[j];
        const ar = a.rect;
        const br = b.rect;

        const overlapX = ar.left + TOLERANCE < br.right && br.left + TOLERANCE < ar.right;
        const overlapY = ar.top  + TOLERANCE < br.bottom && br.top  + TOLERANCE < ar.bottom;

        if (overlapX && overlapY) {
          collisions.push(
            `"${a.label}" collides with "${b.label}"\n` +
            `  ${a.label}: top=${ar.top.toFixed(1)} right=${ar.right.toFixed(1)} ` +
              `bottom=${ar.bottom.toFixed(1)} left=${ar.left.toFixed(1)}\n` +
            `  ${b.label}: top=${br.top.toFixed(1)} right=${br.right.toFixed(1)} ` +
              `bottom=${br.bottom.toFixed(1)} left=${br.left.toFixed(1)}`
          );
        }
      }
    }

    expect(
      collisions,
      `Collisions detected at ${vp.label}:\n\n${collisions.join('\n\n')}`
    ).toHaveLength(0);
  });
  }
  });
}
