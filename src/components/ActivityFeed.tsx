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
    <div
      data-testid="dashboard-activity-feed"
      className="h-28 bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] text-[var(--text-primary)] flex items-stretch overflow-hidden"
    >
      {/* Activity Log */}
      <div className="flex-1 p-3 overflow-y-auto">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Activity Feed</span>
          <span className="text-[10px] text-[var(--text-secondary)]">({log.length + autonomous.events.length})</span>
        </div>
        {(() => {
          // Merge manual activity log with autonomous events
          const manualEntries = log.map(e => ({ timestamp: e.timestamp, message: e.message, source: 'manual' as const }));
          const autoEntries = autonomous.events.map(e => ({ timestamp: e.timestamp, message: `[Autonomous] ${e.message}`, source: e.type as string }));
          const merged = [...manualEntries, ...autoEntries]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 20);

          return merged.length === 0 ? (
            <p className="text-[11px] text-[var(--text-secondary)] italic">Waiting for tasks...</p>
          ) : (
            <div className="space-y-0.5">
              {merged.map((entry, i) => (
                <div key={i} className={`text-[11px] leading-relaxed ${
                  entry.source === 'error' ? 'text-red-400' :
                  entry.source === 'warning' ? 'text-amber-400' :
                  'text-[var(--text-secondary)]'
                }`}>
                  <span className="text-[var(--text-secondary)] mr-1.5">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  {entry.message}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Live Stats */}
      <div className="w-48 border-l border-[var(--border-subtle)] p-3 flex flex-col justify-center">
        <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-2">Live</div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Autonomous mode</span>
            <span
              data-testid="activity-feed-autonomous-status"
              className={`text-[11px] font-mono ${autonomous.enabled ? 'text-emerald-400' : 'text-[var(--text-secondary)]'}`}
            >
              {autonomous.enabled ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Messages in transit</span>
            <span className="text-[11px] font-mono text-blue-400">{vehicles.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Log entries</span>
            <span className="text-[11px] font-mono text-[var(--text-secondary)]">{log.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Auto completed</span>
            <span className="text-[11px] font-mono text-emerald-300">{autonomous.completedTasks.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Cost burn</span>
            <span className="text-[11px] font-mono text-amber-300">${telemetry.burnRatePerMinUsd.toFixed(4)}/m</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-secondary)]">Budget used</span>
            <span className={`text-[11px] font-mono ${spentPct >= 0.9 ? 'text-red-300' : spentPct >= 0.75 ? 'text-orange-300' : 'text-[var(--text-secondary)]'}`}>
              {(Math.min(100, spentPct * 100)).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
