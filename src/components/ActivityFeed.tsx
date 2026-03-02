'use client';

import { useSwarmStore } from '@/core/store';

export default function ActivityFeed() {
  const log = useSwarmStore(s => s.activityLog);
  const vehicles = useSwarmStore(s => s.vehicles);
  const autonomous = useSwarmStore(s => s.autonomous);
  const telemetry = useSwarmStore(s => s.telemetry);
  const economy = useSwarmStore(s => s.economy);
  const spentPct = economy.totalBudget > 0 ? economy.spent / economy.totalBudget : 0;

  return (
    <div className="h-28 bg-[#0d1117] border-t border-[#1e2a3a] flex items-stretch overflow-hidden">
      {/* Activity Log */}
      <div className="flex-1 p-3 overflow-y-auto">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Activity Feed</span>
          <span className="text-[10px] text-white/15">({log.length})</span>
        </div>
        {log.length === 0 ? (
          <p className="text-[11px] text-white/15 italic">Waiting for tasks...</p>
        ) : (
          <div className="space-y-0.5">
            {log.slice(-12).reverse().map((entry, i) => (
              <div key={i} className="text-[11px] text-white/35 leading-relaxed">
                <span className="text-white/15 mr-1.5">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                {entry.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Stats */}
      <div className="w-48 border-l border-[#1e2a3a] p-3 flex flex-col justify-center">
        <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Live</div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/40">Autonomous mode</span>
            <span className={`text-[11px] font-mono ${autonomous.enabled ? 'text-emerald-400' : 'text-white/45'}`}>
              {autonomous.enabled ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/40">Messages in transit</span>
            <span className="text-[11px] font-mono text-blue-400">{vehicles.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/40">Log entries</span>
            <span className="text-[11px] font-mono text-white/50">{log.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/40">Auto completed</span>
            <span className="text-[11px] font-mono text-emerald-300">{autonomous.completedTasks.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/40">Cost burn</span>
            <span className="text-[11px] font-mono text-amber-300">${telemetry.burnRatePerMinUsd.toFixed(4)}/m</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/40">Budget used</span>
            <span className={`text-[11px] font-mono ${spentPct >= 0.9 ? 'text-red-300' : spentPct >= 0.75 ? 'text-orange-300' : 'text-white/50'}`}>
              {(Math.min(100, spentPct * 100)).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
