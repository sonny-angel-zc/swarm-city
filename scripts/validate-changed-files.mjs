#!/usr/bin/env node

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const LOG_PREFIX = '[validate:changed-files]';
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.mdx',
  '.css',
]);
const JSON_EXTENSIONS = new Set(['.json']);
const NODE_CHECK_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const TS_EXTENSIONS = new Set(['.ts', '.tsx']);

function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function fail(message) {
  console.error(`${LOG_PREFIX} ERROR: ${message}`);
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: process.env,
    encoding: 'utf-8',
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function gitRevisionExists(revision) {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', revision], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  return result.status === 0;
}

function listChangedFilesFromRange(revisionRange) {
  const output = runGit(['diff', '--name-only', '--diff-filter=ACMR', revisionRange]);
  if (output === null) {
    return [];
  }
  return output.split('\n').map(line => line.trim()).filter(Boolean);
}

function listChangedFilesInWorktree() {
  const changed = runGit(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']) ?? '';
  const staged = runGit(['diff', '--name-only', '--cached', '--diff-filter=ACMR']) ?? '';
  const untracked = runGit(['ls-files', '--others', '--exclude-standard']) ?? '';

  return [changed, staged, untracked]
    .flatMap(block => block.split('\n'))
    .map(line => line.trim())
    .filter(Boolean);
}

function pickDiffBase() {
  const manualBase = (process.env.VALIDATION_DIFF_BASE || '').trim();
  if (manualBase) {
    if (gitRevisionExists(manualBase)) {
      return manualBase;
    }
    log(`VALIDATION_DIFF_BASE was provided but cannot be resolved: ${manualBase}`);
  }

  const githubBaseRef = (process.env.GITHUB_BASE_REF || '').trim();
  if (githubBaseRef) {
    const candidates = [`origin/${githubBaseRef}`, githubBaseRef];
    for (const candidate of candidates) {
      if (gitRevisionExists(candidate)) {
        return candidate;
      }
    }
    log(`GITHUB_BASE_REF was provided but no local revision was found for: ${githubBaseRef}`);
  }

  if (gitRevisionExists('HEAD~1')) {
    return 'HEAD~1';
  }

  return null;
}

function extensionFor(filePath) {
  const index = filePath.lastIndexOf('.');
  if (index < 0) {
    return '';
  }
  return filePath.slice(index).toLowerCase();
}

function collectChangedFiles() {
  const files = new Set();
  const diffBase = pickDiffBase();

  if (diffBase) {
    const range = `${diffBase}...HEAD`;
    for (const file of listChangedFilesFromRange(range)) {
      files.add(file);
    }
    log(`Using diff base ${diffBase} for commit-range checks.`);
  } else {
    log('No diff base found; using worktree-only change detection.');
  }

  for (const file of listChangedFilesInWorktree()) {
    files.add(file);
  }

  return Array.from(files).filter(file => {
    const absPath = resolve(process.cwd(), file);
    if (!existsSync(absPath)) {
      return false;
    }
    return TEXT_EXTENSIONS.has(extensionFor(file));
  });
}

function checkForMergeConflicts(filePath, content) {
  const lines = content.split('\n');
  for (const line of lines) {
    if (/^<<<<<<<(?: .*)?$/.test(line) || /^=======$/.test(line) || /^>>>>>>> (?:.*)$/.test(line)) {
      return `contains unresolved merge conflict markers (${filePath})`;
    }
  }
  return null;
}

function checkForNulByte(filePath, content) {
  if (content.includes('\0')) {
    return `contains NUL byte(s), likely corrupted text (${filePath})`;
  }
  return null;
}

function checkJson(filePath, content) {
  try {
    JSON.parse(content);
    return null;
  } catch (error) {
    return `invalid JSON (${filePath}): ${error.message}`;
  }
}

function checkNodeSyntax(filePath) {
  const result = spawnSync('node', ['--check', filePath], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: process.env,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    const details = `${result.stderr || result.stdout || ''}`.trim();
    return `syntax check failed (${filePath})${details ? `: ${details}` : ''}`;
  }

  return null;
}

function localTscPath() {
  const tscPath = resolve(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');
  return existsSync(tscPath) ? tscPath : null;
}

function checkTsFilesWithTsc(tsFiles) {
  const tsc = localTscPath();
  if (!tsc || tsFiles.length === 0) {
    return null;
  }

  const tempConfigPath = resolve(process.cwd(), '.tsconfig.changed-files.tmp.json');
  const config = {
    extends: './tsconfig.json',
    include: tsFiles,
    compilerOptions: {
      noEmit: true,
    },
  };

  try {
    const json = `${JSON.stringify(config, null, 2)}\n`;
    writeFileSync(tempConfigPath, json);

    const result = spawnSync('node', [tsc, '--pretty', 'false', '--project', tempConfigPath], {
      cwd: process.cwd(),
      stdio: 'pipe',
      env: process.env,
      encoding: 'utf-8',
    });

    if (result.status !== 0) {
      const output = `${result.stdout}\n${result.stderr}`.trim();
      return `TypeScript changed-file check failed:\n${output}`;
    }

    return null;
  } finally {
    rmSync(tempConfigPath, { force: true });
  }
}

function main() {
  const changedFiles = collectChangedFiles();
  if (changedFiles.length === 0) {
    log('No changed text files detected. Fallback validation skipped.');
    return;
  }

  log(`Validating ${changedFiles.length} changed file(s).`);

  const issues = [];
  const tsFiles = [];

  for (const filePath of changedFiles) {
    const absPath = resolve(process.cwd(), filePath);
    const content = readFileSync(absPath, 'utf-8');
    const extension = extensionFor(filePath);

    const mergeConflictIssue = checkForMergeConflicts(filePath, content);
    if (mergeConflictIssue) {
      issues.push(mergeConflictIssue);
    }

    const nulByteIssue = checkForNulByte(filePath, content);
    if (nulByteIssue) {
      issues.push(nulByteIssue);
    }

    if (JSON_EXTENSIONS.has(extension)) {
      const jsonIssue = checkJson(filePath, content);
      if (jsonIssue) {
        issues.push(jsonIssue);
      }
    }

    if (NODE_CHECK_EXTENSIONS.has(extension)) {
      const syntaxIssue = checkNodeSyntax(filePath);
      if (syntaxIssue) {
        issues.push(syntaxIssue);
      }
    }

    if (TS_EXTENSIONS.has(extension)) {
      tsFiles.push(filePath);
    }
  }

  const tsIssue = checkTsFilesWithTsc(tsFiles);
  if (tsIssue) {
    issues.push(tsIssue);
  } else if (tsFiles.length > 0 && !localTscPath()) {
    log('TypeScript is unavailable; TS/TSX changed files received lightweight checks only.');
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      fail(issue);
    }
    process.exit(1);
  }

  log('Fallback changed-file validation passed.');
}

main();
