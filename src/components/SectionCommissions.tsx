"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type CommissionsLieu } from "@/lib/api";
import { STATUTS } from "@/lib/commissions";
import { date, euros } from "@/lib/format";
import { useMoi } from "@/lib/session";
import { Badge, Chargement, Erreur, Section, Vide } from "./Etat";
import { FormContrat } from "./FormContrat";
import { Modale } from "./Modale";

/** Contrat de commission, commission en cours et reversements d'un lieu (admin, partenaire). */
export function SectionCommissions({ lieuId }: { lieuId: number }) {
  const moi = useMoi();
  const admin = moi.role === "ADMIN";
  const client = useQueryClient();
  const [formulaire, setFormulaire] = useState(false);
  const { data, error } = useQuery({
    queryKey: ["commissions", lieuId],
    queryFn: () => api<CommissionsLieu>(`/commissions/lieux/${lieuId}`),
  });
  const annuler = useMutation({
    mutationFn: (id: number) => api(`/commissions/contrats/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["commissions", lieuId] }),
  });

  if (error) return <Erreur erreur={error} />;
  if (!data) return <Chargement />;

  const actuel = data.contrats.find((c) => !c.dateFin) ?? data.contrats[0];
  const enCours = data.enCours && "commissionEstimeeCents" in data.enCours ? data.enCours : null;

  return (
    <Section
      titre="Contrat et commissions"
      actions={
        admin ? (
          <button className="bouton-second !py-1 text-xs" onClick={() => setFormulaire(true)}>
            {actuel ? "Avenant" : "Définir le contrat"}
          </button>
        ) : undefined
      }
    >
      {!actuel ? (
        <Vide>Aucun contrat de commission pour ce lieu.</Vide>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-base">{actuel.description}</p>
            <p className="mt-1 text-xs text-ink-muted">
              Version {actuel.version} · en vigueur depuis le {date(actuel.dateEffet)}
              {actuel.dateFin && ` jusqu'au ${date(actuel.dateFin)}`}
            </p>
          </div>

          {enCours && (
            <div className="rounded-md bg-surface-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-ink-2">Période en cours · {enCours.periode.libelle}</span>
                <span className="text-sm">
                  Commission à ce jour : <strong className="tabular">{euros(enCours.commissionEstimeeCents)}</strong>
                </span>
              </div>
              {enCours.seuil && <JaugeSeuil {...enCours.seuil} />}
            </div>
          )}
          {data.enCours && "horsSaison" in data.enCours && (
            <p className="text-sm text-ink-muted">Hors saison : pas de période de calcul en cours.</p>
          )}

          <div>
            <h3 className="mb-2 text-xs font-medium text-ink-2">Reversements</h3>
            {data.reversements.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-ink-2">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Période</th>
                      <th className="py-2 pr-3 text-right font-medium">Base</th>
                      <th className="py-2 pr-3 text-right font-medium">À reverser</th>
                      <th className="py-2 pr-3 font-medium">Statut</th>
                      <th className="py-2"><span className="sr-only">Relevé</span></th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {data.reversements.map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="py-2 pr-3 capitalize">{r.periode}</td>
                        <td className="py-2 pr-3 text-right text-ink-2">{euros(r.baseCalculCents)}</td>
                        <td className="py-2 pr-3 text-right font-medium">{euros(r.montantAReverserCents)}</td>
                        <td className="py-2 pr-3"><Badge ton={STATUTS[r.statut].ton}>{STATUTS[r.statut].libelle}</Badge></td>
                        <td className="py-2 text-right"><Link className="text-accent hover:underline" href={`/reversements/${r.id}`}>Relevé</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Aucune période terminée depuis la date d&apos;effet.</p>
            )}
          </div>

          {admin && data.contrats.length > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-medium text-ink-2">Historique du contrat ({data.contrats.length} versions)</summary>
              <ul className="mt-2 space-y-2">
                {data.contrats.map((c) => (
                  <li key={c.id} className="border-l-2 border-line pl-3">
                    <div>v{c.version} · du {date(c.dateEffet)}{c.dateFin ? ` au ${date(c.dateFin)}` : " (en vigueur)"}</div>
                    <div className="text-ink-2">{c.description}</div>
                    {c.motifAvenant && <div className="text-xs text-ink-muted">Motif : {c.motifAvenant}</div>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {admin && actuel && !actuel.dateFin && (
            <button
              type="button"
              className="text-xs text-ink-muted hover:text-bad hover:underline"
              onClick={() => confirm(`Supprimer la version ${actuel.version} du contrat (saisie par erreur) ?`) && annuler.mutate(actuel.id)}
            >
              Supprimer la version {actuel.version} (erreur de saisie)
            </button>
          )}
          {annuler.error && <p className="text-xs text-bad">{annuler.error.message}</p>}
        </div>
      )}

      <Modale titre={actuel ? "Avenant au contrat" : "Contrat de commission"} ouverte={formulaire} onFermer={() => setFormulaire(false)} large>
        <FormContrat lieuId={lieuId} actuel={actuel} onFini={() => setFormulaire(false)} />
      </Modale>
    </Section>
  );
}

/** Position du CA par rapport au seuil de commission (CDC §5.2). */
function JaugeSeuil({ seuilCents, atteintCents, cumule }: { seuilCents: number; atteintCents: number; cumule: boolean }) {
  const ratio = Math.min(1, atteintCents / seuilCents);
  const franchi = atteintCents >= seuilCents;
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs text-ink-2">
        <span>{cumule ? "Cumul depuis la date d'effet" : "CA de la période"} : {euros(atteintCents)}</span>
        <span>Seuil : {euros(seuilCents)}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={seuilCents / 100}
        aria-valuenow={atteintCents / 100}
        aria-label="Position par rapport au seuil"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {franchi ? "✓ Seuil franchi" : `Encore ${euros(seuilCents - atteintCents)} avant le seuil`}
      </p>
    </div>
  );
}
