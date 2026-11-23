"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ErreurApi } from "./api";
import { deconnecter, estCompteClient, keycloak } from "./auth";
import { definirDroitsClient } from "./perms";

export interface Moi {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  /** Lieux rattachés (client) : son périmètre quand il n'a pas le droit de voir tous les lieux */
  lieuIds: number[];
  lieux: { id: number; enseigne: string }[];
  /** Admin de la plateforme : seul à pouvoir supprimer un lieu ou une borne */
  superAdmin?: boolean;
  /** KONITYS : salarié ; REGIE : client de la Régie (realm « regie ») */
  compte?: "KONITYS" | "REGIE";
  /** Compte client : son entreprise et ses droits (profil de l'Admin Panel, lus par l'API) */
  entreprise?: { id: number; nom: string } | null;
  droits?: string[];
}

const SessionContext = createContext<Moi | null>(null);

/** L'utilisateur connecté (disponible sous <Session>). */
export function useMoi(): Moi {
  const moi = useContext(SessionContext);
  if (!moi) throw new Error("useMoi hors de <Session>");
  return moi;
}

// Les droits (pages, actions) viennent de l'Admin Panel Konitys : voir src/lib/perms.tsx (usePerm, Gate, PageGuard)

/** Charge l'utilisateur de l'application ; bloque l'accès aux comptes non autorisés. */
export function Session({ children }: { children: ReactNode }) {
  const { data, error } = useQuery({
    queryKey: ["moi"],
    queryFn: () => api<Moi>("/utilisateurs/moi"),
    staleTime: Infinity,
    retry: false,
  });

  const client = estCompteClient();
  // Client sans accès à l'application (profil sans app.access) : même écran qu'un compte refusé
  const sansAcces = client && data && !data.droits?.includes("app.access");
  if (error || sansAcces) {
    const refuse = sansAcces || (error instanceof ErreurApi && error.corps.error === "ACCES_NON_ACCORDE");
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-lg font-semibold">{refuse ? "Accès non accordé" : "Connexion impossible"}</h1>
        <p className="mt-2 text-sm text-ink-2">
          {refuse
            ? client
              ? "Votre compte client n'a pas (ou plus) accès à la Régie. Contactez l'administrateur de votre entreprise ou Selfizee."
              : "Votre compte n'a pas encore accès à cette application. Demandez à un administrateur de vous ajouter avec votre adresse e-mail."
            : error?.message}
        </p>
        {refuse && (
          <p className="mt-3 text-sm">
            Compte connecté :{" "}
            <strong>{data?.email ?? (error as ErreurApi | null)?.corps.email ?? "aucun e-mail transmis par Keycloak"}</strong>
          </p>
        )}
        {keycloak() && (
          <button type="button" className="bouton-second mt-6" onClick={() => deconnecter()}>
            Se déconnecter
          </button>
        )}
      </div>
    );
  }
  if (!data) return <p className="w-full py-20 text-center text-sm text-ink-muted">Chargement…</p>;
  // Droits du client posés avant d'afficher la page (ses PageGuard et Gate les lisent)
  if (client) definirDroitsClient(data.droits);
  return <SessionContext.Provider value={data}>{children}</SessionContext.Provider>;
}
