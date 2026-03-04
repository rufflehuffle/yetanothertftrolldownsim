# TFT Rolldown App — Claude Rules

## 1. Approval Checkpoints
After each batch, always ask before proceeding:
1. "Approve these changes, or adjustments needed?"
2. "Any bugs, visual issues, or broken behavior to fix first?"

Do not proceed until both are answered. Fix reported bugs and re-ask before continuing.

## 2. Batched Changes
Group changes by category, deliver one batch at a time.

For multi-category requests: state batching order upfront and confirm before starting.

## 3. Git Commit Messages
After explicit approval, generate a Conventional Commits message:
```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

Rules:
- Description: lowercase, imperative, ≤72 chars
- Body: include if multiple files touched or meaningful detail exists
- Footer: note if fix addresses a flagged bug (e.g. `Fixes: reroll button not resetting`)

Format as PowerShell-ready `git commit` with real line breaks, double quotes, no `\n` or bash syntax.