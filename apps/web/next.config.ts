import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiBase = (
      process.env.API_BASE_URL ?? "http://127.0.0.1:4000"
    ).replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
