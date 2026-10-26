import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Pas de fonds personnalisés dans la Régie pour l'instant (voir ../route.ts). */
export async function DELETE() {
  return NextResponse.json({ error: "Les fonds personnalisés ne sont pas encore disponibles dans la Régie." }, { status: 501 });
}
