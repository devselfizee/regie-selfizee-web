"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs, type ContexteLieu, type OccurrenceMarketing } from "@/lib/api";
import { euros, nombre } from "@/lib/format";
import { Chargement, Erreur } from "./Etat";

// Vue calendrier des ventes (retour de Sébastien) : un mois, la synthèse de chaque jour ; un clic ouvre ses paiements en popup.

interface JourVentes {
  jour: string;
  nbVentes: number;
  encaisseTtcCents: number;
  rembourseTtcCents: number;
  encaisseHtCents?: number;
  rembourseHtCents?: number;
  nbNonAbouties: number;
  nbSansAction: number;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const JOURS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
// Aujourd'hui à Paris
const aujourdhui = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

/** filtres : query string des filtres de la liste (lieu, borne, moyen, parc, cartes), sans période */
export function CalendrierVentes({ filtres, lieuId, onJour, ht = false }: { filtres: Record<string, string | undefined>; lieuId?: number; onJour: (jour: string) => void; ht?: boolean }) {
  const [mois, setMois] = useState(() => aujourdhui().slice(0, 7));
  const premier = new Date(`${mois}-01T00:00:00Z`);
  const dernier = new Date(Date.UTC(premier.getUTCFullYear(), premier.getUTCMonth() + 1, 0));
  // Grille du lundi avant le 1er au dimanche après le dernier jour
  const debutGrille = new Date(premier.getTime() - ((premier.getUTCDay() + 6) % 7) * 86_400_000);
  const finGrille = new Date(dernier.getTime() + ((7 - dernier.getUTCDay()) % 7) * 86_400_000);
  const du = ymd(debutGrille);
  const au = ymd(finGrille);

  const ventes = useQuery({
    queryKey: ["ventes-par-jour", filtres, du, au],
    queryFn: () => api<JourVentes[]>(`/ventes/par-jour${qs({ ...filtres, du, au })}`),
    placeholderData: keepPreviousData,
  });
  const marketing = useQuery({ queryKey: ["calendrier-marketing", du, au], queryFn: () => api<OccurrenceMarketing[]>(`/calendrier-marketing${qs({ du, au })}`) });
  // Sur une fiche lieu : jours fériés et vacances de sa zone
  const contexte = useQuery({
    queryKey: ["contexte", lieuId, du, au],
    queryFn: () => api<ContexteLieu>(`/stats/contexte/lieux/${lieuId}${qs({ du, au })}`),
    enabled: !!lieuId,
  });

  // Montants HT ou TTC selon la bascule de la page (retour de Sébastien)
  const encaisse = (j: JourVentes) => (ht ? (j.encaisseHtCents ?? 0) : j.encaisseTtcCents);
  const net = (j: JourVentes) => encaisse(j) - (ht ? (j.rembourseHtCents ?? 0) : j.rembourseTtcCents);
  const parJour = new Map((ventes.data ?? []).map((j) => [j.jour, j]));
  const contexteJour = new Map((contexte.data?.jours ?? []).map((j) => [j.jour, j]));
  const jours: string[] = [];
  for (let t = debutGrille.getTime(); t <= finGrille.getTime(); t += 86_400_000) jours.push(ymd(new Date(t)));
  const duMois = (ventes.data ?? []).filter((j) => j.jour.startsWith(mois));
  const total = duMois.reduce((s, j) => ({ ca: s.ca + net(j), nb: s.nb + j.nbVentes }), { ca: 0, nb: 0 });
  const max = Math.max(1, ...duMois.map(encaisse));
  const changerMois = (n: number) => setMois(ymd(new Date(Date.UTC(premier.getUTCFullYear(), premier.getUTCMonth() + n, 1))).slice(0, 7));
  const auj = aujourdhui();

  return (
    <div className="carte p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold first-letter:uppercase">{premier.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })}</h3>
        <span className="text-sm text-ink-2 tabular">
          {euros(total.ca)} {ht ? "HT" : "TTC"} encaissés · {nombre(total.nb)} vente{total.nb > 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" className="bouton-second !px-2 !py-1" onClick={() => changerMois(-1)} aria-label="Mois précédent">‹</button>
          <button type="button" className="bouton-second !py-1" onClick={() => setMois(auj.slice(0, 7))}>Aujourd&apos;hui</button>
          <button type="button" className="bouton-second !px-2 !py-1" onClick={() => changerMois(1)} aria-label="Mois suivant">›</button>
        </div>
      </div>
      {ventes.error && <Erreur erreur={ventes.error} />}
      {ventes.isPending && <Chargement />}
      <div>
        <div className="grid grid-cols-7 border-l border-t border-line text-sm">
          {JOURS.map((j, i) => (
            <div key={j} className={`border-b border-r border-line px-2 py-1 text-right text-xs text-ink-2 ${i >= 5 ? "bg-surface-2" : ""}`}>{j}</div>
          ))}
          {jours.map((jour) => {
            const v = parJour.get(jour);
            const horsMois = !jour.startsWith(mois);
            const weekEnd = [0, 6].includes(new Date(`${jour}T00:00:00Z`).getUTCDay());
            const c = contexteJour.get(jour);
            const temps = (marketing.data ?? []).filter((m) => m.du <= jour && m.au >= jour);
            const libelles = [...(c?.ferie ? [{ t: c.ferie, cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" }] : []), ...temps.map((m) => ({ t: m.nom, cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300" }))];
            const actif = !!v && (v.nbVentes > 0 || v.nbNonAbouties > 0 || v.nbSansAction > 0);
            return (
              <button
                key={jour}
                type="button"
                onClick={() => onJour(jour)}
                disabled={!actif}
                title={c?.vacances ?? undefined}
                className={`flex min-h-24 min-w-0 flex-col gap-0.5 overflow-hidden border-b border-r border-line p-1 text-left align-top sm:p-1.5 ${weekEnd ? "bg-surface-2" : ""} ${horsMois ? "opacity-45" : ""} ${actif ? "hover:bg-accent/5" : "cursor-default"}`}
              >
                <span className="flex items-center justify-between gap-1 text-xs">
                  {c?.vacances ? <span className="truncate text-ink-muted">vacances</span> : <span />}
                  <span className={jour === auj ? "rounded-full bg-bad px-1.5 font-semibold text-white" : "text-ink-2"}>{Number(jour.slice(8))}</span>
                </span>
                {libelles.map((l) => (
                  <span key={l.t} className={`truncate rounded px-1 text-[11px] ${l.cls}`} title={l.t}>{l.t}</span>
                ))}
                {v && v.nbVentes > 0 && (
                  <>
                    <span className="mt-auto truncate text-xs font-semibold tabular sm:text-sm">{euros(net(v))}</span>
                    <span className="h-1 rounded bg-surface-2" aria-hidden>
                      <span className="block h-1 rounded bg-accent/70" style={{ width: `${(encaisse(v) / max) * 100}%` }} />
                    </span>
                    <span className="truncate text-xs text-ink-2 tabular">{nombre(v.nbVentes)} vente{v.nbVentes > 1 ? "s" : ""}</span>
                  </>
                )}
                {v && (v.nbNonAbouties > 0 || v.nbSansAction > 0) && (
                  <span className="hidden text-[11px] text-ink-muted tabular sm:block">
                    {[v.nbNonAbouties > 0 && `${v.nbNonAbouties} non abouti${v.nbNonAbouties > 1 ? "s" : ""}`, v.nbSansAction > 0 && `${v.nbSansAction} sans action`].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Encaissé du jour (remboursements déduits). En orange : calendrier marketing{lieuId ? " ; en violet : jours fériés" : ""}. Cliquez sur un jour pour voir ses paiements.
      </p>
    </div>
  );
}
