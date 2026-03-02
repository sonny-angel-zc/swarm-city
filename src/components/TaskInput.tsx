'use client';

import { useState } from 'react';
import { useSwarmStore } from '@/core/store';

export default function TaskInput() {
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const submitTask = useSwarmStore(s => s.submitTask);
  const currentTask = useSwarmStore(s => s.currentTask);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    submitTask(input.trim());
    setInput('');
    setExpanded(false);
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Quick status */}
        {currentTask && currentTask.status !== 'done' && (
          <div className="mb-2 flex items-center gap-2 justify-center">
            <div className="flex gap-1">
              {currentTask.subtasks.map(st => (
                <div
                  key={st.id}
                  className={`w-6 h-1 rounded-full transition-all duration-500 ${
                    st.status === 'done' ? 'bg-green-400' :
                    st.status === 'in_progress' ? 'bg-blue-400' :
                    'bg-white/10'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="relative group">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onFocus={() => setExpanded(true)}
              onBlur={() => !input && setExpanded(false)}
              placeholder="What should the swarm build?"
              className="w-full bg-[#0d1117]/90 backdrop-blur-xl border border-[#1e2a3a] group-hover:border-[#30363d] rounded-xl px-5 py-3.5 text-sm text-white/90 placeholder-white/25 focus:outline-none focus:border-[#58a6ff]/50 focus:ring-1 focus:ring-[#58a6ff]/20 transition-all shadow-2xl shadow-black/50"
            />
            {input && (
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all hover:shadow-lg hover:shadow-green-500/20"
              >
                Create Task →
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
