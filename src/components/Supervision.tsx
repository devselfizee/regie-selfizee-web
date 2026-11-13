"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type Parc } from "@/lib/api";

// Supervision en direct (GET /supervision) : partagée par les pages Monitoring live et Papier.

export interface BorneSupervisee {
  borneId: number;
  identifiant: string;
  gamme: string;
  /** papierSurPlace : le lieu change lui-même le papier (sinon Selfizee) */
  lieu: { id: number; enseigne: string; ville: string | null; parc: Parc; papierSurPlace: boolean } | null;
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

/** Parc d'une borne : celui de son lieu ; une borne sans lieu est à nous (comme la liste des bornes) */
export const parcBorne = (b: BorneSupervisee): Parc => b.lieu?.parc ?? "SELFIZEE";

/** Filtre de parc du Monitoring live et de l'État papier : notre parc par défaut, les autres au choix (retour du 13/11) */
export function ChoixParc({ valeur, onChange }: { valeur: string; onChange: (parc: string) => void }) {
  return (
    <label className="block">
      <span className="etiquette">Parc</span>
      <select className="champ !w-48" value={valeur} onChange={(e) => onChange(e.target.value)}>
        <option value="SELFIZEE">Parc Selfizee</option>
        <option value="CLIENT">Parc client</option>
        <option value="TEST">Parc test</option>
        <option value="">Tous les parcs</option>
      </select>
    </label>
  );
}

/** Seuils du papier (tirages restants) : sous 100 en rouge gras (retour de Sébastien, 05/11/2026) */
export const tonPapier = (restant: number | null | undefined) =>
  restant === null || restant === undefined ? "text-ink-muted" : restant < 100 ? "font-bold text-bad" : "";
