'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="h-[100dvh] flex items-center justify-center bg-[#0a0e1a] p-6">
      <div className="w-full max-w-lg rounded-xl border border-red-500/30 bg-[#140f14] p-5 text-red-100">
        <h2 className="text-sm font-semibold">Something went wrong.</h2>
        <p className="mt-2 text-xs text-red-200/90">{error.message || 'Unknown runtime error.'}</p>
        <button
          onClick={reset}
          className="mt-4 rounded border border-red-300/40 px-3 py-1.5 text-xs text-red-100 hover:bg-red-500/20"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
