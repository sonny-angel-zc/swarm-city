# SWA-65 Subtask 8/8: Coverage Review and Closure

## Scope

Final review of `tests/theme-toggle.spec.ts` to confirm SWA-65 accessibility scope is fully closed with requirement-to-assertion traceability.

## Requirement to Assertion Traceability

| Requirement ID | Requirement | Assertion Mapping in `tests/theme-toggle.spec.ts` |
| --- | --- | --- |
| `TT-A11Y-01` | Keyboard Tab path reaches theme toggle and keyboard focus is visibly indicated. | `focusThemeToggleViaTab(...)` asserts keyboard order (`task-input` -> `create-task-button` -> optional `model-preset-select` -> toggle). `TT-A11Y-01...` test asserts toggle focus and calls `expectVisibleKeyboardFocus(toggle)` to verify rendered focus ring/outline styles. |
| `TT-A11Y-02` | Toggle exposes switch semantics and state-reflective accessible label. | `TT-A11Y-02...` test asserts role-based contract with `getByRole('switch', { name: 'Switch to light mode' })`, then validates `role`, `aria-checked`, and label transitions across repeated interactions via `expectThemeToggleState(...)`. |
| `TT-A11Y-03` | `Space` toggles dark -> light and keeps ARIA/theme/label in sync. | `TT-A11Y-03...` test focuses toggle by keyboard, presses `Space`, then `expectThemeState(page, 'light', ...)` checks `aria-checked`, `aria-label`, root `data-theme`, and persisted storage value. |
| `TT-A11Y-04` | `Enter` toggles light -> dark and keeps ARIA/theme/label in sync. | `TT-A11Y-04...` test seeds light theme, focuses toggle by keyboard, presses `Enter`, then `expectThemeState(page, 'dark', ...)` checks `aria-checked`, `aria-label`, root `data-theme`, and persisted storage value. |
| `TT-A11Y-05` | Dark theme contrast for required probe pairs is WCAG AA (`>= 4.5:1`). | `TT-A11Y-05/TT-A11Y-06...` test in dark mode resolves runtime token probes and element probe (`[data-testid=\"theme-toggle-switch\"]`) and asserts computed contrast ratio threshold for each pair. |
| `TT-A11Y-06` | Light theme contrast for required probe pairs is WCAG AA (`>= 4.5:1`). | Same combined contrast test toggles to light mode and re-runs all contrast assertions against runtime computed values and required threshold. |

## Review Outcome

- Coverage status: `Closed`
- Correctness: Assertions now match all SWA-65 matrix requirements, including explicit visible keyboard focus verification.
- Maintainability: Stable `data-testid` locators are used for deterministic targeting; role-based assertion retained for accessibility contract.
- Edge cases: Keyboard path handles viewport-dependent preset visibility; contrast checks validate both token pairs and real toggle element styles.

## Validation Evidence

- Command: `npm run validate:docs-registry`
- Result: `Passed` (`[docs:registry] Validated 10 docs registry entries.`)
- Command: `npx playwright test tests/theme-toggle.spec.ts --project=chromium --list`
- Result: `Passed` (9 tests discovered for `theme-toggle.spec.ts` in Chromium project)
- Command: `npx playwright test tests/theme-toggle.spec.ts --project=chromium`
- Result: `Blocked in sandbox` (`listen EPERM` on `127.0.0.1:3000` when Playwright web server attempts to start)
