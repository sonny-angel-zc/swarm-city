#!/usr/bin/env node

import { statSync } from 'node:fs';
import { resolve } from 'node:path';

function existsDir(relativePath) {
  try {
    return statSync(resolve(process.cwd(), relativePath)).isDirectory();
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`[next:router-roots] ERROR: ${message}`);
  process.exit(1);
}

const hasRootApp = existsDir('app');
const hasSrcApp = existsDir('src/app');
const hasRootPages = existsDir('pages');
const hasSrcPages = existsDir('src/pages');

if ((hasRootApp && hasSrcPages) || (hasSrcApp && hasRootPages)) {
  fail(
    [
      'Detected mixed Next.js router roots (App Router and Pages Router are split between root and src).',
      'This causes unstable .next/typegen output (for example, missing ../../app/page.js in .next/types/validator.ts).',
      'Keep both routers under the same root: either app+pages at project root, or src/app+src/pages.',
    ].join(' '),
  );
}

console.log('[next:router-roots] Router root layout is valid.');
