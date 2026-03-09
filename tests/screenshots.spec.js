// @ts-check
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-screenshots');

const VIEWPORTS = [
  { width: 1920, height: 1080, label: '1920x1080' },
  { width: 1280, height: 1200, label: '1280x1200' },
  { width: 1536, height: 864,  label: '1536x864'  },
  { width: 1366, height: 768,  label: '1366x768'  },
  { width: 1280, height: 720,  label: '1280x720'  },
  { width: 800,  height: 600,  label: '800x600'   },
  { width: 3840, height: 2160, label: '3840x2160' },
  { width: 2560, height: 1440, label: '2560x1440' },
];

// ─── Seed data ────────────────────────────────────────────────────────────────

// 8-unit Bilgewater / Zaun team used by both the planner test (teamPlan) and
// the home-screen trait panel injection.
const TEAM_PLAN = [
  'Illaoi', 'Blitzcrank', 'Ekko', 'Dr. Mundo',
  'Jinx', 'Nautilus', 'Gangplank', 'Sejuani',
];

// Three teams for the teams-modal. Each must have a non-empty teamPlan so that
// openTeams() does not prune them as empty.
const SEEDED_TEAMS = [
  {
    id: 1001, name: 'Zaun Bruisers', level: 8, gold: 50,
    board: {}, bench: Array(9).fill(null),
    teamPlan: ['Illaoi', 'Blitzcrank', 'Ekko', 'Dr. Mundo', 'Jinx', 'Nautilus', 'Gangplank', 'Sejuani'],
    targetTeam: [], autoGenerateTeam: false, unlocks: [],
  },
  {
    id: 1002, name: 'Ionia Stars', level: 7, gold: 30,
    board: {}, bench: Array(9).fill(null),
    teamPlan: ['Jhin', 'Shen', 'Ahri', 'Kennen', 'Lulu', 'Rumble', 'Neeko', 'Milio'],
    targetTeam: [], autoGenerateTeam: false, unlocks: [],
  },
  {
    id: 1003, name: 'Freljord Invokers', level: 8, gold: 60,
    board: {}, bench: Array(9).fill(null),
    teamPlan: ['Anivia', 'Ashe', 'Sejuani', 'Sona', 'LeBlanc', 'Milio', 'Malzahar'],
    targetTeam: [], autoGenerateTeam: false, unlocks: [],
  },
];

// Trait rows that match what renderTraits() would produce for TEAM_PLAN.
// Board: Illaoi (Bilgewater+Bruiser), Blitzcrank (Zaun+Juggernaut),
//        Ekko (Zaun+Disruptor), Dr.Mundo (Zaun+Bruiser), Jinx (Zaun+Gunslinger),
//        Nautilus (Bilgewater+Juggernaut+Warden), Gangplank (Bilgewater+Slayer+Vanquisher),
//        Sejuani (Freljord+Defender)
// Active breakpoints: Zaun 4→3(Bronze), Bilgewater 3→3(Bronze),
//                     Bruiser 2→2(Bronze), Juggernaut 2→2(Bronze).
const DDR = 'https://ddragon.leagueoflegends.com/cdn/16.4.1/img/tft-trait';
const BRONZE = '#876049';

/** @type {Array<{name:string,count:number,color:string|null,bps:number[],activeBP:number,icon:string}>} */
const TRAIT_ROWS = [
  // Active (sorted: tier desc, activeBP desc)
  { name: 'Zaun',       count: 4, color: BRONZE, bps: [3,5,7],    activeBP: 3, icon: `${DDR}/Trait_Icon_16_Zaun.TFT_Set16.png` },
  { name: 'Bilgewater', count: 3, color: BRONZE, bps: [3,5,7,10], activeBP: 3, icon: `${DDR}/Trait_Icon_9_Bilgewater.png` },
  { name: 'Bruiser',    count: 2, color: BRONZE, bps: [2,4,6],    activeBP: 2, icon: `${DDR}/Trait_Icon_16_Bruiser.TFT_Set16.png` },
  { name: 'Juggernaut', count: 2, color: BRONZE, bps: [2,4,6],    activeBP: 2, icon: `${DDR}/Trait_Icon_16_Juggernaut.png` },
  // Inactive (sorted: count desc, then name)
  { name: 'Defender',   count: 1, color: null, bps: [2,4,6],   activeBP: 0, icon: `${DDR}/Trait_Icon_16_Defender.png` },
  { name: 'Disruptor',  count: 1, color: null, bps: [2,4],     activeBP: 0, icon: `${DDR}/Trait_Icon_16_Disruptor.png` },
  { name: 'Gunslinger', count: 1, color: null, bps: [2,4],     activeBP: 0, icon: `${DDR}/Trait_Icon_16_Gunslinger.TFT_Set16.png` },
  { name: 'Slayer',     count: 1, color: null, bps: [2,4,6],   activeBP: 0, icon: `${DDR}/Trait_Icon_16_Slayer.png` },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Injects real trait rows into .trait-panel, replicating renderTraits() output.
 * Passed as a serialised function so it runs inside page.evaluate().
 * @param {typeof TRAIT_ROWS} rows
 */
function injectTraitPanel(rows) {
  const panel = /** @type {HTMLElement|null} */ (document.querySelector('.trait-panel'));
  if (!panel) return;
  panel.innerHTML = '';
  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'trait-row' + (row.activeBP > 0 ? ' trait-active' : '');

    const iconWrap = document.createElement('div');
    iconWrap.className = 'trait-icon-wrap' + (row.activeBP > 0 ? ' trait-icon-active' : '');
    if (row.color) iconWrap.style.setProperty('--trait-breakpoint-color', row.color);
    const img = document.createElement('img');
    img.src = row.icon;
    img.alt = row.name;
    iconWrap.appendChild(img);
    rowEl.appendChild(iconWrap);

    const info = document.createElement('div');
    info.className = 'trait-info';

    if (row.activeBP > 0) {
      const countEl = document.createElement('span');
      countEl.className = 'trait-count';
      countEl.textContent = String(row.count);
      rowEl.appendChild(countEl);
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'trait-name';
    nameEl.textContent = row.name;
    info.appendChild(nameEl);

    if (row.activeBP > 0) {
      const pips = document.createElement('span');
      pips.className = 'trait-pips';
      pips.innerHTML = row.bps
        .map(bp => `<span class="${bp === row.activeBP ? 'pip-active' : ''}">${bp}</span>`)
        .join(' ＞ ');
      info.appendChild(pips);
    } else {
      const inactive = document.createElement('span');
      inactive.className = 'trait-pip-inactive-count';
      inactive.textContent = `${row.count} / ${row.bps[0]}`;
      info.appendChild(inactive);
    }

    rowEl.appendChild(info);
    panel.appendChild(rowEl);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Waits for every <img> in the document to either load or error out.
 * Covers images injected after page load (e.g. trait panel, planner grid)
 * that networkidle won't wait for.
 * @param {import('@playwright/test').Page} page
 */
async function waitForImages(page) {
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images).map(img =>
        img.complete
          ? Promise.resolve()
          : new Promise(resolve => {
              img.addEventListener('load',  resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            })
      )
    )
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

for (const vp of VIEWPORTS) {
  test.describe(vp.label, () => {

    test('home screen', async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'networkidle' });

      // Populate the trait panel with the Bilgewater/Zaun comp
      await page.evaluate(injectTraitPanel, TRAIT_ROWS);
      await waitForImages(page);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `home-${vp.label}.png`),
        fullPage: false,
      });
    });

    test('planner modal open', async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Pre-seed teamPlan so the selected team grid is populated on open
      await page.addInitScript((plan) => {
        localStorage.setItem('tft-team-plan', JSON.stringify(plan));
      }, TEAM_PLAN);

      await page.goto('/', { waitUntil: 'networkidle' });

      // Click the toolbar planner button — calls openTeamPlanner() which
      // runs buildPicker() + renderTeamGrid() + renderPlannerTraits()
      await page.click('.planner-btn');
      await page.locator('.planner').waitFor({ state: 'visible' });
      await waitForImages(page);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `planner-${vp.label}.png`),
        fullPage: false,
      });
    });

    test('teams modal open', async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Pre-seed three saved teams so the list is populated
      await page.addInitScript((teams) => {
        localStorage.setItem('tft-presets', JSON.stringify(teams));
      }, SEEDED_TEAMS);

      await page.goto('/', { waitUntil: 'networkidle' });

      // Open planner first, then navigate to teams via the back button.
      // (openTeams() is only reachable via the planner's saved-teams button
      // without requiring a specific app state.)
      await page.click('.planner-btn');
      await page.locator('.planner').waitFor({ state: 'visible' });
      await page.click('.planner__saved-teams-btn');
      await page.locator('.teams').waitFor({ state: 'visible' });
      await waitForImages(page);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `teams-${vp.label}.png`),
        fullPage: false,
      });
    });

  });
}
