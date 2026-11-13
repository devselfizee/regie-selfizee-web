/**
 * Editor API helper.
 *
 * In booth-ui the editor API calls are proxied through Next.js rewrites
 * (/editor-api/* → localhost:4000/api/*) to avoid CORS issues.
 * All calls are same-origin so no special fetch options are needed.
 */

/**
 * Régie : pas de serveur d'images derrière le studio (/editor-api/uploads/image n'existe pas). Les images importées ou
 * générées restent en data URL dans le dessin du cadre, enregistré tel quel par l'API Régie. L'envoi tenté par le studio
 * de Kalifun répondait 404 à chaque image (bruit dans la console et faux signalements ticket-flow) : il est coupé.
 */
export const ENVOI_IMAGES_STUDIO = false;

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
