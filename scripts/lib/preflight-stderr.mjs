const ERROR_PREFIX = '[smoke:preflight] ERROR: ';
const HINT_PREFIX = '[smoke:preflight] HINT: ';

/**
 * Parse stderr emitted by scripts/smoke-preflight.mjs into structured fields.
 *
 * Multi-line hints are collapsed into a single hint entry so automation and tests
 * can consume the full actionable guidance consistently.
 *
 * @param {string | null | undefined} stderr
 * @returns {{ errors: string[]; hints: string[]; other: string[] }}
 */
export function parsePreflightStderr(stderr) {
  const errors = [];
  const hints = [];
  const other = [];

  /** @type {'hint' | 'other' | null} */
  let lastBucket = null;

  for (const rawLine of String(stderr ?? '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    if (line.startsWith(ERROR_PREFIX)) {
      errors.push(line.slice(ERROR_PREFIX.length));
      lastBucket = null;
      continue;
    }

    if (line.startsWith(HINT_PREFIX)) {
      hints.push(line.slice(HINT_PREFIX.length));
      lastBucket = 'hint';
      continue;
    }

    if (lastBucket === 'hint' && hints.length > 0) {
      hints[hints.length - 1] += `\n${line}`;
      continue;
    }

    other.push(line);
    lastBucket = 'other';
  }

  return { errors, hints, other };
}
