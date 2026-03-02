# Smoke Test Quick-Run Guide

Use this guide to run the Playwright smoke suite consistently in local development and before opening a PR.

## What the smoke suite validates

- App shell loads.
- Core task input and create button render.
- Backlog create flow updates UI with the new issue.

The suite lives at `tests/smoke.spec.ts`.

## Prerequisites

- Node.js 20+
- npm 10+
- Project dependencies installed:

```bash
npm install
```

- Playwright Chromium browser installed:

```bash
npx playwright install chromium
```

No Linear API key is required for smoke tests. The test mocks `/api/linear` requests.

## Local quick run

Run just the smoke suite:

```bash
npm run test:smoke
```

Each smoke run starts with `test:smoke:preflight`.

## Smoke preflight contract

`npm run test:smoke:preflight` is a hard gate that must pass before smoke tests run.

It checks:

- Tooling in `PATH`: `node`, `npm`, `npx`, `git`.
- Runtime: Node.js major version is `20+`.
- Repo state: git worktree is clean (no modified, deleted, or untracked files).
- Installed dependencies: `next` and `@playwright/test` exist in `node_modules`.
- Smoke config:
  - `SMOKE_HOST` is non-empty and has no whitespace.
  - `SMOKE_PORT` is an integer in `1-65535` (default `3000` if unset).
  - `SMOKE_PREFLIGHT_MODE` is one of `listen`, `check`, or `skip`.
- Server readiness (mode-dependent):
  - `listen` (default): if nothing responds at `SMOKE_HOST:SMOKE_PORT`, preflight starts `next dev` and requires readiness within 45s.
  - `check`: preflight requires an already-running server at `SMOKE_HOST:SMOKE_PORT`.
  - `skip`: preflight skips server/network readiness checks.

If any check fails, preflight exits non-zero and `test:smoke` stops immediately.

## CI-equivalent run

Run with CI semantics (single worker, zero retries):

```bash
npm run test:smoke:ci
```

### Host/port overrides for restricted environments

Smoke tests use these environment variables when starting Next.js and building Playwright `baseURL`:

- `SMOKE_HOST` (default: `127.0.0.1`)
- `SMOKE_PORT` (default: `3000`)
- `SMOKE_PREFLIGHT_MODE` (default: `listen`)
  - `listen`: current local default behavior. If no server is running, preflight temporarily starts `next dev` to verify startup/readiness.
  - `check`: preflight requires an already-running server and does not start one.
  - `skip`: preflight skips all server readiness checks (non-listening mode for restricted sandboxes).

Example:

```bash
SMOKE_HOST=0.0.0.0 SMOKE_PORT=4173 npm run test:smoke:ci
```

Restricted environment preflight-only example (no port binding attempt):

```bash
SMOKE_PREFLIGHT_MODE=skip npm run test:smoke:preflight
```

## Troubleshooting

- `Executable doesn't exist` or browser launch failures:
  - Re-install browsers with `npx playwright install --with-deps chromium`.
- Preflight fails with missing tool/dependency:
  - Confirm Node.js 20+ and npm are installed.
  - Run `npm ci` and retry.
- Preflight fails with `Dirty worktree detected`:
  - Inspect what is dirty: `git status --short`.
  - Choose one:
    - Keep changes: commit them.
    - Temporarily park changes (including untracked): `git stash push -u -m "wip before smoke run"`.
    - Discard tracked edits you do not need: `git restore .`
    - Remove untracked files you do not need: `git clean -fd`
  - Re-run only when `git status --short` is empty.
  - If you need to keep unrelated local work while running smoke, use isolated workflow guidance: `docs/references/smoke-suite-isolation.md`.
- Preflight fails on invalid `SMOKE_HOST`/`SMOKE_PORT`:
  - Use a host without spaces and a port in the `1-65535` range.
- Port `3000` already in use:
  - Stop existing local servers on `3000`, then retry.
  - Or set `SMOKE_PORT` to an open port and rerun.
- `listen EPERM 127.0.0.1:3000` (or other blocked port binding) in restricted environments:
  - Run preflight in non-listening mode: `SMOKE_PREFLIGHT_MODE=skip npm run test:smoke:preflight`.
  - Or run `SMOKE_PREFLIGHT_MODE=check` and point `SMOKE_HOST`/`SMOKE_PORT` at an already-running server.
- First run is slow or times out:
  - Re-run once after dependency/browser install completes.
- Failing assertion after UI text updates:
  - Update smoke selectors/assertions in `tests/smoke.spec.ts` to match intended UI copy.
- CI-only failure:
  - Download `playwright-smoke-artifacts` from the failed workflow run and inspect `test-results` traces/screenshots.

## CI gate

GitHub Actions workflow: `.github/workflows/smoke-playwright.yml`  
Job name: `smoke-test`

Set this job as a required status check in branch protection rules for `main`.
