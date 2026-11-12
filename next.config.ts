import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker minimale : .next/standalone contient le serveur et ses dépendances
  output: "standalone",
  async rewrites() {
    // Proxy ticket-flow (comme selfizee-booth-ui) : le SDK du navigateur poste sur la même origine en HTTPS
    // (NEXT_PUBLIC_TICKET_FLOW_URL=/ticket-flow-proxy), le serveur Next relaie vers l'API ticket-flow, même servie en
    // HTTP (pas de « Mixed Content »). Lu au build, comme toutes les réécritures.
    const ticketFlow = process.env.TICKET_FLOW_API_URL?.replace(/\/+$/, "");
    return ticketFlow ? [{ source: "/ticket-flow-proxy/:path*", destination: `${ticketFlow}/:path*` }] : [];
  },
};

export default nextConfig;
