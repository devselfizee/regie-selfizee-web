"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { euros, nombre, pct } from "@/lib/format";
import { Chargement, Erreur, Section } from "./Etat";

// Comportement des invités (parcours envoyés par les bornes, avenant du 26/10/2026) : de la première page
// à l'impression, pourquoi les paiements n'aboutissent pas, et les formats de cadre qui plaisent.

export interface StatsParcours {
  periode: { du: string; au: string };
  commencees: number;
  etapes: Record<"cadre" | "prise" | "photo" | "revelation" | "offre" | "paiement" | "paiement_demande" | "impression", number>;
  payees: number;
  validees: number;
  issues: { issue: string; nb: number }[];
  appels: { lancees: number; engagees: number; payees: number };
  hesitations: { avecRecommencer: number; avecRelancesCouleurs: number; avecRetoursOffre: number };
  upsell: { proposes: number; acceptes: number; montantCents: number };
  dureesMedianesS: { seance: number | null; cadreAPhoto: number | null; photoAOffre: number | null; offreAPaiement: number | null; paiementAImpression: number | null };
  parCadre: { cadre: string | null; commencees: number; offres: number; payees: number }[];
  parHeure: { heure: number; commencees: number; payees: number }[];
  /** Séances qui ont vu la fenêtre de paiement sans payer, par raison */
  nonAboutis?: { raison: string; nb: number }[];
  /** Tentatives de paiement refusées, annulées ou sans réponse, par motif */
  tentativesEchouees?: { statut: string; motif: string | null; nb: number }[];
  /** Fiche lieu : vignette du cadre dessiné au studio, par nom de gabarit */
  apercus?: Record<string, string>;
}

const MARCHES: { cle: keyof StatsParcours["etapes"] | "commencees" | "payees"; libelle: string }[] = [
  { cle: "commencees", libelle: "Séances commencées" },
  { cle: "cadre", libelle: "Cadre choisi" },
  { cle: "photo", libelle: "Photo prise" },
  { cle: "revelation", libelle: "Photo vue" },
  { cle: "offre", libelle: "Offre vue" },
  { cle: "paiement", libelle: "Paiement affiché" },
  { cle: "paiement_demande", libelle: "Paiement demandé" },
  { cle: "payees", libelle: "Paiement accepté" },
  { cle: "impression", libelle: "Imprimée" },
];

const ISSUES: Record<string, string> = {
  validee: "Photo enregistrée",
  retour: "Retour à l'accueil",
  delai: "Délai d'inactivité",
  appel: "Photo d'appel sans geste",
  autre: "Autre",
};

// Fenêtre de paiement affichée, séance non payée : ce que la borne a noté dans le parcours
const RAISONS: Record<string, string> = {
  non_demande: "Fenêtre fermée sans lancer le paiement",
  annule: "Paiement annulé",
  refuse: "Paiement refusé",
  expire: "Terminal sans réponse",
  offert: "Tirage offert après un échec",
  inconnu: "Issue inconnue",
};

/** Tentative de paiement échouée (ventes) : statut et motif envoyés par la borne */
const libelleTentative = (statut: string, motif: string | null) =>
  statut === "REFUSEE"
    ? motif === "BANQUE" ? "Refus de la banque" : motif === "TERMINAL" ? "Refus du terminal (erreur TPA)" : "Refusé (motif non transmis)"
    : statut === "ANNULEE"
      ? motif === "INVITE" ? "Annulé par l'invité" : motif === "TERMINAL" ? "Annulé par le terminal (erreur TPA)" : "Annulé (motif non transmis)"
      : "Terminal sans réponse (erreur TPA)";

const duree = (s: number | null) => (s === null ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`);

/**
 * Comportement des invités, global (chemin /stats/parcours avec les filtres) ou d'un lieu.
 * requete : query string des filtres (« ?du=…&au=… »).
 */
export function Comportement({ requete, lieuId }: { requete: string; lieuId?: number }) {
  const chemin = lieuId ? `/stats/lieux/${lieuId}/parcours` : "/stats/parcours";
  const { data, error, isPending } = useQuery({
    queryKey: ["parcours", chemin, requete],
    queryFn: () => api<StatsParcours>(`${chemin}${requete}`),
  });
  if (error) return <Section titre="Parcours des invités"><Erreur erreur={error} /></Section>;
  if (isPending) return <Section titre="Parcours des invités"><Chargement /></Section>;
  // Rien reçu : la borne n'envoie pas encore ses parcours (logiciel à mettre à jour)
  if (!data.commencees) {
    return (
      <Section titre="Parcours des invités">
        <p className="text-sm text-ink-2">
          Aucun parcours reçu sur la période. Les bornes envoient le parcours de chaque séance (de la première page à l&apos;impression)
          depuis la version du logiciel livrée avec l&apos;avenant du 26/10/2026.
        </p>
      </Section>
    );
  }
  return (
    <div className="space-y-6">
      <Parcours data={data} />
      <PaiementsNonAboutis data={data} />
      <FormatsCadre data={data} />
    </div>
  );
}

function Parcours({ data }: { data: StatsParcours }) {
  const valeur = (cle: (typeof MARCHES)[number]["cle"]) => (cle === "commencees" ? data.commencees : cle === "payees" ? data.payees : data.etapes[cle]);
  const d = data.dureesMedianesS;
  const echecs = (data.tentativesEchouees ?? []).reduce((s, t) => s + t.nb, 0);

  return (
    <Section titre="Parcours des invités" actions={<span className="text-sm text-ink-2">{nombre(data.commencees)} séances</span>}>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Entonnoir : une barre centrée par étape, une flèche entre deux étapes avec ce qui s'est perdu */}
        <ol aria-label="Entonnoir de conversion">
          {MARCHES.map((m, i) => {
            const v = valeur(m.cle);
            const part = data.commencees ? v / data.commencees : 0;
            const precedente = i > 0 ? valeur(MARCHES[i - 1].cle) : v;
            const perdus = Math.max(0, precedente - v);
            return (
              <Fragment key={m.cle}>
                {i > 0 && (
                  <li aria-hidden className="grid grid-cols-[9rem_1fr_9rem] items-center gap-3 text-xs">
                    <span />
                    <span className="flex flex-col items-center py-0.5 text-ink-muted">
                      <svg width="14" height="14" viewBox="0 0 14 14" className={perdus ? "text-bad" : "text-ink-muted"}>
                        <path d="M7 1v10M3 7l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className={perdus ? "text-bad" : "text-ink-muted"}>
                      {perdus ? `−${nombre(perdus)} (${pct(precedente ? perdus / precedente : 0)})` : "aucune perte"}
                      {m.cle === "payees" && echecs > 0 && <span className="block text-ink-muted">{nombre(echecs)} tentative(s) échouée(s), détail plus bas</span>}
                    </span>
                  </li>
                )}
                <li className="grid grid-cols-[9rem_1fr_9rem] items-center gap-3 text-sm">
                  <span className="text-ink-2">{m.libelle}</span>
                  <span className="flex h-7 justify-center rounded bg-surface-2">
                    <span className="block h-7 rounded bg-accent/80" style={{ width: `${Math.max(part * 100, v ? 1 : 0)}%` }} />
                  </span>
                  <span className="tabular">
                    <strong>{nombre(v)}</strong>
                    <span className="text-xs text-ink-muted"> · {pct(part)}</span>
                  </span>
                </li>
              </Fragment>
            );
          })}
        </ol>

        <div className="space-y-4 text-sm">
          <div>
            <h3 className="mb-1 text-xs font-medium text-ink-2">Comment les séances se terminent</h3>
            <ul className="space-y-0.5">
              {data.issues.map((x) => (
                <li key={x.issue} className="flex justify-between gap-3 tabular">
                  <span>{ISSUES[x.issue] ?? x.issue}</span>
                  <span>{nombre(x.nb)} <span className="text-ink-muted">· {pct(x.nb / data.commencees)}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium text-ink-2">Temps médians</h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular">
              <dt>Séance entière</dt><dd>{duree(d.seance)}</dd>
              <dt>Cadre → photo</dt><dd>{duree(d.cadreAPhoto)}</dd>
              <dt>Photo → offre</dt><dd>{duree(d.photoAOffre)}</dd>
              <dt>Offre → paiement demandé</dt><dd>{duree(d.offreAPaiement)}</dd>
              <dt>Paiement → impression</dt><dd>{duree(d.paiementAImpression)}</dd>
            </dl>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium text-ink-2">Hésitations</h3>
            <p className="text-ink-2">
              {pct(data.hesitations.avecRecommencer / data.commencees)} ont recommencé · {pct(data.hesitations.avecRelancesCouleurs / data.commencees)} ont relancé les couleurs ·{" "}
              {pct(data.hesitations.avecRetoursOffre / data.commencees)} sont revenus de l&apos;offre
            </p>
          </div>
          {data.upsell.proposes > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-ink-2">« +1 pour un pote »</h3>
              <p className="text-ink-2">
                {nombre(data.upsell.acceptes)} acceptés sur {nombre(data.upsell.proposes)} proposés ({pct(data.upsell.acceptes / data.upsell.proposes)}) · {euros(data.upsell.montantCents)}
              </p>
            </div>
          )}
          {data.appels.lancees > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-medium text-ink-2">Photos d&apos;appel</h3>
              <p className="text-ink-2">
                {nombre(data.appels.lancees)} lancées · {nombre(data.appels.engagees)} ont attiré quelqu&apos;un · {nombre(data.appels.payees)} finies en vente
              </p>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Barres horizontales simples : libellé, barre proportionnelle, nombre et part */
function Barres({ lignes, total, ton = "bg-bad/70" }: { lignes: { cle: string; libelle: string; nb: number }[]; total: number; ton?: string }) {
  const max = Math.max(1, ...lignes.map((l) => l.nb));
  return (
    <ul className="space-y-1.5 text-sm">
      {lignes.map((l) => (
        <li key={l.cle} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3">
          <span className="truncate" title={l.libelle}>{l.libelle}</span>
          <span className="h-3 rounded bg-surface-2">
            <span className={`block h-3 rounded ${ton}`} style={{ width: `${(l.nb / max) * 100}%` }} />
          </span>
          <span className="w-28 text-right tabular">
            {nombre(l.nb)} <span className="text-xs text-ink-muted">· {pct(total ? l.nb / total : 0)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function PaiementsNonAboutis({ data }: { data: StatsParcours }) {
  const seances = data.nonAboutis ?? [];
  const tentatives = data.tentativesEchouees ?? [];
  const totalSeances = seances.reduce((s, x) => s + x.nb, 0);
  // Même libellé pour plusieurs couples statut / motif : regroupés
  const parLibelle = new Map<string, number>();
  for (const t of tentatives) parLibelle.set(libelleTentative(t.statut, t.motif), (parLibelle.get(libelleTentative(t.statut, t.motif)) ?? 0) + t.nb);
  const lignesTentatives = [...parLibelle].map(([libelle, nb]) => ({ cle: libelle, libelle, nb })).sort((a, b) => b.nb - a.nb);
  const totalTentatives = lignesTentatives.reduce((s, x) => s + x.nb, 0);

  return (
    <Section titre="Paiements non aboutis">
      {!totalSeances && !totalTentatives ? (
        <p className="text-sm text-ink-2">Aucun paiement manqué sur la période.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-medium text-ink-2">Après la fenêtre de paiement · {nombre(totalSeances)} séance(s) non payée(s)</h3>
            <p className="mb-2 text-xs text-ink-muted">D&apos;après le parcours : comment s&apos;est terminée chaque séance qui a vu la fenêtre de paiement sans payer.</p>
            {totalSeances ? <Barres lignes={seances.map((s) => ({ cle: s.raison, libelle: RAISONS[s.raison] ?? s.raison, nb: s.nb }))} total={totalSeances} /> : <p className="text-sm text-ink-muted">—</p>}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-medium text-ink-2">Tentatives échouées · {nombre(totalTentatives)}</h3>
            <p className="mb-2 text-xs text-ink-muted">D&apos;après les paiements : chaque passage au terminal refusé, annulé ou sans réponse (une séance peut en compter plusieurs).</p>
            {totalTentatives ? <Barres lignes={lignesTentatives} total={totalTentatives} ton="bg-warn-ink/60" /> : <p className="text-sm text-ink-muted">—</p>}
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── Formats de cadre : regroupés par type (retour de Sébastien) ───

type TypeCadre = "polaroid" | "multishoot" | "strip" | "carte" | "autre" | "aucun";
const TYPES_CADRE: Record<TypeCadre, { libelle: string; couleur: string }> = {
  polaroid: { libelle: "Polaroïd", couleur: "var(--viz-1)" },
  multishoot: { libelle: "Multishoot (planche)", couleur: "var(--viz-2)" },
  strip: { libelle: "Bandelette (strip)", couleur: "#1f9e74" },
  carte: { libelle: "Carte", couleur: "#8250df" },
  autre: { libelle: "Autre", couleur: "#6b7280" },
  aucun: { libelle: "Non choisi", couleur: "var(--viz-label)" },
};
const typeDe = (cadre: string | null): TypeCadre =>
  !cadre ? "aucun" : /polaroid|pola/i.test(cadre) ? "polaroid" : /multi|planche/i.test(cadre) ? "multishoot" : /strip|bandelette/i.test(cadre) ? "strip" : /carte|card/i.test(cadre) ? "carte" : "autre";

/** Schéma du format (le rendu réel dépend du cadre de chaque lieu) */
function SchemaFormat({ type }: { type: TypeCadre }) {
  const photo = "fill-current opacity-25";
  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0 text-ink-2" aria-hidden>
      {type === "polaroid" && (<><rect x="10" y="4" width="28" height="40" rx="2" className="fill-surface stroke-current" strokeWidth="1.5" /><rect x="14" y="8" width="20" height="24" className={photo} /></>)}
      {type === "strip" && (<><rect x="16" y="2" width="16" height="44" rx="2" className="fill-surface stroke-current" strokeWidth="1.5" />{[5, 15, 25, 35].map((y) => <rect key={y} x="19" y={y} width="10" height="8" className={photo} />)}</>)}
      {type === "multishoot" && (<><rect x="4" y="8" width="40" height="32" rx="2" className="fill-surface stroke-current" strokeWidth="1.5" />{[[7, 11], [25, 11], [7, 25], [25, 25]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="16" height="12" className={photo} />)}</>)}
      {type === "carte" && (<><rect x="4" y="10" width="40" height="28" rx="2" className="fill-surface stroke-current" strokeWidth="1.5" /><rect x="7" y="13" width="18" height="22" className={photo} /><path d="M29 18h11M29 24h11M29 30h7" className="stroke-current" strokeWidth="1.5" /></>)}
      {(type === "autre" || type === "aucun") && <rect x="8" y="8" width="32" height="32" rx="2" className="fill-surface stroke-current" strokeWidth="1.5" strokeDasharray="3 3" />}
    </svg>
  );
}

interface LigneFormat {
  cle: string;
  libelle: string;
  commencees: number;
  offres: number;
  payees: number;
}

function FormatsCadre({ data }: { data: StatsParcours }) {
  const [ouverts, setOuverts] = useState<Set<TypeCadre>>(new Set());
  if (!data.parCadre.length) return null;
  const groupes = new Map<TypeCadre, { total: LigneFormat; gabarits: (LigneFormat & { cadre: string | null })[] }>();
  for (const c of data.parCadre) {
    const t = typeDe(c.cadre);
    const g = groupes.get(t) ?? { total: { cle: t, libelle: TYPES_CADRE[t].libelle, commencees: 0, offres: 0, payees: 0 }, gabarits: [] };
    g.total.commencees += c.commencees;
    g.total.offres += c.offres;
    g.total.payees += c.payees;
    g.gabarits.push({ cle: c.cadre ?? "—", libelle: c.cadre ?? "non choisi", cadre: c.cadre, commencees: c.commencees, offres: c.offres, payees: c.payees });
    groupes.set(t, g);
  }
  // Part de chaque format parmi les séances où un cadre a été choisi
  const tries = [...groupes.entries()].sort((a, b) => (a[0] === "aucun" ? 1 : b[0] === "aucun" ? -1 : b[1].total.commencees - a[1].total.commencees));
  const avecCadre = tries.filter(([t]) => t !== "aucun").reduce((s, [, g]) => s + g.total.commencees, 0);
  const payeesTotal = tries.reduce((s, [, g]) => s + g.total.payees, 0);
  const basculer = (t: TypeCadre) => setOuverts((o) => { const n = new Set(o); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const cellules = (l: LigneFormat, part: number | null) => (
    <>
      <td className="py-2 pr-3 text-right">{nombre(l.commencees)}</td>
      <td className="py-2 pr-3 text-right text-ink-2">{part === null ? "—" : pct(part)}</td>
      <td className="py-2 pr-3 text-right">{nombre(l.offres)}</td>
      <td className="py-2 pr-3 text-right">{nombre(l.payees)}</td>
      <td className="py-2 pr-3 text-right text-ink-2">{pct(payeesTotal ? l.payees / payeesTotal : 0)}</td>
      <td className="py-2 text-right font-medium">{pct(l.commencees ? l.payees / l.commencees : 0)}</td>
    </>
  );

  return (
    <Section titre="Formats de cadre">
      {/* Les formats qui plaisent : part des séances (barre) et part qui finit payée */}
      <div className="mb-6 space-y-2">
        {tries.filter(([t]) => t !== "aucun").map(([t, g]) => {
          const part = avecCadre ? g.total.commencees / avecCadre : 0;
          return (
            <div key={t} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="flex items-center gap-2">
                <SchemaFormat type={t} />
                {TYPES_CADRE[t].libelle}
              </span>
              <span className="h-6 rounded bg-surface-2">
                <span className="flex h-6 items-center rounded px-2 text-xs font-medium text-white" style={{ width: `${Math.max(part * 100, 2)}%`, background: TYPES_CADRE[t].couleur }}>
                  {part >= 0.12 ? pct(part) : ""}
                </span>
              </span>
              <span className="w-40 text-right tabular">
                <strong>{pct(part)}</strong> <span className="text-xs text-ink-muted">des séances · {pct(g.total.commencees ? g.total.payees / g.total.commencees : 0)} payées</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Format · gabarit</th>
              <th className="py-1.5 pr-3 text-right font-medium">Séances</th>
              <th className="py-1.5 pr-3 text-right font-medium">% séances</th>
              <th className="py-1.5 pr-3 text-right font-medium">Offre vue</th>
              <th className="py-1.5 pr-3 text-right font-medium">Payées</th>
              <th className="py-1.5 pr-3 text-right font-medium">% payées</th>
              <th className="py-1.5 text-right font-medium">Conversion</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {tries.map(([t, g]) => {
              const ouvert = ouverts.has(t);
              const detail = g.gabarits.length > 1 || (g.gabarits[0]?.cadre ?? null) !== null;
              return (
                <Fragment key={t}>
                  <tr className="border-t border-line">
                    <td className="py-2 pr-3">
                      <button type="button" className="flex items-center gap-2 text-left font-medium hover:text-accent disabled:hover:text-ink" onClick={() => basculer(t)} disabled={!detail} aria-expanded={detail ? ouvert : undefined}>
                        <SchemaFormat type={t} />
                        <span>
                          {TYPES_CADRE[t].libelle}
                          {detail && <span className="block text-xs font-normal text-ink-muted">{g.gabarits.length} gabarit{g.gabarits.length > 1 ? "s" : ""} · {ouvert ? "masquer" : "détail"}</span>}
                        </span>
                      </button>
                    </td>
                    {cellules(g.total, t === "aucun" ? null : avecCadre ? g.total.commencees / avecCadre : 0)}
                  </tr>
                  {ouvert &&
                    g.gabarits.map((x) => (
                      <tr key={x.cle} className="border-t border-line/60 bg-surface-2/40">
                        <td className="py-1.5 pl-6 pr-3">
                          <span className="flex items-center gap-2">
                            {x.cadre && data.apercus?.[x.cadre] ? (
                              // eslint-disable-next-line @next/next/no-img-element -- vignette du studio (data URL)
                              <img src={data.apercus[x.cadre]} alt="" className="h-12 w-auto rounded border border-line" />
                            ) : (
                              <SchemaFormat type={t} />
                            )}
                            <span className="font-mono text-xs">{x.libelle}</span>
                          </span>
                        </td>
                        {cellules(x, t === "aucun" ? null : avecCadre ? x.commencees / avecCadre : 0)}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        % séances : parmi les séances où un cadre a été choisi. % payées : part des séances payées. Conversion : séances payées ÷ séances du format.
        {data.apercus ? " Vignette : le cadre dessiné au studio pour ce gabarit, quand il y en a un." : ""}
      </p>
    </Section>
  );
}
