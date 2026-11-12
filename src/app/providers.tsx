"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// SDK ticket-flow (comme selfizee-booth-ui) : remonte les erreurs du navigateur (window.onerror, promesses rejetées)
// en tickets. Importé ici, dans un fichier « use client », pour être dans le bundle du navigateur (depuis le layout,
// composant serveur, aucun écouteur ne s'installerait). Configuration lue dans NEXT_PUBLIC_TICKET_FLOW_URL / _PROJECT /
// _TOKEN ; s'il en manque une, le SDK reste éteint (simple avertissement dans la console).
import "@devselfizee/ticket-flow-reporter/auto";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  const creer = () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
  if (typeof window === "undefined") return creer();
  browserQueryClient ??= creer();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
