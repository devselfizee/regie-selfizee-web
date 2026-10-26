import { NextResponse } from 'next/server';
import { boothBibliothequesGet } from '@/studio/lib/boothApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /editor-api/bibliotheques/catalogue → catalogue des modèles Selfizee.
 * Proxy serveur vers le CakePHP de production, même source que l'ancien
 * booth. L'endpoint exige un JWT depuis le 2026-09-07 : l'appel passe par
 * boothBibliothequesGet, qui porte le compte de service.
 * Réponse relayée telle quelle ({ data: [...] }).
 */
export async function GET() {
  try {
    const res = await boothBibliothequesGet('/catalogue');
    if (!res.ok) return NextResponse.json({ data: [], error: `catalogue_${res.status}` }, { status: 200 });
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return NextResponse.json({ data: [], error: 'catalogue_unreachable' }, { status: 200 });
  }
}
