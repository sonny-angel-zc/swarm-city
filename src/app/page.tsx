'use client';

import CityCanvas from '@/components/CityCanvas';
import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import InspectPanel from '@/components/InspectPanel';
import ActivityFeed from '@/components/ActivityFeed';
import TaskInput from '@/components/TaskInput';

export default function Home() {
  return (
    <div className="h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <CityCanvas />
          <InspectPanel />
          <TaskInput />
        </div>
        <Sidebar />
      </div>
      <ActivityFeed />
    </div>
  );
}
