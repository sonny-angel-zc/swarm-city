const KNOWN_LEVELS = new Set(['ERROR', 'HINT']);

function parsePrefixedLine(line) {
  const match = line.match(/^\[[^\]]+\]\s+(ERROR|HINT):\s?(.*)$/);
  if (!match) {
    return null;
  }

  return {
    level: match[1],
    message: match[2] ?? '',
  };
}

export function parseStderrDiagnostics(stderr) {
  const lines = String(stderr)
    .split('\n')
    .map(line => line.replace(/\r$/, ''));

  const diagnostics = [];
  let current = null;

  for (const line of lines) {
    const parsed = parsePrefixedLine(line);

    if (parsed && KNOWN_LEVELS.has(parsed.level)) {
      current = {
        level: parsed.level,
        message: parsed.message,
      };
      diagnostics.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    current.message += `\n${line}`;
  }

  return diagnostics;
}
