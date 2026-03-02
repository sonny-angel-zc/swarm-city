# Smoke Suite Isolation Workflow

Use this flow whenever Playwright smoke work is in progress and your current tree has unrelated local edits (for example `package.json`, `src/core/*`, or non-smoke tests).

## Preferred: Temporary Worktree

1. Confirm your main workspace can keep its in-progress edits:
   ```bash
   git status --short
   ```
2. Create an isolated branch and worktree from current `main`:
   ```bash
   git fetch origin
   git worktree add ../swarm-city-smoke -b chore/smoke-suite-isolated origin/main
   ```
3. Switch to the isolated worktree:
   ```bash
   cd ../swarm-city-smoke
   ```
4. Implement smoke-only changes there.
5. Commit and push from the isolated worktree:
   ```bash
   git add .github/workflows/smoke-playwright.yml playwright.config.ts tests/smoke.spec.ts package.json package-lock.json
   git commit -m "chore(test): isolate Playwright smoke-suite changes"
   git push -u origin chore/smoke-suite-isolated
   ```
6. Open PR, then clean up:
   ```bash
   cd -
   git worktree remove ../swarm-city-smoke
   ```

## Fallback: Same Tree + Stash/Cherry-Pick Checklist

Only use this if you cannot create a worktree.

1. Snapshot everything before smoke work:
   ```bash
   git stash push -u -m "wip/non-smoke-before-smoke-suite"
   ```
2. Create and switch to smoke branch:
   ```bash
   git switch -c chore/smoke-suite-isolated
   ```
3. Re-apply only smoke-suite files from stash (no blanket `stash pop`):
   ```bash
   git checkout stash@{0} -- .github/workflows/smoke-playwright.yml playwright.config.ts tests/smoke.spec.ts package.json package-lock.json
   ```
4. Verify staged scope is smoke-only:
   ```bash
   git add .github/workflows/smoke-playwright.yml playwright.config.ts tests/smoke.spec.ts package.json package-lock.json
   git status --short
   git diff --cached --name-only
   ```
5. Commit smoke-suite changes.
6. Return non-smoke WIP safely:
   ```bash
   git switch -
   git stash pop
   ```

## Pre-Commit Safety Checklist

- Branch name is `chore/smoke-suite-isolated` (or equivalent smoke-specific name).
- `git diff --cached --name-only` contains only smoke-related files.
- No files under `src/core/` are staged unless explicitly part of smoke fix.
- `package.json` / `package-lock.json` changes are limited to Playwright scripts/deps.
- Smoke test passes before push:
  ```bash
  npm run test:smoke
  ```
