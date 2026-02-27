# 2.27.26 Plan
    - Compare app to in-game screenshots and fix discrepancies

# Major
## Trait Indicators
    - Make look like what it actually looks like in game
    - Units on hover should have a colored border indicating their rarity
    - Unlockable units should show whether or not they're locked or unlocked
        - If locked, show how close to unlock condition

## Shop
    - Edit tiles to have champion traits
    - Fix animation to be a ring-like effect
    - When dragging champion out of the shop, it should be placed back if not dragged too far
        - When you're far enough, the tile should become transparent
        - Dragging the champion out should also leave shop background visible instead of duplicating the tile
    - Picking up shop slot should also pick up the entire div not just the image now

## Add SFX
    - Record buy XP, combine, end of round timer sfx

# Minor
- Code Cleanup
    - Implement the Command Pattern -> will help with implement rolldown tracking

- Rolldown grading
    - Implement a rolldown replay system
        - Also add a move function so I can track movement

- Sell zone doesn't cover shop for all viewports
    - Make positioning more dynamic

- Add SFX
    - Add tick sfx (plays every 1s while holding a unit, also plays when switching the hex you're hovering over)
    - Investigate how often champion SFX play

- Background art

- Specific unit interactions
    - Make Annie, Ice Tower, and Azir summons feel less janky
    - Add T-Hex eat positioning

- Team Planner
    - Make more like the actual game
    - Filter by trait
    - Clear, Snapshot, Undo, etc.

- Settings Tab
    - Change hotkeys
    - Add start timer on rolldown tickbox

- Presets
    - Add editing of presets

Ideas
- Add items
- Rolldown grading
- Make a bot that simulates another player rolling down