'use client';

import { useEffect } from 'react';
import { useSwarmStore } from '@/core/store';
import { BUILDING_CONFIGS } from '@/core/types';
import DocsPanel from '@/components/DocsPanel';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const statusColors: Record<string, string> = {
  idle: 'bg-gray-500',
  working: 'bg-blue-400 animate-pulse',
  needs_input: 'bg-red-400 animate-pulse',
  done: 'bg-green-400',
  blocked: 'bg-orange-400',
};

const statusLabels: Record<string, string> = {
  idle: 'Idle',
  working: 'Working',
  needs_input: 'Needs Input',
  done: 'Done',
  blocked: 'Blocked',
};

export default function Sidebar({ onClose }: { onClose?: () => void } = {}) {
  const agents = useSwarmStore(s => s.agents);
  const autonomous = useSwarmStore(s => s.autonomous);
  const currentTask = useSwarmStore(s => s.currentTask);
  const notifications = useSwarmStore(s => s.notifications);
  const economy = useSwarmStore(s => s.economy);
  const decompositionStatus = useSwarmStore(s => s.decompositionStatus);
  const fetchAgentStatuses = useSwarmStore(s => s.fetchAgentStatuses);
  const selectAgent = useSwarmStore(s => s.selectAgent);
  const dismissNotification = useSwarmStore(s => s.dismissNotification);

  const unread = notifications.filter(n => !n.read);

  useEffect(() => {
    if (!autonomous.enabled) return;

    void fetchAgentStatuses().catch((error) => {
      console.error('[Sidebar] agent status poll failed', error);
    });
    const timer = window.setInterval(() => {
      void fetchAgentStatuses().catch((error) => {
        console.error('[Sidebar] agent status poll failed', error);
      });
    }, 3000);

    return () => window.clearInterval(timer);
  }, [autonomous.enabled, fetchAgentStatuses]);

  return (
    <div className="w-80 bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] text-[var(--text-primary)] flex flex-col overflow-hidden h-full">
      {/* Mobile close button */}
      {onClose && (
        <div className="md:hidden flex items-center justify-between p-3 border-b border-[var(--border-subtle)]">
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Panel</span>
          <button onClick={onClose} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {/* Task Progress */}
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Task Progress</h2>
        {currentTask ? (
          <div>
            <p className="text-sm font-medium mb-2 truncate">{currentTask.title}</p>
            {currentTask.status === 'decomposing' ? (
              <div className={`rounded-md border px-2 py-2 text-[11px] space-y-1 ${
                decompositionStatus.stalled ? 'border-orange-400/40 bg-orange-400/10 text-orange-200' : 'border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] text-[var(--text-secondary)]'
              }`}>
                <div>Decomposing subtasks... {formatDuration(decompositionStatus.elapsedMs)}</div>
                <div className="text-[10px]">
                  Threshold warning at {formatDuration(decompositionStatus.stallThresholdMs)}
                </div>
                {decompositionStatus.stalled && (
                  <div className="text-[10px] text-orange-100">
                    {decompositionStatus.stallReason ? `Reason: ${decompositionStatus.stallReason}` : 'Reason unavailable.'}
                  </div>
                )}
                {decompositionStatus.stalled && (
                  <div className="text-[10px] text-orange-100">
                    Suggested recovery: {decompositionStatus.suggestedAction}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {currentTask.subtasks.map(st => (
                  <div key={st.id} className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      st.status === 'done' ? 'bg-green-400' :
                      st.status === 'in_progress' ? 'bg-blue-400' :
                      st.status === 'review' ? 'bg-yellow-400' :
                      'bg-gray-600'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-[var(--text-secondary)] truncate">{st.title.split(':')[0]}</div>
                      {st.status === 'in_progress' && (
                        <div className="w-full h-1 bg-[var(--bg-panel-muted)] rounded-full mt-0.5">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-300"
                            style={{ width: `${st.progress * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--text-secondary)]">{Math.round(st.progress * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : autonomous.enabled && autonomous.currentTask ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">{autonomous.currentTask.identifier}</span>
              <span className="text-[10px] text-[var(--text-secondary)]">Autonomous</span>
            </div>
            <p className="text-sm font-medium mb-2 truncate" title={autonomous.currentTask.title}>{autonomous.currentTask.title}</p>
            {(() => {
              const agentStatuses = Object.entries(agents).filter(([, a]) => a.status === 'working' || a.status === 'needs_input');
              const totalTokens = Object.values(agents).reduce((sum, a) => sum + ((a as Record<string, unknown>)._tokensUsed as number || 0), 0);
              const costEstimate = totalTokens * 0.000003; // rough $/token for codex
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[var(--text-secondary)]">Tokens</span>
                    <span className="font-mono text-blue-400">{totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(0)}k` : totalTokens}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[var(--text-secondary)]">Est. Cost</span>
                    <span className="font-mono text-green-400">${costEstimate.toFixed(4)}</span>
                  </div>
                  {agentStatuses.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-[var(--border-subtle)]">
                      {agentStatuses.map(([role, a]) => (
                        <div key={role} className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          <span className="text-[10px] text-[var(--text-secondary)] capitalize">{a.building.buildingName}</span>
                          {a.currentTask && (
                            <span className="text-[10px] text-blue-400 font-mono ml-auto truncate max-w-[100px]">{(a as Record<string, unknown>)._tokensUsed as number >= 1000 ? `${(((a as Record<string, unknown>)._tokensUsed as number) / 1000).toFixed(0)}k` : (a as Record<string, unknown>)._tokensUsed} tok</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-secondary)] italic">No active task. Submit one above.</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Agents */}
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">Agents</h2>
          <div className="space-y-2">
            {BUILDING_CONFIGS.map(cfg => {
              const agent = agents[cfg.role];
              const budget = economy.agentBudgets[cfg.role];
              const usedPct = budget.tokensSpent / budget.tokenBudget;
              const budgetColor =
                usedPct > 0.8 ? '#EF4444' :
                usedPct > 0.5 ? '#F59E0B' :
                cfg.color;
              return (
                <button
                  key={cfg.role}
                  onClick={() => selectAgent(cfg.role)}
                  className="w-full text-left p-2.5 rounded-lg bg-[var(--bg-panel-muted)] hover:brightness-110 border border-[var(--border-subtle)] transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                          <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                            {cfg.buildingName}
                          </div>
                        {budget.tokensSpent > 0 && (
                          <span className="text-[9px] font-mono" style={{ color: budgetColor }}>
                            {budget.tokensSpent.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusColors[agent.status]}`} />
                        <span className="text-[10px] text-[var(--text-secondary)]">{statusLabels[agent.status]}</span>
                        {agent.status === 'working' && (() => {
                          const tokens = (agent as Record<string, unknown>)._tokensUsed as number | undefined;
                          return tokens && tokens > 0 ? (
                            <span className="text-[10px] text-blue-400 font-mono ml-auto">{tokens >= 1000 ? `${(tokens / 1000).toFixed(0)}k` : tokens} tok</span>
                          ) : null;
                        })()}
                      </div>
                      {/* Budget progress bar */}
                      {budget.tokensSpent > 0 && (
                        <div className="w-full h-0.5 bg-[var(--bg-panel)] rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, usedPct * 100)}%`,
                              backgroundColor: budgetColor,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <DocsPanel />

        {/* Notifications */}
        <div className="p-4">
          <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
            Notifications {unread.length > 0 && (
              <span className="text-red-400 ml-1">({unread.length})</span>
            )}
          </h2>
          {unread.length === 0 ? (
            <p className="text-[11px] text-[var(--text-secondary)] italic">All clear</p>
          ) : (
            <div className="space-y-1.5">
              {unread.slice(-5).reverse().map(n => (
                <div
                  key={n.id}
                  onClick={() => {
                    dismissNotification(n.id);
                    selectAgent(n.agentRole);
                  }}
                  className={`text-[11px] p-2 rounded cursor-pointer transition-colors ${
                    n.type === 'review_needed'
                      ? 'bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20'
                      : 'bg-[var(--bg-panel-muted)] text-[var(--text-secondary)] hover:brightness-110'
                  }`}
                >
                  {n.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
