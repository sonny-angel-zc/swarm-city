'use client';

import { useState } from 'react';
import { useSwarmStore } from '@/core/store';
import ProviderHealth from './ProviderHealth';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function TopBar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const submitTask = useSwarmStore(s => s.submitTask);
  const currentTask = useSwarmStore(s => s.currentTask);
  const decompositionStatus = useSwarmStore(s => s.decompositionStatus);
  const autonomous = useSwarmStore(s => s.autonomous);
  const setAutonomousEnabled = useSwarmStore(s => s.setAutonomousEnabled);
  const modelPreset = useSwarmStore(s => s.modelPreset);
  const setModelPreset = useSwarmStore(s => s.setModelPreset);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setActionError(null);
    setSubmitting(true);
    try {
      await submitTask(input.trim());
      setInput('');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Task submission failed.');
    } finally {
      setSubmitting(false);
    }
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
            disabled={submitting}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Task →'}
          </button>
        </div>
      </form>
      <label className="hidden md:flex items-center gap-2 text-xs text-white/60">
        <span>Preset</span>
        <select
          value={modelPreset}
          onChange={(e) => setModelPreset(e.target.value as 'claude-first' | 'codex-first')}
          className="bg-[#161b22] border border-[#30363d] rounded-md px-2 py-1 text-white/90 focus:outline-none focus:border-[#58a6ff]"
        >
          <option value="codex-first">Codex-first</option>
          <option value="claude-first">Claude-first</option>
        </select>
      </label>
      <button
        onClick={async () => {
          setActionError(null);
          setToggleLoading(true);
          try {
            await setAutonomousEnabled(!autonomous.enabled);
          } catch (error) {
            setActionError(error instanceof Error ? error.message : 'Failed to toggle autonomous mode.');
          } finally {
            setToggleLoading(false);
          }
        }}
        disabled={toggleLoading}
        className={`inline-flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] border transition-colors ${
          autonomous.enabled
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
            : 'bg-white/5 text-white/60 border-white/15'
        } disabled:opacity-60 disabled:cursor-not-allowed`}
        title="Toggle autonomous execution loop"
      >
        <span>Autonomous</span>
        <span>{toggleLoading ? '...' : autonomous.enabled ? 'ON' : 'OFF'}</span>
      </button>
      <button
        onClick={onToggleSidebar}
        className="md:hidden p-2 rounded-lg hover:bg-[#161b22] text-white/60 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>
      {currentTask && (
        <div className="flex flex-col text-xs leading-tight">
          <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${
            currentTask.status === 'done' ? 'bg-green-400' :
            currentTask.status === 'in_progress' ? 'bg-blue-400 animate-pulse' :
            decompositionStatus.stalled ? 'bg-orange-400 animate-pulse' : 'bg-yellow-400 animate-pulse'
          }`} />
          <span className="text-white/50">
            {currentTask.status === 'done' ? 'Complete' :
             currentTask.status === 'decomposing'
               ? `Decomposing... ${formatDuration(decompositionStatus.elapsedMs)}`
               :
             `${currentTask.subtasks.filter(s => s.status === 'done').length}/${currentTask.subtasks.length} tasks`}
          </span>
        </div>
          {currentTask.status === 'decomposing' && decompositionStatus.stalled && (
            <span className="text-[10px] text-orange-300">
              Stalled beyond {formatDuration(decompositionStatus.stallThresholdMs)}. {decompositionStatus.suggestedAction}
            </span>
          )}
        </div>
      )}
      {autonomous.currentTask && (
        <div className="hidden lg:flex items-center gap-2 text-xs text-white/55 max-w-72 truncate">
          <span className={`inline-block w-2 h-2 rounded-full ${autonomous.running ? 'bg-emerald-400 animate-pulse' : 'bg-sky-400'}`} />
          <span className="truncate">
            Auto: {autonomous.currentTask.identifier} {autonomous.currentTask.title}
          </span>
        </div>
      )}
      <ProviderHealth />
      {actionError && (
        <div className="hidden lg:block text-[10px] text-red-300 max-w-80 truncate" title={actionError}>
          {actionError}
        </div>
      )}
    </div>
  );
}
