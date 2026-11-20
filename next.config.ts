import type { NextConfig } from "next";

// In development the Python simulation API runs on :8000 (npm run dev:api).
// In production Vercel routes /api/* to the Python function (see vercel.json).
const apiOrigin = process.env.AQUAGRID_API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.AQUAGRID_DIST_DIR || ".next",
  async rewrites() {
    if (process.env.NODE_ENV !== "development" && !process.env.AQUAGRID_API_ORIGIN) return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
