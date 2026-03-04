# TFT Rolldown App — Claude Rules
**Stack:** Vanilla JS, no build step | **Dirs:** `js/` (scripts), `style/` (CSS)

## Workflow
Work in batches grouped by category. For multi-category requests, state the order upfront before starting. Pause after each batch for approval. Fix reported bugs before proceeding.

## Git Commit Messages
When asked to `commit`, generate a Conventional Commits message after explicit approval:

- Format: `<type>(<scope>): <desc>` — lowercase, imperative, ≤72 chars
- Add a body if multiple files touched or meaningful detail exists
- Add a footer if the commit fixes a flagged bug: `Fixes: <description>`