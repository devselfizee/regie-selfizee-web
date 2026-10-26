import { NextResponse } from 'next/server';
import { boothBibliothequesGet } from '@/studio/lib/boothApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /editor-api/bibliotheques/content-menu?type_id=9&theme=true&…
 * Proxy serveur vers le CakePHP de production. Sert la « liste de personnes »
 * (type_id=9) groupée par thème pour le mode Aperçu du studio. Même source que
 * l'ancien booth ; on relaie côté serveur pour éviter le CORS et pour porter
 * le JWT du compte de service (endpoint authentifié depuis le 2026-09-07).
 * Réponse relayée telle quelle ({ data: [...] }).
 */
export async function GET(req: Request) {
  const { search } = new URL(req.url);
  try {
    const res = await boothBibliothequesGet(`/content-menu${search}`);
    if (!res.ok) return NextResponse.json({ data: [], error: `content_menu_${res.status}` }, { status: 200 });
    const data = await res.json();
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return NextResponse.json({ data: [], error: 'content_menu_unreachable' }, { status: 200 });
  }
}
