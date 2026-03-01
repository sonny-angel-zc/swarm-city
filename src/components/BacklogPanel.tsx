'use client';

import { useEffect } from 'react';
import { useSwarmStore } from '@/core/store';
import { BacklogPriority, BacklogStatus } from '@/core/types';

const PRIORITY_CLASS: Record<BacklogPriority, string> = {
  P0: 'text-red-300 border-red-500/30 bg-red-500/10',
  P1: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  P2: 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10',
  P3: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
};

const STATUS_ORDER: BacklogStatus[] = ['todo', 'in_progress', 'blocked', 'done'];

export default function BacklogPanel() {
  const backlog = useSwarmStore(s => s.backlog);
  const linear = useSwarmStore(s => s.linear);
  const syncBacklog = useSwarmStore(s => s.syncBacklog);
  const setBacklogItemStatus = useSwarmStore(s => s.setBacklogItemStatus);

  useEffect(() => {
    if (!linear.connected && !linear.syncing && backlog.length === 0) {
      syncBacklog();
    }
  }, [backlog.length, linear.connected, linear.syncing, syncBacklog]);

  return (
    <div className="absolute top-3 right-3 z-20 w-80 max-h-[56vh] bg-[#0d1117]/92 backdrop-blur-sm border border-[#2b3443] rounded-lg overflow-hidden shadow-2xl">
      <div className="px-3 py-2 border-b border-[#1e2a3a] flex items-center justify-between">
        <div>
          <p className="text-[10px] text-white/35 uppercase tracking-wider">Backlog</p>
          <p className="text-xs text-white/70">Linear stub + local incidents</p>
        </div>
        <button
          onClick={() => syncBacklog()}
          disabled={linear.syncing}
          className="text-[10px] px-2 py-1 rounded bg-[#1b2432] border border-[#334155] text-white/70 hover:text-white/90 disabled:opacity-50"
        >
          {linear.syncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      <div className="px-3 py-1.5 border-b border-[#1e2a3a] text-[10px] text-white/40 flex items-center justify-between">
        <span>{linear.connected ? 'connected' : 'disconnected'}</span>
        <span>
          {linear.lastSyncAt
            ? `updated ${new Date(linear.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'never synced'}
        </span>
      </div>

      {linear.error && (
        <div className="px-3 py-1.5 text-[10px] text-red-300 border-b border-red-500/20 bg-red-500/5">
          sync failed: {linear.error}
        </div>
      )}

      <div className="overflow-y-auto max-h-[40vh] p-2 space-y-2">
        {backlog.length === 0 ? (
          <p className="text-[11px] text-white/30 italic p-2">No backlog items.</p>
        ) : (
          backlog.slice(0, 12).map(item => (
            <div key={item.id} className="rounded-md border border-[#253041] bg-[#141b25] p-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-white/80 leading-snug">{item.title}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${PRIORITY_CLASS[item.priority]}`}>
                  {item.priority}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-white/45">
                <span>{item.id} • {item.ownerRole}</span>
                <span>{item.source === 'linear_stub' ? 'linear' : 'local'}</span>
              </div>
              <div className="mt-1.5 flex gap-1">
                {STATUS_ORDER.map(status => (
                  <button
                    key={status}
                    onClick={() => setBacklogItemStatus(item.id, status)}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                      item.status === status
                        ? 'bg-[#315a91]/30 border-[#4b79b8] text-blue-200'
                        : 'bg-[#0f1520] border-[#2a3546] text-white/45 hover:text-white/70'
                    }`}
                  >
                    {status.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
