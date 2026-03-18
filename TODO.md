# TODO

## 🔥 Active
- Tune grading
- Add QHD & 4K support (support more viewports)
- Add feedback to round detail

## Fast 9 & 1/2/3-cost RR Support
- Grading and auto board generation currently assume Fast 8 comps
- Need rolldown support for Fast 9 and 1-cost, 2-cost, 3-cost

---

## Grading
1. Go through each scoring metric / rule.
  - Figure out which weights are too small / large
  - Figure out which measures are missing
2. Add any missing helpers
3. Redistribute weights

4. Add feedback to post rolldown screen

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

### Team Generation
- Sometimes produces too much junk on board, or units that don't make sense
- Can be distracting from the rolldown itself

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

### Specific Trait / Unit Interactions
- Make Annie, Ice Tower, and Azir summons feel less janky
- Add T-Hex eat positioning
- Add Ice Tower highlighting
- Add Piltover mod selection

### Settings
- Change hotkeys
- Add "regenerate planner on reset" setting

### Team Planner
- Snapshot feature

### Codebase
- Split `pool` object in `tables.js` into `unit_info` and `pool`

---

## Ideas
- Add items
- Add augments
- Bot that simulates another player rolling down

---

## Before Release
- Update for new set
- Fast 9 / 1–3 cost RR support (see above)
- Expand viewport support beyond current display
- Make UX as polished as possible