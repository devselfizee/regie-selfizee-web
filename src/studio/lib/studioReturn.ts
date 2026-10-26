/**
 * « D'où vient-on ? » entre l'espace client et le studio.
 *
 * Quitter le studio par `router.push('/espace/…')` empile une nouvelle entrée :
 * la page se remonte à zéro et le client perd l'endroit où il lisait. Revenir
 * par l'historique laisse le navigateur restaurer la position de défilement
 * exacte, images comprises — ce qu'aucune restauration manuelle ne fait aussi
 * bien.
 *
 * Encore faut-il qu'il y ait quelque chose derrière : le studio peut être
 * ouvert par un lien direct, un nouvel onglet ou un signet. L'espace pose donc
 * un marqueur avant d'ouvrir le studio, et le studio le consomme au retour.
 * Pas de marqueur → on retombe sur une navigation classique.
 *
 * `sessionStorage` est propre à l'onglet, ce qui est exactement la portée
 * voulue, et peut lever (navigation privée, cookies bloqués) : tout est gardé.
 */
const KEY = 'kalifun:studio-from-espace';

/** L'espace client s'apprête à ouvrir le studio pour cette réservation. */
export function markStudioOpenedFromEspace(uuid: string): void {
  try {
    sessionStorage.setItem(KEY, uuid);
  } catch {
    // Stockage indisponible : le studio retombera sur un push, sans casse.
  }
}

/**
 * Le studio peut-il ressortir par l'historique pour cette réservation ?
 * Consomme le marqueur : un second retour repartira sur un push.
 */
export function consumeStudioReturnToEspace(uuid: string): boolean {
  try {
    const from = sessionStorage.getItem(KEY);
    if (from !== uuid) return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
