import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /editor-api/bibliotheques/external?names=Poppins-SemiBold,MONTSERRAT,…
 * Proxy serveur vers le CakePHP de production. Résout des noms de polices
 * « booth » (celles référencées par les modèles du catalogue Selfizee) vers
 * leurs fichiers hébergés. Réponse : { fonts: [{ fileName, displayName, url }] }.
 *
 * On relaie côté serveur (comme content-menu / options) : évite le CORS ET le
 * Mixed Content en prod HTTP — le fetch sortant part du Node, invisible pour
 * le navigateur. Sans cette route, l'appel tombait sur /api/bibliotheques/…
 * (aucun rewrite côté Kalifun) → 404 → aucune police chargée.
 */
const MODELS_BACKEND = (process.env.MODELS_BACKEND_URL || 'https://booth.selfizee.fr').replace(/\/$/, '');

// Les noms de polices se répètent massivement d'un modèle à l'autre et la
// résolution nom→fichier est stable. On garde la réponse en mémoire 30 min
// (par jeu de noms) — Coolify = serveur Node persistant, le cache survit.
const TTL_MS = 30 * 60 * 1000;
const memCache = new Map<string, { at: number; data: unknown }>();

export async function GET(req: Request) {
  const { search } = new URL(req.url);
  const key = search;

  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'HIT' } });
  }

  try {
    const res = await fetch(`${MODELS_BACKEND}/api/bibliotheques/external${search}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return NextResponse.json({ fonts: [], error: `external_${res.status}` }, { status: 200 });
    const data = await res.json();
    memCache.set(key, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'MISS' } });
  } catch {
    if (hit) return NextResponse.json(hit.data, { headers: { 'X-Cache': 'STALE' } });
    return NextResponse.json({ fonts: [], error: 'external_unreachable' }, { status: 200 });
  }
}
