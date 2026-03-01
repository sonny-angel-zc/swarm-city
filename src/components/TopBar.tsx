'use client';

import { useState } from 'react';
import { useSwarmStore } from '@/core/store';
import ProviderHealth from './ProviderHealth';

export default function TopBar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const [input, setInput] = useState('');
  const submitTask = useSwarmStore(s => s.submitTask);
  const currentTask = useSwarmStore(s => s.currentTask);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    submitTask(input.trim());
    setInput('');
  };

  return (
    <div className="h-14 bg-[#0d1117] border-b border-[#1e2a3a] flex items-center px-3 md:px-4 gap-2 md:gap-4 z-10">
      <div className="flex items-center gap-2">
        <span className="text-lg">🏙️</span>
        <span className="font-bold text-white/90 text-sm tracking-wide hidden sm:inline">SWARM CITY</span>
      </div>
      <form onSubmit={handleSubmit} className="flex-1 max-w-2xl">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter a task for the swarm to execute..."
            className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] transition-all"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
          >
            Deploy →
          </button>
        </div>
      </form>
      <button
        onClick={onToggleSidebar}
        className="md:hidden p-2 rounded-lg hover:bg-[#161b22] text-white/60 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>
      {currentTask && (
        <div className="flex items-center gap-2 text-xs">
          <span className={`inline-block w-2 h-2 rounded-full ${
            currentTask.status === 'done' ? 'bg-green-400' :
            currentTask.status === 'in_progress' ? 'bg-blue-400 animate-pulse' :
            'bg-yellow-400 animate-pulse'
          }`} />
          <span className="text-white/50">
            {currentTask.status === 'done' ? 'Complete' :
             currentTask.status === 'decomposing' ? 'Decomposing...' :
             `${currentTask.subtasks.filter(s => s.status === 'done').length}/${currentTask.subtasks.length} tasks`}
          </span>
        </div>
      )}
      <ProviderHealth />
    </div>
  );
}
