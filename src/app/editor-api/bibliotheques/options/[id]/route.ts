import { NextResponse } from 'next/server';
import { boothBibliothequesGet } from '@/studio/lib/boothApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /editor-api/bibliotheques/options/[id] → options/scène d'un modèle.
 * Proxy serveur vers le CakePHP de production (public).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  try {
    const res = await boothBibliothequesGet(`/options/${id}`);
    if (!res.ok) return NextResponse.json({ error: `options_${res.status}` }, { status: res.status });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'options_unreachable' }, { status: 502 });
  }
}
