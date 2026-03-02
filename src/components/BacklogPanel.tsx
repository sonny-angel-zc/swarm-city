'use client';

import React, { useState } from 'react';
import { useSwarmStore } from '../core/store';
import { BacklogItem, BacklogPriority } from '../core/types';

const PRIORITY_COLORS: Record<BacklogPriority, string> = {
  P0: '#ef4444',
  P1: '#f97316',
  P2: '#eab308',
  P3: '#6b7280',
};

const STATUS_ICONS: Record<string, string> = {
  todo: '○',
  in_progress: '◑',
  blocked: '⊘',
  done: '●',
};

function IssueCard({ item }: { item: BacklogItem }) {
  const updateIssueStatus = useSwarmStore(s => s.updateLinearIssueStatus);
  const deploySwarm = useSwarmStore(s => s.deploySwarm);
  const [deploying, setDeploying] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleStatusCycle = async () => {
    if (!item.linearId) return;
    const cycle: Record<string, string> = {
      todo: 'started',
      in_progress: 'completed',
      done: 'unstarted',
      blocked: 'started',
    };
    const nextType = cycle[item.status] ?? 'unstarted';
    setActionError(null);
    setUpdatingStatus(true);
    try {
      await updateIssueStatus(item.linearId, nextType);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Status update failed.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeploy = async () => {
    setActionError(null);
    setDeploying(true);
    try {
      await deploySwarm(item.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Deploy failed.');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: 13,
        background: item.isSwarmTarget ? 'rgba(99,102,241,0.08)' : undefined,
        borderLeft: item.isSwarmTarget ? '2px solid #818cf8' : '2px solid transparent',
      }}
    >
      <button
        onClick={handleStatusCycle}
        disabled={updatingStatus || !item.linearId}
        title={`Status: ${item.statusLabel ?? item.status} — click to cycle`}
        style={{
          background: 'none',
          border: 'none',
          cursor: item.linearId ? 'pointer' : 'default',
          fontSize: 14,
          color: item.status === 'done' ? '#22c55e' : item.status === 'in_progress' ? '#3b82f6' : '#9ca3af',
          opacity: updatingStatus ? 0.5 : 1,
        }}
      >
        {STATUS_ICONS[item.status] ?? '○'}
      </button>

      <span
        style={{
          background: PRIORITY_COLORS[item.priority],
          color: '#fff',
          borderRadius: 3,
          padding: '1px 5px',
          fontSize: 10,
          fontWeight: 700,
          minWidth: 22,
          textAlign: 'center',
        }}
      >
        {item.priority}
      </span>

      <span style={{ color: '#6b7280', fontSize: 11, minWidth: 48 }}>{item.id}</span>

      {item.linearUrl ? (
        <a
          href={item.linearUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#e2e8f0', textDecoration: 'none', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={item.title}
        >
          {item.title}
        </a>
      ) : (
        <span style={{ color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </span>
      )}

      {item.labels && item.labels.length > 0 && (
        <span style={{ fontSize: 10, color: '#818cf8' }}>
          {item.labels.join(', ')}
        </span>
      )}

      {item.ownerName && (
        <span style={{ fontSize: 10, color: '#9ca3af' }}>{item.ownerName}</span>
      )}

      {item.isSwarmTarget ? (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#818cf8',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#818cf8',
              display: 'inline-block',
              animation: 'swarmPulse 1s ease-in-out infinite',
            }}
          />
          SWARMING
        </span>
      ) : item.status !== 'done' && (
        <button
          onClick={handleDeploy}
          disabled={deploying}
          title="Deploy swarm on this issue"
          style={{
            background: 'rgba(99,102,241,0.15)',
            color: '#818cf8',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 10,
            cursor: deploying ? 'default' : 'pointer',
            opacity: deploying ? 0.5 : 1,
            whiteSpace: 'nowrap',
            fontWeight: 600,
          }}
        >
          {deploying ? '...' : '⚡ Deploy'}
        </button>
      )}
      {actionError && (
        <span style={{ fontSize: 10, color: '#fca5a5', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={actionError}>
          {actionError}
        </span>
      )}
    </div>
  );
}

function CreateIssueForm({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createIssue = useSwarmStore(s => s.createLinearIssue);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await createIssue(title.trim(), undefined, priority);
      setTitle('');
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Issue creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        gap: 6,
        padding: '8px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        alignItems: 'center',
      }}
    >
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Issue title..."
        autoFocus
        style={{
          flex: 1,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 4,
          padding: '4px 8px',
          color: '#e2e8f0',
          fontSize: 12,
          outline: 'none',
        }}
      />
      <select
        value={priority}
        onChange={e => setPriority(Number(e.target.value))}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 4,
          color: '#e2e8f0',
          fontSize: 11,
          padding: '4px 6px',
        }}
      >
        <option value={1}>Urgent</option>
        <option value={2}>High</option>
        <option value={3}>Medium</option>
        <option value={4}>Low</option>
      </select>
      <button
        type="submit"
        disabled={submitting || !title.trim()}
        style={{
          background: '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '4px 10px',
          fontSize: 11,
          cursor: 'pointer',
          opacity: submitting ? 0.5 : 1,
        }}
      >
        {submitting ? '...' : 'Create'}
      </button>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'none',
          color: '#9ca3af',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        ✕
      </button>
      {submitError && (
        <div style={{ fontSize: 11, color: '#fca5a5', marginLeft: 4, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={submitError}>
          {submitError}
        </div>
      )}
    </form>
  );
}

export default function BacklogPanel() {
  const backlog = useSwarmStore(s => s.backlog);
  const linear = useSwarmStore(s => s.linear);
  const autonomous = useSwarmStore(s => s.autonomous);
  const syncLinear = useSwarmStore(s => s.syncLinear);
  const [showCreate, setShowCreate] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const grouped = {
    in_progress: backlog.filter(i => i.status === 'in_progress'),
    todo: backlog.filter(i => i.status === 'todo'),
    blocked: backlog.filter(i => i.status === 'blocked'),
    done: backlog.filter(i => i.status === 'done'),
  };

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: 420,
        maxHeight: '60vh',
        background: 'rgba(15, 15, 25, 0.92)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>
            Linear Backlog
          </span>
          <span style={{ fontSize: 10, color: '#6b7280' }}>
            {backlog.length} issues
          </span>
          {linear.syncing && (
            <span style={{ fontSize: 10, color: '#3b82f6' }}>syncing...</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setShowCreate(v => !v)}
            style={{
              background: 'rgba(59,130,246,0.15)',
              color: '#60a5fa',
              border: 'none',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            + New
          </button>
          <button
            onClick={async () => {
              setSyncError(null);
              try {
                await syncLinear();
              } catch (error) {
                setSyncError(error instanceof Error ? error.message : 'Sync failed.');
              }
            }}
            disabled={linear.syncing}
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#9ca3af',
              border: 'none',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 11,
              cursor: 'pointer',
              opacity: linear.syncing ? 0.5 : 1,
            }}
          >
            ↻ Sync
          </button>
        </div>
      </div>

      {showCreate && <CreateIssueForm onClose={() => setShowCreate(false)} />}

      {linear.error && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>
          {linear.error}
        </div>
      )}
      {syncError && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: '#fca5a5', background: 'rgba(248,113,113,0.1)' }}>
          {syncError}
        </div>
      )}

      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ fontSize: 10, color: '#9ca3af' }}>
          Autonomous: <span style={{ color: autonomous.enabled ? '#34d399' : '#9ca3af' }}>{autonomous.enabled ? 'ON' : 'OFF'}</span>
          {autonomous.currentTask ? ` • Working: ${autonomous.currentTask.identifier}` : ' • Idle'}
        </div>
        {autonomous.completedTasks.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {autonomous.completedTasks.slice(0, 3).map((task) => (
              <div key={task.issueId} style={{ fontSize: 10, color: '#6ee7b7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                ✓ {task.identifier} {task.title}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Issues list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {(['in_progress', 'todo', 'blocked', 'done'] as const).map(status => {
          const items = grouped[status];
          if (items.length === 0) return null;
          return (
            <div key={status}>
              <div
                style={{
                  padding: '6px 12px',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: '#6b7280',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                {STATUS_ICONS[status]} {status.replace('_', ' ')} ({items.length})
              </div>
              {items.map(item => (
                <IssueCard key={item.id} item={item} />
              ))}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {linear.lastSyncAt && (
        <div
          style={{
            padding: '4px 12px',
            fontSize: 9,
            color: '#4b5563',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            textAlign: 'right',
          }}
        >
          Last synced: {new Date(linear.lastSyncAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
