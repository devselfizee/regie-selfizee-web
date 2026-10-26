/**
 * Lecture d'un corps JSON avec garde-fou de taille.
 *
 * Les cadres embarquent le rendu PNG + les illustrations (base64 dans le JSON
 * Fabric) : un cadre chargé peut peser plusieurs Mo. On plafonne côté serveur
 * pour renvoyer une erreur claire (413) au lieu de laisser gonfler la base ou
 * de dépendre uniquement du reverse-proxy. Voir docs/UPLOAD_SIZE.md pour le
 * réglage proxy correspondant.
 */

/** Plafond d'un enregistrement de cadre (rendu + canvas + illustrations). */
export const MAX_CADRE_BYTES = 25 * 1024 * 1024; // 25 Mo

export type LimitedJson<T> =
  | { ok: true; data: T }
  | { ok: false; tooLarge: true }
  | { ok: false; tooLarge: false }; // JSON invalide

/**
 * Lit le corps en texte, vérifie la taille réelle (octets UTF-8), puis parse.
 * Rejette tôt via Content-Length quand l'en-tête est présent.
 */
export async function readJsonLimited<T>(req: Request, maxBytes: number): Promise<LimitedJson<T>> {
  const declared = Number(req.headers.get('content-length') || '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, tooLarge: true };
  }
  const text = await req.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    return { ok: false, tooLarge: true };
  }
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return { ok: false, tooLarge: false };
  }
}

/** Message client lisible pour un cadre trop volumineux. */
export const TOO_LARGE_MESSAGE =
  'Ce cadre est trop volumineux (limite 25 Mo). Réduisez le nombre ou le poids des illustrations.';
