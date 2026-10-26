import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /editor-api/remove-bg → détourage.
 * Pas encore branché sur un provider (remove.bg, rembg local, …). Renvoie 501
 * avec un message clair au lieu d'un 500 opaque. À implémenter avec un token
 * dédié quand le fournisseur sera choisi.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'remove_bg_not_configured', message: 'Le détourage n’est pas encore configuré.' },
    { status: 501 },
  );
}
