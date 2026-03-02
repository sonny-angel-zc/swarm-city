#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REGISTRY_PATH = resolve(process.cwd(), 'src/core/planRegistry.ts');
const REQUIRED_STRING_FIELDS = ['id', 'title', 'path', 'category', 'track', 'updatedAt', 'summary'];
const REQUIRED_FIELDS = [...REQUIRED_STRING_FIELDS, 'tags', 'content'];

function fail(message, hint) {
  console.error(`[docs:registry] ERROR: ${message}`);
  if (hint) {
    console.error(`[docs:registry] HINT: ${hint}`);
  }
  process.exit(1);
}

function log(message) {
  console.log(`[docs:registry] ${message}`);
}

function extractDocsSeedBody(source) {
  const marker = 'const DOCS_SEED: PlanDocument[] = [';
  const start = source.indexOf(marker);
  if (start === -1) {
    fail('Could not find DOCS_SEED in src/core/planRegistry.ts.');
  }

  const bodyStart = start + marker.length;
  const end = source.indexOf('\n];', bodyStart);
  if (end === -1) {
    fail('Could not parse DOCS_SEED array end in src/core/planRegistry.ts.');
  }

  return source.slice(bodyStart, end);
}

function splitTopLevelObjects(arrayBody) {
  const objects = [];
  let depth = 0;
  let objectStart = -1;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let index = 0; index < arrayBody.length; index += 1) {
    const char = arrayBody[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if ((inSingle || inDouble) && char === '\\') {
      escaped = true;
      continue;
    }

    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && char === '"') {
      inDouble = !inDouble;
      continue;
    }

    if (inSingle || inDouble) {
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        objectStart = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth < 0) {
        fail('Malformed object nesting while parsing DOCS_SEED.');
      }
      if (depth === 0 && objectStart >= 0) {
        objects.push(arrayBody.slice(objectStart, index + 1));
        objectStart = -1;
      }
    }
  }

  if (depth !== 0) {
    fail('Unbalanced braces while parsing DOCS_SEED.');
  }

  return objects;
}

function extractQuotedString(objectBlock, key) {
  const match = objectBlock.match(new RegExp(`${key}:\\s*'([^']*)'`));
  return match?.[1] ?? null;
}

function hasKey(objectBlock, key) {
  return new RegExp(`${key}:`).test(objectBlock);
}

function extractTags(objectBlock) {
  const match = objectBlock.match(/tags:\s*\[([\s\S]*?)\]/);
  if (!match) return null;
  const raw = match[1];
  const tags = Array.from(raw.matchAll(/'([^']+)'/g), item => item[1].trim()).filter(Boolean);
  return tags;
}

function validateObject(objectBlock, objectIndex, seenIds, seenPaths) {
  const label = `entry #${objectIndex + 1}`;

  for (const field of REQUIRED_FIELDS) {
    if (!hasKey(objectBlock, field)) {
      fail(`${label} is missing required field "${field}".`);
    }
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = extractQuotedString(objectBlock, field);
    if (value === null) {
      fail(`${label} must set "${field}" as a quoted string literal.`);
    }
    if (!value.trim()) {
      fail(`${label} has an empty "${field}" value.`);
    }
  }

  const id = extractQuotedString(objectBlock, 'id');
  const path = extractQuotedString(objectBlock, 'path');
  const updatedAt = extractQuotedString(objectBlock, 'updatedAt');

  if (!id || !path || !updatedAt) {
    fail(`${label} could not be fully parsed for id/path/updatedAt.`);
  }

  if (seenIds.has(id)) {
    fail(`${label} reuses duplicate id "${id}".`);
  }
  seenIds.add(id);

  if (seenPaths.has(path)) {
    fail(`${label} reuses duplicate path "${path}".`);
  }
  seenPaths.add(path);

  if (!path.toLowerCase().endsWith('.md')) {
    fail(`${label} path must reference a markdown file: "${path}".`);
  }

  const absolutePath = resolve(process.cwd(), path);
  if (!existsSync(absolutePath)) {
    fail(`${label} references missing file "${path}".`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) {
    fail(`${label} has invalid updatedAt date "${updatedAt}". Use YYYY-MM-DD.`);
  }

  const tags = extractTags(objectBlock);
  if (!tags || tags.length === 0) {
    fail(`${label} must include at least one tag.`);
  }
}

function main() {
  if (!existsSync(REGISTRY_PATH)) {
    fail('Missing src/core/planRegistry.ts.');
  }

  const source = readFileSync(REGISTRY_PATH, 'utf8');
  const docsSeedBody = extractDocsSeedBody(source);
  const entries = splitTopLevelObjects(docsSeedBody);

  if (entries.length === 0) {
    fail('DOCS_SEED is empty.');
  }

  const seenIds = new Set();
  const seenPaths = new Set();
  entries.forEach((entry, index) => validateObject(entry, index, seenIds, seenPaths));

  log(`Validated ${entries.length} docs registry entries.`);
}

main();
