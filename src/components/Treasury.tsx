'use client';

import { useSwarmStore } from '@/core/store';

export default function Treasury() {
  const economy = useSwarmStore(s => s.economy);
  const setBudgetPanelOpen = useSwarmStore(s => s.setBudgetPanelOpen);

  const remaining = economy.totalBudget - economy.spent;
  const spentPct = economy.spent / economy.totalBudget;

  // Spend rate: tokens per minute based on recent transactions
  const now = Date.now();
  const recentTxs = economy.transactions.filter(t => t.amount > 0 && now - t.timestamp < 60000);
  const spendRate = recentTxs.reduce((sum, t) => sum + t.amount, 0);

  // Color based on spend level
  const color =
    spentPct > 0.8 ? '#EF4444' :  // red
    spentPct > 0.5 ? '#F59E0B' :  // yellow
    '#4ADE80';                      // green

  const borderColor =
    spentPct > 0.8 ? 'border-red-500/30' :
    spentPct > 0.5 ? 'border-yellow-500/30' :
    'border-green-500/30';

  const bgColor =
    spentPct > 0.8 ? 'bg-red-500/5' :
    spentPct > 0.5 ? 'bg-yellow-500/5' :
    'bg-green-500/5';

  return (
    <div
      className={`absolute top-3 left-3 z-20 ${bgColor} backdrop-blur-sm border ${borderColor} rounded-lg px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors select-none`}
      onClick={() => setBudgetPanelOpen(true)}
    >
      <div className="flex items-center gap-2">
        {/* Gold coin icon */}
        <div className="relative">
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
          {spentPct > 0.8 && (
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-mono font-semibold" style={{ color }}>
              {remaining.toLocaleString()}
            </span>
            <span className="text-[9px] text-white/30">tokens</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-white/30">
              {spendRate > 0 ? `${spendRate.toLocaleString()}/min` : 'idle'}
            </span>
          </div>
        </div>
      </div>

      {/* Mini budget bar */}
      <div className="mt-1.5 w-full h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(100, spentPct * 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}
