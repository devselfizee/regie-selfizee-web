"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type ReleveReversement } from "@/lib/api";
import { STATUTS } from "@/lib/commissions";
import { date, euros, jour, nombre, pct } from "@/lib/format";
import { useMoi } from "@/lib/session";
import { Badge, Chargement, Erreur } from "@/components/Etat";

/** Relevé de commission d'un lieu pour une période : à imprimer ou enregistrer en PDF. */
export function Releve({ id }: { id: number }) {
  const moi = useMoi();
  const { data: r, error } = useQuery({ queryKey: ["releve", id], queryFn: () => api<ReleveReversement>(`/reversements/${id}`) });
  if (error) return <Erreur erreur={error} />;
  if (!r) return <Chargement />;
  const d = r.detailCalcul;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={moi.role === "ADMIN" ? "/reversements" : `/lieux/${r.lieuId}`} className="text-sm text-accent hover:underline">← Retour</Link>
        <button className="bouton" onClick={() => window.print()}>Imprimer / enregistrer en PDF</button>
      </div>

      <article className="carte space-y-6 p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <div className="text-xs font-semibold tracking-wider text-accent uppercase">Selfizee · Régie</div>
            <h1 className="mt-1 text-2xl font-semibold">Relevé de commission</h1>
            <p className="mt-1 text-ink-2 capitalize">{d?.periode}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">{r.lieu.raisonSociale}</div>
            <div>{r.lieu.enseigne}</div>
            <div className="text-ink-2">{[r.lieu.adresse, [r.lieu.codePostal, r.lieu.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</div>
            {r.lieu.siret && <div className="text-ink-muted">SIRET {r.lieu.siret}</div>}
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <Chiffre libelle="Ventes" valeur={nombre(d?.nbVentes ?? 0)} />
          <Chiffre libelle="CA TTC" valeur={euros(r.caTtcCents)} />
          <Chiffre libelle="Remboursements" valeur={euros(r.rembourseCents)} />
        </section>

        <section>
          <h2 className="mb-1 text-sm font-semibold">Calcul de la commission</h2>
          <p className="mb-3 text-sm text-ink-2">
            Contrat (version {r.contrat.version}, en vigueur depuis le {date(r.contrat.dateEffet)}) : {d?.contrat}
          </p>
          <table className="w-full text-sm">
            <tbody className="tabular">
              <tr className="border-b border-line">
                <td className="py-2">Base de calcul</td>
                <td className="py-2 text-right">{euros(r.baseCalculCents)}</td>
              </tr>
              {d?.lignes.map((l, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-2 pr-3">
                    {l.libelle}
                    {l.baseCents !== undefined && l.tauxBp !== undefined && (
                      <span className="text-ink-muted"> — {pct(l.tauxBp / 10000)} × {euros(l.baseCents)}</span>
                    )}
                  </td>
                  <td className="py-2 text-right">{l.montantCents ? euros(l.montantCents) : ""}</td>
                </tr>
              ))}
              <tr className="border-b border-line font-medium">
                <td className="py-2">Commission calculée</td>
                <td className="py-2 text-right">{euros(r.commissionCalculeeCents)}</td>
              </tr>
              {r.ajustements.map((a) => (
                <tr key={a.id} className="border-b border-line">
                  <td className="py-2 pr-3">
                    Correction : {a.motif}
                    <span className="text-ink-muted"> ({[a.user.prenom, a.user.nom].filter(Boolean).join(" ")}, {date(a.createdAt)})</span>
                  </td>
                  <td className="py-2 text-right">{euros(a.montantCents)}</td>
                </tr>
              ))}
              <tr className="text-base font-semibold">
                <td className="pt-3">Montant à reverser</td>
                <td className="pt-3 text-right">{euros(r.montantAReverserCents)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <Badge ton={STATUTS[r.statut].ton}>{STATUTS[r.statut].libelle}</Badge>
            {r.numeroFacture && <span>Facture {r.numeroFacture}</span>}
            {r.payeLe && <span>· payé le {date(r.payeLe)}</span>}
          </div>
        </section>

        <section className="break-inside-avoid-page">
          <h2 className="mb-2 text-sm font-semibold">Détail des ventes par jour</h2>
          {r.ventesParJour.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="py-1 font-medium">Date</th>
                  <th className="py-1 text-right font-medium">Ventes</th>
                  <th className="py-1 text-right font-medium">CA TTC</th>
                  <th className="py-1 text-right font-medium">Remboursé</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {r.ventesParJour.map((v) => (
                  <tr key={v.jour} className="border-t border-line">
                    <td className="py-1">{jour(v.jour)}</td>
                    <td className="py-1 text-right">{nombre(v.nbVentes)}</td>
                    <td className="py-1 text-right">{euros(v.caTtcCents)}</td>
                    <td className="py-1 text-right text-ink-2">{v.rembourseTtcCents ? euros(v.rembourseTtcCents) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-muted">Aucune vente sur la période.</p>
          )}
        </section>

        <footer className="border-t border-line pt-3 text-xs text-ink-muted">
          Relevé établi le {date(r.calculeLe)} à partir des ventes enregistrées par les bornes Selfizee installées dans l&apos;établissement.
        </footer>
      </article>
    </div>
  );
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="rounded-md bg-surface-2 p-3">
      <div className="text-xs text-ink-2">{libelle}</div>
      <div className="mt-1 text-lg font-semibold tabular">{valeur}</div>
    </div>
  );
}
