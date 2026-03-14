# TODO
- Add default teams
- Add QHD & 4K support
- Add feedback to round detail
- Tune grading
- Add support for Fast 9 and 1-cost, 2-cost, and 3-cost RR rolldowns
  - Currently, grading and auto board generation only make sense in the context of Fast 8 comps

# Low Priority
## Team Generation
- Team generation is still a little wonky... sometimes you have too much junk on your board or some units don't make sense.
- Ends up being a little too distracting from the actual rolldown.

## Team Planner
- Snapshot

## Trait Indicators
- Units in hover info panel should have a colored border indicating their rarity

## Shop
- Change star up animation to be a ring-like effect
- Add gem to top of shop slot
- Add lock icon to shop

## SFX
- Record buy XP, combine, end of round timer sfx
- Add tick sfx (plays every 1s while holding a unit, also plays when switching the hex you're hovering over)
- Investigate how often champion SFX play

## Specific trait / unit interactions
- Make Annie, Ice Tower, and Azir summons feel less janky
- Add T-Hex eat positioning
- Add Ice Tower highlighting
- Add Piltover mod selection

## Settings
- Change hotkeys
- Add regenerate planner on reset setting

## Misc
- Disable loading saved teams and entering TB mode while in a round

# Ideas
- Add items
- Add augments
- Make a bot that simulates another player rolling down

## Known Bugs / Issues
    - Units can still appear in the shop after being 3 starred
    - You can hold a shop slot and roll it, leaving you with a null shop slot, but when the unit is bought the unit that was in the that shop slot gets bought instead (does that make sense?)

    - You can drag a unit into the gap between the hexes, causing the move champ to fizzle
    - You can still (somehow?) drag the star indicators and unit count around if you click on the right spot in the board-bench gap



    - Inactive traits move around based on the order of units on the board
        - Correct order has something to do with the trait breakpoints maybe?
        - Shurima (2 > 3 > 4) is above Warden (2 > 3 > 4 > 5) which is above Piltover (2 > 4 > 6)
        - But Defender (2 > 4 > 6) is above Invoker (2 > 4)?
        - Alphabetical order seems to be the least important
    - Galio can be fielded
    - Ice Tower, Tibbers, and Azir Soldiers have hardcoded hex placements when summoned and overwrite units in those hexes
    - Presets don't load with the XP in the bank
    - HUD is all messed up and clippy in TB mode
    - Shop, planner, etc. UI don't support 7 costs at all
    - "pool" object in tables.js is doing too much -> split into unit_info and pool
    - Need to prevent D from doing the default navigation thingy
    - Sometimes, you accidentally reset your board by pressing D after the timer ends (should be ~1s cd)
    - Unlock condition doesn't load properly

## Big Picture before Release
- Update for new set
- Support more viewports than my own...
- Tune board auto generation
- Make UX as good as possible