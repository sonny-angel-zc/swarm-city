'use client';

import { useEffect, useState } from 'react';
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
import { useSwarmStore } from '@/core/store';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const resumeTask = useSwarmStore(s => s.resumeTask);
  const fetchLimits = useSwarmStore(s => s.fetchLimits);
  const syncBacklog = useSwarmStore(s => s.syncBacklog);
  const fetchAutonomousStatus = useSwarmStore(s => s.fetchAutonomousStatus);

  useEffect(() => {
    // Fetch runtime budget limits and Linear backlog on mount
    fetchLimits();
    syncBacklog();
    fetchAutonomousStatus();
    const timer = window.setInterval(() => {
      fetchAutonomousStatus();
    }, 4000);
    try {
      const lastTaskId = localStorage.getItem('swarm:lastTaskId');
      if (lastTaskId) resumeTask(lastTaskId);
    } catch {}
    return () => window.clearInterval(timer);
  }, [resumeTask, fetchLimits, syncBacklog, fetchAutonomousStatus]);

  return (
    <div className="h-[100dvh] flex flex-col">
      <TopBar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative">
          <CityCanvas />
          <Treasury />
          <BacklogPanel />
          <InspectPanel />
          <TaskInput />
          <BudgetPanel />
          <OverlayToggle />
        </div>
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <>
            <div
              className="md:hidden fixed inset-0 bg-black/60 z-30"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="md:hidden fixed right-0 top-0 bottom-0 z-40 w-80 max-w-[85vw]">
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}
      </div>
      <div className="hidden md:block">
        <ActivityFeed />
      </div>
    </div>
  );
}
