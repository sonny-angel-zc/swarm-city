# SWA-66 Subtask 2/6: Theme Regression Test Strategy And Assertions

## Decision

Use a lightweight **hybrid strategy**:
1. Token-level CSS variable contract assertions.
2. Semantic surface style assertions (computed-style snapshot of selected properties only).
3. Hardcoded-color guardrails to enforce semantic variable usage on audited surfaces.

Rationale:
- Full-page image snapshots are brittle for this dashboard because content/state changes frequently.
- Token-only checks miss regressions where components stop consuming semantic variables.
- Hybrid checks are fast, deterministic, and high-signal for theme regressions.

## Scope

Audited surfaces:
- top bar
- sidebar
- activity feed
- floating task input root + field
- top-bar task input field
- create task button
- theme toggle switch

Theme matrix:
- run all guardrails in both `dark` and `light` themes.

## Assertions

### 1) Root Semantic CSS Variable Contract (Hard Fail)

Per theme, assert required semantic CSS variables resolve to expected contract values:
- `--bg-canvas`
- `--bg-panel`
- `--bg-panel-muted`
- `--border-subtle`
- `--text-primary`
- `--text-secondary`
- `--text-inverse`
- `--accent-primary`
- `--accent-success`
- `--overlay-backdrop`
- `--theme-toggle-bg`
- `--theme-toggle-border`
- `--theme-toggle-text`
- `--theme-toggle-icon-bg`
- `--theme-toggle-icon-text`
- `--theme-toggle-indicator`

Fail if any variable is missing/empty or differs from the expected value for the active theme.

### 2) Semantic Surface Wiring Assertions (Hard Fail)

Per audited surface, assert computed style properties map to expected semantic variables:
- `backgroundColor`
- `borderColor`
- `color`
- theme toggle icon/indicator color slots

Interactive focus assertions:
- top-bar input focus border + ring use accent token.
- floating input focus border + ring use accent token.
- theme toggle focus indicator uses accent token (`boxShadow` or `outlineColor`).

Fail if an audited selector is missing or any asserted property no longer resolves to the canonical semantic token value.

### 3) Hardcoded-Color Guardrails (Hard Fail)

Guardrail checks are split by scope:
- **Audited surface roots**: zero tolerance.
  - No disallowed literal palette class tokens.
  - No inline literal color style declarations.
- **Audited descendants**: no-new-debt model.
  - Existing known hardcoded class debt is allowlisted.
  - Any newly introduced disallowed class token fails.
  - Any inline literal color style declaration fails.

This enforces semantic variable usage where it matters most (audited roots) while keeping maintenance cost manageable during incremental descendant cleanup.

### 4) Detector Self-Check (Hard Fail)

Injection tests intentionally add:
- a disallowed class token,
- an inline literal color style.

Fail if detectors do not catch the injected violations.

## Determinism Requirements

- Mock dashboard API dependencies (`/api/limits`, `/api/autonomous`, `/api/linear`).
- Clear `swarm:theme` and `swarm:lastTaskId` before each run.
- Seed `swarm:theme=light` before navigation for light-theme scenarios.
- Wait for audited surfaces to be visible before style collection.

## Pass/Fail Criteria

A guardrail run passes only if all criteria pass in **both** themes:
1. Root semantic CSS variable contract assertions.
2. Audited semantic surface wiring assertions.
3. Focus-state semantic token assertions.
4. Audited-root hardcoded-color zero-tolerance checks.
5. Descendant no-new-hardcoded-debt checks.
6. Detector injection self-checks.

Any single assertion failure is a theme regression failure.

## Edge Cases Covered

- Invalid stored theme values still resolve to deterministic theme contract behavior.
- Theme toggle/interactive focus indicators remain accent-token driven.
- Conditional task-input UI states do not bypass semantic wiring checks.
- Incremental descendant debt reduction can proceed without noisy baseline rewrites.
