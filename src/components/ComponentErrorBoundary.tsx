'use client';

import React from 'react';

type Props = {
  name: string;
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export default class ComponentErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[ComponentErrorBoundary] ${this.props.name}`, error);
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
        <div className="font-semibold">{this.props.name} failed to render.</div>
        <button
          onClick={this.reset}
          className="mt-2 rounded border border-red-400/40 px-2 py-1 text-[11px] text-red-100 hover:bg-red-500/20"
        >
          Retry
        </button>
      </div>
    );
  }
}
