import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Génération d'image du panneau IA. Dans Kalifun, ce proxy payant (Gemini) exige la session du
 * client ; les routes du studio de la Régie ne voient pas le jeton Keycloak : désactivé tant
 * qu'il ne passe pas par l'API Régie authentifiée.
 */
export async function POST() {
  return NextResponse.json({ error: "La génération d'images n'est pas encore disponible dans la Régie." }, { status: 501 });
}
