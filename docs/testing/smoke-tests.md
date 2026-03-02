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

Each smoke run now starts with `test:smoke:preflight`, which fails fast on missing tooling, dirty git worktrees, invalid `SMOKE_HOST`/`SMOKE_PORT`, missing dependencies, or server startup/readiness errors.

### Preflight failure contract (stderr)

Downstream automation can parse smoke preflight failures from `stderr` using this versioned contract.

- On failure, preflight exits non-zero and always emits:
  - `FAIL_CODE:<code>`
  - `FAIL_FIELD:contract_version=1`
- It may emit additional `FAIL_FIELD:<key>=<value>` lines before human-readable `[smoke:preflight] ERROR/HINT` lines.
- Treat unknown `FAIL_FIELD` keys as additive and ignore them safely.
- `contract_version=1` compatibility rule: existing `FAIL_CODE` meanings and required fields are stable; new codes/fields may be added without breaking v1 parsers.

Required fields by `FAIL_CODE` (in addition to `contract_version`):

| FAIL_CODE | Required `FAIL_FIELD` keys |
| --- | --- |
| `INVALID_SMOKE_HOST` | `reason` (`empty` or `whitespace`) |
| `INVALID_SMOKE_PORT` | `port_raw` |
| `INVALID_PREFLIGHT_MODE` | `mode` |
| `NODE_VERSION_UNSUPPORTED` | `detected_version`, `min_major` |
| `REQUIRED_TOOL_UNAVAILABLE` | `tool` |
| `DEPENDENCY_MISSING` | `dependency`, `dependency_path` |
| `WORKTREE_STATUS_UNAVAILABLE` | none |
| `WORKTREE_DIRTY` | `modified`, `deleted`, `untracked`, `other` |
| `SERVER_START_TIMEOUT` | `base_url`, `timeout_seconds` |
| `SERVER_NOT_REACHABLE` | `base_url`, `mode` |
| `UNEXPECTED_FAILURE` | `error_name` |

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
  - Commit, stash, or discard local modified/deleted files.
  - Clean untracked files you do not need.
  - Re-run after `git status --short` shows no output.
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
