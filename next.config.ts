import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false, // Disable React strict mode to prevent double execution during development
  experimental: {
    optimizePackageImports: ['antd', 'lodash']
  }
};

export default nextConfig;
