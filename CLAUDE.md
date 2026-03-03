# TFT Rolldown Web App — Claude Instructions

## 1. Output Format

When making changes to the project, Claude will always output complete, copy-paste-ready files — not partial diffs or abbreviated snippets. This includes:

- Full HTML files (with embedded or linked CSS/JS as appropriate)
- Full CSS files
- Full JavaScript/script files
- Isolated code snippets only when a change is scoped to a single clearly-defined function or block, and the surrounding file context is unchanged

Every file delivered should be immediately usable without requiring the developer to mentally "fill in the blanks."

## 2. Approval Checkpoints

After delivering each set of changes, Claude will always pause and ask two questions before proceeding:

1. **Approval:** "Do you approve these changes, or would you like any adjustments before moving on?"
2. **Bug check:** "Are there any bugs, visual issues, or broken behavior you've noticed that I should fix before the next batch of changes?"

Claude will not proceed to the next set of changes until both questions have been answered. If bugs are reported, Claude will fix them and re-ask the approval questions before continuing.

## 3. Batched, Categorized Changes

Claude will never bundle all requested changes into a single delivery. Instead, changes will be grouped by category and delivered one batch at a time. Examples of how changes might be categorized:

- **Layout / Structure** — HTML skeleton, page structure, component arrangement
- **Styling / Visual Design** — CSS, theming, colors, typography
- **Core Logic** — rolldown simulation, odds calculation, game state
- **UI Interactivity** — button behavior, inputs, modals, tooltips
- **Data / Champions** — champion lists, trait data, item data
- **Bug Fixes** — isolated corrections from the previous version

If a request spans multiple categories, Claude will state the planned batching order up front and ask for confirmation before starting.

## 4. Git Commit Messages

Once a set of changes has been explicitly approved (per Section 2), Claude will generate a git commit message following the Conventional Commits specification.

The commit message format is:

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

Commit types to use:

| Type | Use |
|------|-----|
| `feat` | a new feature or capability |
| `fix` | a bug fix |
| `style` | visual/CSS changes with no logic impact |
| `refactor` | code restructuring without behavior change |
| `chore` | data updates, dependency changes, or housekeeping |
| `docs` | documentation changes only |

Scope should reflect the category of the batch (e.g., `layout`, `styling`, `core-logic`, `ui`, `data`, `bugfix`).

**Rules:**
- The short description must be lowercase, imperative mood, and under 72 characters
- If the batch touches multiple files or has meaningful implementation detail, include a concise body summarizing what changed and why
- If a bug fix closes a known issue or addresses something flagged in the bug check, note it in the footer (e.g., `Fixes: reroll button not resetting between rounds`)

Claude will present the commit message as a ready-to-run `git commit` command in a copyable code block, formatted for PowerShell using double quotes with real line breaks, like so:

```powershell
git commit -m "feat(ui): add gold tracker with per-round delta display

Adds a persistent gold counter to the sim panel that tracks
current gold and shows the delta gained or spent each round.
Includes input validation to prevent negative gold values.

Fixes: gold display resetting unexpectedly on stage change"
```

The command should be copy-paste ready from PowerShell — no bash-only syntax (`$'...'`), no escaped `\n` characters.

Claude will present this after approval is confirmed, before moving on to the next batch.

## 5. General Working Style

- Claude will state what it is changing and why at the top of each batch, in plain language
- Claude will flag any assumptions made about intended behavior or data when the spec is ambiguous
- Claude will not silently remove or refactor existing features unless explicitly asked — if a change requires modifying existing functionality, it will be called out before delivery
