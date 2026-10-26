/**
 * Preview-mode person catalogue.
 *
 * Persons are fetched live from the CakePHP backend
 * (/api/bibliotheques/content-menu?type_id=9). In prod the booth-ui and
 * CakePHP backend live on different domains, so `NEXT_PUBLIC_BACKEND_URL`
 * is used to hit the public endpoint directly. In dev the env var is
 * unset and the relative path falls through the Next.js rewrite proxy.
 */
export interface Person {
  id: string;
  url: string;
  thumbUrl?: string;
}

export const DEFAULT_PREVIEW_BG = "#A9DD33";

export interface PersonGroup {
  id: string;
  nom: string;
  slug: string;
  table: string;
  persons: Person[];
}

let cachedGroups: PersonGroup[] | null = null;
let inflight: Promise<PersonGroup[]> | null = null;

interface BibliothequeItem {
  id: number;
  file_url?: string;
  url_thumbnail?: string;
  url_md_thumbnail?: string;
  url_sm_thumbnail?: string;
  url_xs_thumbnail?: string;
}

interface ContentMenuEntry {
  id?: number | string;
  id_unique?: string;
  nom?: string;
  slug?: string;
  table?: string;
  bibliotheques?: BibliothequeItem[];
}

function bibToPerson(b: BibliothequeItem): Person | null {
  // `url` is the full-resolution image used on the canvas when selected;
  // `thumbUrl` is the smaller image used in the gallery preview only.
  const fullUrl = b.file_url || b.url_thumbnail || b.url_md_thumbnail || b.url_sm_thumbnail || b.url_xs_thumbnail;
  if (!fullUrl) return null;
  const thumb = b.url_xs_thumbnail || b.url_sm_thumbnail || b.url_thumbnail || fullUrl;
  return { id: String(b.id), url: fullUrl, thumbUrl: thumb };
}

export async function fetchPersonnesGrouped(): Promise<PersonGroup[]> {
  if (cachedGroups) return cachedGroups;
  if (inflight) return inflight;
  inflight = (async () => {
    // Group by theme — the API does the grouping when both
    // `is_active_filtre_par_categ=1` and `theme=true` are set.
    const res = await fetch(
      apiUrl(`/api/bibliotheques/content-menu?type_id=9&is_active_filtre_par_categ=1&theme=true`),
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: ContentMenuEntry[] };
    const data = Array.isArray(json.data) ? json.data : [];

    const groups: PersonGroup[] = data
      .map((g): PersonGroup => ({
        id: g.id_unique || String(g.id ?? g.slug ?? g.nom ?? Math.random()),
        nom: g.nom || "Sans nom",
        slug: g.slug || "",
        table: g.table || "",
        persons: (g.bibliotheques || [])
          .map(bibToPerson)
          .filter((p): p is Person => p !== null),
      }))
      .filter((g) => g.persons.length > 0);

    cachedGroups = groups;
    return groups;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

// ── Filtrage des thèmes par type d'événement (retour boss p.11) ──
// « Si c'est un mariage on ne va pas proposer un univers Diplôme. » On récupère
// l'occasion de la réservation et on ne PROPOSE QUE les univers pertinents
// (liste blanche). Basé sur les 23 thèmes réels du backend. Les clés d'occasion
// matchent par INCLUSION → « Mariage » / « Mariages » / « mariage » tombent sur
// la même liste. Occasion inconnue → aucun filtre (tous les thèmes).
const ALLOWED_THEMES_BY_OCCASION: Record<string, string[]> = {
  mariage: ['mariage', 'amour', 'amis', 'famille', 'anniversaire', 'chic', 'boisson', 'musique', 'jeunes', 'restauration', 'personnage'],
  anniversaire: ['anniversaire', 'amis', 'famille', 'boisson', 'musique', 'jeunes', 'enfance', 'chic', 'personnage', 'restauration', 'animal'],
  bapteme: ['baby shower', 'enfance', 'famille', 'amis', 'sante', 'personnage'],
  communion: ['enfance', 'famille', 'amis', 'ecole', 'personnage', 'sante'],
  entreprise: ['professionnel', 'chic', 'boisson', 'restauration', 'musique', 'amis', 'voyage', 'personnage'],
  professionnel: ['professionnel', 'chic', 'boisson', 'restauration', 'musique', 'amis', 'voyage', 'personnage'],
};

function normLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function allowedThemesFor(occasion: string | null): string[] | null {
  if (!occasion) return null;
  const o = normLabel(occasion);
  for (const [key, allowed] of Object.entries(ALLOWED_THEMES_BY_OCCASION)) {
    if (o.includes(key) || key.includes(o)) return allowed;
  }
  return null; // occasion inconnue → pas de filtre
}

/** Ne garde que les thèmes pertinents pour l'occasion (mariage, anniversaire…). */
export function filterThemesForEvent(
  groups: PersonGroup[],
  occasion?: string | null,
): PersonGroup[] {
  const allowed = allowedThemesFor(occasion ?? null);
  if (!allowed) return groups;
  const filtered = groups.filter((g) => {
    const name = normLabel(g.nom);
    return allowed.some((a) => name.includes(a) || a.includes(name));
  });
  // Filet de sécurité : si rien ne matche (libellés backend inattendus), on ne
  // casse pas l'UX → liste complète.
  return filtered.length > 0 ? filtered : groups;
}

// Occasion de la réservation, mise en cache par uuid (le studio la lit pour
// filtrer les thèmes de l'aperçu).
const eventTypeCache = new Map<string, string | null>();

export async function fetchEventType(uuid: string): Promise<string | null> {
  if (!uuid) return null;
  if (eventTypeCache.has(uuid)) return eventTypeCache.get(uuid) ?? null;
  try {
    // Chemin BRUT (pas apiUrl) : cet endpoint est sur l'app Next, pas sur le
    // backend éditeur — apiUrl le réécrirait en /editor-api/… (404).
    const res = await fetch(`/api/booking/${encodeURIComponent(uuid)}`, apiFetchOptions);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { booking?: { occasion?: string } };
    const occasion = json.booking?.occasion ?? null;
    eventTypeCache.set(uuid, occasion);
    return occasion;
  } catch {
    eventTypeCache.set(uuid, null);
    return null;
  }
}

// ── Backgrounds gallery (fonds-verts and similar typeSlugs) ──
//
// Pulled from the selfizee-backend's /api/bibliotheques/backgrounds endpoint,
// which returns any Bibliotheque of the requested type that the user owns
// OR that's flagged isPublic. Used by the preview-mode bg picker so the
// user can choose between a solid colour and an image background.

export interface BackgroundItem {
  id: string;
  name: string;
  url: string;
  thumbUrl?: string;
}

import { apiUrl, apiFetchOptions } from "@/studio/lib/api";

const backgroundsCache = new Map<string, BackgroundItem[]>();
const backgroundsInflight = new Map<string, Promise<BackgroundItem[]>>();

interface BackgroundsResponseItem {
  id: string;
  name: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}

// The /api/bibliotheques/backgrounds endpoint now returns absolute URLs
// (resolved server-side from PUBLIC_API_URL or the request host), so the
// client doesn't need to reconstruct them from NEXT_PUBLIC_API_URL —
// which isn't reliably set at build time in every deployment. Keep a
// trivial pass-through for legacy/relative payloads in case the backend
// hasn't been updated yet.
const BACKEND_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

function resolveBackgroundUrl(u: string | null): string | null {
  if (!u) return null;
  // Fonds uploadés côté Kalifun = data URLs → à laisser telles quelles.
  if (/^(https?:\/\/|data:|blob:)/i.test(u)) return u;
  if (BACKEND_BASE) return `${BACKEND_BASE}${u.startsWith("/") ? "" : "/"}${u}`;
  return u.startsWith("/") ? u : `/${u}`;
}

export async function fetchBackgrounds(typeSlug: string): Promise<BackgroundItem[]> {
  const cached = backgroundsCache.get(typeSlug);
  if (cached) return cached;
  const pending = backgroundsInflight.get(typeSlug);
  if (pending) return pending;
  const endpoint = apiUrl(`/api/bibliotheques/backgrounds?typeSlug=${encodeURIComponent(typeSlug)}`);
  console.log("[backgrounds] fetching", { endpoint, typeSlug });
  // 15 s hard timeout so a hanging proxy / DNS issue can't leave the
  // gallery stuck on the skeleton forever — the caller sees a rejection
  // and renders an error message instead.
  const ctl = new AbortController();
  const timeoutId = setTimeout(() => ctl.abort(), 15000);
  const promise = (async () => {
    try {
      const res = await fetch(endpoint, { ...apiFetchOptions, signal: ctl.signal });
      console.log("[backgrounds] response", { status: res.status, ok: res.ok });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items?: BackgroundsResponseItem[] };
      console.log("[backgrounds] raw items", json.items?.length ?? 0, json.items?.[0]);
      const items: BackgroundItem[] = (json.items || [])
        .map((it): BackgroundItem | null => {
          const url = resolveBackgroundUrl(it.imageUrl);
          if (!url) return null;
          const thumb = resolveBackgroundUrl(it.thumbnailUrl) || url;
          return { id: it.id, name: it.name, url, thumbUrl: thumb };
        })
        .filter((it): it is BackgroundItem => it !== null);
      console.log("[backgrounds] resolved items", items.length, items[0]);
      backgroundsCache.set(typeSlug, items);
      return items;
    } finally {
      clearTimeout(timeoutId);
    }
  })();
  backgroundsInflight.set(typeSlug, promise);
  try {
    return await promise;
  } finally {
    backgroundsInflight.delete(typeSlug);
  }
}

/** Vide le cache des fonds (après upload/suppression) pour forcer un refetch. */
export function invalidateBackgroundsCache(): void {
  backgroundsCache.clear();
  backgroundsInflight.clear();
}

/** Upload d'un fond vert (data URL) lié au compte client. */
export async function uploadBackground(input: {
  name?: string;
  imageDataUrl: string;
  thumbnailDataUrl?: string;
}): Promise<void> {
  const res = await fetch(apiUrl(`/api/bibliotheques/backgrounds`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = `Envoi du fond échoué (HTTP ${res.status})`;
    try {
      const b = (await res.json()) as { message?: string };
      if (b?.message) msg = b.message;
    } catch {
      /* pas de corps JSON */
    }
    throw new Error(msg);
  }
  invalidateBackgroundsCache();
}

/** Suppression d'un fond vert du compte client. */
export async function deleteBackgroundApi(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/bibliotheques/backgrounds/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Suppression échouée (HTTP ${res.status})`);
  invalidateBackgroundsCache();
}
