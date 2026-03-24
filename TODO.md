# TODO

## 🔥 Active
- Add feedback to round detail
- Add QHD & 4K support (support more viewports)

## Fast 9 & 1/2/3-cost RR Support
- Grading and auto board generation currently assume Fast 8 comps
- Need rolldown support for Fast 9 and 1-cost, 2-cost, 3-cost

---

## Bugs

### Gameplay / Logic
- Units can still appear in shop after being 3-starred
- Galio can be fielded
- Inactive traits reorder based on unit positions on board (expected: some fixed order by breakpoints?)
- Presets don't load with XP in the bank
- Unlock condition doesn't load properly
- Ice Tower, Tibbers, and Azir Soldiers have hardcoded hex placements and overwrite units

### Input / Controls
- Can hold a shop slot and roll it, leaving a null slot; buying causes wrong unit to be bought
- Can drag a unit into the gap between hexes, causing a fizzle
- Can drag star indicators and unit count if clicking the right spot in board-bench gap
- `D` key triggers browser default navigation
- Pressing `D` after timer ends can accidentally reset board (~1s cooldown needed)

### UI / HUD
- HUD is messed up and clippy in TB mode
- Shop, planner, etc. don't support 7-cost units
- Disable loading saved teams and entering TB mode while in a round

---

## Polish

### Trait Indicators
- Units in hover info panel should have colored border indicating rarity

### Shop
- Change star-up animation to ring-like effect
- Add gem to top of shop slot
- Add lock icon to shop

### SFX
- Record: buy XP, combine, end-of-round timer SFX
- Add tick SFX (every 1s while holding a unit; also when switching hovered hex)
- Investigate how often champion SFX play

### Settings
- Change hotkeys
- Add "regenerate planner on reset" setting

### Team Planner
- Snapshot feature

### Codebase
- Split `pool` object in `tables.js` into `unit_info` and `pool`

### Grading
- Needs another pass to see if weights are distributed correctly and if any more metrics need to be added

---

## Ideas
- Add items
- Add augments
- Bot that simulates another player rolling down

---

## Before Release -> aiming for ~April 15th
- Update for new set
- Fast 9 / 1–3 cost RR support (see above)
- Expand viewport support beyond current display
- Make UX as polished as possible
- Final pass over:
  - Shop UI
  - Team Builder
  - Popup
  - Unit shop tile animations (in planner / shop shine, star up)