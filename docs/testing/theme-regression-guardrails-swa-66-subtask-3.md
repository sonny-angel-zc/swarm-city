# SWA-66 Subtask 3/9: Canonical Surface-State Token Expectations

## Goal

Define a single assertion source of truth for which semantic CSS variables each audited surface state must use across both themes.

Scope states:
- `default`
- `hover`
- `active`
- `disabled`
- `focus`

Audited surfaces:
- top bar container
- sidebar container
- activity feed container
- top-bar task input field
- floating task input field
- create-task button
- theme toggle switch

## Canonical Source Of Truth

Machine-readable source:
- `tests/support/themeSurfaceTokenExpectations.ts`

This file defines:
- `THEME_SEMANTIC_CSS_VAR_CONTRACT`:
  - canonical dark/light values for each semantic CSS variable used by guardrails,
  - includes panel/text/accent variables and theme-toggle-specific variables.
- `AUDITED_SURFACE_STATE_TOKEN_EXPECTATIONS`:
  - per-surface mapping for every required state (`default|hover|active|disabled|focus`),
  - expected semantic variable bindings per style slot (`backgroundColor`, `borderColor`, `color`, etc.),
  - expectation status:
    - `enforced`: currently asserted by tests,
    - `planned`: canonical expectation documented for follow-up assertions,
    - `not_applicable`: state intentionally does not apply to that surface.

## Theme Matrix Behavior

The same semantic variable names are used in both themes; only resolved values change.

Examples:
- `--bg-panel`: dark `#0d1117`, light `#ffffff`
- `--accent-primary`: dark `#38bdf8`, light `#0ea5e9`
- `--theme-toggle-bg`: dark `#0f172a`, light `#f8fafc`

Because bindings reference semantic variables (not literals), assertions stay stable while theme palettes differ correctly.

## Current Enforcement Wiring

`tests/theme-regression.spec.ts` now consumes the canonical file for:
- root semantic CSS variable contract assertions (dark + light),
- audited default-state surface style assertions,
- enforced focus token assertions:
  - top-bar task input
  - floating task input
  - theme toggle

This makes subtask 3 the concrete contract baseline for future hover/active/disabled assertion expansion.
