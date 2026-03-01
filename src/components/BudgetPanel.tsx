'use client';

import { useSwarmStore } from '@/core/store';
import { BUILDING_CONFIGS, AgentRole } from '@/core/types';

export default function BudgetPanel() {
  const economy = useSwarmStore(s => s.economy);
  const budgetPanelOpen = useSwarmStore(s => s.budgetPanelOpen);
  const setBudgetPanelOpen = useSwarmStore(s => s.setBudgetPanelOpen);
  const setAgentBudget = useSwarmStore(s => s.setAgentBudget);

  if (!budgetPanelOpen) return null;

  const remaining = economy.totalBudget - economy.spent;
  const netFlow = economy.income - economy.expenses;

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
        <div className="bg-[#0d1117] border border-[#1e2a3a] rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#1e2a3a]">
            <h2 className="text-sm font-semibold text-white/90">Budget Allocation</h2>
            <button
              onClick={() => setBudgetPanelOpen(false)}
              className="p-1 text-white/40 hover:text-white/80 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-px bg-[#1e2a3a] border-b border-[#1e2a3a]">
            <div className="bg-[#0d1117] p-3 text-center">
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Income</div>
              <div className="text-sm font-mono text-green-400 mt-0.5">+{economy.income.toLocaleString()}</div>
            </div>
            <div className="bg-[#0d1117] p-3 text-center">
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Expenses</div>
              <div className="text-sm font-mono text-red-400 mt-0.5">-{economy.expenses.toLocaleString()}</div>
            </div>
            <div className="bg-[#0d1117] p-3 text-center">
              <div className="text-[10px] text-white/40 uppercase tracking-wider">Remaining</div>
              <div className={`text-sm font-mono mt-0.5 ${remaining > economy.totalBudget * 0.2 ? 'text-white/80' : 'text-red-400'}`}>
                {remaining.toLocaleString()}
              </div>
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
