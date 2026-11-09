"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { euros, nombre, pct } from "@/lib/format";
import { Badge, Chargement, Erreur, Section } from "./Etat";

// Comportement des invités (parcours envoyés par les bornes, avenant du 26/10/2026), refonte du 09/11/2026
// d'après la maquette : vue « Parcours » (cinq clés, ruban du parcours, pertes, formats, terminal, borne par borne)
// et vue « Par heure » (séances payées ou non par heure de soirée, pertes selon l'heure, borne × heure).

type Etape = "cadre" | "prise" | "photo" | "revelation" | "offre" | "paiement" | "paiement_demande" | "impression";
interface HeureParcours {
  heure: number;
  commencees: number;
  cadre: number;
  photo: number;
  offre: number;
  paiementDemande: number;
  payees: number;
  recommencent: number;
  sansRien: number;
  upsell: number;
  dureeMedianeS: number | null;
  photoAOffreS: number | null;
}
interface BorneParcours {
  borneId: number;
  identifiant: string;
  lieu: { id: number; enseigne: string } | null;
  commencees: number;
  paiementDemande: number;
  payees: number;
  recommencent: number;
  sansRien: number;
  photoAOffreS: number | null;
  terminalMuet: number;
  tendance: number[];
  parHeure: { heure: number; commencees: number; payees: number }[];
}
interface Cles {
  commencees: number;
  paiementDemande: number;
  payees: number;
  recommencent: number;
  sansRien: number;
}

export interface StatsParcours {
  periode: { du: string; au: string };
  commencees: number;
  etapes: Record<Etape, number>;
  payees: number;
  validees: number;
  issues: { issue: string; nb: number }[];
  appels: { lancees: number; engagees: number; payees: number };
  sansRien?: { total: number; retoursAccueil: number; delais: number };
  soirees?: number;
  hesitations: { avecRecommencer: number; avecRelancesCouleurs: number; avecRetoursOffre: number; recommencerPuisSansRien?: number };
  upsell: { proposes: number; acceptes: number; montantCents: number };
  dureesMedianesS: { seance: number | null; cadreAPhoto: number | null; photoAOffre: number | null; offreAPaiement: number | null; paiementAImpression: number | null };
  parCadre: { cadre: string | null; commencees: number; offres: number; payees: number }[];
  parHeure: (Partial<HeureParcours> & { heure: number; commencees: number; payees: number })[];
  parBorne?: BorneParcours[];
  precedente?: Cles;
  /** Séances qui ont vu la fenêtre de paiement sans payer, par raison */
  nonAboutis?: { raison: string; nb: number }[];
  /** Tentatives de paiement refusées, annulées ou sans réponse, par motif */
  tentativesEchouees?: { statut: string; motif: string | null; nb: number }[];
  /** Fiche lieu : vignette du cadre dessiné au studio, par nom de gabarit */
  apercus?: Record<string, string>;
}

const ISSUES: Record<string, string> = {
  validee: "Photo enregistrée",
  retour: "Retour à l'accueil",
  delai: "Délai d'inactivité",
  appel: "Photo d'appel sans geste",
  autre: "Autre",
};
const COULEURS_ISSUES: Record<string, string> = { validee: "bg-good", retour: "bg-warn-ink", delai: "bg-bad", appel: "bg-ink-muted", autre: "bg-line-strong" };

const duree = (s: number | null | undefined) => (s === null || s === undefined ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`);
const part = (a: number, b: number) => (b ? a / b : 0);
const JOURS_SOIR = [
  { v: "", l: "Tous les soirs" },
  { v: "1", l: "Lundi" },
  { v: "2", l: "Mardi" },
  { v: "3", l: "Mercredi" },
  { v: "4", l: "Jeudi" },
  { v: "5", l: "Vendredi" },
  { v: "6", l: "Samedi" },
  { v: "7", l: "Dimanche" },
  { v: "4,5,6", l: "Jeudi à samedi" },
];

/**
 * Comportement des invités, global (chemin /stats/parcours avec les filtres) ou d'un lieu.
 * requete : query string des filtres (« ?du=…&au=… »).
 */
export function Comportement({ requete, lieuId }: { requete: string; lieuId?: number }) {
  const [vue, setVue] = useState<"parcours" | "heure">("parcours");
  const [soirs, setSoirs] = useState("");
  const chemin = lieuId ? `/stats/lieux/${lieuId}/parcours` : "/stats/parcours";
  const complete = soirs ? `${requete || "?"}${requete && requete !== "?" ? "&" : ""}soirs=${soirs}` : requete;
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["parcours", chemin, complete],
    queryFn: () => api<StatsParcours>(`${chemin}${complete}`),
    placeholderData: keepPreviousData,
  });

  const barre = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <nav className="flex gap-1 border-b border-line" aria-label="Vues du comportement">
        {(
          [
            ["parcours", "Parcours"],
            ["heure", "Par heure"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-current={vue === v ? "page" : undefined}
            onClick={() => setVue(v)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${vue === v ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {l}
          </button>
        ))}
      </nav>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        Soirées
        <select className="champ !w-auto" value={soirs} onChange={(e) => setSoirs(e.target.value)} aria-label="Soirées de la semaine">
          {JOURS_SOIR.map((j) => <option key={j.v} value={j.v}>{j.l}</option>)}
        </select>
        {isFetching && <span className="text-xs text-ink-muted">mise à jour…</span>}
      </label>
    </div>
  );

  if (error) return <>{barre}<Erreur erreur={error} /></>;
  if (isPending) return <>{barre}<Chargement /></>;
  // Rien reçu : la borne n'envoie pas encore ses parcours (logiciel à mettre à jour)
  if (!data.commencees) {
    return (
      <>
        {barre}
        <Section titre="Parcours des invités">
          <p className="text-sm text-ink-2">
            Aucun parcours reçu sur la période{soirs ? " pour ces soirées" : ""}. Les bornes envoient le parcours de chaque séance (de la première page à
            l&apos;impression) depuis la version du logiciel livrée avec l&apos;avenant du 26/10/2026.
          </p>
        </Section>
      </>
    );
  }
  return (
    <>
      {barre}
      {vue === "parcours" ? <VueParcours data={data} lieuId={lieuId} /> : <VueParHeure data={data} />}
    </>
  );
}

// ─── Petites briques ───

/** Évolution d'une clé vs la période précédente : en % pour un volume, en points pour un taux */
function Evolution({ courant, precedent, taux = false, hausseMauvaise = false }: { courant: number; precedent: number | null; taux?: boolean; hausseMauvaise?: boolean }) {
  if (precedent === null || (!taux && !precedent)) return <span className="text-xs text-ink-muted">pas de comparaison</span>;
  const ecart = taux ? (courant - precedent) * 100 : ((courant - precedent) / precedent) * 100;
  const arrondi = Math.round(ecart);
  if (!arrondi) return <span className="w-max rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">= stable</span>;
  const bon = hausseMauvaise ? arrondi < 0 : arrondi > 0;
  return (
    <span className={`w-max rounded-full px-2 py-0.5 text-xs font-semibold ${bon ? "bg-ok-bg text-ok-ink" : "bg-crit-bg text-crit-ink"}`}>
      {arrondi > 0 ? "▲ +" : "▼ −"}
      {Math.abs(arrondi)} {taux ? "pt" : "%"}
      {Math.abs(arrondi) > 1 && taux ? "s" : ""} <span className="font-normal text-ink-2">vs période précédente</span>
    </span>
  );
}

function Cle({ libelle, valeur, ton, evolution, detail }: { libelle: string; valeur: string; ton?: string; evolution: ReactNode; detail: ReactNode }) {
  return (
    <div className="carte flex min-w-0 flex-col gap-2 p-4">
      <span className="text-xs font-semibold tracking-wide text-ink-2 uppercase">{libelle}</span>
      <span className={`text-3xl font-extrabold tracking-tight tabular ${ton ?? ""}`}>{valeur}</span>
      {evolution}
      <span className="text-xs text-ink-2">{detail}</span>
    </div>
  );
}

// ─── Vue Parcours ───

// Les cinq marches du ruban ; les étapes sans perte notable (cadre choisi, photo vue, paiement affiché) sont fondues
const MARCHES = [
  { libelle: "Séance commencée", perte: "" },
  { libelle: "Photo prise", perte: "ne prennent pas de photo" },
  { libelle: "Offre vue", perte: "ne vont pas jusqu'à l'offre" },
  { libelle: "Paiement demandé", perte: "voient l'offre et la ferment sans payer" },
  { libelle: "Payée", perte: "paiements non aboutis" },
];

function VueParcours({ data, lieuId }: { data: StatsParcours; lieuId?: number }) {
  const e = data.etapes;
  const c = data.commencees;
  const valeurs = [c, e.photo, e.offre, e.paiement_demande, data.payees];
  const pertes = valeurs.map((v, i) => (i ? Math.max(0, valeurs[i - 1] - v) : 0));
  // Le plus gros décrochage, et le suivant pour situer
  const classees = pertes.map((p, i) => ({ p, i })).filter((x) => x.i > 0).sort((a, b) => b.p - a.p);
  const pire = classees[0];
  const second = classees[1];
  const d = data.dureesMedianesS;
  const p = data.precedente ?? null;
  const sansRien = data.sansRien ?? { total: 0, retoursAccueil: 0, delais: 0 };

  return (
    <div className="space-y-5">
      {pire && pire.p > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-accent/10 px-4 py-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-accent text-accent-ink" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>
          </span>
          <p className="min-w-0 flex-[1_1_420px] text-sm">
            <strong>Le point à travailler :</strong> {nombre(pire.p)} invités {MARCHES[pire.i].perte}, soit {pct(part(pire.p, valeurs[pire.i - 1]))} de ceux qui arrivent jusque-là.
            {second && second.p > 0 && <> C&apos;est le plus gros décrochage du parcours, devant « {MARCHES[second.i].perte} » ({nombre(second.p)}).</>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Cle
          libelle="Séances"
          valeur={nombre(c)}
          evolution={<Evolution courant={c} precedent={p?.commencees ?? null} />}
          detail={`${data.soirees ? `${nombre(Math.round(c / data.soirees))} par borne et par soir · ` : ""}${duree(d.seance)} en médiane`}
        />
        <Cle
          libelle="Jusqu'au paiement"
          valeur={pct(part(e.paiement_demande, c))}
          ton="text-accent"
          evolution={<Evolution taux courant={part(e.paiement_demande, c)} precedent={p ? part(p.paiementDemande, p.commencees) : null} />}
          detail={`${nombre(e.paiement_demande)} séances lancent le paiement`}
        />
        <Cle
          libelle="Payées"
          valeur={pct(part(data.payees, c))}
          ton="text-good"
          evolution={<Evolution taux courant={part(data.payees, c)} precedent={p ? part(p.payees, p.commencees) : null} />}
          detail={`${nombre(data.payees)} séances · ${pct(part(data.payees, e.paiement_demande))} des demandes aboutissent`}
        />
        <Cle
          libelle="Recommencent"
          valeur={pct(part(data.hesitations.avecRecommencer, c))}
          ton="text-warn-ink"
          evolution={<Evolution taux hausseMauvaise courant={part(data.hesitations.avecRecommencer, c)} precedent={p ? part(p.recommencent, p.commencees) : null} />}
          detail={`${nombre(data.hesitations.avecRecommencer)} séances${data.hesitations.recommencerPuisSansRien !== undefined ? ` · dont ${pct(part(data.hesitations.recommencerPuisSansRien, c))} repartent ensuite sans rien` : ""}`}
        />
        <Cle
          libelle="Repartent sans rien"
          valeur={pct(part(sansRien.total, c))}
          ton="text-bad"
          evolution={<Evolution taux hausseMauvaise courant={part(sansRien.total, c)} precedent={p ? part(p.sansRien, p.commencees) : null} />}
          detail={`${nombre(sansRien.total)} séances · ${nombre(sansRien.retoursAccueil)} retours accueil, ${nombre(sansRien.delais)} inactivités`}
        />
      </div>

      <section className="carte space-y-5 p-5" id="parcours">
        <div>
          <h2 className="text-base font-bold">Le parcours d&apos;un invité</h2>
          <p className="mt-0.5 text-sm text-ink-2">
            Le ruban se rétrécit à chaque étape ; en dessous, qui on perd et combien. Les étapes sans perte (cadre choisi, photo vue, paiement affiché) sont fondues
            dans leurs voisines.
          </p>
        </div>
        <Ruban valeurs={valeurs} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {MARCHES.map((m, i) => (
            <div key={m.libelle} className="flex min-w-0 flex-col gap-0.5">
              <span className={`text-2xl font-extrabold tabular ${i === 4 ? "text-good" : ""}`}>
                {nombre(valeurs[i])} <small className="text-xs font-semibold text-ink-2">{pct(part(valeurs[i], c))}</small>
              </span>
              <span className="text-sm font-semibold">{m.libelle}</span>
              <span className="text-xs text-ink-2">
                {i === 0 ? "un invité touche l'accueil" : i === 1 ? `${duree(d.cadreAPhoto)} après le choix du cadre` : i === 2 ? `${duree(d.photoAOffre)} après la photo` : i === 3 ? `${duree(d.offreAPaiement)} après l'offre` : `tirage ${duree(d.paiementAImpression)} après le paiement`}
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {MARCHES.map((m, i) =>
            i === 0 ? (
              <div key={i} className="hidden rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-ink-2 sm:block">départ</div>
            ) : (
              <div key={i} className={`flex min-w-0 flex-col gap-0.5 rounded-lg border px-3 py-2.5 ${i === pire?.i ? "border-bad bg-bad text-white" : "border-bad/25 bg-crit-bg"}`}>
                <b className={`text-lg font-extrabold tabular ${i === pire?.i ? "" : "text-bad"}`}>− {nombre(pertes[i])}</b>
                <span className={`text-xs ${i === pire?.i ? "" : "text-crit-ink"}`}>
                  {m.perte} · {pct(part(pertes[i], valeurs[i - 1]))}
                  {i === pire?.i ? " · le plus gros décrochage" : ""}
                </span>
              </div>
            )
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4 text-sm">
          <Etiquette>Recommencent la photo <b>{pct(part(data.hesitations.avecRecommencer, c))}</b></Etiquette>
          <Etiquette>Reviennent de l&apos;offre à la photo <b>{pct(part(data.hesitations.avecRetoursOffre, c))}</b></Etiquette>
          <Etiquette>Relancent les couleurs <b>{pct(part(data.hesitations.avecRelancesCouleurs, c))}</b></Etiquette>
          {data.upsell.proposes > 0 && (
            <Etiquette>
              « +1 pour un pote » <b>{nombre(data.upsell.acceptes)} / {nombre(data.upsell.proposes)} · {pct(part(data.upsell.acceptes, data.upsell.proposes))} · {euros(data.upsell.montantCents)}</b>
            </Etiquette>
          )}
          {data.appels.lancees > 0 && (
            <Etiquette>
              Photos d&apos;appel <b>{nombre(data.appels.lancees)} · {nombre(data.appels.engagees)} ont attiré · {nombre(data.appels.payees)} vendues</b>
            </Etiquette>
          )}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[6fr_5fr]">
        <Podium data={data} />
        <AuTerminal data={data} />
      </div>

      {(data.parBorne?.length ?? 0) > 1 && <BorneParBorne data={data} />}

      <FormatsCadre data={data} lieuId={lieuId} />
    </div>
  );
}

const Etiquette = ({ children }: { children: ReactNode }) => <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5">{children}</span>;

/** Ruban du parcours : chaque bande a la hauteur de la part des séances, la perte en rose au-dessus et en dessous */
function Ruban({ valeurs }: { valeurs: number[] }) {
  const H = 160;
  const L = 1200 / valeurs.length;
  const h = valeurs.map((v) => (valeurs[0] ? (v / valeurs[0]) * H : 0));
  const y = (x: number) => (H - x) / 2;
  const couleur = (i: number) => (i === valeurs.length - 1 ? "var(--color-good)" : `color-mix(in srgb, var(--color-accent) ${100 - i * 12}%, white)`);
  return (
    <figure className="m-0" role="img" aria-label={`Ruban du parcours : ${valeurs.map((v, i) => `${MARCHES[i].libelle} ${v}`).join(", ")}`}>
      <svg viewBox={`0 0 1200 ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
        {valeurs.map((_, i) => {
          const x0 = i * L;
          const x1 = x0 + L;
          const g = i ? h[i - 1] : h[0];
          const dr = h[i];
          return (
            <Fragment key={i}>
              <path d={`M${x0} 0 L${x1} 0 L${x1} ${y(dr)} L${x0} ${y(g)} Z`} fill="var(--color-crit-bg)" />
              <path d={`M${x0} ${H} L${x1} ${H} L${x1} ${H - y(dr)} L${x0} ${H - y(g)} Z`} fill="var(--color-crit-bg)" />
              <path d={`M${x0} ${y(g)} L${x1} ${y(dr)} L${x1} ${H - y(dr)} L${x0} ${H - y(g)} Z`} fill={couleur(i)} />
              {i > 0 && <line x1={x0} y1="0" x2={x0} y2={H} stroke="var(--color-surface)" strokeWidth="3" />}
            </Fragment>
          );
        })}
      </svg>
    </figure>
  );
}

// ─── Formats : podium au taux de séances payées ───

type TypeCadre = "polaroid" | "multishoot" | "strip" | "carte" | "autre" | "aucun";
const TYPES_CADRE: Record<TypeCadre, { libelle: string; couleur: string }> = {
  polaroid: { libelle: "Polaroïd", couleur: "var(--viz-1)" },
  multishoot: { libelle: "Planche multishoot", couleur: "var(--viz-2)" },
  strip: { libelle: "Bandelette", couleur: "#1f9e74" },
  carte: { libelle: "Carte", couleur: "#8250df" },
  autre: { libelle: "Autre", couleur: "#6b7280" },
  aucun: { libelle: "Non choisi", couleur: "var(--viz-label)" },
};
const typeDe = (cadre: string | null): TypeCadre =>
  !cadre ? "aucun" : /polaroid|pola/i.test(cadre) ? "polaroid" : /multi|planche/i.test(cadre) ? "multishoot" : /strip|bandelette/i.test(cadre) ? "strip" : /carte|card/i.test(cadre) ? "carte" : "autre";

function groupesFormats(data: StatsParcours) {
  const groupes = new Map<TypeCadre, { commencees: number; offres: number; payees: number; gabarits: StatsParcours["parCadre"] }>();
  for (const c of data.parCadre) {
    const t = typeDe(c.cadre);
    const g = groupes.get(t) ?? { commencees: 0, offres: 0, payees: 0, gabarits: [] };
    g.commencees += c.commencees;
    g.offres += c.offres;
    g.payees += c.payees;
    g.gabarits.push(c);
    groupes.set(t, g);
  }
  return groupes;
}

function Podium({ data }: { data: StatsParcours }) {
  const groupes = groupesFormats(data);
  const avecCadre = [...groupes.entries()].filter(([t]) => t !== "aucun").reduce((s, [, g]) => s + g.commencees, 0);
  // Formats assez choisis pour être comparés (5 % des séances avec cadre au moins), classés au taux payé
  const classes = [...groupes.entries()]
    .filter(([t, g]) => t !== "aucun" && part(g.commencees, avecCadre) >= 0.05)
    .map(([t, g]) => ({ t, g, taux: part(g.payees, g.commencees), partSeances: part(g.commencees, avecCadre) }))
    .sort((a, b) => b.taux - a.taux);
  const podium = classes.slice(0, 3);
  const ordre = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium.length === 2 ? [podium[1], podium[0]] : podium;
  const hauteurs = ["h-40", "h-28", "h-20"];
  const tons = [
    { fond: "bg-ok-bg", texte: "text-good", rond: "bg-good text-white" },
    { fond: "bg-surface-2", texte: "", rond: "bg-line-strong text-ink" },
    { fond: "bg-crit-bg", texte: "text-bad", rond: "bg-bad text-white" },
  ];
  const plusChoisi = [...classes].sort((a, b) => b.partSeances - a.partSeances)[0];
  return (
    <section className="carte space-y-4 p-5">
      <div>
        <h2 className="text-base font-bold">Formats : qui fait payer</h2>
        <p className="mt-0.5 text-sm text-ink-2">Podium au taux de séances payées. En dessous, la part des invités qui choisissent le format.</p>
      </div>
      {podium.length ? (
        <div className={`grid items-end gap-4 ${ordre.length === 3 ? "grid-cols-3" : ordre.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {ordre.map((x) => {
            const rang = podium.indexOf(x);
            const ton = tons[rang];
            return (
              <div key={x.t} className="flex flex-col items-center gap-2">
                <SchemaFormat type={x.t} grand />
                <div className={`flex w-full flex-col items-center gap-1 rounded-t-xl pt-3 ${ton.fond} ${hauteurs[rang]}`}>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold ${ton.rond}`}>{rang + 1}</span>
                  <span className={`text-2xl font-extrabold tabular ${ton.texte}`}>{pct(x.taux)}</span>
                  {rang < 2 && <span className={`text-xs ${ton.texte || "text-ink-2"}`}>payées</span>}
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold">{TYPES_CADRE[x.t].libelle}</div>
                  <div className="text-xs text-ink-2">{pct(x.partSeances)} des séances</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Pas assez de séances avec un cadre choisi pour comparer les formats.</p>
      )}
      {classes.length > 3 && (
        <p className="text-xs text-ink-2">
          Ensuite : {classes.slice(3).map((x) => `${TYPES_CADRE[x.t].libelle} ${pct(x.taux)} payées (${pct(x.partSeances)} des séances)`).join(" · ")}
        </p>
      )}
      {podium.length >= 2 && plusChoisi && (
        <p className="border-t border-line pt-3 text-sm text-ink-2">
          {plusChoisi.t === podium[0].t
            ? `${TYPES_CADRE[plusChoisi.t].libelle} : le plus choisi et celui qui fait le mieux payer.`
            : `${TYPES_CADRE[plusChoisi.t].libelle} : le plus choisi (${pct(plusChoisi.partSeances)} des séances) mais ${pct(plusChoisi.taux)} payées, contre ${pct(podium[0].taux)} pour ${TYPES_CADRE[podium[0].t].libelle.toLowerCase()}.`}
        </p>
      )}
    </section>
  );
}

// ─── Au terminal ───

/** Tentative échouée (ventes) → cause regroupée */
const causeTentative = (statut: string, motif: string | null) =>
  statut === "EXPIREE" ? "expire" : statut === "REFUSEE" ? (motif === "TERMINAL" ? "refus_terminal" : "refuse") : motif === "TERMINAL" ? "annule_terminal" : "annule";
const CAUSES: { cle: string; libelle: string; couleur: string; raison: string | null }[] = [
  { cle: "annule", libelle: "Annulé par l'invité", couleur: "bg-accent", raison: "annule" },
  { cle: "expire", libelle: "Terminal sans réponse", couleur: "bg-warn-ink", raison: "expire" },
  { cle: "refuse", libelle: "Refus de la banque", couleur: "bg-bad", raison: "refuse" },
  { cle: "refus_terminal", libelle: "Refus du terminal (erreur TPA)", couleur: "bg-bad/60", raison: null },
  { cle: "annule_terminal", libelle: "Annulé par le terminal (erreur TPA)", couleur: "bg-accent/50", raison: null },
];

function AuTerminal({ data }: { data: StatsParcours }) {
  const tentatives = new Map<string, number>();
  for (const t of data.tentativesEchouees ?? []) tentatives.set(causeTentative(t.statut, t.motif), (tentatives.get(causeTentative(t.statut, t.motif)) ?? 0) + t.nb);
  const seances = new Map((data.nonAboutis ?? []).map((x) => [x.raison, x.nb]));
  const totalTentatives = [...tentatives.values()].reduce((s, x) => s + x, 0);
  // Séances perdues au terminal : paiement lancé, non payé (pas celles qui ont fermé la fenêtre avant)
  const perdues = [...seances].filter(([r]) => r !== "non_demande").reduce((s, [, x]) => s + x, 0);
  const lignes = CAUSES.filter((x) => tentatives.get(x.cle) || (x.raison && seances.get(x.raison)));
  const issues = data.issues.filter((x) => x.nb > 0);
  return (
    <section className="carte space-y-4 p-5">
      <div>
        <h2 className="text-base font-bold">Au terminal</h2>
        <p className="mt-0.5 text-sm text-ink-2">
          {nombre(totalTentatives)} passage{totalTentatives > 1 ? "s" : ""} sans débit pour {nombre(perdues)} séance{perdues > 1 ? "s" : ""} perdue{perdues > 1 ? "s" : ""}.
          Un invité qui annule puis paie n&apos;est pas perdu.
        </p>
      </div>
      {totalTentatives > 0 && (
        <div className="flex h-4 gap-0.5 overflow-hidden rounded-lg" role="img" aria-label={lignes.map((l) => `${l.libelle} ${pct(part(tentatives.get(l.cle) ?? 0, totalTentatives))}`).join(", ")}>
          {lignes.map((l) => <span key={l.cle} className={l.couleur} style={{ width: `${part(tentatives.get(l.cle) ?? 0, totalTentatives) * 100}%` }} />)}
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>
            <th className="pb-2 font-medium">Cause</th>
            <th className="pb-2 text-right font-medium">Tentatives</th>
            <th className="pb-2 text-right font-medium">Séances perdues</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {lignes.map((l) => (
            <tr key={l.cle} className="border-t border-line">
              <td className="py-2"><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-sm align-[-1px] ${l.couleur}`} />{l.libelle}</td>
              <td className="py-2 text-right">{tentatives.get(l.cle) ? `${nombre(tentatives.get(l.cle)!)} · ${pct(part(tentatives.get(l.cle)!, totalTentatives))}` : "—"}</td>
              <td className="py-2 text-right">{l.raison && seances.get(l.raison) ? nombre(seances.get(l.raison)!) : "—"}</td>
            </tr>
          ))}
          {(seances.get("offert") ?? 0) > 0 && (
            <tr className="border-t border-line text-ink-2"><td className="py-2">Tirage offert après un échec</td><td className="py-2 text-right">—</td><td className="py-2 text-right">{nombre(seances.get("offert")!)}</td></tr>
          )}
          {(seances.get("inconnu") ?? 0) > 0 && (
            <tr className="border-t border-line text-ink-2"><td className="py-2">Issue inconnue</td><td className="py-2 text-right">—</td><td className="py-2 text-right">{nombre(seances.get("inconnu")!)}</td></tr>
          )}
          {!lignes.length && !seances.get("offert") && !seances.get("inconnu") && (
            <tr className="border-t border-line"><td colSpan={3} className="py-2 text-ink-muted">Aucun paiement manqué sur la période.</td></tr>
          )}
        </tbody>
      </table>
      <div className="space-y-1.5 rounded-xl bg-surface-2 p-3">
        <span className="text-xs font-semibold tracking-wide text-ink-2 uppercase">Comment finissent les {nombre(data.commencees)} séances</span>
        <div className="flex h-2.5 gap-0.5 overflow-hidden rounded" role="img" aria-label={issues.map((x) => `${ISSUES[x.issue] ?? x.issue} ${pct(part(x.nb, data.commencees))}`).join(", ")}>
          {issues.map((x) => <span key={x.issue} className={COULEURS_ISSUES[x.issue] ?? "bg-line-strong"} style={{ width: `${part(x.nb, data.commencees) * 100}%` }} />)}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {issues.map((x) => (
            <span key={x.issue}><b className="tabular">{nombre(x.nb)}</b> {(ISSUES[x.issue] ?? x.issue).toLowerCase()} · {pct(part(x.nb, data.commencees))}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Borne par borne ───

/** Ce qui cloche sur une borne, comparé au parc */
function aRegarder(b: BorneParcours, parc: { paiement: number; payees: number; recommencent: number; photoAOffre: number | null }) {
  const r: { texte: string; grave: boolean }[] = [];
  if (b.commencees < 20) return [{ texte: "Peu de séances", grave: false }];
  if (b.terminalMuet >= 5) r.push({ texte: `Terminal muet : ${b.terminalMuet} fois`, grave: false });
  if (parc.photoAOffre && b.photoAOffreS && b.photoAOffreS > parc.photoAOffre * 1.5) r.push({ texte: "Lente après la photo", grave: true });
  if (part(b.recommencent, b.commencees) > parc.recommencent * 1.5) r.push({ texte: "Recommence beaucoup", grave: true });
  if (part(b.payees, b.commencees) < parc.payees * 0.75) r.push({ texte: "Paie peu", grave: true });
  return r;
}

function Tendance({ valeurs }: { valeurs: number[] }) {
  const max = Math.max(1, ...valeurs);
  const iMax = valeurs.indexOf(max);
  return (
    <span className="inline-flex h-5 items-end gap-0.5" aria-hidden>
      {valeurs.map((v, i) => <i key={i} className={`block w-1.5 rounded-sm ${i === iMax ? "bg-accent" : "bg-accent/30"}`} style={{ height: `${Math.max(2, (v / max) * 20)}px` }} />)}
    </span>
  );
}

function Taux({ valeur, mauvais }: { valeur: number; mauvais?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      <i className="inline-block h-2 w-14 overflow-hidden rounded bg-surface-2"><b className={`block h-full rounded ${mauvais ? "bg-bad" : "bg-accent"}`} style={{ width: `${valeur * 100}%` }} /></i>
      {pct(valeur)}
    </span>
  );
}

function BorneParBorne({ data }: { data: StatsParcours }) {
  const c = data.commencees;
  const parc = { paiement: part(data.etapes.paiement_demande, c), payees: part(data.payees, c), recommencent: part(data.hesitations.avecRecommencer, c), photoAOffre: data.dureesMedianesS.photoAOffre };
  return (
    <section className="carte space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Borne par borne</h2>
          <p className="mt-0.5 text-sm text-ink-2">Les mêmes clés que le parc. Une borne loin de la moyenne a un problème à elle : caméra, lumière, lenteur, terminal.</p>
        </div>
        <Etiquette>Parc : <b>{pct(parc.paiement)} jusqu&apos;au paiement</b> · <b>{pct(parc.payees)} payées</b></Etiquette>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr>
              <th className="pb-2 pr-3 font-medium">Borne</th>
              <th className="pb-2 pr-3 font-medium">Lieu</th>
              <th className="pb-2 pr-3 text-right font-medium">Séances</th>
              <th className="pb-2 pr-3 font-medium">Sur la période</th>
              <th className="pb-2 pr-3 text-right font-medium">Jusqu&apos;au paiement</th>
              <th className="pb-2 pr-3 text-right font-medium">Payées</th>
              <th className="pb-2 pr-3 text-right font-medium">Recommencent</th>
              <th className="pb-2 pr-3 text-right font-medium">Photo → offre</th>
              <th className="pb-2 font-medium">À regarder</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.parBorne!.map((b) => {
              const alertes = aRegarder(b, parc);
              const grave = alertes.some((x) => x.grave);
              const payees = part(b.payees, b.commencees);
              const recommencent = part(b.recommencent, b.commencees);
              return (
                <tr key={b.borneId} className={`border-t border-line ${grave ? "bg-crit-bg/40" : ""}`}>
                  <td className="py-2.5 pr-3 font-semibold"><Link href={`/bornes/${b.borneId}`} className="hover:underline">{b.identifiant}</Link></td>
                  <td className="py-2.5 pr-3 text-ink-2">{b.lieu ? <Link href={`/lieux/${b.lieu.id}?onglet=comportement`} className="hover:underline">{b.lieu.enseigne}</Link> : "—"}</td>
                  <td className="py-2.5 pr-3 text-right">{nombre(b.commencees)}</td>
                  <td className="py-2.5 pr-3"><Tendance valeurs={b.tendance} /></td>
                  <td className="py-2.5 pr-3 text-right"><Taux valeur={part(b.paiementDemande, b.commencees)} mauvais={part(b.paiementDemande, b.commencees) < parc.paiement * 0.75} /></td>
                  <td className={`py-2.5 pr-3 text-right font-semibold ${payees < parc.payees * 0.75 ? "text-bad" : payees > parc.payees * 1.1 ? "text-good" : ""}`}>{pct(payees)}</td>
                  <td className={`py-2.5 pr-3 text-right ${recommencent > parc.recommencent * 1.5 ? "font-semibold text-warn-ink" : ""}`}>{pct(recommencent)}</td>
                  <td className={`py-2.5 pr-3 text-right ${parc.photoAOffre && b.photoAOffreS && b.photoAOffreS > parc.photoAOffre * 1.5 ? "font-semibold text-bad" : ""}`}>{duree(b.photoAOffreS)}</td>
                  <td className="py-2.5">
                    {alertes.length ? (
                      <span className="flex flex-wrap gap-1">{alertes.map((x) => <Badge key={x.texte} ton={x.grave ? "crit" : x.texte === "Peu de séances" ? "neutre" : "warn"}>{x.texte}</Badge>)}</span>
                    ) : (
                      <Badge ton="ok">RAS</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-muted">
        À regarder : payées sous les trois quarts du parc, recommencent ou délai photo → offre une fois et demie au-dessus, terminal sans réponse 5 fois ou plus. Moins de 20 séances : pas de comparaison.
      </p>
    </section>
  );
}

// ─── Vue Par heure de soirée ───

// Une soirée commence à 6 h : 20 h, 21 h… minuit, 1 h… 5 h dans cet ordre
const rangSoiree = (h: number) => (h + 18) % 24;
const libelleHeure = (h: number) => `${h} h`;
const creneau = (h: number, n: number) => `${h} h – ${(h + n) % 24} h`;

type LigneHeure = HeureParcours;

function heuresDeLaSoiree(data: StatsParcours): LigneHeure[] {
  const vide = (heure: number): LigneHeure => ({ heure, commencees: 0, cadre: 0, photo: 0, offre: 0, paiementDemande: 0, payees: 0, recommencent: 0, sansRien: 0, upsell: 0, dureeMedianeS: null, photoAOffreS: null });
  const parHeure = new Map(data.parHeure.map((h) => [h.heure, { ...vide(h.heure), ...h } as LigneHeure]));
  const actives = data.parHeure.filter((h) => h.commencees > 0).map((h) => rangSoiree(h.heure));
  if (!actives.length) return [];
  const debut = Math.min(...actives);
  const fin = Math.max(...actives);
  const lignes: LigneHeure[] = [];
  for (let r = debut; r <= fin; r++) {
    const h = (r + 6) % 24;
    lignes.push(parHeure.get(h) ?? vide(h));
  }
  return lignes;
}

/** Somme de lignes horaires (créneau de plusieurs heures) */
const sommeHeures = (l: LigneHeure[]) =>
  l.reduce(
    (s, x) => ({ commencees: s.commencees + x.commencees, payees: s.payees + x.payees, sansRien: s.sansRien + x.sansRien, recommencent: s.recommencent + x.recommencent, upsell: s.upsell + x.upsell }),
    { commencees: 0, payees: 0, sansRien: 0, recommencent: 0, upsell: 0 }
  );

/** Meilleur créneau de deux heures selon un critère, parmi ceux qui ont assez de séances */
function meilleurCreneau(heures: LigneHeure[], score: (s: ReturnType<typeof sommeHeures>) => number, total: number) {
  let meilleur: { i: number; s: ReturnType<typeof sommeHeures>; v: number } | null = null;
  for (let i = 0; i + 1 < heures.length; i++) {
    const s = sommeHeures(heures.slice(i, i + 2));
    if (s.commencees < Math.max(10, total * 0.05)) continue;
    const v = score(s);
    if (!meilleur || v > meilleur.v) meilleur = { i, s, v };
  }
  return meilleur;
}

function VueParHeure({ data }: { data: StatsParcours }) {
  const heures = heuresDeLaSoiree(data);
  const total = data.commencees;
  if (heures.length < 2) return <Section titre="Par heure"><p className="text-sm text-ink-2">Pas assez d&apos;heures avec des séances pour comparer.</p></Section>;
  const max = Math.max(1, ...heures.map((h) => h.commencees));
  const pointe = heures.reduce((a, b) => (b.commencees > a.commencees ? b : a));
  const paie = meilleurCreneau(heures, (s) => part(s.payees, s.commencees), total);
  const abandon = meilleurCreneau(heures, (s) => part(s.sansRien, s.commencees), total);
  const volume = meilleurCreneau(heures, (s) => s.commencees, total);
  const fin = sommeHeures(heures.slice(-2));
  const tauxParc = part(data.payees, total);
  const recommenceHors = (i: number) => {
    const autres = sommeHeures([...heures.slice(0, i), ...heures.slice(i + 2)]);
    return part(autres.recommencent, autres.commencees);
  };
  const ton = (taux: number) => (taux >= tauxParc + 0.05 ? "bg-ok-bg text-ok-ink" : taux <= tauxParc - 0.05 ? "bg-crit-bg text-crit-ink" : "bg-surface-2 text-ink-2");
  const photoOffreVolume = volume ? heures.slice(volume.i, volume.i + 2).map((h) => h.photoAOffreS).filter((x): x is number => x !== null) : [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Cle libelle="Heure de pointe" valeur={creneau(pointe.heure, 1)} evolution={null} detail={`${nombre(pointe.commencees)} séances · ${pct(part(pointe.commencees, total))} de la soirée`} />
        <Cle
          libelle="On paie le mieux"
          valeur={paie ? creneau(heures[paie.i].heure, 2) : "—"}
          ton="text-good"
          evolution={null}
          detail={paie ? `${pct(part(paie.s.payees, paie.s.commencees))} de séances payées, contre ${pct(tauxParc)} sur la soirée` : "pas assez de séances"}
        />
        <Cle
          libelle="On abandonne le plus"
          valeur={abandon ? creneau(heures[abandon.i].heure, 2) : "—"}
          ton="text-bad"
          evolution={null}
          detail={
            abandon
              ? `${pct(part(abandon.s.sansRien, abandon.s.commencees))} repartent sans rien · recommencent ${pct(part(abandon.s.recommencent, abandon.s.commencees))} (${pct(recommenceHors(abandon.i))} le reste de la soirée)`
              : "pas assez de séances"
          }
        />
        <Cle
          libelle="Fin de soirée"
          valeur={pct(part(fin.commencees, total))}
          ton="text-ink-2"
          evolution={null}
          detail={`des séances après ${libelleHeure(heures[heures.length - 2].heure)} · ${pct(part(fin.payees, fin.commencees))} payées`}
        />
      </div>

      <section className="carte space-y-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Séances par heure, payées ou non</h2>
            <p className="mt-0.5 text-sm text-ink-2">Hauteur = séances commencées dans l&apos;heure. Vert = payées. Sous chaque colonne, le taux payé de l&apos;heure.</p>
          </div>
          <div className="flex gap-3 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm bg-good" />payées</span>
            <span className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm bg-accent/30" />non payées</span>
          </div>
        </div>
        <div className="grid items-end gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${heures.length}, minmax(0, 1fr))` }} role="img" aria-label={heures.map((h) => `${h.heure} h : ${h.commencees} séances, ${h.payees} payées`).join(" ; ")}>
          {heures.map((h) => (
            <div key={h.heure} className="flex min-w-0 flex-col items-center gap-1.5" title={`${creneau(h.heure, 1)} : ${h.commencees} séances, ${h.payees} payées`}>
              <span className="text-sm font-extrabold tabular">{nombre(h.commencees)}</span>
              <div className="flex h-40 w-full flex-col justify-end overflow-hidden rounded-lg bg-surface-2 sm:h-52">
                <i className="block w-full bg-accent/30" style={{ height: `${((h.commencees - h.payees) / max) * 100}%` }} />
                <i className="block w-full bg-good" style={{ height: `${(h.payees / max) * 100}%` }} />
              </div>
              <span className="text-xs font-semibold text-ink-2">{libelleHeure(h.heure)}</span>
              {h.commencees >= 5 ? (
                <span className={`rounded px-1 text-[11px] font-bold tabular sm:px-1.5 sm:text-xs ${ton(part(h.payees, h.commencees))}`}>{pct(part(h.payees, h.commencees))}</span>
              ) : (
                <span className="text-[11px] text-ink-muted">—</span>
              )}
            </div>
          ))}
        </div>
        <div className="grid gap-3 border-t border-line pt-4 md:grid-cols-3">
          {paie && (
            <Encadre ton="bg-ok-bg" titre={`${creneau(heures[paie.i].heure, 2)} : le créneau qui rapporte`} titreTon="text-good">
              {nombre(paie.s.commencees)} séances, {pct(part(paie.s.payees, paie.s.commencees))} payées.
              {paie.s.upsell > 0 && ` « +1 pour un pote » accepté ${nombre(paie.s.upsell)} fois.`}
            </Encadre>
          )}
          {volume && (
            <Encadre ton="bg-surface-2" titre={`${creneau(heures[volume.i].heure, 2)} : le volume`}>
              {nombre(volume.s.commencees)} séances ({pct(part(volume.s.commencees, total))} de la soirée), {pct(part(volume.s.payees, volume.s.commencees))} payées.
              {photoOffreVolume.length > 0 && ` Délai photo → offre : ${duree(Math.max(...photoOffreVolume))} au plus, contre ${duree(data.dureesMedianesS.photoAOffre)} sur la soirée.`}
            </Encadre>
          )}
          {abandon && (
            <Encadre ton="bg-crit-bg" titre={`${creneau(heures[abandon.i].heure, 2)} : on joue, on paie moins`} titreTon="text-bad">
              {nombre(abandon.s.commencees)} séances, {pct(part(abandon.s.payees, abandon.s.commencees))} payées ; {pct(part(abandon.s.sansRien, abandon.s.commencees))} repartent sans rien.
            </Encadre>
          )}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[6fr_5fr]">
        <PertesParHeure heures={heures} />
        <TempsParHeure heures={heures} />
      </div>

      {(data.parBorne?.length ?? 0) > 1 && <BorneParHeure data={data} heures={heures} />}
    </div>
  );
}

function Encadre({ ton, titre, titreTon = "", children }: { ton: string; titre: string; titreTon?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl p-4 ${ton}`}>
      <b className={`text-sm font-extrabold ${titreTon}`}>{titre}</b>
      <span className="text-sm">{children}</span>
    </div>
  );
}

/** Grille de cases colorées, une par heure */
function Cases({ valeurs, couleur, titre }: { valeurs: (number | null)[]; couleur: (v: number) => string; titre: (i: number) => string }) {
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${valeurs.length}, minmax(0, 1fr))` }}>
      {valeurs.map((v, i) => <i key={i} className="block h-6 rounded" style={{ background: v === null ? "var(--color-surface-2)" : couleur(v) }} title={titre(i)} />)}
    </div>
  );
}

function EnteteHeures({ heures }: { heures: LigneHeure[] }) {
  return (
    <div className="grid gap-[3px] text-[11px] font-semibold text-ink-2" style={{ gridTemplateColumns: `repeat(${heures.length}, minmax(0, 1fr))` }} aria-hidden>
      {heures.map((h) => <span key={h.heure} className="text-center">{h.heure}</span>)}
    </div>
  );
}

function PertesParHeure({ heures }: { heures: LigneHeure[] }) {
  // Part des séances arrivées à l'étape qui s'y perdent ; moins de 5 séances : case grise
  const lignes: { libelle: string; fort?: boolean; orange?: boolean; taux: (h: LigneHeure) => number | null }[] = [
    { libelle: "Avant la photo", taux: (h) => (h.commencees >= 5 ? part(h.commencees - h.photo, h.commencees) : null) },
    { libelle: "Photo → offre", taux: (h) => (h.photo >= 5 ? part(h.photo - h.offre, h.photo) : null) },
    { libelle: "À l'offre, sans payer", fort: true, taux: (h) => (h.offre >= 5 ? part(h.offre - h.paiementDemande, h.offre) : null) },
    { libelle: "Au terminal", taux: (h) => (h.paiementDemande >= 5 ? part(h.paiementDemande - h.payees, h.paiementDemande) : null) },
    { libelle: "Recommencent la photo", orange: true, taux: (h) => (h.commencees >= 5 ? part(h.recommencent, h.commencees) : null) },
  ];
  return (
    <section className="carte space-y-4 p-5">
      <div>
        <h2 className="text-base font-bold">Où décrochent-ils, selon l&apos;heure</h2>
        <p className="mt-0.5 text-sm text-ink-2">Part des séances de l&apos;heure perdue à chaque étape. Plus la case est foncée, plus on perd. Case grise : moins de 5 séances.</p>
      </div>
      <div className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-x-3 gap-y-2 text-sm">
        <span />
        <EnteteHeures heures={heures} />
        {lignes.map((l) => {
          const valeurs = heures.map(l.taux);
          const maxi = Math.max(0.01, ...valeurs.filter((v): v is number => v !== null));
          const base = l.orange ? "var(--color-warn-ink)" : "var(--color-bad)";
          return (
            <Fragment key={l.libelle}>
              <span className={`truncate ${l.fort ? "font-semibold" : l.orange ? "text-ink-2" : ""}`}>{l.libelle}</span>
              <Cases
                valeurs={valeurs}
                couleur={(v) => `color-mix(in srgb, ${base} ${Math.round(10 + (v / maxi) * 80)}%, var(--color-surface))`}
                titre={(i) => `${creneau(heures[i].heure, 1)} : ${valeurs[i] === null ? "moins de 5 séances" : pct(valeurs[i]!)}`}
              />
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

function TempsParHeure({ heures }: { heures: LigneHeure[] }) {
  const valeurs = heures.map((h) => (h.commencees >= 5 ? h.dureeMedianeS : null));
  const connues = valeurs.filter((v): v is number => v !== null);
  if (!connues.length) return null;
  const max = Math.max(...connues);
  const min = Math.min(...connues);
  const iMax = valeurs.indexOf(max);
  return (
    <section className="carte space-y-3 p-5">
      <div>
        <h2 className="text-base font-bold">Temps de séance</h2>
        <p className="mt-0.5 text-sm text-ink-2">Médiane, de l&apos;accueil à la fin de la séance</p>
      </div>
      <div className="flex h-24 items-end gap-1.5" role="img" aria-label={heures.map((h, i) => `${h.heure} h : ${duree(valeurs[i])}`).join(", ")}>
        {valeurs.map((v, i) => (
          <i
            key={i}
            className={`block flex-1 rounded-t ${v === null ? "bg-surface-2" : v >= max * 0.9 ? "bg-accent" : v >= (min + max) / 2 ? "bg-accent/60" : "bg-accent/30"}`}
            style={{ height: v === null ? "4%" : `${(v / max) * 100}%` }}
            title={`${creneau(heures[i].heure, 1)} : ${duree(v)}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-ink-2">
        <span>{libelleHeure(heures[0].heure)} · {duree(valeurs[0])}</span>
        <span>{libelleHeure(heures[iMax].heure)} · <b className="text-ink">{duree(max)}</b></span>
        <span>{libelleHeure(heures[heures.length - 1].heure)} · {duree(valeurs[valeurs.length - 1])}</span>
      </div>
      {max - min >= 10 && (
        <p className="text-sm text-ink-2">
          +{duree(max - min)} entre l&apos;heure la plus rapide et la plus lente ({libelleHeure(heures[iMax].heure)}) : attente de l&apos;offre ou paiement plus long, c&apos;est là qu&apos;on perd des séances
          par inactivité.
        </p>
      )}
    </section>
  );
}

function BorneParHeure({ data, heures }: { data: StatsParcours; heures: LigneHeure[] }) {
  const tauxParc = part(data.payees, data.commencees);
  // Écart au parc : vert au-dessus, rouge en dessous ; case grise sous 5 séances
  const couleur = (v: number) => {
    const ecart = v - tauxParc;
    return ecart >= 0.07 ? "var(--color-good)" : ecart >= -0.03 ? "color-mix(in srgb, var(--color-good) 35%, var(--color-surface))" : ecart >= -0.13 ? "color-mix(in srgb, var(--color-bad) 30%, var(--color-surface))" : "var(--color-bad)";
  };
  return (
    <section className="carte space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Taux payé par borne et par heure</h2>
          <p className="mt-0.5 text-sm text-ink-2">
            Vert = au-dessus du parc ({pct(tauxParc)}), rouge = en dessous. Une ligne qui vire au rouge tôt a un lieu qui ferme tôt, ou un problème de borne.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-ink-2">
          {[
            ["var(--color-good)", "au-dessus"],
            ["color-mix(in srgb, var(--color-good) 35%, var(--color-surface))", "dans la moyenne"],
            ["color-mix(in srgb, var(--color-bad) 30%, var(--color-surface))", "un peu en dessous"],
            ["var(--color-bad)", "nettement en dessous"],
          ].map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />{l}</span>)}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[44rem] grid-cols-[9rem_8rem_1fr_4.5rem] items-center gap-x-3 gap-y-2 text-sm">
          <span className="text-xs font-medium text-ink-2">Borne</span>
          <span className="text-xs font-medium text-ink-2">Lieu</span>
          <EnteteHeures heures={heures} />
          <span className="text-right text-xs font-medium text-ink-2">Soirée</span>
          {data.parBorne!.map((b) => {
            const parHeure = new Map(b.parHeure.map((x) => [x.heure, x]));
            const valeurs = heures.map((h) => {
              const x = parHeure.get(h.heure);
              return x && x.commencees >= 5 ? part(x.payees, x.commencees) : null;
            });
            const taux = part(b.payees, b.commencees);
            return (
              <Fragment key={b.borneId}>
                <span className="truncate font-semibold">{b.identifiant}</span>
                <span className="truncate text-ink-2">{b.lieu?.enseigne ?? "—"}</span>
                <Cases valeurs={valeurs} couleur={couleur} titre={(i) => `${b.identifiant}, ${creneau(heures[i].heure, 1)} : ${valeurs[i] === null ? "moins de 5 séances" : `${pct(valeurs[i]!)} payées`}`} />
                <span className={`text-right font-semibold tabular ${taux < tauxParc - 0.1 ? "text-bad" : taux > tauxParc + 0.05 ? "text-good" : ""}`}>{pct(taux)}</span>
              </Fragment>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-ink-muted">Case grise : moins de 5 séances dans l&apos;heure.</p>
    </section>
  );
}

// ─── Détail des formats et des gabarits (tableau, repliable) ───

/** Schéma du format (le rendu réel dépend du cadre de chaque lieu) */
function SchemaFormat({ type, grand = false }: { type: TypeCadre; grand?: boolean }) {
  const photo = "fill-current opacity-25";
  return (
    <svg viewBox="0 0 48 48" className={`${grand ? "h-16 w-16" : "h-10 w-10"} shrink-0 text-ink-2`} aria-hidden>
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

function FormatsCadre({ data, lieuId }: { data: StatsParcours; lieuId?: number }) {
  // Sur une fiche lieu, ouvert d'office : les vignettes des cadres du studio y sont
  const [deplie, setDeplie] = useState(!!lieuId);
  const [ouverts, setOuverts] = useState<Set<TypeCadre>>(new Set());
  if (!data.parCadre.length) return null;
  const groupes = groupesFormats(data);
  const tries = [...groupes.entries()].sort((a, b) => (a[0] === "aucun" ? 1 : b[0] === "aucun" ? -1 : b[1].commencees - a[1].commencees));
  const avecCadre = tries.filter(([t]) => t !== "aucun").reduce((s, [, g]) => s + g.commencees, 0);
  const payeesTotal = tries.reduce((s, [, g]) => s + g.payees, 0);
  const basculer = (t: TypeCadre) => setOuverts((o) => { const n = new Set(o); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const cellules = (l: LigneFormat, partSeances: number | null) => (
    <>
      <td className="py-2 pr-3 text-right">{nombre(l.commencees)}</td>
      <td className="py-2 pr-3 text-right text-ink-2">{partSeances === null ? "—" : pct(partSeances)}</td>
      <td className="py-2 pr-3 text-right">{nombre(l.offres)}</td>
      <td className="py-2 pr-3 text-right">{nombre(l.payees)}</td>
      <td className="py-2 pr-3 text-right text-ink-2">{pct(part(l.payees, payeesTotal))}</td>
      <td className="py-2 text-right font-medium">{pct(part(l.payees, l.commencees))}</td>
    </>
  );

  return (
    <Section
      titre="Détail des formats et des gabarits"
      actions={
        <button type="button" className="text-sm text-accent hover:underline" onClick={() => setDeplie(!deplie)} aria-expanded={deplie}>
          {deplie ? "Masquer" : "Afficher"}
        </button>
      }
    >
      {deplie ? (
        <>
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
                  const total: LigneFormat = { cle: t, libelle: TYPES_CADRE[t].libelle, commencees: g.commencees, offres: g.offres, payees: g.payees };
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
                        {cellules(total, t === "aucun" ? null : part(g.commencees, avecCadre))}
                      </tr>
                      {ouvert &&
                        g.gabarits.map((x) => (
                          <tr key={x.cadre ?? "—"} className="border-t border-line/60 bg-surface-2/40">
                            <td className="py-1.5 pl-6 pr-3">
                              <span className="flex items-center gap-2">
                                {x.cadre && data.apercus?.[x.cadre] ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- vignette du studio (data URL)
                                  <img src={data.apercus[x.cadre]} alt="" className="h-12 w-auto rounded border border-line" />
                                ) : (
                                  <SchemaFormat type={t} />
                                )}
                                <span className="font-mono text-xs">{x.cadre ?? "non choisi"}</span>
                              </span>
                            </td>
                            {cellules({ cle: x.cadre ?? "—", libelle: x.cadre ?? "non choisi", commencees: x.commencees, offres: x.offres, payees: x.payees }, t === "aucun" ? null : part(x.commencees, avecCadre))}
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
        </>
      ) : (
        <p className="text-sm text-ink-2">Chaque format et chacun de ses gabarits : séances, offres vues, payées, conversion.</p>
      )}
    </Section>
  );
}
