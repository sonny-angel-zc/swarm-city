'use client';

import { useState, useRef, useEffect } from 'react';
import { useSwarmStore } from '@/core/store';

const statusColors: Record<string, string> = {
  idle: 'text-gray-400',
  working: 'text-blue-400',
  needs_input: 'text-red-400',
  done: 'text-green-400',
  blocked: 'text-orange-400',
};

const statusDots: Record<string, string> = {
  idle: 'bg-gray-500',
  working: 'bg-blue-400 animate-pulse',
  needs_input: 'bg-red-400 animate-pulse',
  done: 'bg-green-400',
  blocked: 'bg-orange-400 animate-pulse',
};

export default function AgentPanel() {
  const [message, setMessage] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const selectedAgent = useSwarmStore(s => s.selectedAgent);
  const agents = useSwarmStore(s => s.agents);
  const selectAgent = useSwarmStore(s => s.selectAgent);
  const sendMessage = useSwarmStore(s => s.sendMessage);

  const agent = selectedAgent ? agents[selectedAgent] : null;

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agent?.log.length]);

  if (!agent) return null;

  const b = agent.building;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedAgent) return;
    sendMessage(selectedAgent, message.trim());
    setMessage('');
  };

  return (
    <div className="absolute right-80 top-0 bottom-0 w-96 bg-[#0d1117]/95 backdrop-blur-xl border-l border-[#1e2a3a] flex flex-col animate-slide-in z-20">
      {/* Header */}
      <div className="p-4 border-b border-[#1e2a3a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
              style={{ backgroundColor: b.color + '22', border: `1px solid ${b.color}44` }}
            >
              {b.icon}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white/90">{b.buildingName}</h2>
              <p className="text-[11px] text-white/40">{b.name}</p>
            </div>
          </div>
          <button
            onClick={() => selectAgent(null)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Status */}
        <div className="mt-3 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${statusDots[agent.status]}`} />
          <span className={`text-xs font-medium ${statusColors[agent.status]}`}>
            {agent.status === 'needs_input' ? 'Needs Input' : agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
          </span>
        </div>

        {/* Current task */}
        {agent.currentTask && (
          <div className="mt-3 p-2.5 rounded-lg bg-[#161b22] border border-[#21262d]">
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Current Task</p>
            <p className="text-xs text-white/70">{agent.currentTask}</p>
            {agent.status === 'working' && (
              <div className="mt-2 w-full h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${agent.progress * 100}%`,
                    backgroundColor: b.color,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <p className="mt-3 text-[11px] text-white/30">{b.description}</p>
      </div>

      {/* Log stream */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-[10px] text-white/30 uppercase tracking-wider mb-3 font-semibold">Activity Log</h3>
        {agent.log.length === 0 ? (
          <p className="text-xs text-white/20 italic">No activity yet</p>
        ) : (
          <div className="space-y-1.5">
            {agent.log.slice(-30).map((entry, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-[10px] text-white/15 font-mono shrink-0 mt-0.5">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className={`text-[11px] leading-relaxed ${
                  entry.type === 'error' ? 'text-red-400' :
                  entry.type === 'request' ? 'text-yellow-400' :
                  entry.type === 'output' ? 'text-green-300/70' :
                  'text-white/50'
                }`}>
                  {entry.message}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Message input (for needs_input or general) */}
      <div className="p-3 border-t border-[#1e2a3a]">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={agent.status === 'needs_input' ? 'Respond to agent...' : 'Send message...'}
            className="flex-1 bg-[#161b22] border border-[#21262d] rounded-md px-3 py-1.5 text-xs text-white/80 placeholder-white/20 focus:outline-none focus:border-[#58a6ff]/50 transition-colors"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-xs rounded-md font-medium transition-colors"
            style={{
              backgroundColor: b.color + '33',
              color: b.color,
              border: `1px solid ${b.color}44`,
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
