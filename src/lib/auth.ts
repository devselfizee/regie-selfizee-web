import type Keycloak from "keycloak-js";

// Même fonctionnement que l'API : sans NEXT_PUBLIC_KEYCLOAK_URL (dev local), pas d'authentification.
export const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "";
export const authActive = KEYCLOAK_URL !== "";

let instance: Keycloak | null = null;

/** Initialise Keycloak (une seule fois) et force la connexion. */
export async function initialiserAuth(): Promise<Keycloak> {
  if (instance) return instance;
  const { default: KeycloakJs } = await import("keycloak-js");
  const kc = new KeycloakJs({
    url: KEYCLOAK_URL,
    realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "konitys",
    clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || "regie-selfizee",
  });
  await kc.init({
    onLoad: "login-required",
    checkLoginIframe: false,
    // PKCE a besoin de Web Crypto, disponible seulement en HTTPS (ou localhost)
    pkceMethod: window.isSecureContext ? "S256" : false,
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
