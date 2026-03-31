# TODO Before Release -> aiming for ~April 15th (HARD DEADLINE: April 22nd)
- Fast 9 / 1–3 cost RR support
  - Build alternative rolldown situations for Lv. 5, Lv. 6, Lv. 7 (2nd rolldown 4-1 / 5-1)
- Board generation makes sensible boards
- Grading supports all types of rolldowns and has an appropriate scale
- Viewport support from 800x600 to 4K
  - Issues with other viewports (currently only optimized for 1920x1080):
    - Small text at high resolutions
    - Pixel-based borders too small at QHD and 4K
    - Switch sliders are broken at high resolutions
    	- Too long and switch doesn't fall into the correct spot due to px-based transforms
    - Team planner
    	- Should always display rows of 4 units perfectly fitted at all resolutions
    		- Currently, there's extra spacing and rows of 3 units at resolutions
- Final pass over:
  - Shop UI
  - Team Builder
  - Popup
  - Unit shop tile animations (in planner / shop shine, star up)

# 🔥 Active

See [BUGS.md](BUGS.md) for known bugs.

---

## Polish

### Shop
- Change star-up animation to ring-like effect
- Add gem to top of shop slot
- Add lock icon to shop

### SFX
- Record: buy XP, combine, end-of-round timer SFX
- Add tick SFX (every 1s while holding a unit; also when switching hovered hex)
- Investigate how often champion SFX play

### Settings
- Add "regenerate planner on reset" setting

### Team Planner
- Snapshot feature

### Grading
- Needs another pass to see if weights are distributed correctly and if any more metrics need to be added

## Fast 9 & 1/2/3-cost RR Support
- ~~Build comp detection for 1-cost, 3-cost, Fast 9~~ (done — but heuristics are AI-assisted; review against real comps)

---

## Ideas
- Add items
- Add augments
- Bot that simulates another player rolling down
- Have Gods comment on rolldown mistakes / wins