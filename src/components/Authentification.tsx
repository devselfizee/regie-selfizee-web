"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { API_URL } from "@/lib/api";
import { authActive, choisirCompte, compteChoisi, initialiserAuth, type SorteCompte } from "@/lib/auth";

/**
 * N'affiche l'application qu'une fois l'utilisateur connecté via Keycloak. Avec la connexion des clients (realm
 * « regie », option 2 du 20/11/2026), l'accueil demande l'e-mail et envoie vers la bonne connexion : salarié ou client.
 */
export function Authentification({ children }: { children: ReactNode }) {
  // Choix lu dans le navigateur (stockage, lien d'invitation) ; inconnu pendant le rendu serveur
  const choixNavigateur = useSyncExternalStore(sansAbonnement, () => (authActive ? compteChoisi() : "salarie"), () => undefined);
  const [choixClic, setCompte] = useState<{ compte: SorteCompte; email?: string } | null>(null);
  const compte: SorteCompte | null | undefined = choixClic?.compte ?? choixNavigateur;
  const [etat, setEtat] = useState<"attente" | "ok" | "erreur">(authActive ? "attente" : "ok");

  useEffect(() => {
    if (!authActive || !compte) return;
    initialiserAuth(compte, choixClic?.email)
      .then(() => setEtat("ok"))
      .catch((err) => {
        console.error("Keycloak :", err);
        setEtat("erreur");
      });
  }, [compte, choixClic?.email]);

  if (authActive && compte === null) {
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

const sansAbonnement = () => () => undefined;
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
    <div className="flex min-h-screen w-full items-center justify-center bg-surface-2 px-4">
      <div className="carte w-full max-w-md p-8 text-center">
        <Image src="/selfizee-logo.png" alt="Selfizee" width={160} height={48} className="mx-auto h-12 w-auto" priority />
        <h1 className="mt-6 text-lg font-semibold">Régie Selfizee</h1>
        {deuxComptes ? (
          <>
            <p className="mt-1 text-sm text-ink-2">Cette adresse a deux comptes. Lequel utiliser ?</p>
            <div className="mt-6 grid gap-3">
              <button type="button" className="bouton justify-center py-3" onClick={() => onChoix("client", email.trim())}>
                Mon compte client
              </button>
              <button type="button" className="bouton-second justify-center py-3" onClick={() => onChoix("salarie", email.trim())}>
                Mon compte salarié Selfizee
              </button>
            </div>
            <button type="button" className="mt-4 text-xs text-ink-muted underline" onClick={() => setDeuxComptes(false)}>
              Changer d&apos;adresse
            </button>
          </>
        ) : (
          <form onSubmit={continuer} className="mt-6 grid gap-3 text-left">
            <label className="text-sm text-ink-2" htmlFor="email-connexion">Votre adresse e-mail</label>
            <input
              id="email-connexion"
              type="email"
              className="champ"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {erreur && <p className="text-sm text-red-600">{erreur}</p>}
            <button type="submit" className="bouton justify-center py-3" disabled={envoi}>
              {envoi ? "Un instant…" : "Continuer"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
