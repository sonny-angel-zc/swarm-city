import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Swarm City — Multi-Agent Orchestration Dashboard',
  description: 'Isometric city visualization of multi-agent task orchestration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0e1a] text-white antialiased">{children}</body>
    </html>
  );
}
