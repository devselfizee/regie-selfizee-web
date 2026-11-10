"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type Atteinte, type PrevisionGlobale, type PrevisionLieu } from "@/lib/api";
import { euros, eurosRond, jour, pct, variation } from "@/lib/format";
import { Badge, Chargement, Erreur, Section } from "./Etat";
import { AvertissementsPrevision, GraphiquePrevision, libelleMois, METHODE, previsionEnHt, ResumePrevision } from "./Prevision";

/** Ligne par lieu de /previsions/global ; precedentCents : CA du mois précédent du lieu (API récente) */
type LieuPrevu = PrevisionGlobale["lieux"][number] & { precedentCents?: number };

/** Détail par lieu sous la prévision globale (page Lieux) : réalisé, reste prévu, fourchette, écart au mois précédent */
function DetailParLieu({ p }: { p: PrevisionGlobale }) {
  const lieux = (p.lieux as LieuPrevu[]).filter((l) => l.totalCents > 0 || l.realiseCents > 0);
  if (!lieux.length) return null;
  const max = Math.max(...lieux.map((l) => l.totalCents));
  const dernier = [...p.jours].reverse().find((j) => j.realiseCents !== null)?.jour;
  const moisPrec = libelleMois(new Date(Date.UTC(Number(p.du.slice(0, 4)), Number(p.du.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10)).split(" ")[0];
  return (
    <div className="mt-4 overflow-x-auto border-t border-line pt-3">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>
            <th className="py-2 pr-3 font-medium">Par lieu</th>
            <th className="py-2 pr-3 text-right font-medium">Réalisé{dernier ? ` au ${jour(dernier).slice(0, 5)}` : ""}</th>
            <th className="w-1/4 py-2 pr-3 font-medium">Réalisé · reste prévu</th>
            <th className="py-2 pr-3 text-right font-medium">Prévu fin {libelleMois(p.du).split(" ")[0]}</th>
            <th className="py-2 pr-3 text-right font-medium">Fourchette</th>
            <th className="py-2 text-right font-medium">vs {moisPrec}</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {lieux.map((l) => {
            const v = l.precedentCents ? variation(l.totalCents, l.precedentCents) : null;
            return (
              <tr key={l.id} className="border-t border-line" title={`${l.enseigne} : ${eurosRond(l.realiseCents)} réalisés · ${eurosRond(l.totalCents)} prévus (entre ${eurosRond(l.basseCents)} et ${eurosRond(l.hauteCents)})`}>
                <td className="py-2 pr-3"><Link className="font-medium hover:underline" href={`/lieux/${l.id}`}>{l.enseigne}</Link></td>
                <td className="py-2 pr-3 text-right">{eurosRond(l.realiseCents)}</td>
                <td className="py-2 pr-3">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-[#ECECFC]" style={{ width: `${max ? (l.totalCents / max) * 100 : 0}%` }}>
                    <span className="bg-[#5B4CF5]" style={{ width: `${l.totalCents ? (l.realiseCents / l.totalCents) * 100 : 0}%` }} />
                    <span className="flex-1 bg-[#C9CBF8]" />
                  </div>
                </td>
                <td className="py-2 pr-3 text-right font-medium">{eurosRond(l.totalCents)}</td>
                <td className="py-2 pr-3 text-right text-ink-2">{eurosRond(l.basseCents)} – {eurosRond(l.hauteCents)}</td>
                <td className={`py-2 text-right ${v === null ? "text-ink-muted" : v < 0 ? "text-bad" : "text-ink-2"}`}>
                  {v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${pct(Math.abs(v))}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Vue globale : prévision du mois en cours, tous lieux actifs (indépendante des filtres).
 * detail : tableau par lieu dessous et méthode repliée (page Lieux) ; sans : tableau de bord, inchangé.
 */
export function PrevisionGlobaleSection({ ht = false, detail = false }: { ht?: boolean; detail?: boolean }) {
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
            {detail ? (
              <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer text-ink-2">Méthode</summary>
                <p className="mt-1">{METHODE.replace(/^Méthode : m/, "M")}</p>
              </details>
            ) : (
              <p className="text-xs text-ink-muted">{METHODE}</p>
            )}
          </div>
          <div className="lg:col-span-2">
            <GraphiquePrevision jours={p.jours} n1Cents={p.n1Cents} />
          </div>
        </div>
      )}
      {p && detail && <DetailParLieu p={p} />}
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
