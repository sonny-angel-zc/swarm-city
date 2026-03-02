export default function NotFoundPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0a0e1a',
        color: '#e5e7eb',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>404</h1>
        <p style={{ marginTop: 8, color: '#9ca3af' }}>This page could not be found.</p>
      </div>
    </main>
  );
}
