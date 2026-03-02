const FAIL_FIELD_MARKER = 'FAIL_FIELD';

function stringifyFailFieldValue(value) {
  return JSON.stringify(value);
}

function parseFailFieldValue(rawValue) {
  const trimmed = rawValue.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export function formatFailFieldLines({ prefix, code, fields = {} }) {
  const normalizedPrefix = prefix.trimEnd();
  const entries = code ? [['code', code], ...Object.entries(fields)] : Object.entries(fields);
  return entries.map(([key, value]) => `${normalizedPrefix} ${FAIL_FIELD_MARKER} ${key}=${stringifyFailFieldValue(value)}`);
}

export function parseFailFields(stderr) {
  const fields = {};

  for (const line of stderr.split('\n')) {
    const markerIndex = line.indexOf(`${FAIL_FIELD_MARKER} `);
    if (markerIndex === -1) continue;

    const payload = line.slice(markerIndex + FAIL_FIELD_MARKER.length + 1).trim();
    const eqIndex = payload.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = payload.slice(0, eqIndex).trim();
    const rawValue = payload.slice(eqIndex + 1);
    if (!key) continue;
    fields[key] = parseFailFieldValue(rawValue);
  }

  const code = typeof fields.code === 'string' ? fields.code : null;
  return { code, fields };
}
