/**
 * UUID v4 robuste — fonctionne en HTTP **et** HTTPS.
 *
 * `crypto.randomUUID()` n'est exposé qu'en « contexte sécurisé » (HTTPS ou
 * localhost). En HTTP (ex. déploiement Coolify sans TLS), il est absent et
 * lève `crypto.randomUUID is not a function`. On le reconstruit alors via
 * `crypto.getRandomValues` (disponible partout), avec repli ultime non
 * cryptographique (suffisant pour des identifiants d'UI).
 */
export function safeRandomUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; // version 4
      b[8] = (b[8] & 0x3f) | 0x80; // variant
      const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
      return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
    }
  } catch {
    /* repli ci-dessous */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
