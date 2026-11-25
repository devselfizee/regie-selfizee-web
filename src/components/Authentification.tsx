"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { API_URL } from "@/lib/api";
import { authActive, choisirCompte, compteChoisi, connexionClientsActive, initialiserAuth, sessionOuverte, type SorteCompte } from "@/lib/auth";

/**
 * N'affiche l'application qu'une fois l'utilisateur connecté via Keycloak. Avec la connexion des clients (realm
 * « regie », option 2 du 20/11/2026), l'accueil demande l'e-mail et envoie vers la bonne connexion : salarié ou client.
 */
export function Authentification({ children }: { children: ReactNode }) {
  // Compte retenu : session trouvée, ou choix fait à l'accueil (avec l'e-mail tapé)
  // Sans connexion des clients : pas d'accueil, connexion salarié directe (comme avant)
  const [choixClic, setCompte] = useState<{ compte: SorteCompte; email?: string } | null>(connexionClientsActive ? null : { compte: "salarie" });
  const compte = choixClic?.compte ?? null;
  const [etat, setEtat] = useState<"attente" | "ok" | "erreur">(authActive ? "attente" : "ok");
  // Avant l'accueil : session déjà ouverte sur le realm du choix gardé par le navigateur (salarié par défaut) ?
  const [sso, setSso] = useState<"verification" | "absente">("verification");

  useEffect(() => {
    if (!authActive || !connexionClientsActive || sso !== "verification") return;
    const cible = compteChoisi() ?? "salarie";
    let fini = false;
    sessionOuverte(cible).then((ouverte) => {
      if (fini) return;
      if (ouverte) setCompte({ compte: cible });
      else {
        // Pas de session : le choix gardé ne décide plus, l'e-mail tapé à l'accueil choisira la connexion
        choisirCompte(null);
        setSso("absente");
      }
    });
    return () => {
      fini = true;
    };
  }, [sso]);

  useEffect(() => {
    if (!authActive || !compte) return;
    initialiserAuth(compte, choixClic?.email)
      .then(() => setEtat("ok"))
      .catch((err) => {
        console.error("Keycloak :", err);
        setEtat("erreur");
      });
  }, [compte, choixClic?.email]);

  if (authActive && !compte && sso === "verification") {
    return <p className="w-full py-20 text-center text-sm text-ink-muted">Connexion…</p>;
  }
  if (authActive && !compte) {
    return (
      <AccueilConnexion
        onChoix={(c, email) => {
          choisirCompte(c);
          setCompte({ compte: c, email });
        }}
      />
    );
  }
  if (etat === "attente") {
    return <p className="w-full py-20 text-center text-sm text-ink-muted">Connexion…</p>;
  }
  if (etat === "erreur") {
    return (
      <div className="w-full py-20 text-center text-sm text-ink-2">
        Erreur d&apos;authentification.{" "}
        <button type="button" className="text-accent underline" onClick={() => window.location.reload()}>Réessayer</button>
        <div className="mt-3">
          <button
            type="button"
            className="text-xs text-ink-muted underline"
            onClick={() => {
              choisirCompte(null);
              window.location.assign("/");
            }}
          >
            Se connecter avec une autre adresse
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

// Valeurs reprises du thème Keycloak « konitys » (login/konitys/css/konitys.css) : la page ressemble à celle qui suit
const BOUTON =
  "mt-2 w-full rounded-xl bg-[linear-gradient(135deg,#fe0154_0%,#e50049_100%)] px-6 py-[13px] text-[15px] font-semibold tracking-[0.02em] text-white transition hover:-translate-y-px hover:bg-[linear-gradient(135deg,#e50049_0%,#cc0040_100%)] disabled:opacity-60";
const CHAMP =
  "box-border w-full rounded-xl border-[1.5px] border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-sm text-[#1e293b] outline-none transition placeholder:text-[#94a3b8] focus:border-[#fe0154] focus:bg-white focus:shadow-[0_0_0_3px_rgba(254,1,84,0.1)]";
const LIBELLE = "mb-1.5 block text-[13px] font-semibold tracking-[0.01em] text-[#334155]";
const URL_CONNEXION = `${API_URL.replace(/\/api$/, "")}/public/v1/connexion`;

/** Accueil : l'e-mail décide de la connexion (salariés : realm konitys ; clients : realm « regie ») */
function AccueilConnexion({ onChoix }: { onChoix: (c: SorteCompte, email: string) => void }) {
  const [email, setEmail] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [deuxComptes, setDeuxComptes] = useState(false);

  async function continuer(e: FormEvent) {
    e.preventDefault();
    const adresse = email.trim();
    if (!adresse) return;
    // Nom d'utilisateur (sans @) : seuls les salariés en ont, les clients se connectent par e-mail
    if (!adresse.includes("@")) return onChoix("salarie", adresse);
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await fetch(URL_CONNEXION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adresse }),
      });
      if (r.status === 429) throw new Error("Trop d'essais. Réessayez dans quelques minutes.");
      if (r.status === 400) throw new Error("Cette adresse e-mail n'est pas valide.");
      if (!r.ok) throw new Error("Connexion impossible pour le moment. Réessayez.");
      const { compte } = (await r.json()) as { compte: SorteCompte | "choix" };
      if (compte === "choix") setDeuxComptes(true);
      else onChoix(compte, adresse);
    } catch (err) {
      setErreur(err instanceof Error && err.message ? err.message : "Connexion impossible pour le moment. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-[#EBF0FA] p-4"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif" }}
    >
      {/* Même police que le thème Keycloak (chargée là-bas depuis Google Fonts) ; React place la feuille dans <head> */}
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      <div className="w-full max-w-[420px] rounded-3xl bg-white px-10 pb-10 pt-12 shadow-[0_4px_6px_-1px_rgba(254,1,84,0.08),0_20px_50px_-12px_rgba(254,1,84,0.15),0_0_0_1px_rgba(254,1,84,0.06)] max-[480px]:rounded-[20px] max-[480px]:px-6 max-[480px]:pb-7 max-[480px]:pt-8">
        <div className="mb-8 text-center">
          <Image src="/konitys-logo.png" alt="Konitys" width={200} height={46} className="mx-auto h-[38px] w-auto max-[480px]:h-8" priority />
          <p className="mt-2 text-sm tracking-[0.01em] text-[#94a3b8]">Plateforme de gestion</p>
        </div>
        {deuxComptes ? (
          <div>
            <p className={LIBELLE}>Cette adresse a deux comptes. Lequel utiliser ?</p>
            <div className="mt-4 grid gap-3">
              <button type="button" className={BOUTON} onClick={() => onChoix("client", email.trim())}>
                Mon compte client
              </button>
              <button
                type="button"
                className="w-full rounded-xl border-[1.5px] border-[#fe0154] bg-white px-6 py-[11px] text-sm font-semibold text-[#fe0154] transition hover:border-[#e50049] hover:bg-[#fff0f5]"
                onClick={() => onChoix("salarie", email.trim())}
              >
                Mon compte salarié Selfizee
              </button>
            </div>
            <p className="mt-5 text-center text-[13px]">
              <button type="button" className="font-medium text-[#fe0154] hover:text-[#cc0040] hover:underline" onClick={() => setDeuxComptes(false)}>
                Changer d&apos;adresse
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={continuer}>
            <div className="mb-5">
              <label className={LIBELLE} htmlFor="email-connexion">Nom d&apos;utilisateur ou courriel</label>
              <input
                id="email-connexion"
                type="text"
                className={CHAMP}
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {erreur && (
              <div className="mb-5 rounded-xl border-l-[3px] border-[#fe0154] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#991b1b]">{erreur}</div>
            )}
            <button type="submit" className={BOUTON} disabled={envoi}>
              {envoi ? "…" : "Connexion"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
