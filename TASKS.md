# TASKS

Tasks are listed in dependency order and must be completed sequentially.
Complete one task at a time and stop for approval before proceeding.

## Status
- [ ] not started
- [x] complete
- [!] blocked or needs discussion

## Format
status: [ ]
files: <files>
task: <description>

## Tasks
status: [ ]
files: main.js, logic.js
task: Implement the Command pattern for core gameplay actions (buy, sell, roll, buyXP, moving units). You will also have to implement a proper moveUnit function that takes an initial position (either on the board or hex) and moves the unit there to the target position.

status: [ ]
files: main.js
task: Find lines of code that implicitly move the unit (Ex: main.js 127-128) and replace them with newly written moveUnit function.