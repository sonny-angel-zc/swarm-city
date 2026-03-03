export type ProviderId = 'anthropic' | 'openai';

export type RateLimitKey = `${ProviderId}:${string}`;

export type RateLimitConfig = {
  maxRequests: number;
  windowMs: number;
  cooldownMs: number;
};

export type RateLimitEntry = {
  key: RateLimitKey;
  maxRequests: number;
  windowMs: number;
  cooldownMs: number;
  requestCount: number;
  remaining: number;
  cooldownUntil: number | null;
  isLimited: boolean;
  lastRequestAt: number | null;
  lastRateLimitedAt: number | null;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
};

const DEFAULT_LIMIT: RateLimitConfig = {
  maxRequests: 8,
  windowMs: 10_000,
  cooldownMs: 12_000,
};

type InternalEntry = {
  config: RateLimitConfig;
  requests: number[];
  cooldownUntil: number;
  lastRequestAt: number | null;
  lastRateLimitedAt: number | null;
};

function makeKey(provider: ProviderId, model: string): RateLimitKey {
  return `${provider}:${model}`;
}

function compactRequests(requests: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return requests.filter((ts) => ts >= cutoff);
}

export class RateLimitManager {
  private entries = new Map<RateLimitKey, InternalEntry>();

  constructor(private readonly configByKey: Partial<Record<RateLimitKey, RateLimitConfig>> = {}) {}

  canRequest(provider: ProviderId, model: string, now = Date.now()): RateLimitDecision {
    const entry = this.getEntry(provider, model, now);

    if (entry.cooldownUntil > now) {
      return {
        allowed: false,
        retryAfterMs: entry.cooldownUntil - now,
        remaining: 0,
      };
    }

    entry.requests = compactRequests(entry.requests, now, entry.config.windowMs);
    if (entry.requests.length >= entry.config.maxRequests) {
      entry.cooldownUntil = now + entry.config.cooldownMs;
      entry.lastRateLimitedAt = now;
      return {
        allowed: false,
        retryAfterMs: entry.config.cooldownMs,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.max(0, entry.config.maxRequests - entry.requests.length),
    };
  }

  recordRequest(provider: ProviderId, model: string, now = Date.now()): void {
    const entry = this.getEntry(provider, model, now);
    entry.requests = compactRequests(entry.requests, now, entry.config.windowMs);
    entry.requests.push(now);
    entry.lastRequestAt = now;
  }

  recordRateLimited(provider: ProviderId, model: string, retryAfterMs?: number, now = Date.now()): void {
    const entry = this.getEntry(provider, model, now);
    const cooldown = retryAfterMs ?? entry.config.cooldownMs;
    entry.cooldownUntil = now + Math.max(1_000, cooldown);
    entry.lastRateLimitedAt = now;
  }

  getSnapshot(now = Date.now()): RateLimitEntry[] {
    const list: RateLimitEntry[] = [];
    for (const [key, entry] of this.entries.entries()) {
      entry.requests = compactRequests(entry.requests, now, entry.config.windowMs);
      const limited = entry.cooldownUntil > now;
      list.push({
        key,
        maxRequests: entry.config.maxRequests,
        windowMs: entry.config.windowMs,
        cooldownMs: entry.config.cooldownMs,
        requestCount: entry.requests.length,
        remaining: Math.max(0, entry.config.maxRequests - entry.requests.length),
        cooldownUntil: limited ? entry.cooldownUntil : null,
        isLimited: limited,
        lastRequestAt: entry.lastRequestAt,
        lastRateLimitedAt: entry.lastRateLimitedAt,
      });
    }
    return list.sort((a, b) => a.key.localeCompare(b.key));
  }

  private getEntry(provider: ProviderId, model: string, now: number): InternalEntry {
    const key = makeKey(provider, model);
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.cooldownUntil <= now) existing.cooldownUntil = 0;
      return existing;
    }

    const config = this.configByKey[key] ?? DEFAULT_LIMIT;
    const created: InternalEntry = {
      config,
      requests: [],
      cooldownUntil: 0,
      lastRequestAt: null,
      lastRateLimitedAt: null,
    };
    this.entries.set(key, created);
    return created;
  }
}

export const DEFAULT_RATE_LIMITS: Partial<Record<RateLimitKey, RateLimitConfig>> = {
  'anthropic:sonnet': { maxRequests: 6, windowMs: 10_000, cooldownMs: 12_000 },
  'openai:gpt-5.3-codex': { maxRequests: 5, windowMs: 10_000, cooldownMs: 12_000 },
  'openai:gpt-4.1': { maxRequests: 8, windowMs: 10_000, cooldownMs: 10_000 },
  'openai:gpt-4o-mini': { maxRequests: 14, windowMs: 10_000, cooldownMs: 8_000 },
};
