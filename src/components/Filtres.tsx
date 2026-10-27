"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Granularite, type Referentiel } from "@/lib/api";
import { OPTIONS_MOYENS } from "@/lib/format";

export interface ValeursFiltres {
  du: string;
  au: string;
  granularite: Granularite;
  gammeId?: string;
  typeModuleId?: string;
  moyenPaiement?: string;
  typeLieuId?: string;
  zoneGeoId?: string;
  standingId?: string;
  saisonnalite?: string;
  interieurExterieur?: string;
  clienteleId?: string;
  antenneId?: string;
  /** SELFIZEE par défaut ; vide = tout */
  parc?: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
// Aujourd'hui en heure de Paris
const aujourdhui = () => new Date(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()) + "T00:00:00Z");
const moinsJours = (d: Date, n: number) => new Date(d.getTime() - n * 86_400_000);

export const PRESETS: { cle: string; libelle: string; calcul: () => { du: string; au: string; granularite: Granularite } }[] = [
  { cle: "7j", libelle: "7 jours", calcul: () => ({ du: ymd(moinsJours(aujourdhui(), 6)), au: ymd(aujourdhui()), granularite: "jour" }) },
  { cle: "30j", libelle: "30 jours", calcul: () => ({ du: ymd(moinsJours(aujourdhui(), 29)), au: ymd(aujourdhui()), granularite: "jour" }) },
  { cle: "90j", libelle: "90 jours", calcul: () => ({ du: ymd(moinsJours(aujourdhui(), 89)), au: ymd(aujourdhui()), granularite: "semaine" }) },
  {
    cle: "mois",
    libelle: "Ce mois",
    calcul: () => {
      const a = aujourdhui();
      return { du: ymd(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1))), au: ymd(a), granularite: "jour" };
    },
  },
  {
    cle: "annee",
    libelle: "Cette année",
    calcul: () => {
      const a = aujourdhui();
      return { du: `${a.getUTCFullYear()}-01-01`, au: ymd(a), granularite: "mois" };
    },
  },
];

export const filtresParDefaut = (): ValeursFiltres => ({ ...PRESETS[1].calcul(), parc: "SELFIZEE" });

export function useReferentiel() {
  return useQuery({ queryKey: ["referentiel"], queryFn: () => api<Referentiel>("/referentiel"), staleTime: 5 * 60_000 });
}

/** Barre de filtres : période, granularité, gamme, module, moyen, et (option) champs de la fiche lieu. */
export function Filtres({
  valeurs,
  onChange,
  filtresLieu = true,
}: {
  valeurs: ValeursFiltres;
  onChange: (v: ValeursFiltres) => void;
  filtresLieu?: boolean;
}) {
  const { data: ref } = useReferentiel();
  const set = (patch: Partial<ValeursFiltres>) => onChange({ ...valeurs, ...patch });
  const presetActif = PRESETS.find((p) => {
    const c = p.calcul();
    return c.du === valeurs.du && c.au === valeurs.au;
  })?.cle;

  // Filtres secondaires repliés par défaut (retour de Sébastien : trop de filtres d'un coup) ; ouverts si l'un est actif
  const SECONDAIRES: (keyof ValeursFiltres)[] = ["gammeId", "typeModuleId", "moyenPaiement", "typeLieuId", "zoneGeoId", "standingId", "clienteleId", "saisonnalite", "interieurExterieur", "antenneId"];
  const nbActifs = SECONDAIRES.filter((k) => valeurs[k]).length;
  const [ouverts, setOuverts] = useState(nbActifs > 0);

  const liste = (cat: string) => (ref?.listes[cat] ?? []).filter((v) => v.actif).map((v) => ({ value: v.id, label: v.libelle }));

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-end justify-end gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Période">
          {PRESETS.map((p) => (
            <button
              key={p.cle}
              type="button"
              onClick={() => set(p.calcul())}
              className={`rounded-md px-3 py-2 text-sm ${presetActif === p.cle ? "border border-accent bg-accent text-accent-ink" : "border border-line-strong bg-surface text-ink-2 hover:text-ink"}`}
            >
              {p.libelle}
            </button>
          ))}
        </div>
        <label>
          <span className="etiquette">Du</span>
          <input type="date" className="champ" value={valeurs.du} max={valeurs.au} onChange={(e) => e.target.value && set({ du: e.target.value })} />
        </label>
        <label>
          <span className="etiquette">Au</span>
          <input type="date" className="champ" value={valeurs.au} min={valeurs.du} onChange={(e) => e.target.value && set({ au: e.target.value })} />
        </label>
        {filtresLieu && (
          <label>
            <span className="etiquette">Parc</span>
            <select className="champ" value={valeurs.parc ?? ""} onChange={(e) => set({ parc: e.target.value || undefined })}>
              <option value="SELFIZEE">Parc Selfizee</option>
              <option value="CLIENT">Parc client</option>
              <option value="">Tout</option>
            </select>
          </label>
        )}
        <label>
          <span className="etiquette">Par</span>
          <select className="champ" value={valeurs.granularite} onChange={(e) => set({ granularite: e.target.value as Granularite })}>
            <option value="jour">Jour</option>
            <option value="semaine">Semaine</option>
            <option value="mois">Mois</option>
            <option value="annee">Année</option>
          </select>
        </label>
        <button type="button" className="bouton-second" aria-expanded={ouverts} onClick={() => setOuverts(!ouverts)}>
          {ouverts ? "Moins de filtres" : "Plus de filtres"}
          {nbActifs > 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-accent-ink">{nbActifs}</span>}
        </button>
        {nbActifs > 0 && (
          <button type="button" className="text-sm text-accent hover:underline" onClick={() => set(Object.fromEntries(SECONDAIRES.map((k) => [k, undefined])))}>
            Effacer les filtres
          </button>
        )}
      </div>

      <div className="carte grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6" hidden={!ouverts}>
        <Select nom="gammeId" valeurs={valeurs} set={set} libelle="Gamme" options={(ref?.gammes ?? []).filter((g) => g.actif).map((g) => ({ value: g.id, label: g.libelle }))} />
        <Select nom="typeModuleId" valeurs={valeurs} set={set} libelle="Module de paiement" options={(ref?.typesModule ?? []).filter((t) => t.actif).map((t) => ({ value: t.id, label: t.libelle }))} />
        <Select nom="moyenPaiement" valeurs={valeurs} set={set} libelle="Moyen de paiement" options={OPTIONS_MOYENS} />
        {filtresLieu && (
          <>
            <Select nom="antenneId" valeurs={valeurs} set={set} libelle="Antenne Selfizee" options={liste("ANTENNE")} />
            <Select nom="typeLieuId" valeurs={valeurs} set={set} libelle="Type de lieu" options={liste("TYPE_LIEU")} />
            <Select nom="zoneGeoId" valeurs={valeurs} set={set} libelle="Zone" options={liste("ZONE_GEO")} />
            <Select nom="standingId" valeurs={valeurs} set={set} libelle="Standing" options={liste("STANDING")} />
            <Select nom="clienteleId" valeurs={valeurs} set={set} libelle="Clientèle" options={liste("CLIENTELE")} />
            <Select
              nom="saisonnalite"
              valeurs={valeurs}
              set={set}
              libelle="Saisonnalité"
              options={[
                { value: "ANNUEL", label: "Annuel" },
                { value: "SAISONNIER", label: "Saisonnier" },
              ]}
            />
            <Select
              nom="interieurExterieur"
              valeurs={valeurs}
              set={set}
              libelle="Emplacement"
              options={[
                { value: "INTERIEUR", label: "Intérieur" },
                { value: "EXTERIEUR", label: "Extérieur" },
                { value: "MIXTE", label: "Mixte" },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Select({
  nom,
  libelle,
  options,
  valeurs,
  set,
}: {
  nom: keyof ValeursFiltres;
  libelle: string;
  options: { value: string | number; label: string }[];
  valeurs: ValeursFiltres;
  set: (patch: Partial<ValeursFiltres>) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="etiquette">{libelle}</span>
      <select className="champ" value={valeurs[nom] ?? ""} onChange={(e) => set({ [nom]: e.target.value || undefined })}>
        <option value="">Tous</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
