import { AgentRole } from './types';

type AgentMap = Partial<Record<AgentRole | 'default', string>>;

const MAP_ENV_KEY = 'SWARM_CODEX_AGENT_MAP';
const GLOBAL_ENV_KEY = 'SWARM_CODEX_AGENT_ID';
const LEGACY_GLOBAL_ENV_KEY = 'OPENCLAW_CODEX_AGENT_ID';

const ROLE_ENV_KEYS: Record<AgentRole, string> = {
  pm: 'SWARM_CODEX_AGENT_ID_PM',
  researcher: 'SWARM_CODEX_AGENT_ID_RESEARCHER',
  designer: 'SWARM_CODEX_AGENT_ID_DESIGNER',
  engineer: 'SWARM_CODEX_AGENT_ID_ENGINEER',
  qa: 'SWARM_CODEX_AGENT_ID_QA',
  devils_advocate: 'SWARM_CODEX_AGENT_ID_DEVILS_ADVOCATE',
  reviewer: 'SWARM_CODEX_AGENT_ID_REVIEWER',
};

const globalForCodexAdapter = globalThis as unknown as {
  __swarmCodexAdapterWarned?: boolean;
};

function readEnv(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseAgentMap(raw: string): AgentMap {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('expected a JSON object');
  }

  const out: AgentMap = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (key === 'default') {
      out.default = trimmed;
      continue;
    }
    if (key in ROLE_ENV_KEYS) {
      out[key as AgentRole] = trimmed;
    }
  }
  return out;
}

function resolveGlobalAgentId(map: AgentMap): string | null {
  return map.default ?? readEnv(GLOBAL_ENV_KEY) ?? readEnv(LEGACY_GLOBAL_ENV_KEY);
}

export function resolveCodexAgentId(role?: AgentRole): string | null {
  const mapRaw = readEnv(MAP_ENV_KEY);
  let map: AgentMap = {};
  if (mapRaw) {
    try {
      map = parseAgentMap(mapRaw);
    } catch {
      map = {};
    }
  }

  if (role) {
    const roleEnv = readEnv(ROLE_ENV_KEYS[role]);
    if (roleEnv) return roleEnv;
    if (map[role]) return map[role] ?? null;
  }

  return resolveGlobalAgentId(map);
}

export function createCodexSpawnEnv(role?: AgentRole): NodeJS.ProcessEnv {
  const resolved = resolveCodexAgentId(role);
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (resolved) {
    env.OPENCLAW_CODEX_AGENT_ID = resolved;
  }
  return env;
}

export function applyCodexAgentIdFromConfig(): string | null {
  const resolved = resolveCodexAgentId();
  if (resolved) {
    process.env.OPENCLAW_CODEX_AGENT_ID = resolved;
  }
  return resolved;
}

export function warnIfCodexAgentMappingMissing() {
  if (globalForCodexAdapter.__swarmCodexAdapterWarned) return;
  globalForCodexAdapter.__swarmCodexAdapterWarned = true;

  try {
    const hasPerRole = Object.values(ROLE_ENV_KEYS).some((key) => Boolean(readEnv(key)));
    const mapRaw = readEnv(MAP_ENV_KEY);
    const map = mapRaw ? parseAgentMap(mapRaw) : {};
    const hasMap = Object.keys(map).length > 0;
    const hasGlobal = Boolean(resolveGlobalAgentId(map));

    if (!hasPerRole && !hasMap && !hasGlobal) {
      console.warn(
        '[codex-adapter] No Codex agent mapping configured; using provider defaults. ' +
          'Set SWARM_CODEX_AGENT_MAP or SWARM_CODEX_AGENT_ID to make mapping explicit.',
      );
    }
  } catch (err) {
    console.warn(
      `[codex-adapter] Invalid ${MAP_ENV_KEY} JSON (${String(err)}). ` +
        'Falling back to role-specific and global env values.',
    );
  }
}
