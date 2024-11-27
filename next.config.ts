import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // TODO: change to pump.fun media url pattern
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.thedailybeast.com",
        port: "",
        pathname: "/resizer/**",
      },
    ],
  },
};

export default nextConfig;
