import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Fonds verts du mode Aperçu du studio. Dans Kalifun, ils sont liés au compte client
 * (table preview_backgrounds) ; la Régie n'a pas encore de stockage pour eux : liste vide.
 */
export async function GET() {
  return NextResponse.json({ items: [] });
}

export async function POST() {
  return NextResponse.json({ error: "Les fonds personnalisés ne sont pas encore disponibles dans la Régie." }, { status: 501 });
}
