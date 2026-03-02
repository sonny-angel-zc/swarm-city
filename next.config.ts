import path from 'node:path';
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  allowedDevOrigins: ['sonny-angel.taild14522.ts.net'],
  outputFileTracingRoot: path.resolve(process.cwd()),
};
export default nextConfig;
