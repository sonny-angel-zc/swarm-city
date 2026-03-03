'use client';

import { KeyboardEvent, useRef } from 'react';
import { useSwarmStore } from '@/core/store';
import { CITY_OVERLAY_CONTRACT, CITY_OVERLAY_COPY, CITY_OVERLAY_MODE_ORDER } from '@/core/cityOverlayContract';

export default function OverlayToggle() {
  const overlayMode = useSwarmStore(s => s.overlayMode);
  const setOverlayMode = useSwarmStore(s => s.setOverlayMode);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeContract = CITY_OVERLAY_CONTRACT[overlayMode];

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % CITY_OVERLAY_MODE_ORDER.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + CITY_OVERLAY_MODE_ORDER.length) % CITY_OVERLAY_MODE_ORDER.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = CITY_OVERLAY_MODE_ORDER.length - 1;

    const next = CITY_OVERLAY_MODE_ORDER[nextIndex];
    setOverlayMode(next);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={CITY_OVERLAY_COPY.panelLabel}
      data-testid="city-overlay-toggle"
      data-overlay-current={overlayMode}
      data-overlay-focus={activeContract.focusArea}
      data-overlay-roads-emphasis={activeContract.roadsEmphasis}
      data-overlay-transit-emphasis={activeContract.transitEmphasis}
      data-overlay-greenspace-emphasis={activeContract.greenspaceEmphasis}
      data-overlay-city-life-emphasis={activeContract.cityLifeEmphasis}
      data-overlay-spend-emphasis={activeContract.spendEmphasis}
      className="absolute bottom-3 left-3 right-3 z-20 max-w-[28rem] rounded-xl border border-white/15 bg-black/70 p-2 shadow-2xl shadow-black/40 backdrop-blur-md sm:bottom-4 sm:left-auto sm:right-4 sm:w-[27rem]"
    >
      <div className="mb-1.5 flex items-center justify-between px-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">{CITY_OVERLAY_COPY.panelHeading}</span>
        <span
          className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80"
          data-testid="city-overlay-active-label"
        >
          {activeContract.label}
        </span>
      </div>
      <div className="flex gap-1">
        {CITY_OVERLAY_MODE_ORDER.map((mode, index) => {
          const contract = CITY_OVERLAY_CONTRACT[mode];
          const selected = overlayMode === mode;
          return (
          <button
            key={mode}
            onClick={() => setOverlayMode(mode)}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            role="tab"
            aria-selected={selected}
            aria-controls="city-canvas"
            aria-label={contract.label}
            tabIndex={selected ? 0 : -1}
            title={contract.rendererIntent}
            data-testid={`city-overlay-mode-${mode}`}
            data-overlay-mode={mode}
            data-overlay-focus={contract.focusArea}
            data-overlay-selected={selected ? 'true' : 'false'}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            className={`rounded-lg px-3 py-2 text-left transition-colors ${
              selected
                ? 'bg-white/20 text-white'
                : 'text-white/55 hover:bg-white/10 hover:text-white/85'
            }`}
          >
            <span className="block text-[11px] font-semibold leading-none">{contract.label}</span>
            <span className="mt-1 block text-[10px] leading-tight text-white/60">{contract.helper}</span>
          </button>
        );
        })}
      </div>
      <div className="mt-1 px-2 text-[10px] text-white/45">{CITY_OVERLAY_COPY.keyboardHint}</div>
    </div>
  );
}
