/**
 * Accès authentifié à l'API Bibliothèques du booth (CakePHP).
 *
 * Depuis le 2026-09-07, `booth.selfizee.fr/api/bibliotheques/*` exige un JWT :
 * les appels anonymes reçoivent `401 { "message": "Token manquant, invalide ou
 * expiré." }`. Seul `/external` (résolution des polices) reste public.
 *
 * Schéma (doc « API Bibliothèques Studio ») :
 *  - `POST /api/users/getToken`, corps form-encoded `username` + `password`
 *    — le USERNAME du compte, jamais son email ;
 *  - réponse `{ success, data: { token, expire } }`, `expire` en secondes Unix,
 *    validité 24 h ;
 *  - puis `Authorization: Bearer <token>` sur content-menu, all, catalogue et
 *    options.
 *
 * Le compte de service et son mot de passe restent côté serveur : jamais de
 * `NEXT_PUBLIC_*`, et ce module n'est importé que par les routes du proxy.
 * Sans identifiants configurés on appelle quand même, en anonyme : le booth
 * répond 401 et les routes retombent sur leur repli habituel.
 */

// MODELS_BACKEND_URL d'abord : c'est la variable que ces routes de proxy
// utilisaient déjà, on ne change donc rien pour un déploiement qui la pose.
// BOOTH_API_URL n'est accepté qu'en second — booth-integration.ts s'en sert
// pour un endpoint différent (/api/integrations/events), les deux ne doivent
// pas se marcher dessus.
const BASE = (
  process.env.MODELS_BACKEND_URL ||
  process.env.BOOTH_API_URL ||
  'https://booth.selfizee.fr'
).replace(/\/$/, '');

const USER = process.env.BOOTH_API_USERNAME || '';
const PASS = process.env.BOOTH_API_PASSWORD || '';

/** Le compte de service est-il configuré ? Sert aux routes à distinguer
 *  « pas encore branché » d'un vrai échec d'authentification. */
export const boothAuthConfigured = Boolean(USER && PASS);

/** Marge avant échéance : on renouvelle sans attendre l'expiration réelle. */
const RENEW_MARGIN_S = 300;

let cached: { token: string; expire: number } | null = null;
/** Évite N appels simultanés à getToken au démarrage (une seule requête). */
let inflight: Promise<string> | null = null;

async function requestToken(): Promise<string> {
  const body = new URLSearchParams({ username: USER, password: PASS });
  const res = await fetch(`${BASE}/api/users/getToken`, {
    method: 'POST',
    body,
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; message?: string; data?: { token?: string; expire?: number } }
    | null;

  if (!json?.success || !json.data?.token) {
    throw new Error(`getToken: ${json?.message ?? `HTTP ${res.status}`}`);
  }
  cached = {
    token: json.data.token,
    // `expire` absent → on se rabat sur 24 h, la validité annoncée.
    expire: json.data.expire ?? Math.floor(Date.now() / 1000) + 86400,
  };
  return cached.token;
}

async function getToken(force = false): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (!force && cached && cached.expire - now > RENEW_MARGIN_S) return cached.token;
  if (!force && inflight) return inflight;

  if (force) cached = null;
  inflight = requestToken().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * GET authentifié sur `/api/bibliotheques<path>`, avec un seul réessai sur 401
 * (jeton expiré côté serveur avant notre marge, ou révoqué).
 *
 * Retourne la `Response` brute : chaque route garde son propre repli et ses
 * propres en-têtes de cache.
 */
export async function boothBibliothequesGet(path: string): Promise<Response> {
  const url = `${BASE}/api/bibliotheques${path}`;

  if (!boothAuthConfigured) {
    return fetch(url, { headers: { Accept: 'application/json' } });
  }

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let token: string;
    try {
      token = await getToken(attempt === 1);
    } catch {
      // Compte de service refusé : inutile d'insister, on laisse la route
      // appliquer son repli avec le statut du booth.
      return res ?? fetch(url, { headers: { Accept: 'application/json' } });
    }
    res = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (res.status !== 401) return res;
  }
  return res!;
}
