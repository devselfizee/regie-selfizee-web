/**
 * Editor API helper.
 *
 * In booth-ui the editor API calls are proxied through Next.js rewrites
 * (/editor-api/* → localhost:4000/api/*) to avoid CORS issues.
 * All calls are same-origin so no special fetch options are needed.
 */

import { api } from "@/lib/api";

/**
 * Régie : les images du studio (importées, générées, fonds) sont envoyées à l'API Régie (POST /api/studio/images), qui
 * les range en fichiers dans le volume des médias et rend leur adresse publique : le dessin du cadre garde cette adresse
 * au lieu de l'image en base64 (comme le backend de l'éditeur de selfizee-booth-ui). En cas d'échec : null, l'image
 * reste en data URL et le cadre s'enregistre quand même.
 */
export async function envoyerImageStudio(dataUrl: string): Promise<string | null> {
  try {
    const r = await api<{ url: string }>("/studio/images", { method: "POST", json: { dataUrl } });
    return r.url || null;
  } catch {
    return null;
  }
}

/** Default fetch options for API calls with cookie auth */
export const apiFetchOptions: RequestInit = {
  credentials: "include",
};

/**
 * Build a proxied API URL from a path like "/api/auth/login".
 * Rewrites /api/... to /editor-api/... so Next.js proxies to the editor backend.
 */
export function apiUrl(path: string): string {
  // Replace leading /api/ with /editor-api/ to go through Next.js proxy
  if (path.startsWith("/api/")) {
    return `/editor-api/${path.slice(5)}`;
  }
  return path;
}
