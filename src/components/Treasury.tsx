'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSwarmStore } from '@/core/store';

type OpenAIUsageSnapshot = {
  available: boolean;
  source?: string;
  windowMinutes?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  requests?: number;
  totalCostUsd?: number;
  burnRateUsdPerMin?: number;
  reason?: string;
  message?: string;
};

export default function Treasury() {
  const economy = useSwarmStore(s => s.economy);
  const telemetry = useSwarmStore(s => s.telemetry);
  const rateLimiter = useSwarmStore(s => s.rateLimiter);
  const activeModel = useSwarmStore(s => s.activeModel);
  const providerHealth = useSwarmStore(s => s.providerHealth);
  const setBudgetPanelOpen = useSwarmStore(s => s.setBudgetPanelOpen);
  const [openAIUsage, setOpenAIUsage] = useState<OpenAIUsageSnapshot | null>(null);

  const remaining = Math.max(0, economy.totalBudget - economy.spent);
  const spentPct = economy.totalBudget > 0 ? economy.spent / economy.totalBudget : 0;

  const now = Date.now();
  const recentTxs = economy.transactions.filter(t => t.amount > 0 && now - t.timestamp < 60_000);
  const spendRate = recentTxs.reduce((sum, t) => sum + t.amount, 0);
  const runwayMin = spendRate > 0 ? remaining / spendRate : null;

  const providerRows = useMemo(() => {
    return Object.values(telemetry.providerSpend)
      .filter(row => row.events > 0)
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 3);
  }, [telemetry.providerSpend]);

  const hottestModel = useMemo(() => {
    const rows = Object.values(telemetry.modelSpend).sort((a, b) => b.costUsd - a.costUsd);
    return rows[0] ?? null;
  }, [telemetry.modelSpend]);
  const latestTelemetry = telemetry.events.length > 0 ? telemetry.events[telemetry.events.length - 1] : null;

  const recentCost15s = useMemo(() => {
    const horizonMs = 15_000;
    if (telemetry.events.length === 0) return 0;
    const lastTimestamp = telemetry.events[telemetry.events.length - 1].timestamp;
    return telemetry.events
      .filter(event => lastTimestamp - event.timestamp <= horizonMs)
      .reduce((sum, event) => sum + event.estimatedCostUsd, 0);
  }, [telemetry.events]);

  const color = spentPct > 0.8 ? '#EF4444' : spentPct > 0.5 ? '#F59E0B' : '#4ADE80';
  const borderColor = spentPct > 0.8 ? 'border-red-500/30' : spentPct > 0.5 ? 'border-yellow-500/30' : 'border-green-500/30';
  const bgColor = spentPct > 0.8 ? 'bg-red-500/5' : spentPct > 0.5 ? 'bg-yellow-500/5' : 'bg-green-500/5';
  const maxTriggeredThreshold = economy.triggeredBudgetAlerts.length > 0
    ? Math.max(...economy.triggeredBudgetAlerts)
    : null;
  const projectedMonthlyCost = telemetry.burnRatePerMinUsd * 60 * 24 * 30;
  const budgetStatus = spentPct >= 1 ? 'Exhausted' : spentPct >= 0.9 ? 'Critical' : spentPct >= 0.75 ? 'Warning' : 'Healthy';
  const budgetStatusClass =
    spentPct >= 1 ? 'border-red-600/50 bg-red-600/20 text-red-100' :
    spentPct >= 0.9 ? 'border-red-500/40 bg-red-500/15 text-red-100' :
    spentPct >= 0.75 ? 'border-amber-500/35 bg-amber-500/15 text-amber-100' :
    'border-emerald-500/35 bg-emerald-500/12 text-emerald-100';

  useEffect(() => {
    let alive = true;
    const fetchUsage = async () => {
      try {
        const res = await fetch('/api/usage/openai?windowMin=15', { cache: 'no-store' });
        const json = await res.json() as OpenAIUsageSnapshot;
        if (alive) setOpenAIUsage(json);
      } catch (err) {
        if (alive) {
          setOpenAIUsage({
            available: false,
            reason: 'network_error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };
    void fetchUsage();
    const timer = window.setInterval(() => {
      void fetchUsage();
    }, 15000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const limiterSnapshot = useMemo(() => rateLimiter.getSnapshot(), [rateLimiter, telemetry.events.length]);
  const activeLimiterEntry = useMemo(() => {
    if (!activeModel) return null;
    const key = `${activeModel.provider}:${activeModel.model}`;
    return limiterSnapshot.find(entry => entry.key === key) ?? null;
  }, [activeModel, limiterSnapshot]);
  const limitedEntries = useMemo(
    () => limiterSnapshot.filter(entry => entry.isLimited),
    [limiterSnapshot],
  );
  const highestPressureEntry = useMemo(() => {
    if (limiterSnapshot.length === 0) return null;
    return [...limiterSnapshot].sort((a, b) => {
      const ratioA = a.maxRequests > 0 ? a.requestCount / a.maxRequests : 0;
      const ratioB = b.maxRequests > 0 ? b.requestCount / b.maxRequests : 0;
      return ratioB - ratioA;
    })[0] ?? null;
  }, [limiterSnapshot]);
  const openAIWindowCost = openAIUsage?.available ? (openAIUsage.totalCostUsd ?? 0) : null;
  const openAIWindowBurn = openAIUsage?.available ? (openAIUsage.burnRateUsdPerMin ?? 0) : null;
  const openAIWindowTokens = openAIUsage?.available ? (openAIUsage.totalTokens ?? 0) : null;
  const openAIWindowLabel = `${openAIUsage?.windowMinutes ?? 15}m`;
  const activeProviderStatus = activeModel ? providerHealth[activeModel.provider]?.status ?? 'healthy' : null;
  const limiterStatusColor =
    limitedEntries.length > 0 ? 'text-red-300' :
    activeProviderStatus === 'degraded' || activeProviderStatus === 'limited' ? 'text-yellow-300' :
    'text-emerald-300';
  const retrySec = activeLimiterEntry?.cooldownUntil
    ? Math.max(0, Math.ceil((activeLimiterEntry.cooldownUntil - Date.now()) / 1000))
    : 0;
  const cardText = 'text-[10px] text-white/60';

  return (
    <div
      className={`absolute top-3 left-3 z-20 ${bgColor} backdrop-blur-sm border ${borderColor} rounded-xl px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors select-none min-w-72 shadow-lg`}
      onClick={() => setBudgetPanelOpen(true)}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
          style={{
            background: `radial-gradient(circle at 35% 35%, #FFF8DC, ${color}, #8B6914)`,
            color: '#5C3D00',
            boxShadow: `0 0 8px ${color}44`,
          }}
        >
          $
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl leading-none font-mono font-semibold" style={{ color }}>
              {remaining.toLocaleString()}
            </span>
            <span className="text-sm text-white/40">tokens</span>
          </div>
          <div className="text-xs text-white/45 flex items-center gap-1.5 mt-0.5">
            <span>{spendRate > 0 ? `${spendRate.toLocaleString()}/min` : 'idle'}</span>
            <span>•</span>
            <span>{runwayMin === null ? '∞ runway' : `${runwayMin.toFixed(1)}m runway`}</span>
          </div>
        </div>
      </div>

      <div className="mt-1.5 w-full h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, spentPct * 100)}%`, backgroundColor: color }}
        />
      </div>

      <div className={`mt-2 flex items-center justify-between ${cardText}`}>
        <span>internal burn ${telemetry.burnRatePerMinUsd.toFixed(4)}/min</span>
        <span>total ${telemetry.totalCostUsd.toFixed(4)}</span>
      </div>
      <div className={`mt-0.5 flex items-center justify-between ${cardText}`}>
        <span>projected monthly</span>
        <span className={projectedMonthlyCost >= economy.totalBudget ? 'text-red-200' : 'text-emerald-200'}>
          ${projectedMonthlyCost.toFixed(2)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-white/65">
        <span>budget status</span>
        <span className={`rounded-full border px-1.5 py-0.5 font-semibold ${budgetStatusClass}`}>
          {budgetStatus}
        </span>
      </div>
      <div className={`mt-0.5 flex items-center justify-between ${cardText}`}>
        <span>internal burst ${recentCost15s.toFixed(4)}/15s</span>
        <span>{telemetry.events.length} cost events</span>
      </div>
      <div className={`mt-1 flex items-center justify-between ${cardText}`}>
        {openAIWindowCost === null ? (
          <span>openai {openAIWindowLabel}: unavailable</span>
        ) : (
          <span>openai {openAIWindowLabel}: ${openAIWindowCost.toFixed(4)}</span>
        )}
        {openAIWindowBurn === null ? (
          <span className="text-yellow-200/80">no external burn</span>
        ) : (
          <span>${openAIWindowBurn.toFixed(4)}/min</span>
        )}
      </div>
      <div className={`mt-0.5 flex items-center justify-between ${cardText}`}>
        <span>openai tokens ({openAIWindowLabel})</span>
        <span>{openAIWindowTokens === null ? 'n/a' : openAIWindowTokens.toLocaleString()}</span>
      </div>
      <div className={`mt-1 flex items-center justify-between ${cardText}`}>
        <span>internal limiter</span>
        <span className={limiterStatusColor}>
          {limitedEntries.length > 0
            ? `${limitedEntries.length} limited`
            : activeProviderStatus === 'degraded'
              ? 'degraded'
              : 'healthy'}
        </span>
      </div>
      {activeModel && (
        <div className={`mt-0.5 flex items-center justify-between ${cardText}`}>
          <span className="truncate max-w-[220px]">active {activeModel.model}</span>
          {activeLimiterEntry ? (
            <span>
              {activeLimiterEntry.remaining}/{activeLimiterEntry.maxRequests}
              {retrySec > 0 ? ` • ${retrySec}s` : ''}
            </span>
          ) : (
            <span>no calls yet</span>
          )}
        </div>
      )}
      {highestPressureEntry && (
        <div className={`mt-0.5 flex items-center justify-between ${cardText}`}>
          <span className="truncate max-w-[220px]">peak window {highestPressureEntry.key}</span>
          <span>{highestPressureEntry.requestCount}/{highestPressureEntry.maxRequests}</span>
        </div>
      )}
      {openAIUsage && !openAIUsage.available && (
        <div className="mt-1 text-[10px] text-yellow-200/80 truncate">
          OpenAI usage sync: {openAIUsage.reason ?? 'not available'}
        </div>
      )}

      {maxTriggeredThreshold !== null && (
        <div className="mt-1 text-[10px] text-red-300 bg-red-500/10 border border-red-500/25 rounded px-1.5 py-1">
          alert: {Math.round(maxTriggeredThreshold * 100)}% budget threshold reached
        </div>
      )}

      {providerRows.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {providerRows.map(p => (
            <span
              key={p.provider}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/60"
            >
              {p.provider}: ${p.costUsd.toFixed(3)}
            </span>
          ))}
        </div>
      )}

      {hottestModel && (
        <div className="mt-1 text-[10px] text-white/40 truncate">
          model {hottestModel.model} ({hottestModel.events} calls)
        </div>
      )}

      {latestTelemetry && (
        <div className="mt-0.5 text-[10px] text-white/40 truncate">
          latest ${latestTelemetry.estimatedCostUsd.toFixed(4)} on {latestTelemetry.model}
        </div>
      )}
    </div>
  );
}
