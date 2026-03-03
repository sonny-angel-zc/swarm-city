'use client';

import { useMemo } from 'react';
import { useSwarmStore } from '@/core/store';

type AlertTone = 'healthy' | 'warning' | 'critical' | 'exhausted';

function resolveAlertTone(spentPct: number): AlertTone {
  if (spentPct >= 1) return 'exhausted';
  if (spentPct >= 0.9) return 'critical';
  if (spentPct >= 0.75) return 'warning';
  return 'healthy';
}

const toneStyles: Record<AlertTone, string> = {
  healthy: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100',
  warning: 'border-amber-500/35 bg-amber-500/12 text-amber-50',
  critical: 'border-red-500/45 bg-red-500/16 text-red-50',
  exhausted: 'border-red-600/65 bg-red-600/20 text-red-50',
};

const toneLabels: Record<AlertTone, string> = {
  healthy: 'Budget healthy',
  warning: 'Budget warning',
  critical: 'Budget critical',
  exhausted: 'Budget exhausted',
};

export default function BudgetAlertLayer() {
  const economy = useSwarmStore(s => s.economy);
  const telemetry = useSwarmStore(s => s.telemetry);
  const notifications = useSwarmStore(s => s.notifications);
  const dismissNotification = useSwarmStore(s => s.dismissNotification);
  const setBudgetPanelOpen = useSwarmStore(s => s.setBudgetPanelOpen);

  const spentPct = economy.totalBudget > 0 ? economy.spent / economy.totalBudget : 0;
  const tone = resolveAlertTone(spentPct);
  const remaining = Math.max(0, economy.totalBudget - economy.spent);
  const latestThreshold = economy.triggeredBudgetAlerts.length > 0
    ? Math.max(...economy.triggeredBudgetAlerts)
    : null;

  const budgetToasts = useMemo(
    () => notifications
      .filter(n => !n.read && n.type === 'warning' && /Budget/i.test(n.message))
      .slice(-3)
      .reverse(),
    [notifications],
  );

  const showBanner = latestThreshold !== null;
  const bannerRole = tone === 'critical' || tone === 'exhausted' ? 'alert' : 'status';
  const bannerLive = tone === 'critical' || tone === 'exhausted' ? 'assertive' : 'polite';

  return (
    <>
      {showBanner && (
        <div className="pointer-events-none absolute left-2 right-2 top-2 z-30 flex justify-center md:left-1/2 md:right-auto md:-translate-x-1/2">
          <section
            role={bannerRole}
            aria-live={bannerLive}
            className={`pointer-events-auto w-full max-w-xl rounded-lg border px-3 py-2 shadow-lg backdrop-blur-sm ${toneStyles[tone]}`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="font-semibold">{toneLabels[tone]}</span>
              <span className="opacity-85">{Math.round(latestThreshold * 100)}% threshold reached.</span>
              <span className="opacity-80">Burn ${telemetry.burnRatePerMinUsd.toFixed(4)}/min.</span>
              <span className="opacity-80">Remaining {remaining.toLocaleString()} tokens.</span>
              <button
                type="button"
                onClick={() => setBudgetPanelOpen(true)}
                className="ml-auto rounded border border-white/25 px-2 py-0.5 text-[10px] font-medium hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Open budget panel
              </button>
            </div>
          </section>
        </div>
      )}

      {budgetToasts.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2">
          {budgetToasts.map(toast => (
            <article
              key={toast.id}
              role="status"
              aria-live="polite"
              className="pointer-events-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)]/95 px-3 py-2 shadow-lg"
            >
              <div className="flex items-start gap-2">
                <p className="flex-1 text-xs text-[var(--text-primary)]">{toast.message}</p>
                <button
                  type="button"
                  onClick={() => dismissNotification(toast.id)}
                  aria-label="Dismiss budget alert"
                  className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]"
                >
                  Dismiss
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
