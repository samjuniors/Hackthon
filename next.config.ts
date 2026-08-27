import type { NextConfig } from "next";

const isVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);

const nextConfig: NextConfig = {
  // Standalone output is only needed for self-hosted/Docker environments, not on Vercel.
  output: !isVercel && process.env.STANDALONE === 'true' ? 'standalone' : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
