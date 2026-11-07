import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@hackathon/contracts'],
  poweredByHeader: false,
};

export default nextConfig;
