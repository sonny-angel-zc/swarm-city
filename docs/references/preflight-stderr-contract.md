# Smoke Preflight stderr Contract

This document defines the machine-readable stderr output contract for `npm run test:smoke:preflight` (`scripts/smoke-preflight.mjs`).

## Scope

- Contract applies to diagnostics written to **stderr**.
- Informational progress logs are written to **stdout** with `[smoke:preflight] ` and are not part of this parsing contract.

## Prefixes

On failure, stderr lines use one of these stable prefixes:

- `"[smoke:preflight] ERROR: "`
- `"[smoke:preflight] HINT: "`

`ERROR` is always emitted first. `HINT` is optional.

## Multiline continuation rule

A single `ERROR` or `HINT` emission may contain embedded newlines.

- The first line includes the prefix.
- Continuation lines do **not** repeat a prefix.
- Continuation lines belong to the most recent prefixed stderr line.

Consumers should keep track of the last seen prefixed record and append unprefixed continuation lines to that record.

## Ordering and exit guarantees

For script-owned failure paths (`fail(...)`):

1. Emit one `ERROR` record.
2. Optionally emit one `HINT` record.
3. Exit with status code `1`.

No later script-owned stderr records are emitted after `process.exit(1)`.

## Backward-compatibility expectations

- The `ERROR` and `HINT` prefixes are backward-compatible contract surface for integrators.
- Future changes should be additive where possible (for example, new hint text), without changing existing prefix tokens.
- If prefix tokens, continuation semantics, or ordering guarantees must change, update this document and treat it as a breaking integrator change.

## Minimal consumer example (Node.js)

```js
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const PREFIX = '[smoke:preflight] ';
const ERROR = `${PREFIX}ERROR: `;
const HINT = `${PREFIX}HINT: `;

const child = spawn('npm', ['run', 'test:smoke:preflight'], { stdio: ['ignore', 'ignore', 'pipe'] });
const rl = createInterface({ input: child.stderr });

const records = [];
let current = null;

rl.on('line', (line) => {
  if (line.startsWith(ERROR)) {
    current = { type: 'error', text: line.slice(ERROR.length) };
    records.push(current);
    return;
  }

  if (line.startsWith(HINT)) {
    current = { type: 'hint', text: line.slice(HINT.length) };
    records.push(current);
    return;
  }

  if (current) {
    current.text += `\n${line}`;
  }
});

child.on('close', (code) => {
  if (code !== 0) {
    const error = records.find((r) => r.type === 'error');
    const hints = records.filter((r) => r.type === 'hint');
    console.error('Preflight failed:', error?.text ?? 'unknown error');
    for (const hint of hints) console.error('Hint:', hint.text);
  }
});
```
