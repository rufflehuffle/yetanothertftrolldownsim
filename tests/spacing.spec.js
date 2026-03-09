// @ts-check
const { test, expect } = require('@playwright/test');

// Shared viewport groups — same set used in layout.spec.js
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

// 2px tolerance to absorb 1px borders and sub-pixel rounding.
const TOLERANCE = 2;

for (const { group, viewports } of VIEWPORT_GROUPS) {
  test.describe(group, () => {
    for (const vp of viewports) {

      // ─────────────────────────────────────────────────────────────────
      // 1. HUD stays within the visible viewport
      // ─────────────────────────────────────────────────────────────────
      test(`hud stays within screen bounds at ${vp.label}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/', { waitUntil: 'networkidle' });

        const errors = await page.evaluate(({ vw, vh, tol }) => {
          const el = document.querySelector('.hud');
          if (!el) return ['element .hud not found'];
          const r = el.getBoundingClientRect();
          const out = [];
          if (r.left   < -tol)       out.push(`left edge out of bounds: ${r.left.toFixed(1)}`);
          if (r.right  > vw + tol)   out.push(`right edge out of bounds: ${r.right.toFixed(1)} > ${vw}`);
          if (r.top    < -tol)       out.push(`top edge out of bounds: ${r.top.toFixed(1)}`);
          if (r.bottom > vh + tol)   out.push(`bottom out of bounds: ${r.bottom.toFixed(1)} > ${vh}`);
          return out;
        }, { vw: vp.width, vh: vp.height, tol: TOLERANCE });

        expect(
          errors,
          `HUD out of bounds at ${vp.label}:\n${errors.join('\n')}`
        ).toHaveLength(0);
      });

      // ─────────────────────────────────────────────────────────────────
      // 2. .board-count does not overlap .board
      // ─────────────────────────────────────────────────────────────────
      test(`board-count does not overlap board at ${vp.label}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/', { waitUntil: 'networkidle' });

        const result = await page.evaluate(({ tol }) => {
          /** @param {string} sel */
          function getRect(sel) {
            const el = document.querySelector(sel);
            if (!el) return null;
            const s = window.getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden') return null;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return null;
            return { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
          }

          const bc = getRect('.board-count');
          const bd = getRect('.board');
          if (!bc) return { skipped: true, reason: '.board-count not visible' };
          if (!bd) return { skipped: true, reason: '.board not visible' };

          const overlapX = bc.left  + tol < bd.right  && bd.left  + tol < bc.right;
          const overlapY = bc.top   + tol < bd.bottom && bd.top   + tol < bc.bottom;
          return { skipped: false, overlaps: overlapX && overlapY, bc, bd };
        }, { tol: TOLERANCE });

        if (result.skipped) return;

        expect(
          result.overlaps,
          `board-count overlaps board at ${vp.label}\n` +
          `  board-count: top=${result.bc.top.toFixed(1)} bottom=${result.bc.bottom.toFixed(1)} ` +
            `left=${result.bc.left.toFixed(1)} right=${result.bc.right.toFixed(1)}\n` +
          `  board:       top=${result.bd.top.toFixed(1)} bottom=${result.bd.bottom.toFixed(1)} ` +
            `left=${result.bd.left.toFixed(1)} right=${result.bd.right.toFixed(1)}`
        ).toBe(false);
      });

      // ─────────────────────────────────────────────────────────────────
      // 3. Bench-to-HUD gap is at least half a rendered hex height
      // ─────────────────────────────────────────────────────────────────
      test(`bench has at least half-hex gap above hud at ${vp.label}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/', { waitUntil: 'networkidle' });

        const result = await page.evaluate(({ tol }) => {
          /** @param {string} sel */
          function getRect(sel) {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return null;
            return { top: r.top, bottom: r.bottom, height: r.height };
          }

          const bench = getRect('.bench');
          const hud   = getRect('.hud');
          if (!bench) return { skipped: true, reason: '.bench not visible' };
          if (!hud)   return { skipped: true, reason: '.hud not visible' };

          // Use the rendered height of the first board hex (or bench-slot as fallback)
          // so the required gap scales with whatever CSS clamp() resolved to.
          const hexEl = document.querySelector('.bench-slot') || document.querySelector('.hex');
          const hexHeight = hexEl ? hexEl.getBoundingClientRect().height : 92;
          const halfHex   = hexHeight / 2;

          const gap    = hud.top - bench.bottom;
          const minGap = halfHex - tol;

          return {
            skipped: false,
            gap,
            minGap,
            hexHeight,
            benchBottom: bench.bottom,
            hudTop: hud.top,
          };
        }, { tol: TOLERANCE });

        if (result.skipped) return;

        const { gap, minGap, hexHeight, benchBottom, hudTop } = result;
        expect(
          gap,
          `Bench-to-HUD gap too small at ${vp.label}: ` +
          `gap=${gap.toFixed(1)}px, need ≥ ${minGap.toFixed(1)}px (half of ${hexHeight.toFixed(1)}px hex)\n` +
          `  bench bottom=${benchBottom.toFixed(1)}, hud top=${hudTop.toFixed(1)}`
        ).toBeGreaterThanOrEqual(minGap);
      });

    }
  });
}
