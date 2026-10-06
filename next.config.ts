import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker minimale : .next/standalone contient le serveur et ses dépendances
  output: "standalone",
};

export default nextConfig;
