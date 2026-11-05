import { NextResponse } from "next/server";
import { adminDeLaRequete } from "@/lib/adminServeur";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /editor-api/generate-image (panneau IA du studio) : génération d'image par Google Gemini
 * (gemini-2.5-flash-image), repris de Kalifun. Clé GOOGLE_AI_API_KEY, lue à l'exécution côté serveur.
 * Sortie { id, url (data URL), prompt }.
 *
 * ⚠️ Proxy PAYANT à l'image : réservé aux admins de la Régie. Le panneau envoie le jeton Keycloak, que
 * l'API Régie valide (GET /utilisateurs/moi) ; corps, prompt et images de référence bornés, limite naïve
 * par utilisateur.
 */
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

const RATIOS = ["3:4", "4:3", "1:1", "3:2", "2:3", "5:4", "4:5", "16:9", "9:16"];
const MAX_CORPS = 20 * 1024 * 1024; // prompt + images de référence
const MAX_PROMPT = 2000;
const MAX_REFS = 3;
const MAX_REF_B64 = 6 * 1024 * 1024; // ~4,5 Mo par image de référence
const MIME_REFS = new Set(["image/png", "image/jpeg", "image/webp"]);

// Limite naïve en mémoire (par instance) : N générations par heure et par utilisateur
const MAX_PAR_HEURE = 30;
const appels = new Map<string, number[]>();
function limite(qui: string): boolean {
  const maintenant = Date.now();
  const recents = (appels.get(qui) ?? []).filter((t) => maintenant - t < 3_600_000);
  const depasse = recents.length >= MAX_PAR_HEURE;
  if (!depasse) recents.push(maintenant);
  appels.set(qui, recents);
  return depasse;
}

function consigne(demande: string, nbRefs: number): string {
  if (nbRefs > 0) {
    return [
      `L'utilisateur t'a fourni ${nbRefs} image${nbRefs > 1 ? "s" : ""} de référence.`,
      "Analyse leur style, couleurs et composition, puis génère une nouvelle image en suivant son instruction.",
      "Si l'instruction est courte ou vague, conserve au maximum le style des références en appliquant la modification demandée.",
      "",
      `Instruction : "${demande}"`,
    ].join("\n");
  }
  return ["Génère une image de haute qualité à partir de la demande suivante.", "Interprète la demande de manière créative même si elle est courte ou vague.", "", `Demande : "${demande}"`].join("\n");
}

export async function POST(req: Request) {
  const qui = await adminDeLaRequete(req);
  if (!qui) return NextResponse.json({ error: "Réservé aux administrateurs de la Régie (reconnectez-vous)." }, { status: 401 });

  const cle = process.env.GOOGLE_AI_API_KEY;
  if (!cle) return NextResponse.json({ error: "Clé API Google non configurée (GOOGLE_AI_API_KEY)." }, { status: 500 });
  if (limite(qui)) return NextResponse.json({ error: "Trop de générations pour l'instant, réessayez dans une heure." }, { status: 429 });

  const brut = await req.text();
  if (brut.length > MAX_CORPS) return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });
  let corps: { prompt?: string; aspectRatio?: string; referenceImages?: { mimeType?: string; data?: string }[] };
  try {
    corps = JSON.parse(brut);
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const demande = (corps.prompt ?? "").trim().slice(0, MAX_PROMPT);
  if (!demande) return NextResponse.json({ error: "Décrivez l'image à générer." }, { status: 400 });
  const ratio = corps.aspectRatio && RATIOS.includes(corps.aspectRatio) ? corps.aspectRatio : undefined;

  // Images de référence vérifiées (type, taille), puis la consigne
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
  for (const img of Array.isArray(corps.referenceImages) ? corps.referenceImages.slice(0, MAX_REFS) : []) {
    if (img?.mimeType && img?.data && MIME_REFS.has(img.mimeType) && img.data.length <= MAX_REF_B64) parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  parts.push({ text: consigne(demande, parts.length) });

  try {
    const r = await fetch(GEMINI_API_URL, {
      method: "POST",
      // Clé en en-tête plutôt que dans l'adresse : elle ne finit pas dans les journaux
      headers: { "Content-Type": "application/json", "x-goog-api-key": cle },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...(ratio && { imageConfig: { aspectRatio: ratio } }) },
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("[generate-image] Gemini", r.status, detail.slice(0, 300));
      const message =
        r.status === 400 || r.status === 403
          ? `Clé Google refusée ou API non activée (${r.status}) : vérifiez GOOGLE_AI_API_KEY et la facturation du projet Google.`
          : r.status === 429
            ? "Quota Google atteint (429) : réessayez plus tard."
            : `Erreur de l'API Google (${r.status}).`;
      return NextResponse.json({ error: message }, { status: 502 });
    }
    const data = (await r.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
    };
    if (data.promptFeedback?.blockReason) return NextResponse.json({ error: "Demande refusée par les filtres de sécurité de Google." }, { status: 422 });
    const image = (data.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
    if (!image?.inlineData?.data) return NextResponse.json({ error: "Aucune image générée : reformulez la demande." }, { status: 422 });
    const url = `data:${image.inlineData.mimeType || "image/png"};base64,${image.inlineData.data}`;
    return NextResponse.json({ id: `ia_${Date.now().toString(36)}`, url, prompt: demande });
  } catch (e) {
    console.error("[generate-image] réseau", e);
    return NextResponse.json({ error: "Génération impossible (réseau)." }, { status: 502 });
  }
}
