# TFT Rolldown App
**Stack:** Vanilla JS ES modules, no build step | **Dirs:** `js/` (scripts), `style/` (CSS)

---

See [`js/CLAUDE.md`](js/CLAUDE.md) for module map, state shape, key invariants, mode state machine, effects, and grading.
See [`js/board-generation/CLAUDE.md`](js/board-generation/CLAUDE.md) for the board generator algorithm, scoring formula, and positioning rules.
See [`models/CLAUDE.md`](models/CLAUDE.md) for the models index (board strength + grading).
See [`docs/CLAUDE.md`](docs/CLAUDE.md) for design documents and game reference (champions, traits, shop odds, XP table, role usage).
See [`style/CLAUDE.md`](style/CLAUDE.md) for typography, colour palette, CSS tokens, viewport breakpoints, z-index layers, and component patterns.

---

## Documentation Rules

This project uses `CLAUDE.md` files as the primary interface documentation for both developers and Claude. Keeping them accurate is a hard requirement, not a nice-to-have.

### When to update docs

You **must** update the relevant `CLAUDE.md` when any of the following change:

- **Public API** — A class, function, or method is added, removed, renamed, or has its signature changed. Document what it does, its parameters, and its return value.
- **Data shapes** — A state field, object schema, or data structure changes type or gains/loses properties (e.g. a plain object becomes a class instance).
- **Invariants and rules** — A constraint on how modules interact is added or changed (e.g. "always snapshot before passing to subsystem X"). These prevent future regressions.
- **Boundary contracts** — When two parts of the codebase expect different representations of the same data (e.g. Board instance vs plain object), document where the conversion happens and who is responsible.
- **Module map** — A file is added, removed, or changes its role or dependencies.

### What to document

Keep **interface** and **implementation** documentation separate. Use distinct sections or headings so readers can find what they need without wading through the other.

**Interface docs** (for callers and integrators):
- Method signatures, parameter types, return values.
- Boundary contracts — when data crosses a boundary in different forms, use a table showing context, expected form, and how to convert (see the Board class boundary table in `js/CLAUDE.md` as an example).
- Constraints and gotchas — if something will break when used wrong (wrong argument type, missing conversion step, ordering dependency), state it explicitly. Future readers will not infer it.

**Implementation docs** (for contributors working inside the module):
- Non-obvious algorithms, formulas, or scoring logic.
- Internal state management and lifecycle (e.g. when internal caches are invalidated).
- Why a particular approach was chosen when alternatives exist — the reasoning behind a design decision, not just what it does.

### What NOT to document

- Temporary state or in-progress work — use tasks or comments for that.
- Information already in git history — don't duplicate changelogs.

### Where docs live

Each `CLAUDE.md` documents the module or directory it sits in. When adding documentation, place it in the closest `CLAUDE.md` to the code it describes. Create a new `CLAUDE.md` in a subdirectory only when that subdirectory is complex enough to warrant its own reference (3+ files with non-trivial interactions). Add a pointer from the parent `CLAUDE.md` when you do.
