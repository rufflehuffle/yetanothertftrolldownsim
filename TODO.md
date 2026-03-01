# TODO
    Work on Team Planner action items

# Major
## Team Planner
    - Make more like the actual game
    - Filter by trait
    - Clear, Snapshot, Undo, Team Codes, etc.

## Shop
    - When dragging champion out of the shop, it should be placed back if not dragged too far
        - When you're far enough, the tile should become transparent
        - Dragging the champion out should also leave shop background visible instead of duplicating the tile

## Trait Indicators
    - Units on hover should have a colored border indicating their rarity
    - Unlockable units should show whether or not they're locked or unlocked
        - If locked, show how close to unlock condition

## SFX
    - Record buy XP, combine, end of round timer sfx

# Low Priority

## Shop
    - Change star up animation to be a ring-like effect
    - Picking up shop slot should also pick up the entire div not just the image now
    - Add gem to top of shop slot

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

## Specific trait / unit interactions
    - Make Annie, Ice Tower, and Azir summons feel less janky
    - Add T-Hex eat positioning
    - Add Piltover mod selection

- Settings Tab
    - Change hotkeys
    - Add start timer on rolldown tickbox

- Presets
    - Add editing of presets

Ideas
- Add items
- Rolldown grading
- Make a bot that simulates another player rolling down

## Known Bugs / Issues
- Inactive traits move around based on the order of units on the board
- Galio can be fielded
- Azir Soldiers count towards unit count
- Ice Tower, Tibbers, and Azir Soldiers have hardcoded hex placements when summoned and overwrite units in those hexes
- Presets don't load with the XP in the bank