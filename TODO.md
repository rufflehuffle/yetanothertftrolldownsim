# TODO

# Major
Disable loading saved teams and entering TB mode while in a round
Change default behavior to not load the board on changing plans
- Add it as a setting in the kebab

# Low Priority
## HUD
- Level select runs into trait panel
    - Change to open a sideways select panel

## Team Planner
- Filter by trait
- Snapshot

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

## Rolldown Grading
- Implement a rolldown replay system

## Specific trait / unit interactions
- Make Annie, Ice Tower, and Azir summons feel less janky
- Add T-Hex eat positioning
- Add Ice Tower highlighting
- Add Piltover mod selection

## Settings
- Change hotkeys
- Add reload planner on reset setting

## Presets
- Add editing of presets

## Misc

# Ideas
- Add items
- Add augments
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
    - Shop, planner, etc. UI don't support 7 costs at all
    - "pool" object in tables.js is doing too much -> split into unit_info and pool
    - No way to get from Free Roll mode to Round Start anymore
        - Have ESC return you to the before round start menu
    - Need to prevent D from doing the default navigation thingy
    - Clicking the team planner button twice works... when it shouldn't
    - Typing space bar while naming in the planner name starts the round...
    - Sometimes, you accidentally reset your board by pressing D after the timer ends (should be ~1s cd)
    - You can drag a unit into the gap between the hexes, causing the move champ to fizzle
    - You can still (somehow?) drag the star indicators and unit count around if you click on the right spot in the board-bench gap
    - You can hold a shop slot and roll it, leaving you with a null shop slot, but when the unit is bought the unit that was in the that shop slot gets bought instead (does that make sense?)
    - Unlock condition doesn't load properly

## Big Picture before Release
- Update for new set
- Support more viewports than my own...
- Tune board auto generation
- Remove any vibe coded / temp UI
- Make UX as good as possible