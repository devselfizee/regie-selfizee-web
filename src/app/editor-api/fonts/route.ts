import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /editor-api/fonts → polices personnalisées.
 * Aucune police custom côté Kalifun pour l'instant : le studio garde ses
 * polices intégrées (FONT_LIST) + Google Fonts. Renvoie une liste vide.
 */
export async function GET() {
  return NextResponse.json({ fonts: [] });
}
