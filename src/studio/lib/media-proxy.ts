/**
 * Proxy CORS pour les médias Selfizee (images de modèles, polices).
 *
 * Les hôtes CakePHP (booth.selfizee.fr, static-media-booth.selfizee.fr, …) ne
 * renvoient plus d'en-tête CORS ; fabric charge les images en
 * crossOrigin="anonymous" → le navigateur les bloque. On relaie les octets
 * côté serveur avec un CORS permissif. Allowlist stricte = anti-SSRF.
 */
import { NextResponse } from 'next/server';

const ALLOWED_HOSTS = new Set([
  'booth.selfizee.fr',
  'static-media-booth.selfizee.fr',
  'www.selfizee.fr',
  'selfizee.fr',
]);

export async function proxyMedia(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('url');
  if (!target) return NextResponse.json({ error: 'url requis' }, { status: 400 });

  let host: string;
  try {
    host = new URL(target).hostname;
  } catch {
    return NextResponse.json({ error: 'url invalide' }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(host)) {
    return NextResponse.json({ error: 'host non autorisé' }, { status: 403 });
  }

  try {
    const upstream = await fetch(target);
    if (!upstream.ok) {
      return NextResponse.json({ error: `upstream_${upstream.status}` }, { status: upstream.status });
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'unreachable' }, { status: 502 });
  }
}
