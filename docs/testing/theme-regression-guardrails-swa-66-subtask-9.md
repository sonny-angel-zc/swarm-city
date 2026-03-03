# SWA-66 Subtask 9/9: Coverage Completeness and Maintenance Risk Review

## Objective

Verify that theme regression guardrails:
- cover all required theme-sensitive surfaces in both themes,
- use stable/non-flaky assertions,
- stay lightweight to maintain over time.

## Coverage Review

Required audited surfaces are covered end-to-end in both `dark` and `light` themes via `THEME_MATRIX` in `tests/theme-regression.spec.ts`:
- top bar container
- sidebar container
- activity feed container
- floating task input root
- top bar task input
- floating task input
- create task button
- theme toggle switch

Coverage signals include:
- semantic CSS variable contracts (`THEME_SEMANTIC_CSS_VAR_CONTRACT`)
- per-surface semantic wiring assertions (`AUDITED_SURFACE_STATE_TOKEN_EXPECTATIONS`)
- focus-state token assertions for interactive controls
- hardcoded color guardrail checks and intentional injection detection

## Stability and Flake Risk Review

Applied hardening changes:
1. Replaced brittle activity feed live-stat locator logic with a dedicated selector:
   - added `data-testid="activity-feed-autonomous-status"` on the autonomous value element.
   - switched test assertion to `getByTestId`.
2. Removed unnecessary cross-theme distinctness assertions for every CSS variable.
   - exact contract assertions per theme already provide stronger signal without constraining intentional future convergence.

## Maintenance Risk Review

Hardcoded color checks now use a no-new-debt model:
- keep known existing hardcoded class debt as an allowlist,
- fail only when new disallowed class tokens appear,
- continue to fail on any inline literal color style usage.

This preserves regression signal while avoiding noisy test churn when existing debt is reduced.

## Targeted Validation

Run:

```bash
npm run test:theme:guardrails -- --grep "theme regression guardrails"
```

Environment limitation in this sandbox remains:
- Playwright server startup fails with `listen EPERM: operation not permitted 127.0.0.1:3000`.

Validation should be executed in CI or local environments where localhost bind is allowed.

## Residual Risk

Known hardcoded color utility usage still exists on some non-critical descendant elements. The no-new-debt model prevents regressions while allowing planned debt burn-down without baseline rewrites.
