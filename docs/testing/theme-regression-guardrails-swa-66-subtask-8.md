# SWA-66 Subtask 8/9: Intentional Break Validation

## Objective

Validate that theme regression guardrails fail on a controlled hardcoded-color regression, then pass once reverted.

## Controlled Break Target

- file: `src/components/TopBar.tsx`
- audited surface selector: `[data-testid="dashboard-topbar"]`
- injected regression: replace semantic token class `text-[var(--text-primary)]` with hardcoded palette class `text-red-500`

## Reproducible Workflow

Use automation script:

```bash
scripts/validate-theme-guardrail-break.sh
```

Script flow:
1. Backs up `src/components/TopBar.tsx`
2. Applies intentional class-level hardcoded color injection
3. Runs targeted guardrail test (expects failure)
4. Restores original file
5. Runs full guardrail suite (expects clean pass)

## Expected Failure Signal

Targeted failing command:

```bash
npm run test:theme:guardrails -- --grep "validates token contracts, semantic surface wiring, and hardcoded color regression fingerprint in dark theme"
```

Expected failure reason:
- hardcoded color fingerprint drift (`text-red-500` appears in disallowed class tokens), and/or
- semantic surface snapshot mismatch for top bar text color.

## Environment Note (2026-03-03)

In this sandbox, Playwright web server startup is blocked by OS policy:
- `Error: listen EPERM: operation not permitted 127.0.0.1:3000`

Because of that, end-to-end guardrail execution cannot complete in this environment. The scripted workflow above is ready for CI or local environments where localhost bind is allowed.
