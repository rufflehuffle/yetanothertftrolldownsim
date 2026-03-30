# TODO Before Release -> aiming for ~April 15th (HARD DEADLINE: April 22nd)
- Fast 9 / 1–3 cost RR support
- Board generation makes sensible boards
- Grading supports all types of rolldowns and has an appropriate scale
- Viewport support from 800x600 to 4K
- Final pass over:
  - Shop UI
  - Team Builder
  - Popup
  - Unit shop tile animations (in planner / shop shine, star up)

# 🔥 Active
## Fast 9 & 1/2/3-cost RR Support
- Build comp detection for 1-cost, 3-cost, Fast 9
- Add comp detection in UI / allow user to manually set the generation

See [BUGS.md](BUGS.md) for known bugs.

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