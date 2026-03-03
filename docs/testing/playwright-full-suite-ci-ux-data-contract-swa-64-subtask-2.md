# SWA-64 Subtask 2/6: Playwright Full Suite CI UX/Data Contract

## Scope

Define the interaction model, operator-facing copy, and workflow-to-UI data mapping contract for running the full Playwright suite in CI with clear status signaling and actionable triage output.

## Interaction Model

- Trigger model:
  - Automatic run on `pull_request` to `main`.
  - Automatic run on `push` to `main`.
  - Automatic nightly run at `07:00 UTC` (`schedule` cron `0 7 * * *`).
  - Manual run via `workflow_dispatch`.
- Check lifecycle contract:
  - Single required check named `playwright-full-suite` appears on PRs.
  - Lifecycle states must be user-legible: `queued`, `in_progress`, `success`, `failure`, `cancelled`.
  - Concurrency cancels stale runs on the same ref so only the latest signal is actionable.
- Failure triage flow:
  - CI summary contains a one-command local reproduce path.
  - CI summary lists first failing test cases from `junit.xml` when available.
  - Full artifact bundle remains downloadable for trace-level debugging.
- Recovery flow:
  - Maintainer reruns failed jobs from GitHub UI after pushing a fix or selecting `Re-run failed jobs`.

## Copy Contract

Use short, action-first copy so contributors can identify intent and next step without opening logs first.

| Surface | Contract copy |
| --- | --- |
| Workflow name | `Playwright Full Suite` |
| Job name | `playwright-full-suite` |
| Build step | `Build app` |
| Test step | `Run Playwright full suite` |
| Failure summary header | `Playwright Full Suite Failure` |
| Reproduce hint | `Reproduce locally: npm run test:e2e:ci` |
| Artifact hint | `Download playwright-full-suite artifacts for traces, screenshots, and JUnit output.` |
| Missing JUnit fallback | `junit.xml not found; inspect step logs and uploaded artifacts.` |

## UI/Data Mapping Contract

Each user-facing CI surface must map to deterministic workflow outputs and filesystem paths:

| UI surface | Source field / path | Contract |
| --- | --- | --- |
| PR required check title | Workflow job `name` | Must render as `playwright-full-suite` |
| Run status badge | Job conclusion (`success/failure/cancelled`) | Must match step exit outcomes |
| Suite execution command | `npm run test:e2e:ci -- --reporter=github,line,junit,html --output=test-results/playwright-full` | Must be shown in workflow logs |
| JUnit report reference | `test-results/playwright-full/junit.xml` | Used for failure list extraction |
| HTML report reference | `playwright-report/playwright-full` | Uploaded on every run |
| Raw artifacts reference | `test-results/playwright-full` | Uploaded on every run |
| Failure summary list | Parsed `<failure>` nodes from JUnit XML | Show up to first 5 failures |

Required naming/data contract for deterministic triage:

| Element | Required value |
| --- | --- |
| Artifact bundle name | `playwright-full-suite-artifacts` |
| HTML report env var | `PLAYWRIGHT_HTML_REPORT=playwright-report/playwright-full` |
| JUnit output dir env var | `PLAYWRIGHT_JUNIT_OUTPUT_DIR=test-results/playwright-full` |
| JUnit output file env var | `PLAYWRIGHT_JUNIT_OUTPUT_NAME=junit.xml` |

## Edge Cases

- Cancelled stale run (newer commit pushed) should not be interpreted as test failure; latest run is source of truth.
- If `junit.xml` is missing, workflow still uploads available artifacts and summary falls back to the missing-file copy contract.
- If no `<failure>` nodes are found but job failed, summary indicates log inspection is required (e.g., setup/build failure before tests).

## Pass/Fail Rules for SWA-64 Subtasks 3-6

- Pass:
  - PR shows one `playwright-full-suite` check with deterministic completion status.
  - Failure summary includes reproduce command and failure list or explicit fallback copy.
  - Artifact bundle is always uploaded with HTML report and raw test results paths.
  - Copy across workflow/job/summary matches this contract exactly.
- Fail:
  - Ambiguous or inconsistent check/job naming between workflow and PR UI.
  - Missing failure summary guidance for failed runs.
  - Missing or renamed artifact/report paths that break triage discoverability.
