'use client';

import { useMemo } from 'react';
import { useSwarmStore } from '@/core/store';
import { ProviderId } from '@/core/rateLimiter';
import { ProviderStatus } from '@/core/fallbackPolicy';

const statusClasses: Record<ProviderStatus, string> = {
  healthy: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  limited: 'bg-orange-500',
  down: 'bg-red-500',
};

const providerLabel: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

export default function ProviderHealth() {
  const providerHealth = useSwarmStore((s) => s.providerHealth);
  const activeModel = useSwarmStore((s) => s.activeModel);
  const lastFallbackReason = useSwarmStore((s) => s.lastFallbackReason);

  const rows = useMemo(
    () =>
      (Object.keys(providerHealth) as ProviderId[])
        .map((provider) => {
          const entry = providerHealth[provider];
          const retryIn =
            entry.rateLimitedUntil && entry.rateLimitedUntil > Date.now()
              ? Math.ceil((entry.rateLimitedUntil - Date.now()) / 1000)
              : null;
          return { provider, entry, retryIn };
        })
        .sort((a, b) => a.provider.localeCompare(b.provider)),
    [providerHealth],
  );

  return (
    <div className="hidden lg:flex items-center gap-2">
      <div className="px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] text-[10px] text-[var(--text-secondary)]">
        {activeModel ? `${activeModel.label}` : 'No model selected'}
      </div>
      {rows.map(({ provider, entry, retryIn }) => (
        <div key={provider} className="px-2 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] min-w-[108px]">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusClasses[entry.status]}`} />
            <span className="text-[10px] text-[var(--text-primary)]">{providerLabel[provider]}</span>
            <span className="text-[9px] uppercase tracking-wide text-[var(--text-secondary)] ml-auto">{entry.status}</span>
          </div>
          <div className="text-[9px] text-[var(--text-secondary)] mt-0.5 truncate">
            {retryIn ? `retry in ${retryIn}s` : `ok ${entry.successCount} / fail ${entry.failureCount}`}
          </div>
        </div>
      ))}
      {lastFallbackReason && (
        <div className="max-w-[230px] truncate text-[10px] text-amber-300/90">{lastFallbackReason}</div>
      )}
    </div>
  );
}
