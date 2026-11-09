"use client";

// Droits Konitys côté front — voir docs/PERMISSIONS_APP_INTEGRATION.md (5.2, porté en Next.js / TypeScript).
// S'appuie sur le SDK du gateway (window.__KONITYS_PERMS). Tout est « autorisé » le temps que le SDK charge,
// et sans NEXT_PUBLIC_GATEWAY_URL (comportement du code de référence) : le contrôle qui compte est celui de l'API.

import { cloneElement, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { jeton } from "./auth";

export const APP_KEY = "regie";
export const GATEWAY_URL = (process.env.NEXT_PUBLIC_GATEWAY_URL ?? "").replace(/\/$/, "");

interface SdkDroits {
  configure: (o: { token: string }) => void;
  refresh: () => void;
  has: (cle: string) => boolean;
  onChange: (fn: () => void) => () => void;
}

declare global {
  interface Window {
    __KONITYS_PERMS?: SdkDroits;
    __KONITYS_AUTH?: { token: string };
  }
}

let sdkCharge = false;

export function loadPermsSDK({ token, gatewayUrl }: { token: string; gatewayUrl: string }) {
  if (!token || !gatewayUrl) return;
  if (sdkCharge && window.__KONITYS_PERMS) {
    window.__KONITYS_PERMS.configure({ token });
    window.__KONITYS_PERMS.refresh();
    return;
  }
  if (sdkCharge) return; // script en cours de chargement
  sdkCharge = true;
  window.__KONITYS_AUTH = { token };
  const s = document.createElement("script");
  s.src = `${gatewayUrl.replace(/\/$/, "")}/sdk/konitys-perms.js?t=${Date.now()}`;
  s.setAttribute("data-gateway", gatewayUrl);
  s.setAttribute("data-token", token);
  s.setAttribute("data-app", APP_KEY); // attribut lu par le SDK : data-app
  s.async = true;
  document.body.appendChild(s);
}

/** Charge le SDK dès que le jeton Keycloak existe, puis le reconfigure à chaque rafraîchissement du jeton (4 min). */
export function ChargeurDroits() {
  useEffect(() => {
    if (!GATEWAY_URL) return;
    const maj = () =>
      jeton()
        .then((t) => t && loadPermsSDK({ token: t, gatewayUrl: GATEWAY_URL }))
        .catch(() => undefined);
    maj();
    const iv = setInterval(maj, 4 * 60_000);
    return () => clearInterval(iv);
  }, []);
  return null;
}

const getSDK = () => (typeof window !== "undefined" ? (window.__KONITYS_PERMS ?? null) : null);

/** Le SDK, une fois chargé ; le composant se redessine quand les droits changent */
function useSdk(): SdkDroits | null {
  const [sdk, setSdk] = useState<SdkDroits | null>(getSDK);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!sdk) {
      if (!GATEWAY_URL) return; // pas de SDK attendu : tout est autorisé
      const iv = setInterval(() => {
        const cur = getSDK();
        if (cur) {
          clearInterval(iv);
          setSdk(cur);
        }
      }, 100);
      return () => clearInterval(iv);
    }
    return sdk.onChange(() => setTick((t) => t + 1));
  }, [sdk]);
  return sdk;
}

/** Fonction de test des droits, pour plusieurs clés dans un même composant (menu, onglets…) */
export function useDroits(): (permKey: string | null | undefined) => boolean {
  const sdk = useSdk();
  return (permKey) => !sdk || !permKey || sdk.has(permKey);
}

export function usePerm(permKey: string | null | undefined): boolean {
  return useDroits()(permKey);
}

/** Affiche son contenu seulement si le droit est accordé (repère data-perm ajouté pour la relecture). */
export function Gate({ perm, children, fallback = null }: { perm: string; children: ReactNode; fallback?: ReactNode }) {
  const allowed = usePerm(perm);
  if (!allowed) return <>{fallback}</>;
  if (isValidElement(children)) {
    const el = children as ReactElement<Record<string, unknown>>;
    const existing = el.props["data-perm"];
    return cloneElement(el, { "data-perm": existing || `${APP_KEY}:${perm}` });
  }
  return <>{children}</>;
}

/** Page protégée : renvoie sur /403 si le droit est refusé (avec une liste : l'un des droits suffit). */
export function PageGuard({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const a = useDroits();
  const allowed = (Array.isArray(perm) ? perm : [perm]).some((p) => a(p));
  const router = useRouter();
  useEffect(() => {
    if (!allowed) router.replace("/403");
  }, [allowed, router]);
  if (!allowed) return null;
  return <>{children}</>;
}
