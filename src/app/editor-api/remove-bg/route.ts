import { NextResponse } from "next/server";
import { adminDeLaRequete } from "@/lib/adminServeur";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /editor-api/remove-bg (bouton « Détourer » du studio) : comme selfizee-booth-ui, le détourage est
 * fait par le backend de l'éditeur de la plateforme Selfizee. booth-ui y envoie /editor-api/* par un
 * rewrite ; ici, cette route lui transmet le formulaire (`file` en PNG, `model_type`) et renvoie le PNG
 * détouré. Adresse : EDITOR_BACKEND_URL (même valeur que dans le déploiement de booth-ui), lue à
 * l'exécution. Réservé aux admins de la Régie.
 */
const MAX_IMAGE = 25 * 1024 * 1024;

export async function POST(req: Request) {
  if (!(await adminDeLaRequete(req))) return NextResponse.json({ error: "Réservé aux administrateurs de la Régie (reconnectez-vous)." }, { status: 401 });

  // Sans « /api » final (booth-ui l'ajoute lui-même, sa valeur n'en a pas) : sinon …/api/api/remove-bg
  const base = (process.env.EDITOR_BACKEND_URL ?? "").trim().replace(/\/+$/, "").replace(/\/api$/, "");
  const cible = `${base}/api/remove-bg`;
  if (!base) return NextResponse.json({ error: "Détourage non configuré : EDITOR_BACKEND_URL manque (adresse du backend de l'éditeur)." }, { status: 501 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const image = form.get("file");
  if (!(image instanceof Blob)) return NextResponse.json({ error: "Image manquante." }, { status: 400 });
  if (image.size > MAX_IMAGE) return NextResponse.json({ error: "Image trop lourde pour le détourage (25 Mo au plus)." }, { status: 413 });

  const envoi = new FormData();
  envoi.append("file", image, "image.png");
  envoi.append("model_type", String(form.get("model_type") ?? "hr"));

  try {
    const r = await fetch(cible, { method: "POST", body: envoi, signal: AbortSignal.timeout(90_000) });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("[remove-bg] backend de l'éditeur", r.status, detail.slice(0, 300));
      const message =
        r.status === 401 || r.status === 403
          ? `Le backend de l'éditeur refuse l'accès (${r.status}) : il faut qu'il accepte les appels de la Régie.`
          : r.status === 404
            ? `${cible} n'existe pas (404) : EDITOR_BACKEND_URL doit être l'adresse du backend de l'éditeur de booth-ui.`
            : `Détourage impossible (backend de l'éditeur : ${r.status}).`;
      return NextResponse.json({ error: message }, { status: 502 });
    }
    const png = await r.arrayBuffer();
    return new NextResponse(png, { headers: { "Content-Type": r.headers.get("content-type") ?? "image/png", "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[remove-bg] réseau", e);
    return NextResponse.json({ error: `Détourage impossible : ${cible} injoignable ou trop lent.` }, { status: 502 });
  }
}
