# SWA-66 Subtask 6/6: Signal Quality Review and CI Integration

## Scope

Final review for theme guardrails focused on:
- correctness signal quality,
- flake risk,
- long-term maintenance cost,
- CI integration with actionable failure output.

## Reliability Decisions

1. Run guardrails in one browser (`chromium`) for deterministic CSS/focus behavior.
2. Force single worker and zero retries in the CI command path to avoid masking intermittent failures.
3. Keep deterministic dashboard mocks and localStorage reset harness from earlier subtasks.
4. Keep assertions token-driven and semantic-surface scoped (no visual image diffs).
5. Make focus-ring assertion resilient to implementation details:
   - pass if accent token appears in `boxShadow` or `outlineColor`,
   - fail with explicit style payload for triage.

## CI Wiring

Added workflow: `.github/workflows/theme-regression-guardrails.yml`

- Job: `theme-regression-guardrails`
- Triggers:
  - `pull_request` on `main`
  - `push` on `main`
  - manual `workflow_dispatch`
- Steps:
  - `npm ci`
  - `npx playwright install --with-deps chromium`
  - `npm run build`
  - `npm run test:theme:guardrails:ci -- --reporter=line,junit,html --output=test-results/theme-regression`

## Actionable Failure Output

CI always uploads:
- `playwright-report/theme-regression`
- `test-results/theme-regression` (includes trace/screenshot artifacts and `junit.xml`)

This gives:
- log-first triage in job output,
- structured test result data (JUnit),
- navigable Playwright HTML report and traces for root-cause debugging.

## Maintenance Notes

- Local run: `npm run test:theme:guardrails`
- CI-equivalent run: `npm run test:theme:guardrails:ci`
- If this gate becomes required in branch protection, use check name:
  - `theme-regression-guardrails`
