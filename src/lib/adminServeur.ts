// Routes /editor-api du studio qui coûtent ou exposent un service de la plateforme (génération IA,
// détourage) : réservées aux admins de la Régie. Elles ne voient pas la session Keycloak du navigateur :
// le studio envoie le jeton, l'API Régie le valide (GET /utilisateurs/moi). Côté serveur uniquement
// (src/lib/api.ts tire Keycloak et ne s'importe pas ici).

const API_REGIE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003/api").replace(/\/+$/, "").replace(/(?<!\/api)$/, "/api");

/** L'e-mail de l'admin de la Régie derrière le jeton de la requête ; null si absent, invalide ou pas admin. */
export async function adminDeLaRequete(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  try {
    const r = await fetch(`${API_REGIE}/utilisateurs/moi`, { headers: auth ? { Authorization: auth } : {}, cache: "no-store" });
    if (!r.ok) return null;
    const moi = (await r.json()) as { email?: string; role?: string };
    return moi.role === "ADMIN" ? (moi.email ?? "admin") : null;
  } catch {
    return null;
  }
}
