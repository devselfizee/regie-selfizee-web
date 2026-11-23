"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { authActive, choisirCompte, compteChoisi, initialiserAuth, type SorteCompte } from "@/lib/auth";

/**
 * N'affiche l'application qu'une fois l'utilisateur connecté via Keycloak. Avec la connexion des clients (realm
 * « regie », option 2 du 20/11/2026), l'accueil demande d'abord « salarié ou client » : chacun son realm.
 */
export function Authentification({ children }: { children: ReactNode }) {
  // Choix lu dans le navigateur (stockage, lien d'invitation) ; inconnu pendant le rendu serveur
  const choixNavigateur = useSyncExternalStore(sansAbonnement, () => (authActive ? compteChoisi() : "salarie"), () => undefined);
  const [choixClic, setCompte] = useState<SorteCompte | null>(null);
  const compte: SorteCompte | null | undefined = choixClic ?? choixNavigateur;
  const [etat, setEtat] = useState<"attente" | "ok" | "erreur">(authActive ? "attente" : "ok");

  useEffect(() => {
    if (!authActive || !compte) return;
    initialiserAuth(compte)
      .then(() => setEtat("ok"))
      .catch((err) => {
        console.error("Keycloak :", err);
        setEtat("erreur");
      });
  }, [compte]);

  if (authActive && compte === null) {
    return (
      <ChoixConnexion
        onChoix={(c) => {
          choisirCompte(c);
          setCompte(c);
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
            Changer de type de compte
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

const sansAbonnement = () => () => undefined;

/** Accueil : salarié Selfizee / Konitys, ou client de la Régie (chacun sa page de connexion) */
function ChoixConnexion({ onChoix }: { onChoix: (c: SorteCompte) => void }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface-2 px-4">
      <div className="carte w-full max-w-md p-8 text-center">
        <Image src="/selfizee-logo.png" alt="Selfizee" width={160} height={48} className="mx-auto h-12 w-auto" priority />
        <h1 className="mt-6 text-lg font-semibold">Régie Selfizee</h1>
        <p className="mt-1 text-sm text-ink-2">Comment vous connectez-vous ?</p>
        <div className="mt-6 grid gap-3">
          <button type="button" className="bouton justify-center py-3" onClick={() => onChoix("client")}>
            Je suis client
          </button>
          <button type="button" className="bouton-second justify-center py-3" onClick={() => onChoix("salarie")}>
            Je suis salarié Selfizee
          </button>
        </div>
        <p className="mt-6 text-xs text-ink-muted">
          Client : le compte reçu par e-mail d&apos;invitation. Salarié : votre compte Konitys habituel.
        </p>
      </div>
    </div>
  );
}
