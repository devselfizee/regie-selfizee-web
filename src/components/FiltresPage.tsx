"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type LieuListe } from "@/lib/api";
import { ChoixLieu } from "./ChoixLieu";
import { dernierWeekEnd } from "./Filtres";

// Filtres du tableau de bord (parc, lieu, période), repris par les pages d'analyse (retour de Sébastien du 12/11)

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
// Aujourd'hui en heure de Paris, à minuit UTC (dates « métier »)
export const aujourdhui = () => new Date(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()) + "T00:00:00Z");
export const plusJours = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const lundi = (d: Date) => plusJours(d, -((d.getUTCDay() + 6) % 7));

export const PERIODES: { cle: string; libelle: string; calcul?: () => { du: Date; au: Date } }[] = [
  { cle: "jour", libelle: "Aujourd'hui", calcul: () => ({ du: aujourdhui(), au: aujourdhui() }) },
  { cle: "hier", libelle: "Hier", calcul: () => ({ du: plusJours(aujourdhui(), -1), au: plusJours(aujourdhui(), -1) }) },
  // Celui en cours le samedi et le dimanche, sinon le précédent (jamais celui à venir)
  { cle: "we", libelle: "Ce week-end", calcul: () => dernierWeekEnd(aujourdhui()) },
  { cle: "7j", libelle: "7 derniers jours", calcul: () => ({ du: plusJours(aujourdhui(), -6), au: aujourdhui() }) },
  { cle: "30j", libelle: "30 derniers jours", calcul: () => ({ du: plusJours(aujourdhui(), -29), au: aujourdhui() }) },
  { cle: "semaine", libelle: "Cette semaine", calcul: () => ({ du: lundi(aujourdhui()), au: aujourdhui() }) },
  { cle: "semaine-1", libelle: "Semaine dernière", calcul: () => ({ du: plusJours(lundi(aujourdhui()), -7), au: plusJours(lundi(aujourdhui()), -1) }) },
  {
    cle: "mois",
    libelle: "Ce mois",
    calcul: () => {
      const a = aujourdhui();
      return { du: new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1)), au: a };
    },
  },
  {
    cle: "mois-1",
    libelle: "Mois précédent",
    calcul: () => {
      const a = aujourdhui();
      return { du: new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() - 1, 1)), au: new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 0)) };
    },
  },
  {
    cle: "annee",
    libelle: "Cette année",
    calcul: () => {
      const a = aujourdhui();
      return { du: new Date(Date.UTC(a.getUTCFullYear(), 0, 1)), au: a };
    },
  },
  { cle: "perso", libelle: "Période personnalisée" },
];

export interface EtatFiltresPage {
  cle: string;
  perso: { du: string; au: string };
  /** Parc Selfizee par défaut : les clients en location financière à part (demande de Sébastien) */
  parc: string;
  lieuId: string;
}

/** Période, parc et lieu choisis ; un lieu choisi l'emporte sur le parc */
export function useFiltresPage(cleInitiale = "jour") {
  const [etat, setEtat] = useState<EtatFiltresPage>(() => ({
    cle: cleInitiale,
    perso: { du: ymd(plusJours(aujourdhui(), -29)), au: ymd(aujourdhui()) },
    parc: "SELFIZEE",
    lieuId: "",
  }));
  const choisie = PERIODES.find((p) => p.cle === etat.cle);
  const { du, au } = choisie?.calcul ? (({ du, au }) => ({ du: ymd(du), au: ymd(au) }))(choisie.calcul()) : etat.perso;
  return {
    etat,
    set: (m: Partial<EtatFiltresPage>) => setEtat((e) => ({ ...e, ...m })),
    du,
    au,
    lieuId: etat.lieuId || undefined,
    parc: etat.lieuId ? undefined : etat.parc || undefined,
  };
}

export type FiltresPageEtat = ReturnType<typeof useFiltresPage>;

/** Parc, lieu et période, sur la ligne du titre de la page */
export function FiltresPage({ f, prefixe, onPeriode }: { f: FiltresPageEtat; prefixe: string; onPeriode?: () => void }) {
  const { etat, set } = f;
  const lieux = useQuery({ queryKey: ["lieux", "tdb"], queryFn: () => api<LieuListe[]>("/lieux"), staleTime: 5 * 60_000 });
  return (
    <>
      <select id={`${prefixe}-parc`} aria-label="Parc" className="champ !w-auto" value={etat.parc} onChange={(e) => set({ parc: e.target.value })} disabled={!!etat.lieuId}>
        <option value="SELFIZEE">Parc Selfizee</option>
        <option value="CLIENT">Parc client</option>
        <option value="">Tous les parcs</option>
      </select>
      <div className="w-72 max-w-full">
        <ChoixLieu
          id={`${prefixe}-lieu`}
          lieux={(lieux.data ?? []).filter((l) => l.statut === "ACTIF" && (!etat.parc || l.parc === etat.parc))}
          valeur={etat.lieuId}
          onChange={(lieuId) => set({ lieuId })}
        />
      </div>
      <select
        id={`${prefixe}-periode`}
        aria-label="Période"
        className="champ !w-auto"
        value={etat.cle}
        onChange={(e) => {
          set({ cle: e.target.value });
          onPeriode?.();
        }}
      >
        {PERIODES.map((p) => <option key={p.cle} value={p.cle}>{p.libelle}</option>)}
      </select>
      {etat.cle === "perso" && (
        <>
          <input id={`${prefixe}-du`} aria-label="Du" type="date" className="champ !w-auto" value={etat.perso.du} max={etat.perso.au} onChange={(e) => e.target.value && set({ perso: { ...etat.perso, du: e.target.value } })} />
          <input id={`${prefixe}-au`} aria-label="Au" type="date" className="champ !w-auto" value={etat.perso.au} min={etat.perso.du} onChange={(e) => e.target.value && set({ perso: { ...etat.perso, au: e.target.value } })} />
        </>
      )}
    </>
  );
}
