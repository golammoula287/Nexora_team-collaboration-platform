import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Workspace packages ship TypeScript source rather than a build.
  transpilePackages: ['@nexora/ui', '@nexora/shared'],
};

export default config;
