import path from 'node:path';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';
const defaultDevDistDir = `.next-dev-${process.env.PORT ?? '3000'}`;

const nextConfig: NextConfig = {
  allowedDevOrigins: ['sonny-angel.taild14522.ts.net'],
  outputFileTracingRoot: path.resolve(process.cwd()),
  distDir: isDev ? (process.env.NEXT_DIST_DIR ?? defaultDevDistDir) : '.next',
};
export default nextConfig;
