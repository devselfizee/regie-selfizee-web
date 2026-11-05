import { NextResponse } from "next/server";
import { adminDeLaRequete } from "@/lib/adminServeur";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /editor-api/remove-bg (bouton « Détourage IA » du studio) : comme le projet background-removal de
 * Selfizee (app/api/remove-bg), l'image part au service de détourage :
 * POST {REMOVE_BG_API_URL}/api/ext/remove-bg?model_type=hr, jeton dans l'en-tête X-API-TOKEN. Mêmes
 * valeurs que API_URL et API_TOKEN de background-removal, lues à l'exécution. Renvoie le PNG détouré.
 * Réservé aux admins de la Régie.
 */
const MAX_IMAGE = 25 * 1024 * 1024;
// Modèles proposés par background-removal (components/ModelSelector.js)
const MODELES = new Set(["standard", "hr", "matting"]);

export async function POST(req: Request) {
  if (!(await adminDeLaRequete(req))) return NextResponse.json({ error: "Réservé aux administrateurs de la Régie (reconnectez-vous)." }, { status: 401 });

  const base = (process.env.REMOVE_BG_API_URL ?? "").trim().replace(/\/+$/, "");
  const jeton = process.env.REMOVE_BG_API_TOKEN ?? "";
  if (!base || !jeton) return NextResponse.json({ error: "Détourage non configuré : REMOVE_BG_API_URL et REMOVE_BG_API_TOKEN manquent." }, { status: 501 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const image = form.get("file");
  if (!(image instanceof Blob)) return NextResponse.json({ error: "Image manquante." }, { status: 400 });
  if (image.size > MAX_IMAGE) return NextResponse.json({ error: "Image trop lourde pour le détourage (25 Mo au plus)." }, { status: 413 });

  const modele = String(form.get("model_type") ?? "hr");
  const params = new URLSearchParams({ model_type: MODELES.has(modele) ? modele : "hr" });
  const dim = Number(form.get("output_max_dim"));
  if (Number.isInteger(dim) && dim > 0) params.set("output_max_dim", String(dim));
  const envoi = new FormData();
  envoi.append("file", image, "image.png");
  const cible = `${base}/api/ext/remove-bg`;

  try {
    const r = await fetch(`${cible}?${params}`, { method: "POST", headers: { "X-API-TOKEN": jeton }, body: envoi, signal: AbortSignal.timeout(90_000) });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("[remove-bg] service de détourage", r.status, detail.slice(0, 300));
      const message =
        r.status === 401 || r.status === 403
          ? `Le service de détourage refuse le jeton (${r.status}) : vérifiez REMOVE_BG_API_TOKEN.`
          : r.status === 404
            ? `${cible} n'existe pas (404) : vérifiez REMOVE_BG_API_URL.`
            : `Détourage impossible (service de détourage : ${r.status}).`;
      return NextResponse.json({ error: message }, { status: 502 });
    }
    return new NextResponse(await r.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[remove-bg] réseau", e);
    return NextResponse.json({ error: `Détourage impossible : ${cible} injoignable ou trop lent.` }, { status: 502 });
  }
}
