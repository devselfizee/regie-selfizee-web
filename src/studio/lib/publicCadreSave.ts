/**
 * Sauvegarde d'un cadre depuis le studio interne Kalifun (port booth-ui).
 *
 * Le studio appelle `savePublicCadre(link, payload)` où :
 *  - `link.codeEvent` porte le booking_uuid Kalifun (posé par /studio/cadre) ;
 *  - `link.cadreId` est présent quand on ÉDITE un cadre existant.
 *
 * On persiste via l'API Kalifun (`/api/booking/[uuid]/cadres`), avec le cookie
 * de session client. En mode démo local (`codeEvent === "LOCAL"`, aucune
 * réservation cible), on retombe sur un stub qui journalise sans envoyer.
 */
import type { FrameSavePayload } from "@/studio/components/dashboard/editor/hooks/useCanvasExport";
import type { CadreLinkPayload } from "./publicCadreLink";

export interface PublicCadreSaveResult {
  /** Id renvoyé par l'API — remonte à l'éditeur via `onSaved`. */
  id?: string;
}

const DEMO_CODE = "LOCAL";

export async function savePublicCadre(
  link: CadreLinkPayload,
  payload: FrameSavePayload,
): Promise<PublicCadreSaveResult> {
  const uuid = link.codeEvent;

  // Mode démo (studio ouvert sans réservation) : rien à persister.
  if (!uuid || uuid === DEMO_CODE) {
    console.info("[cadre] mode démo — sauvegarde non persistée", {
      name: payload.name,
      canvasState: `${Math.round(payload.canvasState.length / 1024)} Ko`,
    });
    return {};
  }

  const editing = link.cadreId != null;
  const base = `/api/booking/${encodeURIComponent(uuid)}/cadres`;
  const url = editing ? `${base}/${link.cadreId}` : base;

  const res = await fetch(url, {
    method: editing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: payload.name,
      formatId: payload.formatId,
      gabaritId: payload.gabaritId,
      shootCount: payload.shootCount,
      imageDataUrl: payload.imageDataUrl,
      thumbnailDataUrl: payload.thumbnailDataUrl,
      canvasState: payload.canvasState,
    }),
  });

  if (!res.ok) {
    // Remonte le message serveur (ex. cadre trop volumineux) quand présent.
    let msg = `Sauvegarde du cadre échouée (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) msg = body.message;
    } catch {
      /* pas de corps JSON */
    }
    throw new Error(msg);
  }

  const data = (await res.json().catch(() => ({}))) as { id?: number | string };
  return { id: data.id != null ? String(data.id) : undefined };
}
