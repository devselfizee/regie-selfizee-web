"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ErreurApi } from "./api";
import { keycloak } from "./auth";

export type Role = "ADMIN" | "COMMERCIAL" | "TECHNICIEN" | "PARTENAIRE";

export interface Moi {
  id: number;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  lieuId: number | null;
}

const SessionContext = createContext<Moi | null>(null);

/** L'utilisateur connecté (disponible sous <Session>). */
export function useMoi(): Moi {
  const moi = useContext(SessionContext);
  if (!moi) throw new Error("useMoi hors de <Session>");
  return moi;
}

export const peut = {
  voirVentes: (r: Role) => r !== "TECHNICIEN",
  gererLieux: (r: Role) => r === "ADMIN" || r === "COMMERCIAL",
  gererBornes: (r: Role) => r === "ADMIN" || r === "TECHNICIEN",
  administrer: (r: Role) => r === "ADMIN",
};

/** Charge l'utilisateur de l'application ; bloque l'accès aux comptes non autorisés. */
export function Session({ children }: { children: ReactNode }) {
  const { data, error } = useQuery({
    queryKey: ["moi"],
    queryFn: () => api<Moi>("/utilisateurs/moi"),
    staleTime: Infinity,
    retry: false,
  });

  if (error) {
    const refuse = error instanceof ErreurApi && error.corps.error === "ACCES_NON_ACCORDE";
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-lg font-semibold">{refuse ? "Accès non accordé" : "Connexion impossible"}</h1>
        <p className="mt-2 text-sm text-ink-2">
          {refuse
            ? "Votre compte n'a pas encore accès à cette application. Demandez à un administrateur de vous ajouter avec votre adresse e-mail."
            : error.message}
        </p>
        {keycloak() && (
          <button type="button" className="bouton-second mt-6" onClick={() => keycloak()?.logout()}>
            Se déconnecter
          </button>
        )}
      </div>
    );
  }
  if (!data) return <p className="w-full py-20 text-center text-sm text-ink-muted">Chargement…</p>;
  return <SessionContext.Provider value={data}>{children}</SessionContext.Provider>;
}

/** Contenu réservé à certains rôles (accès direct par l'URL compris). */
export function Reserve({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const moi = useMoi();
  if (!roles.includes(moi.role)) {
    return <p className="py-20 text-center text-sm text-ink-2">Cette page n&apos;est pas accessible avec votre rôle.</p>;
  }
  return <>{children}</>;
}
