"use client";

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
const BOUTON =
  "h-[50px] w-full rounded-xl bg-gradient-to-r from-[#f5005a] to-[#e0004d] text-[15px] font-semibold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60";
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

  // Même allure que la page de connexion Keycloak (thème Konitys) : on passe de l'une à l'autre sans rupture
  return (
    <div className="flex min-h-screen w-full items-start justify-center bg-[#eef0fb] px-4 pt-[12vh] text-[#1f2333]">
      <div className="w-full max-w-[440px] rounded-3xl bg-white px-10 py-12 shadow-[0_20px_60px_-20px_rgba(245,0,90,0.18)]">
        <div className="text-center">
          <p className="text-[44px] font-extrabold leading-none tracking-tight text-[#1f2333]">Konitys</p>
          <p className="mt-4 text-[15px] text-[#8a90a8]">Plateforme de gestion</p>
        </div>
        {deuxComptes ? (
          <div className="mt-8">
            <p className="text-sm font-semibold">Cette adresse a deux comptes. Lequel utiliser ?</p>
            <div className="mt-4 grid gap-3">
              <button type="button" className={BOUTON} onClick={() => onChoix("client", email.trim())}>
                Mon compte client
              </button>
              <button
                type="button"
                className="h-[50px] w-full rounded-xl border border-[#e3e6f0] bg-white text-[15px] font-semibold text-[#1f2333] transition hover:bg-[#f7f8fc]"
                onClick={() => onChoix("salarie", email.trim())}
              >
                Mon compte salarié Selfizee
              </button>
            </div>
            <button type="button" className="mt-5 text-sm text-[#f5005a] hover:underline" onClick={() => setDeuxComptes(false)}>
              Changer d&apos;adresse
            </button>
          </div>
        ) : (
          <form onSubmit={continuer} className="mt-10">
            <label className="block text-sm font-semibold" htmlFor="email-connexion">Nom d&apos;utilisateur ou courriel</label>
            <input
              id="email-connexion"
              type="email"
              className="mt-3 h-[48px] w-full rounded-xl border border-[#e3e6f0] bg-[#f7f8fc] px-4 text-[15px] outline-none transition placeholder:text-[#9aa0b4] focus:border-[#f5005a] focus:bg-white focus:ring-2 focus:ring-[#f5005a]/15"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {erreur && <p className="mt-3 text-sm text-[#e0004d]">{erreur}</p>}
            <button type="submit" className={`${BOUTON} mt-10`} disabled={envoi}>
              {envoi ? "…" : "Connexion"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
