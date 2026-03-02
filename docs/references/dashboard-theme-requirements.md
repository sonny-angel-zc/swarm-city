# Dashboard Theme Requirements (SWA-63)

## Scope

Define the baseline theme model for the dashboard before wiring the UI toggle.
This document covers:

- Dark and light theme tokens.
- Default state on first visit.
- Toggle behavior.
- Persistence for initial load and subsequent visits.

## Theme Keys

- Theme options: `dark`, `light`
- Persistent storage key: `swarm:theme`
- Valid stored values: `dark`, `light`
- Invalid/missing stored values: treated as no preference

## Default State

- Default theme is `dark`.
- First visit (no stored theme): render dark immediately.
- Server-rendered HTML should default to dark to avoid flash/mismatch.

## Theme Tokens

These tokens are semantic and should back global CSS variables in follow-up implementation.

| Token | Dark | Light |
| --- | --- | --- |
| `bg.canvas` | `#0a0e1a` | `#eef3ff` |
| `bg.panel` | `#0d1117` | `#ffffff` |
| `bg.panelMuted` | `#121826` | `#f4f7ff` |
| `border.subtle` | `#1e2a3a` | `#d3deee` |
| `text.primary` | `#f8fbff` | `#111827` |
| `text.secondary` | `#a7b4c8` | `#4b5563` |
| `text.inverse` | `#0b1020` | `#ffffff` |
| `accent.primary` | `#38bdf8` | `#0ea5e9` |
| `accent.success` | `#22c55e` | `#16a34a` |
| `accent.warning` | `#f59e0b` | `#d97706` |
| `accent.danger` | `#ef4444` | `#dc2626` |
| `overlay.backdrop` | `rgba(0, 0, 0, 0.6)` | `rgba(15, 23, 42, 0.25)` |

## State Model

- Theme state is binary: `dark | light`.
- Toggle action inverts state:
  - `dark -> light`
  - `light -> dark`
- Toggle must be idempotent per click (single transition per interaction).

## Persistence Rules

### Initial load

1. Use `dark` as SSR/default render state.
2. On client hydration, read `localStorage.getItem('swarm:theme')`.
3. If stored value is valid (`dark` or `light`), apply it.
4. Otherwise keep `dark` and do not persist until user toggles.

### Subsequent visits

- If user has toggled previously, apply stored theme on every visit.
- Every successful toggle must update storage immediately.
- Storage writes should be best-effort and non-fatal (UI still updates if storage fails).

## DOM Application Rules

- Apply active theme to root document element (`<html>`).
- Keep backward compatibility with current dark-first setup:
  - Dark: add `class="dark"`, set `data-theme="dark"`.
  - Light: remove `dark` class, set `data-theme="light"`.

## Non-goals (This Subtask)

- No system preference (`prefers-color-scheme`) behavior yet.
- No per-component token refactor yet.
- No animation requirements for transition yet.

## Implementation Guidance For Next Subtasks

1. Introduce global CSS variables for the semantic tokens above.
2. Replace hard-coded color utilities with token-based classes/variables incrementally.
3. Add a top-bar toggle control with accessible pressed state and label.
4. Add focused UI tests for:
   - default dark on first load,
   - persisted light on revisit,
   - invalid stored value fallback to dark.
