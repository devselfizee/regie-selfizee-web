"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type Atteinte, type PrevisionGlobale, type PrevisionLieu } from "@/lib/api";
import { euros, eurosRond, jour } from "@/lib/format";
import { Badge, Chargement, Erreur, Section } from "./Etat";
import { AvertissementsPrevision, GraphiquePrevision, libelleMois, METHODE, previsionEnHt, ResumePrevision } from "./Prevision";

/** Vue globale : prévision du mois en cours, tous lieux actifs (indépendante des filtres). */
export function PrevisionGlobaleSection({ ht = false }: { ht?: boolean }) {
  const { data, error } = useQuery({ queryKey: ["previsions", "global"], queryFn: () => api<PrevisionGlobale>("/previsions/global"), staleTime: 5 * 60_000 });
  // Calculée en TTC : en HT, montants passés à la part HT des ventes réelles (bascule HT / TTC de la page)
  const p = data && ht ? previsionEnHt(data, data.ratioHt ?? 1 / 1.2) : data;
  return (
    <Section titre={p ? `Prévision ${libelleMois(p.du)} ${ht ? "HT" : "TTC"}` : "Prévision du mois"}>
      {error && <Erreur erreur={error} />}
      {!p && !error && <Chargement />}
      {p && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <ResumePrevision p={{ ...p, joursOuvertsRestants: Math.max(0, ...p.lieux.map((l) => l.joursOuvertsRestants)), fiable: true, correctionSaisonniere: null, arretDepuis: null }} n1Cents={p.n1Cents} precedentCents={p.precedentCents} />
            {p.lieux.some((l) => l.arretDepuis) && (
              <div className="text-sm">
                <div className="text-warn-ink">Plus aucune vente, rien de prévu :</div>
                <ul className="mt-1 space-y-0.5">
                  {p.lieux.filter((l) => l.arretDepuis).map((l) => (
                    <li key={l.id}><Link className="hover:underline" href={`/lieux/${l.id}`}>{l.enseigne}</Link> <span className="text-ink-muted">depuis le {jour(l.arretDepuis!)}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {p.lieuxPeuFiables > 0 && <p className="text-xs text-ink-muted">{p.lieuxPeuFiables} lieu(x) avec moins de 3 semaines d&apos;historique : prévision indicative.</p>}
            <p className="text-xs text-ink-muted">{METHODE}</p>
          </div>
          <div className="lg:col-span-2">
            <GraphiquePrevision jours={p.jours} n1Cents={p.n1Cents} />
          </div>
        </div>
      )}
    </Section>
  );
}

const Etat = ({ a }: { a: Atteinte }) =>
  a.statut === "ATTEINT" ? <Badge ton="ok">Atteint le {jour(a.jour)}</Badge>
  : a.statut === "PREVU" ? <Badge ton="neutre">Prévu le {jour(a.jour)}</Badge>
  : <Badge ton="warn">Pas d&apos;ici la fin · manque {eurosRond(a.manqueCents)}</Badge>;

/** Fiche lieu : prévision du mois et, pour l'admin et le partenaire, de la commission. */
export function PrevisionLieuSection({ lieuId, ht = false }: { lieuId: number; ht?: boolean }) {
  const { data, error } = useQuery({ queryKey: ["previsions", "lieu", lieuId], queryFn: () => api<PrevisionLieu>(`/previsions/lieux/${lieuId}`), staleTime: 5 * 60_000 });
  // CA prévu en HT selon la bascule ; la commission reste telle que calculée (montant à reverser)
  const p = data && ht && data.mois ? { ...data, mois: previsionEnHt(data.mois, data.ratioHt ?? 1 / 1.2) } : data;
  return (
    <Section titre={p?.mois ? `Prévision ${libelleMois(p.mois.du)} ${ht ? "HT" : "TTC"}` : "Prévision du mois"}>
      {error && <Erreur erreur={error} />}
      {!p && !error && <Chargement />}
      {p && !p.mois && (
        <p className="text-sm text-ink-2">
          La projection s&apos;affiche après une semaine d&apos;activité
          {p.premiereVente ? ` (première vente le ${jour(p.premiereVente)})` : " : aucune vente pour l'instant"}.
        </p>
      )}
      {p?.mois && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <ResumePrevision p={p.mois} />
            <AvertissementsPrevision p={p.mois} />
            {p.commission && (
              <div className="space-y-2 border-t border-line pt-3">
                <div className="text-xs font-medium text-ink-2">Commission {p.commission.periode.libelle}</div>
                <div className="text-lg font-semibold">
                  {euros(p.commission.commissionPrevueCents)} <span className="text-sm font-normal text-ink-2">prévue</span>
                </div>
                <div className="text-xs text-ink-2">
                  entre {euros(p.commission.commissionBasseCents)} et {euros(p.commission.commissionHauteCents)} · {euros(p.commission.commissionActuelleCents)} à ce jour
                </div>
                {p.commission.seuils.length > 0 && (
                  <ul className="space-y-1.5 text-sm">
                    {p.commission.seuils.map((s) => (
                      <li key={s.libelle} className="flex flex-wrap items-center justify-between gap-2">
                        <span>{s.libelle} · {eurosRond(s.montantCents)} {p.commission!.base}{p.commission!.seuilCumule && " cumulé"}</span>
                        <Etat a={s.atteinte} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="text-xs text-ink-muted">{METHODE}</p>
          </div>
          <div className="lg:col-span-2">
            <GraphiquePrevision jours={p.mois.jours} />
          </div>
        </div>
      )}
    </Section>
  );
}
