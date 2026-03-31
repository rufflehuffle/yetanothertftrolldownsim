# TFT Rolldown — CSS Style Guide

> Viewports tested in `tests/layout.spec.js` and `tests/spacing.spec.js`.

---

## Fonts

| Family | Role | Weights |
|---|---|---|
| `'Beaufort'` | Game UI labels, headings, buttons | 300 400 500 **700** 900 |
| `'Spiegel'` | Body, captions, supporting copy | 400 **600** 700 |

Self-hosted OTF under `style/fonts/`. **Never CDN.** Titles always `text-transform: uppercase`.

**Type scale**

All font sizes outside scale-wrapped elements (HUD, toolbar, timer, trait panel, popup) use `rem` so they scale with the root font-size at QHD/4K. The pixel values below are the 1× equivalents at the 16px root.

| Use | rem | px equiv | Weight | Family |
|---|---|---|---|---|
| Modal title | 1.5–1.75rem | 24–28px | 700 | Beaufort |
| Section header | 1.125rem | 18px | 700 | Beaufort |
| Button label | 0.8125–1rem | 13–16px | 700 | Beaufort |
| Body / trait names | 0.875rem | 14px | 400–500 | Spiegel |
| Caption / hint | 0.6875–0.75rem | 11–12px | 400 | Spiegel |
| Board unit count | `clamp(20px, 3vmin, 5vmin)` | — | 700 | Beaufort |

`letter-spacing` = tracking ÷ 1000 × font-size. (Tracking 50 at 14px → `0.7px`.)

---

## Colours

**Do not introduce new colours. No pure black/white.**

**Backgrounds** (darkest = Hextech Black)

| Role | Value |
|---|---|
| Page `<body>` | `hsl(210, 90%, 4%)` |
| Modals | `#000B13` |
| HUD / popups | `#0D1416` |
| Planner panel / tooltips | `#0F171E` |
| Cards / placeholders | `#1E2429` |
| Timer pill | `#090a0c` |
| Toolbar | `#162021` |

**Gold — Hextech Metal (frames, labels, static structure)**

| Role | Value |
|---|---|
| Primary text (Gold 1) | `#F0E6D2` |
| HUD labels (Gold 2) | `#C8AA6E` |
| Action button border (Gold 3) | `#C0A366` |
| HUD outer border (Gold 4) | `#947842` |
| Toolbar trim (Gold 5) | `#735D31` |
| Inactive border (Gold 6) | `#675F4C` |
| Scrollbar thumb (Gold 7) | `#795b29` |

**Blue — Hextech Magic (attention, interaction, timers)**

| Role | Value |
|---|---|
| Level text | `#90c8ff` |
| XP text | `#6a9fd8` |
| Buy XP border | `#42829C` |
| Teal toolbar caps | `#21555A` |
| Teal hover | `#529A94` |
| Timer — normal | `#38bdf8` |
| Timer — warning | `#f97316` |
| Timer — expired | `#ef4444` |

**Text on dark**

| Role | Value |
|---|---|
| Primary (Gold 1) | `#F0E6D2` |
| Active trait name | `#EAE0CD` |
| Muted | `#A09B8C` |
| Inactive | `#999` |
| Pip / secondary | `#635F56` |
| Team name | `#CDBE91` |

**Trait tier colours**

| Tier | Value |
|---|---|
| Bronze | `#876049` |
| Silver | `#819193` |
| Gold | `#BCA55B` |
| Legendary | `#E37B23` |
| Prismatic | `#BDF3ED` |
| Inactive | `#1E2429` |

**Unit cost borders**

| Cost | Value |
|---|---|
| 1 | `#3E505E` |
| 2 | `#0B7827` |
| 3 | `#2166A6` |
| 4 | `#B91C8C` |
| 5 | `#B88502` |

**Official gradients**

| Name | Direction | Use |
|---|---|---|
| Dark Blue | Blue 7 → Blue 6 | Background surfaces only |
| Gold | Gold 3 → Gold 5 | Metal framing only |
| Blue | Blue 2 → Blue 4 | Magic/animated elements |

---

## CSS Custom Properties

Defined in `board.css`. **Always use these for anything aligned to the hex grid.**

```css
:root {
  --hex-w:       clamp(48px, min(9vh, 7.5vw), max(80px, 4.17vw));
  --hex-h:       calc(var(--hex-w) * 1.15);
  --hex-gap:     4px;    /* 6px @ QHD, 8px @ 4K */
  --row-offset:  calc(var(--hex-w) * 0.5 + var(--hex-gap) * 0.5);
  --row-overlap: calc(var(--hex-h) * -0.217);
  --timer-h:     36px;   /* 54px @ QHD, 72px @ 4K */
  --hud-h:       200px;  /* 130px @ ≤900px, 300px @ QHD, 400px @ 4K */
}
```

---

## Layout

### Centering pattern (board, HUD, timer bar)
```css
position: fixed; left: 50%; transform: translateX(-50%);
```

### Modal pattern
```css
position: fixed; top: 10vh; left: 12.5vw; width: 75vw; height: 75vh;
```
Always pair with `position: fixed; inset: 0` backdrop at z-index 499.

### z-index layers

| z | Element |
|---|---|
| 10 | `.no-comp-popup` |
| 100 | `.trait-panel`, `.toolbar` |
| 200 | Dropdowns, `.btn-panel` |
| 400 | `.top-timer-bar` |
| 499 | `.planner-backdrop` |
| 500 | `.planner`, `.teams` |
| 600 | `.planner__unit-info` |
| 999 | `.sell-zone` |
| 1000 | Drag ghosts |
| 2000 | Tooltips |

---

## Shapes

**Hexagon** (board cells, bench, trait icons)
```css
clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
/* width × height ratio 1 : 1.15 — always use --hex-w / --hex-h */
```

**Top timer pill**
```css
clip-path: polygon(0% 0%, 100% 0%, calc(100% - 20px) 100%, 20px 100%);
```

No `border-radius` on game-chrome buttons. `border-radius: 4px` only for small utility controls.

---

## Buttons

| Type | Style |
|---|---|
| Modal action | `border: 0.125rem solid #C0A366; background: #1E2429` |
| HUD (Buy XP / Reroll) | Diagonal `linear-gradient`, `height: 65px`, `box-shadow: inset 0 0 0 2px` |
| Hover (gold-bordered) | `background: rgba(192, 163, 102, 0.15)` |
| Disabled | `opacity: 0.35; cursor: not-allowed` |

---

## Transitions

| Context | Value |
|---|---|
| Interactive (hover bg/border) | `0.15s ease` |
| Filter (trait icon) | `filter 0.15s ease` |
| XP bar fill | `width 0.3s ease` |
| Timer progress | `width 1s linear, background 0.4s` |

---

## Scrollbars

```css
--sb-track-color: #000b13;
--sb-thumb-color: #795b29;
--sb-size: 7px;
```
Always provide both `::-webkit-scrollbar` rules and the `@supports not selector(::-webkit-scrollbar)` `scrollbar-color` fallback.

---

## Viewports & Scaling

| Group | Resolution | HUD scale | Root font-size |
|---|---|---|---|
| low-res | 800×600 | 0.62× | 16px (default) |
| standard | 1280–1920px wide | 1× (design target) | 16px (default) |
| QHD | 2560×1440 | 1.5× | 24px |
| 4K | 3840×2160 | 2.0× | 32px |

### Two-track scaling strategy

**Track 1 — Scale-wrapped widgets** (HUD, toolbar, timer, trait panel, popup): use `transform: scale()` at QHD/4K breakpoints. All sizing inside these elements stays in `px` to avoid double-scaling.

**Track 2 — Modals and standalone elements** (planner, teams, postrd, presets, team-builder): sized with `rem`. Root font-size bumps at QHD/4K drive scaling automatically — no per-element media queries needed.

> `border` and `font-size` values in Track 2 files are written in `rem`. `postrd-analysis.css` is an exception — it uses `calc(Npx * var(--rd-ui-scale, 1))` driven by JS and must stay that way.

**`transform-origin` by component:**
- HUD → `center bottom`
- Toolbar → `right top`
- Timer bar → `top center`
- Trait panel → `top right`
- Popup → keep in `translate(-50%, -50%) scale(…)` chain

### Breakpoint rules

**`max-width: 900px`**
- `.hud`, `.toolbar`: scale `0.62`
- `.trait-panel`: `left: 0; top: 80px; width: 165px; max-height: 40vh; overflow-y: auto`
- `--hud-h: 130px`
- Planner: `.planner-picker__unit-trait-container { display: none }` — trait icons hidden in picker cards (too small to read; pagination planned)
- Planner: `.planner-traits { overflow: hidden }` — trait panel clips rather than overflows

**`max-width: 1919px`**
- Trait rows: `.trait-row:nth-child(n+7) { display: none }`

**`min-width: 2560px`**
- HUD scale `1.5`; `--hud-h: 300px`, `--timer-h: 54px`, `--hex-gap: 6px`; `html { font-size: 24px }`

**`min-width: 3840px`**
- HUD scale `2.0`; `--hud-h: 400px`, `--timer-h: 72px`, `--hex-gap: 8px`; `html { font-size: 32px }`

**Toolbar right offset:** standard `right: min(18vw, calc(50vw - 497px))`; `≤900px`: `right: 0`

### Switch slider formula

Toggle switches (planner + teams) use a `3vw` track. All icon dimensions are `vw`-based so proportions match 1920×1080 at every resolution.

| Property | Value | 1920px equiv |
|---|---|---|
| Icon size | `2.4vw` | 46px |
| Icon `left` | `-0.78vw` | −15px |
| Icon `top` | `-0.42vw` | −8px |
| `::before` size | `2.083vw` | 40px |
| Symbol (planner) | `1.3vw` | 25px |
| Symbol (teams) | `1.04vw` | 20px |
| Track height (teams) | `1.56vw` | 30px |
| Travel (checked state) | `2.16vw` | 41.5px |

Travel derived from: `3vw − icon(2.4vw) + 2 × overhang(0.78vw)` = `2.16vw`.

---

## File Map

| File | Scope |
|---|---|
| `base.css` | Body font + bg |
| `fonts.css` | `@font-face` declarations |
| `board.css` | `:root` tokens, hex grid, bench |
| `hud.css` | HUD bar, gold, level, XP, buttons |
| `buttons.css` | Toolbar, hover panels |
| `shop.css` | Shop slots, cost bar |
| `ghost.css` | Drag ghosts (`.drag-ghost`, `.shop-slot-ghost`) |
| `timer.css` | Top timer bar |
| `trait.css` | Trait panel, rows, tooltip |
| `popup.css` | `.no-comp-popup` |
| `planner.css` | Team Planner modal |
| `planner-filter.css` | Planner filter bar |
| `teams.css` | Saved Teams modal |
| `postrd.css` | Post-RD overlay |
| `postrd-analysis.css` | Post-RD analysis panel |
| `postrd-performance.css` | Post-RD chart |
| `presets.css` | Preset toolbar |
| `hotkeys-modal.css` | Hotkeys reference modal (z 649/650) |

---

## Do / Don't

| Do | Don't |
|---|---|
| Gold = frames/structure; Blue = animation/attention | Mix blue framing with gold animated elements |
| `clamp()` for values that flex across viewports | Hard-code sizes that should track `--hex-w` |
| `transform: scale()` at QHD/4K for Track 1; `rem` for Track 2 | Add breakpoints between 900px and 2560px |
| `rem` for font-size and border in modal/planner CSS | Use `px` in Track 2 files (breaks QHD/4K scaling) |
| `px` for font-size and border inside scale-wrapped elements | Use `rem` inside HUD/toolbar/timer (causes double-scaling) |
| `user-select: none` on all display-only game elements | Add `border-radius` to game-chrome buttons |
| Always pair new modals with a backdrop at z-499 | Skip the backdrop |
| Use `@font-face` with exact weight/style | Import fonts from CDN or rely on faux-bold |
| Beaufort for game labels; Spiegel for body copy | Use Beaufort at very small sizes or in paragraphs |
| Lines terminate in straights (Hextech Metal rule) | Round or point decorative line ends |
| Test at 800×600 and 3840×2160 | Assume 1920×1080 only |
