import { ProviderId, RateLimitManager } from './rateLimiter';

export type ProviderStatus = 'healthy' | 'degraded' | 'limited' | 'down';

export type ModelCandidate = {
  provider: ProviderId;
  model: string;
  label: string;
  tier: 'primary' | 'fallback' | 'emergency';
};

export type ProviderHealth = {
  provider: ProviderId;
  status: ProviderStatus;
  consecutiveFailures: number;
  inFlight: number;
  successCount: number;
  failureCount: number;
  lastError: string | null;
  lastErrorAt: number | null;
  lastSuccessAt: number | null;
  rateLimitedUntil: number | null;
};

export type FallbackDecision = {
  selected: ModelCandidate | null;
  reason: string;
  skipped: string[];
};

const TIER_WEIGHT: Record<ModelCandidate['tier'], number> = {
  primary: 0,
  fallback: 10,
  emergency: 20,
};

const STATUS_WEIGHT: Record<ProviderStatus, number> = {
  healthy: 0,
  degraded: 8,
  limited: 100,
  down: 200,
};

export const DEFAULT_MODEL_CHAIN: ModelCandidate[] = [
  { provider: 'anthropic', model: 'claude-sonnet-4', label: 'Claude Sonnet 4', tier: 'primary' },
  { provider: 'openai', model: 'gpt-4.1', label: 'GPT-4.1', tier: 'fallback' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'GPT-4o mini', tier: 'fallback' },
  { provider: 'google', model: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'emergency' },
];

export function createInitialProviderHealth(providers: ProviderId[]): Record<ProviderId, ProviderHealth> {
  return providers.reduce((acc, provider) => {
    acc[provider] = {
      provider,
      status: 'healthy',
      consecutiveFailures: 0,
      inFlight: 0,
      successCount: 0,
      failureCount: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: null,
      rateLimitedUntil: null,
    };
    return acc;
  }, {} as Record<ProviderId, ProviderHealth>);
}

export function pickFallbackModel(params: {
  candidates: ModelCandidate[];
  providerHealth: Record<ProviderId, ProviderHealth>;
  limiter: RateLimitManager;
  now?: number;
}): FallbackDecision {
  const now = params.now ?? Date.now();
  const skipped: string[] = [];

  const scored = params.candidates
    .map((candidate) => {
      const health = params.providerHealth[candidate.provider];
      const limit = params.limiter.canRequest(candidate.provider, candidate.model, now);

      if (health.status === 'down') {
        skipped.push(`${candidate.label} skipped: provider marked down.`);
        return null;
      }
      if (!limit.allowed) {
        skipped.push(`${candidate.label} skipped: rate limited (${Math.ceil(limit.retryAfterMs / 1000)}s).`);
        return null;
      }

      const score = TIER_WEIGHT[candidate.tier] + STATUS_WEIGHT[health.status] + health.consecutiveFailures * 2;
      return { candidate, score };
    })
    .filter((entry): entry is { candidate: ModelCandidate; score: number } => Boolean(entry));

  if (scored.length === 0) {
    return {
      selected: null,
      reason: 'No provider is currently eligible. Waiting for cooldown or health recovery.',
      skipped,
    };
  }

  scored.sort((a, b) => a.score - b.score);
  const best = scored[0]?.candidate ?? null;

  if (!best) {
    return {
      selected: null,
      reason: 'No candidate selected due to unavailable providers.',
      skipped,
    };
  }

  return {
    selected: best,
    reason:
      best.tier === 'primary'
        ? 'Primary model selected.'
        : `Fallback engaged: ${best.label} (${best.tier}).`,
    skipped,
  };
}

export function onProviderRequestStart(
  health: Record<ProviderId, ProviderHealth>,
  provider: ProviderId,
): Record<ProviderId, ProviderHealth> {
  return {
    ...health,
    [provider]: {
      ...health[provider],
      inFlight: health[provider].inFlight + 1,
    },
  };
}

export function onProviderSuccess(
  health: Record<ProviderId, ProviderHealth>,
  provider: ProviderId,
  now = Date.now(),
): Record<ProviderId, ProviderHealth> {
  const current = health[provider];
  const nextStatus: ProviderStatus =
    current.status === 'limited' && current.rateLimitedUntil && current.rateLimitedUntil > now
      ? 'limited'
      : 'healthy';

  return {
    ...health,
    [provider]: {
      ...current,
      status: nextStatus,
      consecutiveFailures: 0,
      inFlight: Math.max(0, current.inFlight - 1),
      successCount: current.successCount + 1,
      lastSuccessAt: now,
      lastError: null,
      ...(nextStatus === 'healthy' ? { rateLimitedUntil: null } : {}),
    },
  };
}

export function onProviderFailure(
  health: Record<ProviderId, ProviderHealth>,
  provider: ProviderId,
  error: string,
  now = Date.now(),
): Record<ProviderId, ProviderHealth> {
  const current = health[provider];
  const failures = current.consecutiveFailures + 1;
  const nextStatus: ProviderStatus = failures >= 3 ? 'down' : 'degraded';

  return {
    ...health,
    [provider]: {
      ...current,
      status: nextStatus,
      consecutiveFailures: failures,
      inFlight: Math.max(0, current.inFlight - 1),
      failureCount: current.failureCount + 1,
      lastError: error,
      lastErrorAt: now,
    },
  };
}

export function onProviderRateLimited(
  health: Record<ProviderId, ProviderHealth>,
  provider: ProviderId,
  retryAfterMs: number,
  now = Date.now(),
): Record<ProviderId, ProviderHealth> {
  const current = health[provider];

  return {
    ...health,
    [provider]: {
      ...current,
      status: 'limited',
      inFlight: Math.max(0, current.inFlight - 1),
      failureCount: current.failureCount + 1,
      consecutiveFailures: current.consecutiveFailures + 1,
      rateLimitedUntil: now + Math.max(1_000, retryAfterMs),
      lastError: '429 rate limited',
      lastErrorAt: now,
    },
  };
}

export function recoverProviderHealth(
  health: Record<ProviderId, ProviderHealth>,
  now = Date.now(),
): Record<ProviderId, ProviderHealth> {
  let changed = false;
  const next = { ...health };

  for (const provider of Object.keys(health) as ProviderId[]) {
    const entry = health[provider];
    if (entry.status === 'limited' && entry.rateLimitedUntil && now >= entry.rateLimitedUntil) {
      next[provider] = {
        ...entry,
        status: entry.consecutiveFailures > 1 ? 'degraded' : 'healthy',
        rateLimitedUntil: null,
      };
      changed = true;
      continue;
    }

    if (entry.status === 'down' && entry.lastSuccessAt && now - entry.lastSuccessAt < 60_000) {
      next[provider] = {
        ...entry,
        status: 'degraded',
      };
      changed = true;
    }
  }

  return changed ? next : health;
}
