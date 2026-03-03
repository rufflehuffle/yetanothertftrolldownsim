# TODO

# Major

## Shop
- Implement proper shop drag behavior
    - When dragging champion out of the shop, it should be placed back if not dragged too far
    - When you're far enough, the tile should become transparent
    - Dragging the champion out should also leave shop background visible instead of duplicating the tile
    - Picking up shop slot should also pick up the entire div not just the image now


# Low Priority

## Team Planner
- Filter by trait
- Clear, Snapshot, Undo, Team Codes, etc.

## Trait Indicators
- Units on hover should have a colored border indicating their rarity
- Unlockable units should show whether or not they're locked or unlocked
    - If locked, show how close to unlock condition

## Shop
- Change star up animation to be a ring-like effect
- Add gem to top of shop slot
- Add lock icon to shop

## SFX
- Record buy XP, combine, end of round timer sfx
- Add tick sfx (plays every 1s while holding a unit, also plays when switching the hex you're hovering over)
- Investigate how often champion SFX play

## Code Cleanup
- Implement the Command Pattern -> will help with implement rolldown tracking

## Rolldown Grading
- Implement a rolldown replay system
    - Also add a move function so I can track movement

## Specific trait / unit interactions
- Make Annie, Ice Tower, and Azir summons feel less janky
- Add T-Hex eat positioning
- Add Piltover mod selection

## Settings
- Change hotkeys
- Add start timer on rolldown tickbox

## Presets
- Add editing of presets

## Misc
- Sell zone doesn't cover shop for all viewports
    - Make positioning more dynamic

# Ideas
- Add items
- Rolldown grading
- Make a bot that simulates another player rolling down

## Known Bugs / Issues
    - Inactive traits move around based on the order of units on the board
        - Correct order has something to do with the trait breakpoints maybe?
        - Shurima (2 > 3 > 4) is above Warden (2 > 3 > 4 > 5) which is above Piltover (2 > 4 > 6)
        - But Defender (2 > 4 > 6) is above Invoker (2 > 4)?
        - Alphabetical order seems to be the least important
    - Galio can be fielded
    - Ice Tower, Tibbers, and Azir Soldiers have hardcoded hex placements when summoned and overwrite units in those hexes
    - Units can still appear in the shop after being 3 starred
    - Presets don't load with the XP in the bank
    - HUD is all messed up and clippy in TB mode