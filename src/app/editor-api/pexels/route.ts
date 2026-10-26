import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /editor-api/pexels?query=&per_page=&page=
 * Proxy Pexels : ajoute la clé serveur (PEXELS_API_KEY) et relaie la réponse
 * telle quelle (déjà de forme { photos: [{ id, src:{tiny,medium,large}, alt }] }).
 * Sans clé ou sans requête → { photos: [] } (panneau vide, pas d'erreur).
 */
export async function GET(req: Request) {
  const key = process.env.PEXELS_API_KEY;
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('query') || '').trim();
  const perPage = searchParams.get('per_page') || '40';
  const page = searchParams.get('page') || '1';

  if (!key || !query) return NextResponse.json({ photos: [] });

  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${encodeURIComponent(perPage)}&page=${encodeURIComponent(page)}`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) return NextResponse.json({ photos: [], error: `pexels_${res.status}` });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ photos: [], error: 'pexels_unreachable' });
  }
}
