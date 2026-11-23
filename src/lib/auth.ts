import type Keycloak from "keycloak-js";

// Même fonctionnement que l'API : sans NEXT_PUBLIC_KEYCLOAK_URL (dev local), pas d'authentification.
export const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? "";
export const authActive = KEYCLOAK_URL !== "";
const REALM_SALARIES = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || "konitys";
// Realm des clients de la Régie (option 2 du 20/11/2026) : vide, pas de connexion client (accueil direct vers konitys)
const REALM_CLIENTS = (process.env.NEXT_PUBLIC_KEYCLOAK_REGIE_REALM ?? "").trim();
export const connexionClientsActive = authActive && REALM_CLIENTS !== "" && REALM_CLIENTS !== REALM_SALARIES;

/** Sorte de compte choisie à l'accueil : salarié (realm konitys) ou client de la Régie (realm « regie ») */
export type SorteCompte = "salarie" | "client";
const CLE_COMPTE = "regie.compte";
let compteMemoire: SorteCompte | null = null;

/** Choix retenu : lien d'invitation (?compte=client), sinon stockage du navigateur ; null tant que rien n'est choisi */
export function compteChoisi(): SorteCompte | null {
  if (!connexionClientsActive) return "salarie";
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("compte");
  if (param === "client" || param === "salarie") {
    choisirCompte(param);
    return param;
  }
  if (compteMemoire) return compteMemoire;
  try {
    const v = localStorage.getItem(CLE_COMPTE);
    return v === "client" || v === "salarie" ? v : null;
  } catch {
    return null;
  }
}

export function choisirCompte(c: SorteCompte | null) {
  compteMemoire = c;
  try {
    if (c) localStorage.setItem(CLE_COMPTE, c);
    else localStorage.removeItem(CLE_COMPTE);
  } catch {
    /* stockage indisponible : le choix reste en mémoire (et dans l'adresse de retour de Keycloak) */
  }
}

/** Vrai pour un client de la Régie connecté : pas d'en-tête ni de droits de la plateforme Konitys */
export const estCompteClient = () => connexionClientsActive && compteChoisi() === "client";

/** Déconnexion, retour à l'accueil (et au choix salarié / client) */
export async function deconnecter() {
  const kc = instance;
  choisirCompte(null);
  if (kc) await kc.logout({ redirectUri: `${window.location.origin}/` });
  else window.location.assign("/");
}

let instance: Keycloak | null = null;

/** Initialise Keycloak (une seule fois) et force la connexion ; loginHint pré-remplit l'e-mail tapé à l'accueil. */
export async function initialiserAuth(compte: SorteCompte = "salarie", loginHint?: string): Promise<Keycloak> {
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
    realm: compte === "client" ? REALM_CLIENTS : REALM_SALARIES,
    clientId: compte === "client" ? process.env.NEXT_PUBLIC_KEYCLOAK_REGIE_CLIENT_ID || "regie-selfizee" : process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || "regie-selfizee",
  });
  // Pas de onLoad « login-required » : il ne transmet pas l'e-mail à Keycloak. init lit le retour de Keycloak,
  // puis on lance la connexion nous-mêmes si personne n'est connecté.
  const redirectUri = avecCompte(window.location.href, compte);
  await kc.init({
    checkLoginIframe: false,
    // Pas de "scope" explicite : Keycloak répond invalid_scope si un scope demandé n'est pas
    // rattaché au client. L'e-mail (indispensable à l'API) vient du scope "email" en Default sur le client.
    // PKCE (S256) a besoin de crypto.subtle, absent en http
    pkceMethod: securise ? "S256" : false,
    // Retour de Keycloak : garder la sorte de compte dans l'adresse si le navigateur ne la stocke pas
    redirectUri,
  });
  if (!kc.authenticated) {
    await kc.login({ redirectUri, loginHint: loginHint || undefined });
    return new Promise<Keycloak>(() => undefined); // la page part vers Keycloak
  }
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

/** Adresse de retour avec ?compte=client, seulement si le navigateur ne retient pas le choix (stockage bloqué) */
function avecCompte(adresse: string, compte: SorteCompte): string {
  if (compte !== "client") return adresse;
  try {
    if (localStorage.getItem(CLE_COMPTE) === "client") return adresse;
  } catch {
    /* stockage indisponible : on passe par l'adresse */
  }
  const u = new URL(adresse);
  u.searchParams.set("compte", "client");
  return u.toString();
}
