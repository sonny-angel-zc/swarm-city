# SWA-66 Subtask 7/9: CI Gate and Developer Workflow

## CI Gate

Theme regression guardrails are enforced by:
- workflow: `.github/workflows/theme-regression-guardrails.yml`
- job/check name: `theme-regression-guardrails`
- triggers:
  - `pull_request` to `main`
  - `push` to `main`
  - `workflow_dispatch`

CI execution path:
1. `npm ci`
2. `npx playwright install --with-deps chromium`
3. `npm run build`
4. `npm run test:theme:guardrails:ci -- --reporter=github,line,junit,html --output=test-results/theme-regression`

Failure output quality:
- `github` reporter emits inline GitHub annotations for failing tests.
- JUnit XML (`test-results/theme-regression/junit.xml`) is generated for machine-readable reporting.
- Playwright HTML report (`playwright-report/theme-regression`) is generated for interactive trace/debug review.
- A job summary section is written on failure with:
  - local reproduction command,
  - artifact paths,
  - first failing test case names extracted from JUnit.

## Local Developer Workflow

### Prerequisites

```bash
npm ci
npx playwright install chromium
```

### Fast local validation

```bash
npm run test:theme:guardrails
```

### CI-equivalent local validation

```bash
npm run test:theme:guardrails:ci
```

## Updating Guardrails for Intentional Theme Changes

Use this flow only when theme behavior changes intentionally (token update, semantic rewiring, or hardcoded-color migration).

1. Make product/theme change first:
   - token source: `src/core/theme.ts`
   - theme variable wiring: `app/globals.css` and affected components
2. Run guardrails and inspect failures:
   - `npm run test:theme:guardrails`
3. Update guardrail expectations to match the new intentional behavior:
   - semantic token contracts and per-surface mappings:
     - `tests/support/themeSurfaceTokenExpectations.ts`
   - hardcoded color baseline debt and navigation semantic wiring snapshots:
     - `tests/theme-regression.spec.ts`
4. Re-run CI-equivalent guardrails:
   - `npm run test:theme:guardrails:ci`
5. Include intent in PR description:
   - what changed in theme behavior,
   - which guardrail contracts/baselines were updated and why.

## Review Checklist for PRs Touching Theme Surfaces

- `theme-regression-guardrails` check is green.
- Any baseline update is paired with a matching product/theme code change.
- No unexplained drift in `HARD_CODED_COLOR_BASELINE` or semantic variable contracts.
