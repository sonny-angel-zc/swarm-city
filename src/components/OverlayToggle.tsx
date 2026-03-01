'use client';

import { useSwarmStore } from '@/core/store';
import { OverlayMode } from '@/core/types';

const MODES: { mode: OverlayMode; label: string }[] = [
  { mode: 'activity', label: 'Activity' },
  { mode: 'power', label: 'Power' },
  { mode: 'economy', label: 'Economy' },
];

export default function OverlayToggle() {
  const overlayMode = useSwarmStore(s => s.overlayMode);
  const setOverlayMode = useSwarmStore(s => s.setOverlayMode);

  return (
    <div className="absolute bottom-4 right-4 z-20 flex gap-1 rounded-lg bg-black/60 backdrop-blur-sm p-1 border border-white/10">
      {MODES.map(({ mode, label }) => (
        <button
          key={mode}
          onClick={() => setOverlayMode(mode)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            overlayMode === mode
              ? 'bg-white/15 text-white'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
