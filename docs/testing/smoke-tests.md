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

## Preflight failure contract

`scripts/smoke-preflight.mjs` emits a stable machine-readable error contract on `stderr` for every failure.

### Line format

- `FAIL_CODE` line:

```text
[smoke:preflight] FAIL_CODE=<CODE>
```

- `FAIL_FIELD` line:

```text
[smoke:preflight] FAIL_FIELD <KEY>=<JSON_VALUE>
```

`<JSON_VALUE>` is JSON-encoded (string, number, array). Consumers should parse the JSON payload after `=`.

### Ordering guarantees

For every failure, output order is stable:

1. Exactly one `FAIL_CODE` line.
2. Zero or more `FAIL_FIELD` lines.
3. Human-readable `ERROR` line.
4. Optional human-readable `HINT` line.

Within `FAIL_FIELD` lines:

1. Required fields are emitted first, in the documented order for that `FAIL_CODE`.
2. Optional fields are emitted after required fields, in the documented order, only when present.

### `FAIL_CODE` reference

| FAIL_CODE | Required `FAIL_FIELD` keys (ordered) | Optional `FAIL_FIELD` keys (ordered) |
| --- | --- | --- |
| `INVALID_SMOKE_HOST_EMPTY` | `VAR_NAME` | None |
| `INVALID_SMOKE_HOST_WHITESPACE` | `VAR_NAME`, `HOST_VALUE` | None |
| `INVALID_SMOKE_PORT` | `VAR_NAME`, `RECEIVED`, `MIN_PORT`, `MAX_PORT`, `DEFAULT_PORT` | None |
| `INVALID_SMOKE_PREFLIGHT_MODE` | `VAR_NAME`, `RECEIVED`, `ALLOWED_MODES` | None |
| `UNSUPPORTED_NODE_VERSION` | `DETECTED_VERSION`, `MIN_NODE_MAJOR` | None |
| `MISSING_TOOL` | `TOOL` | `CHECK_ARGS` |
| `MISSING_DEPENDENCY` | `DEPENDENCY`, `EXPECTED_PATH` | None |
| `GIT_STATUS_UNAVAILABLE` | `COMMAND` | None |
| `DIRTY_WORKTREE` | `MODIFIED`, `DELETED`, `UNTRACKED`, `OTHER`, `TOTAL_CHANGES`, `PREVIEW_COUNT` | `TRUNCATED_REMAINING` |
| `SERVER_START_TIMEOUT` | `MODE`, `BASE_URL`, `TIMEOUT_SECONDS` | None |
| `SERVER_CHECK_UNAVAILABLE` | `MODE`, `BASE_URL` | None |
| `UNEXPECTED_FAILURE` | `ERROR_MESSAGE` | `ERROR_NAME` |

### `FAIL_FIELD` value formats

- `VAR_NAME`, `TOOL`, `DEPENDENCY`, `EXPECTED_PATH`, `COMMAND`, `MODE`, `BASE_URL`, `HOST_VALUE`, `DETECTED_VERSION`, `ERROR_MESSAGE`, `ERROR_NAME`, `RECEIVED`: JSON string
- `MIN_PORT`, `MAX_PORT`, `DEFAULT_PORT`, `MIN_NODE_MAJOR`, `MODIFIED`, `DELETED`, `UNTRACKED`, `OTHER`, `TOTAL_CHANGES`, `PREVIEW_COUNT`, `TRUNCATED_REMAINING`, `TIMEOUT_SECONDS`: JSON number
- `ALLOWED_MODES`, `CHECK_ARGS`: JSON array of strings

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
