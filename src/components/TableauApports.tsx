"use client";

import { useState } from "react";
import { euros, nombre } from "@/lib/format";
import { Vide } from "@/components/Etat";

// Apporteurs d'affaires (demande du 17/11/2026) : point mensuel très synthétique, le même pour l'apporteur
// (page « Mes apports ») et pour l'administrateur qui le consulte (page Apporteurs).

export interface LigneLieuApport {
  lieuId: number;
  enseigne: string;
  ville: string | null;
  tauxBp: number;
  baseCents: number;
  commissionCents: number;
  nbVentes: number;
  du?: string;
  au?: string;
}
export interface MoisApport {
  mois: string;
  libelle: string;
  enCours: boolean;
  baseCents: number;
  commissionCents: number;
  nbVentes: number;
  lieux: LigneLieuApport[];
}
export interface TableauApport {
  mois: MoisApport[];
  totaux: { moisPrecedentCents: number; anneeCents: number; totalCents: number; baseAnneeCents: number; nbLieux: number };
}

export const taux = (bp: number) => `${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
const jj = (ymd: string) => ymd.split("-").reverse().join("/");

/** Les trois chiffres qui comptent pour un apporteur */
export function SyntheseApports({ t }: { t: TableauApport }) {
  const annee = new Date().getFullYear();
  const tuiles = [
    { libelle: "Commission du mois dernier", valeur: euros(t.totaux.moisPrecedentCents), detail: t.mois.find((m) => !m.enCours)?.libelle ?? "aucun mois terminé" },
    { libelle: `Commission ${annee}`, valeur: euros(t.totaux.anneeCents), detail: `depuis le 1er janvier · ${euros(t.totaux.totalCents)} au total` },
    { libelle: `Chiffre généré ${annee}`, valeur: euros(t.totaux.baseAnneeCents), detail: `${t.totaux.nbLieux} lieu${t.totaux.nbLieux > 1 ? "x" : ""} apporté${t.totaux.nbLieux > 1 ? "s" : ""}` },
  ];
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      {tuiles.map((k) => (
        <div key={k.libelle} className="carte p-4">
          <div className="text-xs font-medium text-ink-2">{k.libelle}</div>
          <div className="mt-1 text-2xl font-semibold text-ink">{k.valeur}</div>
          <div className="mt-0.5 text-xs text-ink-muted">{k.detail}</div>
        </div>
      ))}
    </div>
  );
}

/** Un mois par ligne (le plus récent en haut), ses lieux dépliables quand il y en a plusieurs */
export function MoisApports({ t }: { t: TableauApport }) {
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set(t.mois.slice(0, 2).map((m) => m.mois)));
  const basculer = (m: string) =>
    setOuverts((s) => {
      const n = new Set(s);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });
  if (!t.mois.length) return <Vide>Pas encore de mois à afficher : la commission démarre à la date de début du contrat.</Vide>;
  const plusieurs = t.totaux.nbLieux > 1;
  return (
    <div className="carte overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>
            <th className="px-4 py-3 font-medium">Mois</th>
            <th className="px-4 py-3 text-right font-medium">Ventes</th>
            <th className="px-4 py-3 text-right font-medium" title="Chiffre d'affaires des lieux apportés, base de la commission">Chiffre généré</th>
            <th className="px-4 py-3 text-right font-medium">Commission</th>
            <th className="px-4 py-3"><span className="sr-only">Détail</span></th>
          </tr>
        </thead>
        <tbody className="tabular">
          {t.mois.map((m) => {
            const ouvert = ouverts.has(m.mois);
            return (
              <MoisLigne key={m.mois} m={m} ouvert={ouvert} plusieurs={plusieurs} onBasculer={() => basculer(m.mois)} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MoisLigne({ m, ouvert, plusieurs, onBasculer }: { m: MoisApport; ouvert: boolean; plusieurs: boolean; onBasculer: () => void }) {
  const detail = m.lieux.length > 1 || m.lieux.some((l) => l.du);
  return (
    <>
      <tr className="border-t border-line">
        <td className="px-4 py-3">
          <span className="font-medium capitalize">{m.libelle}</span>
          {m.enCours && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">en cours</span>}
          {!plusieurs && m.lieux[0]?.du && <div className="text-xs text-ink-muted">du {jj(m.lieux[0].du)} au {jj(m.lieux[0].au!)}</div>}
        </td>
        <td className="px-4 py-3 text-right text-ink-2">{nombre(m.nbVentes)}</td>
        <td className="px-4 py-3 text-right text-ink-2">{euros(m.baseCents)}</td>
        <td className="px-4 py-3 text-right font-semibold">{euros(m.commissionCents)}</td>
        <td className="px-4 py-3 text-right">
          {detail && (
            <button type="button" className="text-xs text-accent hover:underline" aria-expanded={ouvert} onClick={onBasculer}>
              {ouvert ? "Replier" : `${m.lieux.length} lieu${m.lieux.length > 1 ? "x" : ""}`}
            </button>
          )}
        </td>
      </tr>
      {detail &&
        ouvert &&
        m.lieux.map((l) => (
          <tr key={l.lieuId} className="bg-surface-2/50 text-xs text-ink-2">
            <td className="py-2 pr-4 pl-8">
              {l.enseigne}
              {l.ville && <span className="text-ink-muted"> · {l.ville}</span>}
              <span className="text-ink-muted"> · {taux(l.tauxBp)}</span>
              {l.du && <span className="text-ink-muted"> · du {jj(l.du)} au {jj(l.au!)}</span>}
            </td>
            <td className="px-4 py-2 text-right">{nombre(l.nbVentes)}</td>
            <td className="px-4 py-2 text-right">{euros(l.baseCents)}</td>
            <td className="px-4 py-2 text-right font-medium text-ink">{euros(l.commissionCents)}</td>
            <td />
          </tr>
        ))}
    </>
  );
}
