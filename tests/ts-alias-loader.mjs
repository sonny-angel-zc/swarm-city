import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = process.cwd();
const STUB_LINEAR_SERVER_URL = 'swarm-test-stub:linearServer';
const STUB_ORCHESTRATOR_URL = 'swarm-test-stub:orchestrator';
const STUB_CODEX_ADAPTER_URL = 'swarm-test-stub:codexAdapter';
const LINEAR_SERVER_STUB_SOURCE = `
export const LINEAR_TEAM_ID = 'test-team';
export async function createLinearIssueServer() { return null; }
export async function getTopTodoIssue() { return null; }
export async function listLinearIssues() { return []; }
export async function updateIssueStateByType() { return true; }
`;
const ORCHESTRATOR_STUB_SOURCE = `
export function cleanupAutonomousBranchesForClosedIssues() { return { deleted: 0, skipped: 0, errors: 0 }; }
export function cleanupStaleAutonomousWorktrees() { return { removed: 0, skipped: 0, errors: 0 }; }
export function detectRetryKind() { return 'other'; }
export async function executeAutonomousTaskWithCodex() {
  return {
    ok: true,
    output: '',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, model: 'test-model' },
    restarts: [],
    rateLimited: false,
    retryAfterMs: null,
  };
}
export function hasActiveCodexProcess() { return false; }
export function runAutonomousPreflight() { return { noCommitMode: false, constraints: [] }; }
export async function runCodexExec() { return { code: 0, text: '[]' }; }
`;
const CODEX_ADAPTER_STUB_SOURCE = `
export function applyCodexAgentIdFromConfig() {
  if (!process.env.OPENCLAW_CODEX_AGENT_ID && process.env.SWARM_CODEX_AGENT_MAP) {
    try {
      const parsed = JSON.parse(process.env.SWARM_CODEX_AGENT_MAP);
      if (parsed && typeof parsed.default === 'string' && parsed.default.trim()) {
        process.env.OPENCLAW_CODEX_AGENT_ID = parsed.default.trim();
      }
    } catch {}
  }
  return process.env.OPENCLAW_CODEX_AGENT_ID ?? null;
}
export function warnIfCodexAgentMappingMissing() {}
`;

function resolveAlias(specifier) {
  if (!specifier.startsWith('@/')) return null;
  const candidate = path.join(PROJECT_ROOT, 'src', `${specifier.slice(2)}.ts`);
  if (!existsSync(candidate)) return null;
  return pathToFileURL(candidate).href;
}

function resolveExtensionless(specifier, context) {
  if (path.extname(specifier) !== '') return null;
  if (!context.parentURL) return null;
  if (!specifier.startsWith('./') && !specifier.startsWith('../') && !specifier.startsWith('/')) {
    return null;
  }

  const parentPath = fileURLToPath(context.parentURL);
  const basePath = path.resolve(path.dirname(parentPath), specifier);
  for (const ext of ['.ts', '.tsx', '.js', '.mjs', '.cjs']) {
    const candidate = `${basePath}${ext}`;
    if (existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === './linearServer' || specifier === '@/core/linearServer') {
    return { shortCircuit: true, url: STUB_LINEAR_SERVER_URL };
  }
  if (specifier === './orchestrator' || specifier === '@/core/orchestrator') {
    return { shortCircuit: true, url: STUB_ORCHESTRATOR_URL };
  }
  if (specifier === './codexAdapter' || specifier === '@/core/codexAdapter') {
    return { shortCircuit: true, url: STUB_CODEX_ADAPTER_URL };
  }

  const aliasResolved = resolveAlias(specifier);
  if (aliasResolved) {
    return { shortCircuit: true, url: aliasResolved };
  }

  const extensionlessResolved = resolveExtensionless(specifier, context);
  if (extensionlessResolved) {
    return { shortCircuit: true, url: extensionlessResolved };
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === STUB_LINEAR_SERVER_URL) {
    return { format: 'module', shortCircuit: true, source: LINEAR_SERVER_STUB_SOURCE };
  }
  if (url === STUB_ORCHESTRATOR_URL) {
    return { format: 'module', shortCircuit: true, source: ORCHESTRATOR_STUB_SOURCE };
  }
  if (url === STUB_CODEX_ADAPTER_URL) {
    return { format: 'module', shortCircuit: true, source: CODEX_ADAPTER_STUB_SOURCE };
  }
  return nextLoad(url, context);
}
