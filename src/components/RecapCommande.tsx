"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type RecapVente } from "@/lib/api";
import { dateHeure, euros, GRATUITES, MOYENS } from "@/lib/format";
import { Badge, Chargement, Erreur } from "./Etat";

// Récapitulatif d'une commande (demande de Sébastien, comme boothpay) : la photo, le paiement,
// les autres paiements de la séance, les remboursements et le parcours de l'invité.

export const STATUTS_PAIEMENT: Record<string, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre" }> = {
  ACCEPTEE: { libelle: "Acceptée", ton: "ok" },
  REFUSEE: { libelle: "Refusée", ton: "crit" },
  ANNULEE: { libelle: "Annulée", ton: "neutre" },
  EXPIREE: { libelle: "Sans réponse du terminal", ton: "warn" },
  OFFERTE: { libelle: "Tirage offert (non débité)", ton: "warn" },
  REMBOURSEE: { libelle: "Remboursement", ton: "neutre" },
};

const ETAPES: Record<string, string> = {
  cadre: "Cadre choisi", prise: "Prise", photo: "Photo prise", revelation: "Photo vue", offre: "Offre vue",
  paiement: "Paiement affiché", paiement_demande: "Paiement demandé", impression: "Imprimée",
};

function Info({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] font-medium uppercase tracking-wide text-ink-muted">{libelle}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

export function RecapCommande({ id, onRembourser }: { id: string; onRembourser?: (v: RecapVente) => void }) {
  const { data: v, error } = useQuery({ queryKey: ["ventes", "recap", id], queryFn: () => api<RecapVente>(`/ventes/${id}`) });
  if (error) return <Erreur erreur={error} />;
  if (!v) return <Chargement />;

  const statut = STATUTS_PAIEMENT[v.statut] ?? { libelle: v.statut, ton: "neutre" as const };
  const gratuite = v.gratuite || (v.statut === "ACCEPTEE" && v.moyenPaiement === "AUCUN");
  const encaissee = v.statut === "ACCEPTEE" && !gratuite && v.montantTtcCents > 0;
  const remboursable = encaissee && v.montantTtcCents > v.rembourseCents;
  const autres = v.seance.paiements.filter((p) => p.id !== v.id);

  return (
    <div className="-m-4">
      {/* Photo de la séance */}
      <div className="flex min-h-40 items-center justify-center bg-[#1c1630] p-4">
        {v.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- image externe (PikCloud), taille inconnue
          <img src={v.photoUrl} alt={`Photo de la séance ${v.seance.code}`} className="max-h-80 w-auto rounded shadow-lg" />
        ) : (
          <p className="max-w-xs text-center text-sm text-white/70">
            {v.photoUuid
              ? "Photo enregistrée, mais l'adresse des photos n'est pas encore réglée sur la plateforme."
              : "Pas de photo liée à ce paiement : la borne n'a pas envoyé son identifiant PikCloud."}
          </p>
        )}
      </div>

      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className={`text-3xl font-semibold tabular ${encaissee ? "" : "text-ink-muted"}`}>{euros(v.montantTtcCents)}</div>
            <div className="text-xs text-ink-2 tabular">
              {encaissee ? `HT ${euros(v.montantHtCents)} · TVA ${euros(v.montantTtcCents - v.montantHtCents)} · TTC` : "demandés, non encaissés"}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            <Badge ton={statut.ton}>{statut.libelle}</Badge>
            {v.encaissement === "INCERTAIN" && <Badge ton="warn">À rapprocher</Badge>}
            {gratuite && <Badge ton="neutre">Gratuit{v.gratuite ? ` — ${GRATUITES[v.gratuite] ?? v.gratuite.toLowerCase()}` : ""}</Badge>}
            {v.borne.parc === "CLIENT" && <Badge ton="neutre">Parc client</Badge>}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-sm">
          <Info libelle="Date">{dateHeure(v.horodatage)}</Info>
          <Info libelle="Lieu">
            {v.lieu ? <Link className="hover:underline" href={`/lieux/${v.lieu.id}`}>{v.lieu.enseigne}</Link> : <span className="text-ink-muted">non affectée</span>}
            {v.parcours?.evenement && <span className="text-ink-muted"> · {v.parcours.evenement}</span>}
          </Info>
          <Info libelle="Quantité">
            {v.nbTirages} impression{v.nbTirages > 1 ? "s" : ""}
            <span className="text-ink-muted"> · {v.produitLibelle ?? v.produitCode}</span>
          </Info>
          <Info libelle="Borne">
            <Link className="hover:underline" href={`/bornes/${v.borne.id}`}>{v.borne.identifiant}</Link>
            <span className="text-ink-muted"> · {v.borne.gamme.libelle}</span>
          </Info>
          <Info libelle="Paiement">
            {MOYENS[v.moyenPaiement] ?? v.moyenPaiement}
            <span className="block text-xs text-ink-muted">{v.typeModule.libelle}{v.module?.identifiantPrestataire ? ` · TID ${v.module.identifiantPrestataire}` : ""}</span>
          </Info>
          <Info libelle="Carte">{v.carteFin ? <span className="font-mono">•••• {v.carteFin}</span> : <span className="text-ink-muted">—</span>}</Info>
          <Info libelle="N° d'autorisation">{v.referenceMonetique ? <span className="font-mono">{v.referenceMonetique}</span> : <span className="text-ink-muted">—</span>}</Info>
          <Info libelle="N° de séquence">{v.referenceSequence ? <span className="font-mono">{v.referenceSequence}</span> : <span className="text-ink-muted">—</span>}</Info>
          <div className="col-span-2">
            <Info libelle="Transaction">
              <span className="font-mono text-xs">{v.transactionIdModule}</span>
              {v.motif && <span className="text-ink-muted"> · motif : {v.motif.toLowerCase()}</span>}
            </Info>
          </div>
        </dl>

        {autres.length > 0 && (
          <div className="border-t border-line pt-4 text-sm">
            <h3 className="mb-2 text-xs font-medium text-ink-2">Autres paiements de la séance {v.seance.code.split("-").pop()}</h3>
            <ul className="space-y-1">
              {autres.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 tabular">
                  <span>
                    {dateHeure(p.horodatage)} · {p.produitLibelle ?? p.produitCode}
                    <span className="text-ink-muted"> · {STATUTS_PAIEMENT[p.statut]?.libelle ?? p.statut}</span>
                  </span>
                  <span>{euros(p.montantTtcCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {v.remboursements.length > 0 && (
          <div className="border-t border-line pt-4 text-sm">
            <h3 className="mb-2 text-xs font-medium text-ink-2">Remboursements</h3>
            <ul className="space-y-1">
              {v.remboursements.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 tabular">
                  <span>{dateHeure(r.horodatage)}{r.motif && <span className="text-ink-muted"> · {r.motif}</span>}</span>
                  <span className="text-bad">− {euros(r.montantTtcCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {v.parcours && (
          <div className="border-t border-line pt-4 text-sm">
            <h3 className="mb-2 text-xs font-medium text-ink-2">
              Parcours de l&apos;invité · {Math.round(v.parcours.dureeS / 6) / 10} min{v.parcours.cadre ? ` · cadre ${v.parcours.cadre}` : ""}
            </h3>
            <ol className="flex flex-wrap gap-1">
              {Object.entries(ETAPES).map(([cle, libelle]) => (
                <li key={cle}>
                  <Badge ton={v.parcours!.etapes[cle] ? "ok" : "neutre"}>{libelle}</Badge>
                </li>
              ))}
            </ol>
          </div>
        )}

        {remboursable && onRembourser && (
          <div className="border-t border-line pt-4">
            <button type="button" className="bouton-second" onClick={() => onRembourser(v)}>Rembourser</button>
          </div>
        )}
      </div>
    </div>
  );
}
