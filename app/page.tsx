'use client';

import { useCallback, useEffect, useState } from 'react';
import CityCanvas from '@/components/CityCanvas';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import InspectPanel from '@/components/InspectPanel';
import ActivityFeed from '@/components/ActivityFeed';
import TaskInput from '@/components/TaskInput';
import Treasury from '@/components/Treasury';
import BudgetPanel from '@/components/BudgetPanel';
import OverlayToggle from '@/components/OverlayToggle';
import BacklogPanel from '@/components/BacklogPanel';
import ComponentErrorBoundary from '@/components/ComponentErrorBoundary';
import { useSwarmStore } from '@/core/store';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const resumeTask = useSwarmStore(s => s.resumeTask);
  const fetchLimits = useSwarmStore(s => s.fetchLimits);
  const syncBacklog = useSwarmStore(s => s.syncBacklog);
  const fetchAutonomousStatus = useSwarmStore(s => s.fetchAutonomousStatus);

  const bootstrap = useCallback(async () => {
    setBootLoading(true);
    setBootError(null);
    const results = await Promise.allSettled([
      fetchLimits(),
      syncBacklog(),
      fetchAutonomousStatus(),
    ]);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason));
    if (failures.length > 0) {
      setBootError(failures.join(' | '));
    }
    setBootLoading(false);
  }, [fetchLimits, syncBacklog, fetchAutonomousStatus]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchAutonomousStatus().catch((error) => {
        console.error('[Home] autonomous polling failed', error);
      });
    }, 4000);
    try {
      const lastTaskId = localStorage.getItem('swarm:lastTaskId');
      if (lastTaskId) {
        void resumeTask(lastTaskId).catch((error) => {
          console.error('[Home] resume task failed', error);
        });
      }
    } catch {}
    return () => window.clearInterval(timer);
  }, [resumeTask, fetchAutonomousStatus]);

  if (bootLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-secondary)]">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-3 text-sm">
          Loading swarm control plane...
        </div>
      </div>
    );
  }

  return (
    <div data-testid="dashboard-theme-surface-root" className="h-[100dvh] flex flex-col">
      <ComponentErrorBoundary name="TopBar">
        <TopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      </ComponentErrorBoundary>
      {bootError && (
        <div className="mx-3 mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          Startup sync failed: {bootError}
          <button
            onClick={() => void bootstrap()}
            className="ml-2 rounded border border-red-400/30 px-2 py-1 text-[11px] text-red-100 hover:bg-red-500/20"
          >
            Retry
          </button>
        </div>
      )}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative">
          <ComponentErrorBoundary name="CityCanvas">
            <CityCanvas />
          </ComponentErrorBoundary>
          <div className="hidden md:block">
            <ComponentErrorBoundary name="Treasury">
              <Treasury />
            </ComponentErrorBoundary>
          </div>
          <ComponentErrorBoundary name="BacklogPanel">
            <BacklogPanel />
          </ComponentErrorBoundary>
          <ComponentErrorBoundary name="InspectPanel">
            <InspectPanel />
          </ComponentErrorBoundary>
          <ComponentErrorBoundary name="TaskInput">
            <TaskInput />
          </ComponentErrorBoundary>
          <div className="hidden md:block">
            <ComponentErrorBoundary name="BudgetPanel">
              <BudgetPanel />
            </ComponentErrorBoundary>
            <ComponentErrorBoundary name="OverlayToggle">
              <OverlayToggle />
            </ComponentErrorBoundary>
          </div>
        </div>
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <ComponentErrorBoundary name="Sidebar">
            <Sidebar />
          </ComponentErrorBoundary>
        </div>
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div
              className="md:hidden fixed inset-0 z-30"
              style={{ background: 'var(--overlay-backdrop)' }}
              onClick={() => setSidebarOpen(false)}
            />
            <div className="md:hidden fixed right-0 top-0 bottom-0 z-40 w-80 max-w-[85vw]">
              <ComponentErrorBoundary name="Sidebar">
                <Sidebar onClose={() => setSidebarOpen(false)} />
              </ComponentErrorBoundary>
            </div>
          </>
        )}
      </div>
      <div className="hidden md:block">
        <ComponentErrorBoundary name="ActivityFeed">
          <ActivityFeed />
        </ComponentErrorBoundary>
      </div>
    </div>
  );
}
