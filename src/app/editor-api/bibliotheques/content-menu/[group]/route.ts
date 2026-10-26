import { NextResponse } from 'next/server';
import { boothBibliothequesGet } from '@/studio/lib/boothApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /editor-api/bibliotheques/content-menu/[group]?type_id=1&…
 * Proxy serveur vers le CakePHP de production, variante avec un segment de
 * chemin (groupe/client — ex. /content-menu/1 = catalogue Selfizee). On relaie
 * le chemin + la query string tels quels, côté serveur (évite le CORS).
 */
// Cet endpoint Cake est TRÈS lourd (~2 min à froid). On garde la réponse en
// mémoire (par path+query) 30 min → seul le 1er accès paie le coût. Coolify =
// serveur Node persistant, le cache module-level survit entre requêtes.
const TTL_MS = 30 * 60 * 1000;
const memCache = new Map<string, { at: number; data: unknown }>();

export async function GET(req: Request, { params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  const { search } = new URL(req.url);
  const key = `${group}${search}`;

  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'HIT' } });
  }

  try {
    const res = await boothBibliothequesGet(
      `/content-menu/${encodeURIComponent(group)}${search}`,
    );
    if (!res.ok) {
      // Le booth exige désormais une auth sur cet endpoint (401) — sers le
      // dernier bon cache, même périmé, plutôt qu'une liste vide qui casse le
      // catalogue. Ne rien mettre en cache sur une réponse d'erreur.
      if (hit) return NextResponse.json(hit.data, { headers: { 'X-Cache': 'STALE' } });
      return NextResponse.json({ data: [], error: `content_menu_${res.status}` }, { status: 200 });
    }
    const data = await res.json();
    memCache.set(key, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'MISS' } });
  } catch {
    // Repli sur le cache périmé plutôt que rien, si dispo.
    if (hit) return NextResponse.json(hit.data, { headers: { 'X-Cache': 'STALE' } });
    return NextResponse.json({ data: [], error: 'content_menu_unreachable' }, { status: 200 });
  }
}
