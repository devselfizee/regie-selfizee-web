/**
 * Contexte de l'éditeur public : événement + cadre éventuel, résolus par le
 * back-office CakePHP à partir du paramètre obfusqué de l'URL.
 *
 * On repasse le paramètre BRUT (tel qu'il est dans l'URL) : c'est le PHP qui
 * le déchiffre, nous n'avons pas à lui envoyer le contenu décodé.
 * Endpoint : POST /api/evenements/getEventCadreFromParam (public, sans token).
 */
import { cakeClient } from "./client";

export interface PublicCadreEvent {
  id: number;
  nom: string;
  code_logiciel: string;
}

export interface PublicCadre {
  id: number;
  /** Format du cadre. Legacy Cake = `type_animation_id` (number) raccordé au
   *  `formatBoothId` du catalogue ; studio interne Kalifun = l'`id` string du
   *  format (ex. "carte-postale-paysage"). Les deux sont acceptés au load. */
  format_id: number | string | null;
  /** Contenu de `cadres.json_editeur`. */
  json: string | null;
}

export interface PublicCadreContext {
  evenement: PublicCadreEvent;
  /** `null` quand le lien ne porte pas de `cadre_id` → parcours de création. */
  cadre: PublicCadre | null;
}

export type PublicCadreErrorCode = "EVENT_NOT_FOUND" | "UNKNOWN";

/** Erreur typée : la page publique affiche un écran différent selon le code. */
export class PublicCadreError extends Error {
  code: PublicCadreErrorCode;

  constructor(code: PublicCadreErrorCode, message: string) {
    super(message);
    this.name = "PublicCadreError";
    this.code = code;
  }
}

interface PublicCadreResponse {
  success?: boolean;
  code?: PublicCadreErrorCode;
  message?: string;
  data?: PublicCadreContext;
}

export async function fetchPublicCadreContext(parametre: string): Promise<PublicCadreContext> {
  let payload: PublicCadreResponse | undefined;

  try {
    const res = await cakeClient.post<PublicCadreResponse>(
      "/evenements/getEventCadreFromParam",
      { parametre },
    );
    payload = res.data;
  } catch (err) {
    // Axios lève sur 4xx/5xx : le corps porte quand même le code métier
    // (404 + EVENT_NOT_FOUND pour un code événement inconnu).
    const body = (err as { response?: { data?: PublicCadreResponse } })?.response?.data;
    if (body?.code === "EVENT_NOT_FOUND") {
      throw new PublicCadreError("EVENT_NOT_FOUND", body.message || "Événement introuvable.");
    }
    throw new PublicCadreError(
      "UNKNOWN",
      body?.message || (err instanceof Error ? err.message : "Impossible de charger cet événement."),
    );
  }

  if (payload?.code === "EVENT_NOT_FOUND") {
    throw new PublicCadreError("EVENT_NOT_FOUND", payload.message || "Événement introuvable.");
  }
  if (!payload?.success || !payload.data?.evenement) {
    throw new PublicCadreError("UNKNOWN", payload?.message || "Impossible de charger cet événement.");
  }

  return { evenement: payload.data.evenement, cadre: payload.data.cadre ?? null };
}
