import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Swarm City — Multi-Agent Orchestration Dashboard',
  description: 'Isometric city visualization of multi-agent task orchestration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
