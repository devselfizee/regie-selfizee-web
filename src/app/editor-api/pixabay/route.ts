import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /editor-api/pixabay?query=&per_page=&page=&image_type=&color=
 * Proxy Pixabay : ajoute la clé serveur (PIXABAY_API_KEY) et relaie la réponse
 * telle quelle (déjà { hits: [{ id, previewURL, webformatURL, largeImageURL, tags }] }).
 * Sans clé ou sans requête → { hits: [] }.
 */
export async function GET(req: Request) {
  const key = process.env.PIXABAY_API_KEY;
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get('query') || '').trim().slice(0, 100);
  const perPage = searchParams.get('per_page') || '60';
  const page = searchParams.get('page') || '1';
  const imageType = searchParams.get('image_type') || 'all';
  const color = searchParams.get('color') || '';

  if (!key || !query) return NextResponse.json({ hits: [] });

  try {
    const params = new URLSearchParams({
      key,
      q: query,
      per_page: perPage,
      page,
      image_type: imageType,
      safesearch: 'true',
    });
    if (color) params.set('colors', color);
    const res = await fetch(`https://pixabay.com/api/?${params.toString()}`);
    if (!res.ok) return NextResponse.json({ hits: [], error: `pixabay_${res.status}` });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ hits: [], error: 'pixabay_unreachable' });
  }
}
