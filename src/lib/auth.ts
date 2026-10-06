import type Keycloak from "keycloak-js";

// Même fonctionnement que l'API : sans NEXT_PUBLIC_KEYCLOAK_URL (dev local), pas d'authentification.
export const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "";
export const authActive = KEYCLOAK_URL !== "";

let instance: Keycloak | null = null;

/** Initialise Keycloak (une seule fois) et force la connexion. */
export async function initialiserAuth(): Promise<Keycloak> {
  if (instance) return instance;
  const securise = window.isSecureContext;
  if (!securise) {
    // PROVISOIRE (déploiement en http, sans nom de domaine) : le navigateur ne fournit
    // crypto.randomUUID qu'en HTTPS, et keycloak-js en a besoin. getRandomValues, lui,
    // reste disponible en http. À retirer dès que le front est servi en HTTPS.
    console.warn("Front servi en HTTP : connexion Keycloak sans PKCE (provisoire)");
    if (!crypto.randomUUID) {
      Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        value: () => {
          const o = crypto.getRandomValues(new Uint8Array(16));
          o[6] = (o[6] & 0x0f) | 0x40; // version 4
          o[8] = (o[8] & 0x3f) | 0x80; // variante RFC 4122
          const h = [...o].map((b) => b.toString(16).padStart(2, "0")).join("");
          return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
        },
      });
    }
  }
  const { default: KeycloakJs } = await import("keycloak-js");
  const kc = new KeycloakJs({
    url: KEYCLOAK_URL,
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "konitys",
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || "regie-selfizee",
  });
  await kc.init({
    onLoad: "login-required",
    checkLoginIframe: false,
    // Pas de "scope" explicite : Keycloak répond invalid_scope si un scope demandé n'est pas
    // rattaché au client. L'e-mail (indispensable à l'API) vient du scope "email" en Default sur le client.
    // PKCE (S256) a besoin de crypto.subtle, absent en http
    pkceMethod: securise ? "S256" : false,
  });
  instance = kc;
  return kc;
}

export const keycloak = () => instance;

/** Jeton d'accès valide (rafraîchi s'il expire dans moins de 30 s). */
export async function jeton(): Promise<string | null> {
  if (!authActive || !instance) return null;
  try {
    await instance.updateToken(30);
  } catch {
    await instance.login();
  }
  return instance.token ?? null;
}
