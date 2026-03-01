'use client';

import { useMemo } from 'react';
import { useSwarmStore } from '@/core/store';

export default function Treasury() {
  const economy = useSwarmStore(s => s.economy);
  const telemetry = useSwarmStore(s => s.telemetry);
  const setBudgetPanelOpen = useSwarmStore(s => s.setBudgetPanelOpen);

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

  const color = spentPct > 0.8 ? '#EF4444' : spentPct > 0.5 ? '#F59E0B' : '#4ADE80';
  const borderColor = spentPct > 0.8 ? 'border-red-500/30' : spentPct > 0.5 ? 'border-yellow-500/30' : 'border-green-500/30';
  const bgColor = spentPct > 0.8 ? 'bg-red-500/5' : spentPct > 0.5 ? 'bg-yellow-500/5' : 'bg-green-500/5';

  return (
    <div
      className={`absolute top-3 left-3 z-20 ${bgColor} backdrop-blur-sm border ${borderColor} rounded-lg px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors select-none min-w-56`}
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
            <span className="text-sm font-mono font-semibold" style={{ color }}>
              {remaining.toLocaleString()}
            </span>
            <span className="text-[9px] text-white/30">tokens</span>
          </div>
          <div className="text-[9px] text-white/35 flex items-center gap-1.5">
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

      <div className="mt-2 flex items-center justify-between text-[9px] text-white/35">
        <span>burn ${telemetry.burnRatePerMinUsd.toFixed(4)}/min</span>
        <span>total ${telemetry.totalCostUsd.toFixed(4)}</span>
      </div>

      {providerRows.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {providerRows.map(p => (
            <span
              key={p.provider}
              className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/60"
            >
              {p.provider}: ${p.costUsd.toFixed(3)}
            </span>
          ))}
        </div>
      )}

      {hottestModel && (
        <div className="mt-1 text-[9px] text-white/40 truncate">
          model {hottestModel.model} ({hottestModel.events} calls)
        </div>
      )}
    </div>
  );
}
