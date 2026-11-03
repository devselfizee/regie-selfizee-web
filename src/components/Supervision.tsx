"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Supervision en direct (GET /supervision) : partagée par les pages Monitoring live et Papier.

export interface BorneSupervisee {
  borneId: number;
  identifiant: string;
  gamme: string;
  lieu: { id: number; enseigne: string; ville: string | null } | null;
  enLigne: boolean;
  lieuOuvert: boolean;
  prochaineOuverture: string | null;
  etat: "ok" | "alerte" | "eteinte_anormale" | "eteinte";
  dernierPing: string | null;
  derniereVente: string | null;
  dernierePhoto: string | null;
  logicielVersion: string | null;
  imprimanteOk: boolean | null;
  terminalOk: boolean | null;
  etatLe: string | null;
  erreurs: { code: string; message?: string; composant?: string }[];
  papier: { restant: number; ruban: number | null; le: string } | null;
  journee: {
    ventes: number;
    caTtcCents: number;
    echecs: number;
    seances: number;
    photos: number;
    tirages: number;
    derniereSeance: { fin: string; issue: string } | null;
  };
}

export interface Supervision {
  maintenant: string;
  debutJournee: string;
  bornes: BorneSupervisee[];
}

export function useSupervision() {
  return useQuery({
    queryKey: ["supervision"],
    queryFn: () => api<Supervision>("/supervision"),
    // En direct : les bornes envoient un signe de vie toutes les 5 minutes
    refetchInterval: 30_000,
  });
}

/** Seuils du papier (tirages restants), comme la fiche lieu */
export const tonPapier = (restant: number | null | undefined) =>
  restant === null || restant === undefined ? "text-ink-muted" : restant < 50 ? "text-bad" : restant < 100 ? "text-warn-ink" : "";
