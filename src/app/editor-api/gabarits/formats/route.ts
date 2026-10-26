import { NextResponse } from 'next/server';
import { FORMATS } from '@/studio/lib/gabarits';

export const dynamic = 'force-dynamic';

/**
 * GET /editor-api/gabarits/formats?typeSlug=cadres
 * Catalogue de formats du studio. Servi nativement à partir des FORMATS
 * statiques (lib/gabarits) — plus de backend externe. `typeSlug` autre que
 * "cadres" renvoie la même liste (seuls les cadres sont gérés pour l'instant).
 */
export async function GET() {
  return NextResponse.json({ formats: FORMATS });
}
