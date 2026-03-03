'use client';

import { useSwarmStore } from '@/core/store';
import { BUILDING_CONFIGS, AgentRole } from '@/core/types';

type BudgetStatusTone = 'healthy' | 'warning' | 'critical' | 'exhausted';

function resolveBudgetStatusTone(spentPct: number): BudgetStatusTone {
  if (spentPct >= 1) return 'exhausted';
  if (spentPct >= 0.9) return 'critical';
  if (spentPct >= 0.75) return 'warning';
  return 'healthy';
}

const statusConfig: Record<BudgetStatusTone, { label: string; shortLabel: string; badgeClass: string; panelClass: string; helper: string }> = {
  healthy: {
    label: 'Healthy',
    shortLabel: 'On track',
    badgeClass: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-100',
    panelClass: 'border-emerald-500/25 bg-emerald-500/10',
    helper: 'Spend is within a safe range.',
  },
  warning: {
    label: 'Warning',
    shortLabel: 'Watch burn',
    badgeClass: 'border-amber-500/35 bg-amber-500/15 text-amber-100',
    panelClass: 'border-amber-500/30 bg-amber-500/10',
    helper: 'Burn is elevated. Rebalance model usage soon.',
  },
  critical: {
    label: 'Critical',
    shortLabel: 'Immediate action',
    badgeClass: 'border-red-500/40 bg-red-500/18 text-red-100',
    panelClass: 'border-red-500/35 bg-red-500/12',
    helper: 'Budget depletion risk is high.',
  },
  exhausted: {
    label: 'Exhausted',
    shortLabel: 'Budget reached',
    badgeClass: 'border-red-600/50 bg-red-600/22 text-red-50',
    panelClass: 'border-red-600/45 bg-red-600/16',
    helper: 'Budget is fully consumed.',
  },
};

export default function BudgetPanel() {
  const economy = useSwarmStore(s => s.economy);
  const telemetry = useSwarmStore(s => s.telemetry);
  const budgetPanelOpen = useSwarmStore(s => s.budgetPanelOpen);
  const setBudgetPanelOpen = useSwarmStore(s => s.setBudgetPanelOpen);
  const setAgentBudget = useSwarmStore(s => s.setAgentBudget);

  if (!budgetPanelOpen) return null;

  const remaining = economy.totalBudget - economy.spent;
  const netFlow = economy.income - economy.expenses;
  const usedPct = economy.totalBudget > 0 ? economy.spent / economy.totalBudget : 0;
  const tone = resolveBudgetStatusTone(usedPct);
  const toneConfig = statusConfig[tone];
  const nextThreshold = economy.budgetAlertThresholds.find(t => !economy.triggeredBudgetAlerts.includes(t)) ?? null;
  const latestTelemetry = telemetry.events.length > 0 ? telemetry.events[telemetry.events.length - 1] : null;
  const projectedMonthlyCost = telemetry.burnRatePerMinUsd * 60 * 24 * 30;
  const budgetPaceLabel = projectedMonthlyCost >= economy.totalBudget
    ? 'Projected to exceed token budget'
    : 'Projected to stay within token budget';
  const projectedBudgetPct = economy.totalBudget > 0 ? Math.min(1, projectedMonthlyCost / economy.totalBudget) : 0;

  // Build spend history bars from history points
  const historyBars = economy.history.slice(-20);
  const maxSpent = Math.max(1, ...historyBars.map(h => h.totalSpent));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={() => setBudgetPanelOpen(false)}
      />
      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[#0d1117] border border-[#1e2a3a] rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#1e2a3a]">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white/90">Budget Allocation</h2>
              <p className="mt-0.5 text-[11px] text-white/50">Live token and cost visibility for this swarm run.</p>
            </div>
            <button
              onClick={() => setBudgetPanelOpen(false)}
              className="p-1 text-white/40 hover:text-white/80 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className={`mx-4 mt-4 rounded-lg border p-3 ${toneConfig.panelClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-white/75">
                Budget status
                <span className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${toneConfig.badgeClass}`}>
                  {toneConfig.label}
                </span>
              </div>
              <div className="text-[11px] text-white/70">{toneConfig.helper}</div>
            </div>
          </div>

          {/* Summary stats */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1e2a3a] border-y border-[#1e2a3a]">
            <div className="bg-[#0d1117] p-3 text-center">
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Current Spend</div>
              <div className="text-sm font-mono text-amber-300 mt-0.5">${telemetry.totalCostUsd.toFixed(4)}</div>
            </div>
            <div className="bg-[#0d1117] p-3 text-center">
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Burn Rate</div>
              <div className="text-sm font-mono text-amber-100 mt-0.5">${telemetry.burnRatePerMinUsd.toFixed(4)}/min</div>
            </div>
            <div className="bg-[#0d1117] p-3 text-center">
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Projected Monthly</div>
              <div className={`text-sm font-mono mt-0.5 ${projectedMonthlyCost >= economy.totalBudget ? 'text-red-300' : 'text-emerald-300'}`}>
                ${projectedMonthlyCost.toFixed(2)}
              </div>
            </div>
            <div className="bg-[#0d1117] p-3 text-center">
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Budget Remaining</div>
              <div className={`text-sm font-mono mt-0.5 ${remaining > economy.totalBudget * 0.2 ? 'text-white/80' : 'text-red-400'}`}>
                {Math.max(0, remaining).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="px-4 py-2 border-b border-[#1e2a3a] text-[10px] text-white/55 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span>budget used {Math.min(100, usedPct * 100).toFixed(1)}%</span>
            <span className={projectedMonthlyCost >= economy.totalBudget ? 'text-red-300' : 'text-emerald-300'}>
              {budgetPaceLabel}
            </span>
            <span>
              {nextThreshold
                ? `next alert ${Math.round(nextThreshold * 100)}%`
                : 'all budget alerts triggered'}
            </span>
          </div>

          <div className="px-4 py-3 border-b border-[#1e2a3a]">
            <h3 className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Live Cost Tracking</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">
              <div className="rounded bg-[#161b22] border border-[#21262d] px-2 py-2">
                <div className="text-white/45">Current spend this run</div>
                <div className="font-mono text-amber-100 mt-0.5">${telemetry.totalCostUsd.toFixed(4)}</div>
                <div className="text-white/45 mt-1">{telemetry.events.length} metered events</div>
              </div>
              <div className="rounded bg-[#161b22] border border-[#21262d] px-2 py-2">
                <div className="text-white/45">Live burn rate</div>
                <div className="font-mono text-white/80 mt-0.5">${telemetry.burnRatePerMinUsd.toFixed(4)}/min</div>
                <div className="text-white/45 mt-1">Equivalent ${(telemetry.burnRatePerMinUsd * 60).toFixed(4)}/hr</div>
              </div>
              <div className={`rounded border px-2 py-2 ${projectedMonthlyCost >= economy.totalBudget ? 'bg-red-500/8 border-red-500/25' : 'bg-emerald-500/8 border-emerald-500/25'}`}>
                <div className="text-white/45">Projected monthly total</div>
                <div className={`font-mono mt-0.5 ${projectedMonthlyCost >= economy.totalBudget ? 'text-red-200' : 'text-emerald-200'}`}>
                  ${projectedMonthlyCost.toFixed(2)}
                </div>
                <div className="mt-1 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(4, projectedBudgetPct * 100)}%`,
                      backgroundColor: projectedMonthlyCost >= economy.totalBudget ? '#F87171' : '#34D399',
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['healthy', 'warning', 'critical', 'exhausted'] as BudgetStatusTone[]).map(status => (
                <span
                  key={status}
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${statusConfig[status].badgeClass} ${tone === status ? '' : 'opacity-55'}`}
                  aria-current={tone === status}
                >
                  {statusConfig[status].shortLabel}
                </span>
              ))}
            </div>
          </div>

          {/* Agent budgets */}
          <div className="p-4 overflow-y-auto max-h-[45vh]">
            <h3 className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Per-Agent Budgets</h3>
            <div className="space-y-3">
              {BUILDING_CONFIGS.map(cfg => {
                const budget = economy.agentBudgets[cfg.role];
                const usedPct = budget.tokensSpent / budget.tokenBudget;
                const barColor =
                  usedPct > 0.8 ? '#EF4444' :
                  usedPct > 0.5 ? '#F59E0B' :
                  cfg.color;

                return (
                  <div key={cfg.role} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{cfg.icon}</span>
                        <span className="text-xs text-white/70">{cfg.buildingName}</span>
                      </div>
                      <span className="text-[10px] font-mono text-white/40">
                        {budget.tokensSpent.toLocaleString()} / {budget.tokenBudget.toLocaleString()}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, usedPct * 100)}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    {/* Budget slider */}
                    <input
                      type="range"
                      min={1000}
                      max={15000}
                      step={500}
                      value={budget.tokenBudget}
                      onChange={(e) => setAgentBudget(cfg.role, parseInt(e.target.value))}
                      className="w-full h-1 mt-1 appearance-none bg-transparent cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/60 [&::-webkit-slider-runnable-track]:h-0.5 [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-runnable-track]:rounded-full"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Spend history */}
          {historyBars.length > 1 && (
            <div className="p-4 border-t border-[#1e2a3a]">
              <h3 className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Spend History</h3>
              <div className="flex items-end gap-px h-12">
                {historyBars.map((h, i) => {
                  const prev = i > 0 ? historyBars[i - 1].totalSpent : 0;
                  const delta = h.totalSpent - prev;
                  const barH = Math.max(2, (delta / (maxSpent * 0.1)) * 48);
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm transition-all duration-200"
                      style={{
                        height: `${Math.min(48, barH)}px`,
                        backgroundColor: delta > maxSpent * 0.05 ? '#F59E0B' : '#4ADE80',
                        opacity: 0.6 + (i / historyBars.length) * 0.4,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-4 border-t border-[#1e2a3a]">
            <h3 className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Live Cost</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
              <div className="rounded bg-[#161b22] border border-[#21262d] px-2 py-1.5">
                <div className="text-white/45">Income</div>
                <div className="font-mono text-green-400 mt-0.5">+{economy.income.toLocaleString()}</div>
              </div>
              <div className="rounded bg-[#161b22] border border-[#21262d] px-2 py-1.5">
                <div className="text-white/45">Expenses</div>
                <div className="font-mono text-red-400 mt-0.5">-{economy.expenses.toLocaleString()}</div>
              </div>
              <div className="rounded bg-[#161b22] border border-[#21262d] px-2 py-1.5">
                <div className="text-white/45">Burn Rate</div>
                <div className="font-mono text-amber-200 mt-0.5">${telemetry.burnRatePerMinUsd.toFixed(4)}/min</div>
              </div>
              <div className="rounded bg-[#161b22] border border-[#21262d] px-2 py-1.5">
                <div className="text-white/45">Cost Events</div>
                <div className="font-mono text-white/70 mt-0.5">{telemetry.events.length}</div>
              </div>
            </div>
            {latestTelemetry && (
              <div className="mt-2 text-[10px] text-white/55 truncate">
                latest ${latestTelemetry.estimatedCostUsd.toFixed(4)} on {latestTelemetry.model}
              </div>
            )}
          </div>

          {/* Recent transactions */}
          <div className="p-4 border-t border-[#1e2a3a] max-h-32 overflow-y-auto">
            <h3 className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Recent Transactions</h3>
            {economy.transactions.length === 0 ? (
              <p className="text-[10px] text-white/20 italic">No transactions yet</p>
            ) : (
              <div className="space-y-1">
                {economy.transactions.slice(-8).reverse().map(tx => {
                  const cfg = BUILDING_CONFIGS.find(c => c.role === tx.agentRole);
                  const isIncome = tx.amount < 0;
                  return (
                    <div key={tx.id} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <span>{cfg?.icon}</span>
                        <span className="text-white/40">{tx.type.replace('_', ' ')}</span>
                      </div>
                      <span className={isIncome ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
                        {isIncome ? '+' : '-'}{Math.abs(tx.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
