"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
