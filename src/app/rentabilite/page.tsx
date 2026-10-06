"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs, type Rentabilite } from "@/lib/api";
import { euros, jour, pct } from "@/lib/format";
import { Reserve } from "@/lib/session";
import { PRESETS } from "@/components/Filtres";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";

interface Ligne extends Rentabilite {
  borneId: number;
  identifiant: string;
  gamme: string;
  lieu: { id: number; enseigne: string } | null;
  roi: { partRemboursee: number; dateRetour: string | null; moisRestants: number | null; coutAchatCents: number } | null;
}

export default function PageRentabilite() {
  return (
    <Reserve roles={["ADMIN"]}>
      <Contenu />
    </Reserve>
  );
}

/** Montant retranché : « −12,00 € », ou un tiret s'il est nul */
const moins = (c: number) => (c ? euros(-c) : "—");

function Contenu() {
  const [periode, setPeriode] = useState(PRESETS[2].calcul());
  const { data, error, isPending } = useQuery({
    queryKey: ["rentabilite", "toutes", periode.du, periode.au],
    queryFn: () =>
      api<{ periode: { du: string; au: string }; bornes: Ligne[]; total: Pick<Rentabilite, "caHtCents" | "commissionsCents" | "coutsCents" | "amortissementCents" | "margeNetteCents"> }>(
        `/rentabilite${qs({ du: periode.du, au: periode.au })}`
      ),
    placeholderData: keepPreviousData,
  });
  const lignes = [...(data?.bornes ?? [])].sort((a, b) => a.margeNetteCents - b.margeNetteCents);

  const exporter = () => {
    if (!data) return;
    const e = (c: number) => (c / 100).toFixed(2).replace(".", ",");
    const csv = [
      ["Borne", "Gamme", "Lieu", "CA HT", "Commissions", "Coûts", "Amortissement", "Marge nette", "Part du prix d'achat remboursée", "Rentabilisée le"].join(";"),
      ...lignes.map((l) =>
        [l.identifiant, l.gamme, l.lieu?.enseigne ?? "", e(l.caHtCents), e(l.commissionsCents), e(l.coutsCents), e(l.amortissementCents), e(l.margeNetteCents),
         l.roi ? `${Math.round(l.roi.partRemboursee * 100)} %` : "", l.roi?.dateRetour ?? ""].join(";")
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: `rentabilite_${periode.du}_${periode.au}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <EnTete
        titre="Rentabilité des bornes"
        sousTitre="Marge nette = CA HT − commissions reversées (part de la borne) − coûts saisis − amortissement. Les bornes les moins rentables en premier."
        actions={<button className="bouton-second" onClick={exporter} disabled={!data}>Exporter (CSV)</button>}
      />
      <div className="mb-4 flex flex-wrap gap-1">
        {PRESETS.filter((p) => p.cle !== "7j").map((p) => {
          const c = p.calcul();
          return (
            <button key={p.cle} onClick={() => setPeriode(c)}
              className={`rounded-md px-3 py-2 text-sm ${periode.du === c.du && periode.au === c.au ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2"}`}>
              {p.libelle}
            </button>
          );
        })}
        {data && <span className="ml-2 self-center text-sm text-ink-2">du {jour(data.periode.du)} au {jour(data.periode.au)}</span>}
      </div>

      {error && <Erreur erreur={error} />}
      {isPending && !error && <Chargement />}
      {data && !lignes.length && <Vide>Aucune borne.</Vide>}
      {data && lignes.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-3 font-medium">Borne</th>
                <th className="px-4 py-3 text-right font-medium">CA HT</th>
                <th className="px-4 py-3 text-right font-medium">Commissions</th>
                <th className="px-4 py-3 text-right font-medium">Coûts</th>
                <th className="px-4 py-3 text-right font-medium">Amortissement</th>
                <th className="px-4 py-3 text-right font-medium">Marge nette</th>
                <th className="px-4 py-3 font-medium">Retour sur investissement</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {lignes.map((l) => (
                <tr key={l.borneId} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link className="font-medium hover:underline" href={`/bornes/${l.borneId}`}>{l.identifiant}</Link>
                    <div className="text-xs text-ink-muted">{l.gamme}{l.lieu && <> · <Link className="hover:underline" href={`/lieux/${l.lieu.id}`}>{l.lieu.enseigne}</Link></>}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{euros(l.caHtCents)}</td>
                  <td className="px-4 py-3 text-right text-ink-2">{moins(l.commissionsCents)}</td>
                  <td className="px-4 py-3 text-right text-ink-2">{moins(l.coutsCents)}</td>
                  <td className="px-4 py-3 text-right text-ink-2">{moins(l.amortissementCents)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${l.margeNetteCents < 0 ? "text-bad" : "text-good"}`}>
                    {l.margeNetteCents < 0 ? "▼ " : ""}{euros(l.margeNetteCents)}
                  </td>
                  <td className="px-4 py-3">
                    {!l.roi ? (
                      <span className="text-xs text-ink-muted">prix d&apos;achat non renseigné</span>
                    ) : (
                      <div className="min-w-40">
                        <div className="h-1.5 overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(l.roi.partRemboursee * 100)} aria-label="Part du prix d'achat remboursée">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${l.roi.partRemboursee * 100}%` }} />
                        </div>
                        <div className="mt-1 text-xs text-ink-2">
                          {l.roi.dateRetour
                            ? `✓ rentabilisée le ${jour(l.roi.dateRetour)}`
                            : `${pct(l.roi.partRemboursee)}${l.roi.moisRestants !== null ? ` · ~${l.roi.moisRestants} mois restants` : " · pas de remboursement au rythme actuel"}`}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular">
              <tr className="border-t-2 border-line-strong font-semibold">
                <td className="px-4 py-3">Total ({lignes.length} bornes)</td>
                <td className="px-4 py-3 text-right">{euros(data.total.caHtCents)}</td>
                <td className="px-4 py-3 text-right">{moins(data.total.commissionsCents)}</td>
                <td className="px-4 py-3 text-right">{moins(data.total.coutsCents)}</td>
                <td className="px-4 py-3 text-right">{moins(data.total.amortissementCents)}</td>
                <td className={`px-4 py-3 text-right ${data.total.margeNetteCents < 0 ? "text-bad" : "text-good"}`}>{euros(data.total.margeNetteCents)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
