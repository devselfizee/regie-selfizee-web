/**
 * Contrat du lien public de l'éditeur de cadre.
 *
 * Le PHP legacy génère l'URL avec le paramètre obfusqué :
 *
 *   $data = ['code_event' => '7UTW', 'cadre_id' => 334444];
 *   $url  = 'https://…/public/cadre/' . base64_encode(base64_encode(base64_encode(serialize($data))));
 *
 * Côté front on décode avec [slDecrypt] puis on valide ici, à un seul endroit,
 * pour que le reste de l'app manipule un objet typé et pas un `PhpValue`.
 *
 * ⚠ Le paramètre n'est ni signé ni chiffré : il dit « quel événement » mais ne
 * prouve rien. Toute vérification d'accès devra être faite par l'API de
 * sauvegarde, pas par cette page.
 */
import { slDecrypt, slEncrypt, SlCryptError, type PhpValue } from "./slCrypt";

export interface CadreLinkPayload {
  /** Code événement Selfizee (ex. « 7UTW »). Obligatoire. */
  codeEvent: string;
  /**
   * Id du cadre à modifier. Absent = création d'un nouveau cadre.
   * Transporté par le lien mais pas encore exploité : le chargement d'un
   * cadre existant arrivera avec l'API (cf. [savePublicCadre]).
   */
  cadreId?: number;
}

/** Clés telles qu'écrites par le PHP. */
const KEY_CODE_EVENT = "code_event";
const KEY_CADRE_ID = "cadre_id";

/** Construit le token d'URL à partir du payload (miroir exact du PHP). */
export function encodeCadreLink(payload: CadreLinkPayload): string {
  const data: Record<string, PhpValue> = { [KEY_CODE_EVENT]: payload.codeEvent };
  if (payload.cadreId !== undefined) data[KEY_CADRE_ID] = payload.cadreId;
  return slEncrypt(data);
}

/**
 * Décode et valide le token d'URL. Lève une [SlCryptError] si le paramètre est
 * illisible ou ne porte pas de `code_event` exploitable.
 */
export function decodeCadreLink(token: string): CadreLinkPayload {
  const raw = slDecrypt(token);

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SlCryptError("Le paramètre ne contient pas un tableau PHP.");
  }

  const codeEvent = raw[KEY_CODE_EVENT];
  if (typeof codeEvent !== "string" || codeEvent.trim() === "") {
    throw new SlCryptError("Le paramètre ne contient pas de code_event.");
  }

  const payload: CadreLinkPayload = { codeEvent: codeEvent.trim() };

  // Le PHP peut envoyer l'id en int ou en string selon la source ; on accepte
  // les deux et on ignore une valeur inexploitable plutôt que de bloquer le
  // lien — cadre_id n'est pas encore utilisé.
  const cadreId = raw[KEY_CADRE_ID];
  if (typeof cadreId === "number" && Number.isFinite(cadreId)) {
    payload.cadreId = cadreId;
  } else if (typeof cadreId === "string" && /^\d+$/.test(cadreId.trim())) {
    payload.cadreId = Number(cadreId.trim());
  }

  return payload;
}

/** Variante non levante : `null` si le token est invalide. */
export function tryDecodeCadreLink(token: string | null | undefined): CadreLinkPayload | null {
  if (!token) return null;
  try {
    return decodeCadreLink(token);
  } catch {
    return null;
  }
}

/** Chemin de la page publique pour un payload donné. */
export function cadreLinkPath(payload: CadreLinkPayload): string {
  // encodeURIComponent : le base64 standard contient « + » et « / », qui
  // seraient sinon interprétés comme séparateurs de segment.
  return `/public/cadre/${encodeURIComponent(encodeCadreLink(payload))}`;
}
