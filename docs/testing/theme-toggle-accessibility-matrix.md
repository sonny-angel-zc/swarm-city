# Theme Toggle Accessibility E2E Matrix (SWA-65 Subtask 2/7)

## Goal

Define a single, testable accessibility matrix for toggle behavior covering:
- Tab focus behavior
- Space activation
- Enter activation
- `role="switch"` semantics
- `aria-checked` transitions in both light and dark paths

## Behavior Matrix

| ID | Behavior | Light Mode Expectation | Dark Mode Expectation | Pass Criteria | Fail Criteria |
| --- | --- | --- | --- | --- | --- |
| `TT-A11Y-01` | Tab reaches toggle in top-bar order | From initial load, keyboard order reaches toggle after required controls. | Same behavior as light mode. | Focus order: `task-input` -> `create-task-button` -> `model-preset-select` (if visible) -> `theme-toggle-switch`, and toggle has visible keyboard focus. | Toggle skipped, wrong order, or no visible focus indicator when focused. |
| `TT-A11Y-02` | Toggle exposes switch semantics | Toggle is queryable via `getByRole('switch')`; `aria-checked="false"` when active theme is light. | Toggle is queryable via `getByRole('switch')`; `aria-checked="true"` when active theme is dark. | `role="switch"` is always present and `aria-checked` matches current theme state. | Missing/incorrect role, stale `aria-checked`, or role/state mismatch at any step. |
| `TT-A11Y-03` | Space key activates exactly one transition | `Space` changes light -> dark, keeps focus on toggle, and updates coupled state. | `Space` changes dark -> light, keeps focus on toggle, and updates coupled state. | One keypress causes one transition; focus remains on toggle; `aria-checked`, `aria-label`, `data-theme-current`, `data-theme-target`, `<html data-theme>`, and `localStorage['swarm:theme']` are synchronized. | No transition, duplicate transition, focus loss, or any coupled-state mismatch. |
| `TT-A11Y-04` | Enter key activates exactly one transition | `Enter` changes light -> dark, keeps focus on toggle, and updates coupled state. | `Enter` changes dark -> light, keeps focus on toggle, and updates coupled state. | One keypress causes one transition; focus remains on toggle; `aria-checked`, `aria-label`, `data-theme-current`, `data-theme-target`, `<html data-theme>`, and `localStorage['swarm:theme']` are synchronized. | No transition, duplicate transition, focus loss, or any coupled-state mismatch. |

## `aria-checked` Transition Truth Table

| Key | Starting Theme | `aria-checked` Before | `aria-checked` After | Theme After | Pass Criteria | Fail Criteria |
| --- | --- | --- | --- | --- | --- | --- |
| `Space` | `light` | `false` | `true` | `dark` | Transition is exactly `false -> true` and coupled state updates to dark. | Value unchanged, flips twice, or diverges from effective theme. |
| `Space` | `dark` | `true` | `false` | `light` | Transition is exactly `true -> false` and coupled state updates to light. | Value unchanged, flips twice, or diverges from effective theme. |
| `Enter` | `light` | `false` | `true` | `dark` | Transition is exactly `false -> true` and coupled state updates to dark. | Value unchanged, flips twice, or diverges from effective theme. |
| `Enter` | `dark` | `true` | `false` | `light` | Transition is exactly `true -> false` and coupled state updates to light. | Value unchanged, flips twice, or diverges from effective theme. |

## Coupled State Contract (Post Activation)

After each valid `Space` or `Enter` activation, all fields below must represent the same resolved theme:
- `role="switch"` remains present.
- `aria-checked` matches resolved theme (`dark=true`, `light=false`).
- `aria-label` describes the next available action.
- `data-theme-current` equals resolved current theme.
- `data-theme-target` equals next toggle target theme.
- `<html data-theme>` equals resolved current theme.
- `localStorage['swarm:theme']` equals resolved current theme.

## Playwright Mapping

- `TT-A11Y-01` -> `tests/theme-toggle.spec.ts` test: keyboard Tab focus path.
- `TT-A11Y-02` -> `tests/theme-toggle.spec.ts` test: switch semantics and repeated ARIA validation.
- `TT-A11Y-03` -> `tests/theme-toggle.spec.ts` test: `Space` transition behavior in both theme directions.
- `TT-A11Y-04` -> `tests/theme-toggle.spec.ts` test: `Enter` transition behavior in both theme directions.
