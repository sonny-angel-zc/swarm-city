# SWA-64 Subtask 1/5: Research Constraints for Running Full Playwright Suite in CI

## Scope

Audit repository architecture and operational constraints for running the full Playwright suite in CI, then provide implementation-ready guidance for SWA-64 subtasks 2-5.

## Current Architecture Snapshot (Verified)

- CI workflow: `.github/workflows/playwright-full-suite.yml`
  - Triggers: `pull_request` (main), `push` (main), nightly `schedule` (`0 7 * * *`), and `workflow_dispatch`.
  - Execution model: matrix over `chromium`, `firefox`, `webkit` with `fail-fast: false`.
- Playwright runtime config: `playwright.config.ts`
  - `retries: 2` in CI, `workers: 1` in CI, `timeout: 90s` in CI.
  - `testDir: ./tests`, so all specs in `tests/` run in the full suite.
- CI server orchestration:
  - Workflow sets `PLAYWRIGHT_SKIP_WEBSERVER=1` and launches Next.js manually (`npm run start -- -H "$SMOKE_HOST" -p "$SMOKE_PORT"`).
  - Readiness requires both TCP and HTTP success at `http://localhost:3000` before tests begin.
- Build/test command chain in CI:
  - `npm ci`
  - `npx playwright install --with-deps <project>`
  - `npm run build`
  - `npm run test:e2e:ci -- --project=<project> ...`

## Hard Constraints

1. Full-suite browser parity is non-negotiable
- The workflow is explicitly designed to run each test project in separate matrix jobs (`chromium`, `firefox`, `webkit`).
- Any reduction in browser matrix coverage changes the quality gate and should be treated as scope change, not refactor.

2. CI reliability depends on external webServer mode being disabled
- Workflow sets `PLAYWRIGHT_SKIP_WEBSERVER=1`, so Playwright does not manage server lifecycle in CI.
- CI correctness therefore depends on the explicit launch/wait/stop steps in `.github/workflows/playwright-full-suite.yml`.

3. Build must stay in the critical path
- `npm run build` is required before E2E execution and includes docs/router validation scripts from `package.json`.
- Skipping build would weaken contract coverage and diverge from deployed runtime behavior.

4. Test topology is mixed (browser E2E + contract-style specs)
- `tests/` includes UI browser flows and non-UI contract-style specs (e.g. `tests/linear-project-contract.spec.ts`, `tests/linear-sync-contract.spec.ts`, `tests/api-projects-route.spec.ts`).
- Under current architecture, those contract-style specs are still executed once per browser matrix leg, increasing runtime.

5. CI timing behavior is intentionally conservative
- Workflow timeout is `45` minutes per matrix job.
- Startup readiness budget is `120s` (60 attempts x 2s).
- Playwright CI settings prioritize determinism (`workers=1`) over throughput.

6. Triage output is part of the operational contract
- Failure summary in GitHub step summary is generated from project-scoped JUnit XML.
- Artifacts are always uploaded per project at:
  - `playwright-report/playwright-full/<project>`
  - `test-results/playwright-full/<project>`
  - `next-server.log`

7. No secrets are required for this suite
- Tests mock/stub external dependencies in-spec (notably Linear API paths), so workflow currently runs without external secret injection.

## CI Environment Contract

- Runner: GitHub-hosted `ubuntu-latest`
- Node: `20`
- Host/port: `localhost:3000`
- Required env in workflow:
  - `CI=1`
  - `TZ=UTC`
  - `NEXT_TELEMETRY_DISABLED=1`
  - `SMOKE_HOST=localhost`
  - `SMOKE_PORT=3000`
  - `PLAYWRIGHT_SKIP_WEBSERVER=1`

## Actionable Implementation Guidance (Subtasks 2-5)

1. Subtask 2: Lock UX/data contract to current matrix-scoped outputs
- Keep matrix-scoped artifact/report directories (`.../<project>`) as the stable contract.
- Keep failure-summary copy/action hints stable so triage docs and on-call behavior do not drift.

2. Subtask 3: Reduce runtime without reducing browser gate quality
- Split contract-style, non-UI specs into a separate CI lane (or separate Playwright project/config) that runs once per workflow, not once per browser.
- Keep browser matrix jobs focused on tests that require page/browser semantics.

3. Subtask 4: Preserve deterministic server lifecycle
- Keep explicit server process management in workflow (launch, combined TCP+HTTP readiness, guaranteed cleanup).
- If startup flakiness appears, increase readiness budget before changing test assertions.

4. Subtask 5: Validate with project-scoped execution and artifact checks
- Required validation should include at least one matrix leg command-equivalent local run plus CI artifact path verification.
- Confirm JUnit file generation remains project-scoped (`test-results/playwright-full/<project>/junit.xml`) because failure-summary parsing depends on it.

## Targeted Validation Commands for Follow-On Work

- `npm run test:e2e:ci -- --project=chromium --list`
- `npm run test:e2e:ci -- --project=chromium --reporter=line`
- `npm run validate:docs-registry`
