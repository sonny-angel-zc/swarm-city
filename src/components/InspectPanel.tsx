'use client';

import { useState } from 'react';
import { useSwarmStore } from '@/core/store';

const statusBadge: Record<string, { bg: string; text: string; label: string }> = {
  idle: { bg: 'bg-gray-700', text: 'text-gray-300', label: 'IDLE' },
  working: { bg: 'bg-blue-900/60', text: 'text-blue-300', label: 'WORKING' },
  reviewing: { bg: 'bg-yellow-900/60', text: 'text-yellow-300', label: 'REVIEWING' },
  needs_input: { bg: 'bg-red-900/60', text: 'text-red-300', label: 'NEEDS INPUT' },
  done: { bg: 'bg-green-900/60', text: 'text-green-300', label: 'COMPLETE' },
  blocked: { bg: 'bg-orange-900/60', text: 'text-orange-300', label: 'BLOCKED' },
};

export default function InspectPanel() {
  const selectedAgent = useSwarmStore(s => s.selectedAgent);
  const agents = useSwarmStore(s => s.agents);
  const selectAgent = useSwarmStore(s => s.selectAgent);
  const sendMessage = useSwarmStore(s => s.sendMessage);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  if (!selectedAgent) return null;

  const agent = agents[selectedAgent];
  const badge = statusBadge[agent.status] ?? statusBadge.idle;

  return (
    <div className="absolute bottom-16 left-4 w-96 bg-[#0d1117]/95 backdrop-blur-md border border-[#30363d] rounded-xl shadow-2xl overflow-hidden z-20">
      {/* Header */}
      <div className="p-4 border-b border-[#21262d]" style={{ borderLeftColor: agent.building.color, borderLeftWidth: 3 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{agent.building.icon}</span>
            <div>
              <h3 className="font-semibold text-white/90 text-sm">{agent.building.buildingName}</h3>
              <p className="text-[11px] text-white/40">{agent.building.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
            <button onClick={() => selectAgent(null)} className="text-white/30 hover:text-white/60 text-lg">✕</button>
          </div>
        </div>
        <p className="text-[11px] text-white/30 mt-1">{agent.building.description}</p>
      </div>

      {/* Current Task */}
      {agent.currentTask && (
        <div className="px-4 py-2 border-b border-[#21262d]">
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Current Task</p>
          <p className="text-xs text-white/70 mt-0.5">{agent.currentTask}</p>
          {agent.status === 'working' && (
            <div className="w-full h-1.5 bg-[#161b22] rounded-full mt-1.5">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${agent.progress * 100}%`, backgroundColor: agent.building.color }}
              />
            </div>
          )}
        </div>
      )}

      {/* Activity Log */}
      <div className="px-4 py-2 max-h-36 overflow-y-auto">
        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Activity Log</p>
        {agent.log.length === 0 ? (
          <p className="text-[11px] text-white/20 italic">No activity yet</p>
        ) : (
          <div className="space-y-1">
            {agent.log.slice(-8).reverse().map((entry, i) => (
              <div key={i} className={`text-[11px] ${
                entry.type === 'error' ? 'text-red-400' :
                entry.type === 'request' ? 'text-orange-300' :
                entry.type === 'output' ? 'text-green-300/70' :
                'text-white/40'
              }`}>
                {entry.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="p-3 border-t border-[#21262d]">
        <form onSubmit={async e => {
          e.preventDefault();
          if (!msg.trim()) return;
          setSendError(null);
          setSending(true);
          try {
            await sendMessage(selectedAgent, msg.trim());
            setMsg('');
          } catch (error) {
            setSendError(error instanceof Error ? error.message : 'Failed to send message.');
          } finally {
            setSending(false);
          }
        }} className="flex gap-2">
          <input
            value={msg}
            onChange={e => setMsg(e.target.value)}
            placeholder={agent.status === 'needs_input' ? 'Provide input...' : 'Send message...'}
            className={`flex-1 bg-[#161b22] border rounded px-3 py-1.5 text-xs text-white/80 placeholder-white/25 focus:outline-none transition-all ${
              agent.status === 'needs_input'
                ? 'border-red-500/40 focus:border-red-400'
                : 'border-[#30363d] focus:border-[#58a6ff]'
            }`}
          />
          <button
            type="submit"
            disabled={sending}
            className="bg-[#238636] hover:bg-[#2ea043] disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs px-3 rounded font-medium transition-colors"
          >
            {sending ? '...' : 'Send'}
          </button>
        </form>
        {sendError && (
          <p className="mt-2 text-[11px] text-red-300">{sendError}</p>
        )}
      </div>
    </div>
  );
}
