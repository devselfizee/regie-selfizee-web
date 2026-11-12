"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { euros, nombre, pct } from "@/lib/format";
import { Badge, Chargement, Erreur, Section } from "./Etat";
import { KpiCouleur } from "./KpiCouleur";

// Comportement des invités (parcours envoyés par les bornes, avenant du 26/10/2026), d'après la maquette du 10/11/2026 :
// phrase de synthèse, cinq tuiles, ruban du parcours, arbre « Ce que devient chaque invité », formats, borne par borne.
// La vue par heure est partie sur sa propre page (/par-heure). Unité de la page : la séance.

type Etape = "cadre" | "prise" | "photo" | "revelation" | "offre" | "paiement" | "paiement_demande" | "impression";
/** Dernière marche du ruban atteinte */
type Marche = "avant_photo" | "photo" | "offre" | "paiement";
/** Ce que devient la séance */
type Sortie = "payee" | "gardee" | "non_validee";

interface LigneArbre {
  marche: Marche;
  sortie: Sortie;
  issue: string;
  statut: string | null;
  recommence: boolean;
  retourOffre: boolean;
  sansCadre: boolean;
  nb: number;
}
interface BorneParcours {
  borneId: number;
  identifiant: string;
  lieu: { id: number; enseigne: string } | null;
  commencees: number;
  paiementDemande: number;
  payees: number;
  recommencent: number;
  nonValidees: number;
  photoAOffreS: number | null;
  terminalMuet: number;
  tendance: number[];
}
interface Cles {
  commencees: number;
  paiementDemande: number;
  payees: number;
  recommencent: number;
  nonValidees: number;
}

interface StatsParcours {
  periode: { du: string; au: string };
  commencees: number;
  etapes: Record<Etape, number>;
  payees: number;
  appels: { lancees: number; engagees: number; payees: number };
  soirees: number;
  upsell: { proposes: number; acceptes: number; montantCents: number };
  dureesMedianesS: {
    seance: number | null;
    cadreAPhoto: number | null;
    photoAOffre: number | null;
    offreAPaiement: number | null;
    paiementAImpression: number | null;
    avantPhoto: number | null;
    devantOffre: number | null;
  };
  arbre: LigneArbre[];
  parCadre: { cadre: string | null; commencees: number; offres: number; payees: number }[];
  parBorne: BorneParcours[];
  precedente: Cles;
  /** Fiche lieu : vignette du cadre dessiné au studio, par nom de gabarit */
  apercus?: Record<string, string>;
}

// Une seule teinte violette dans les graphiques (l'intensité porte la valeur), vert = payé, rouge = pertes
export const VIOLET = "#5B4CF5";
export const VIOLET_FONCE = "#3F33C7";
export const VIOLET_MOYEN = "#8A80F0";
export const VIOLET_CLAIR = "#C9CBF8";
export const VIOLET_PALE = "#ECECFC";
export const VERT = "#067647";
export const ROUGE = "#B42318";
/** Cinq nuances, de la plus faible à la plus forte valeur (cases des tableaux teintés) */
export const NUANCES = ["#F6F7FA", VIOLET_PALE, "#D9DAFA", "#B9B7F5", VIOLET_MOYEN];
const COULEURS_SORTIE: Record<Sortie, string> = { payee: VERT, gardee: VIOLET_MOYEN, non_validee: ROUGE };

export const duree = (s: number | null | undefined) => (s === null || s === undefined ? "—" : s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`);
export const part = (a: number, b: number) => (b ? a / b : 0);

/** Jours d'exploitation (de 6 h à 6 h le lendemain), d'après le jour où commence la soirée */
const JOURS = [
  { v: "", l: "Tous les jours" },
  { v: "1", l: "Lundi" },
  { v: "2", l: "Mardi" },
  { v: "3", l: "Mercredi" },
  { v: "4", l: "Jeudi" },
  { v: "5", l: "Vendredi" },
  { v: "6", l: "Samedi" },
  { v: "7", l: "Dimanche" },
  { v: "4,5,6", l: "Jeudi à samedi" },
];

export function ChoixJours({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      <span className="sr-only">Jours</span>
      <select className="champ !w-auto" value={valeur} onChange={(e) => onChange(e.target.value)} aria-label="Jours de la semaine">
        {JOURS.map((j) => <option key={j.v} value={j.v}>{j.l}</option>)}
      </select>
    </label>
  );
}

/** Ajoute le filtre des jours (soirs=…) à la query string des filtres */
export const avecJours = (requete: string, soirs: string) => (soirs ? `${requete || "?"}${requete && requete !== "?" ? "&" : ""}soirs=${soirs}` : requete);

/** Infobulle au survol (bulle sombre) : le chiffre exact d'un graphique, jamais affichée en permanence */
export function Infobulle({ texte, children, className = "", cote = "centre" }: { texte: ReactNode; children: ReactNode; className?: string; cote?: "centre" | "gauche" | "droite" }) {
  const position = cote === "gauche" ? "left-0" : cote === "droite" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div className={`group/bulle relative ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-[calc(100%+6px)] z-40 hidden w-max max-w-80 rounded-lg bg-[#15171C] px-2.5 py-1.5 text-left text-xs leading-snug font-semibold tracking-normal text-white normal-case shadow-lg group-hover/bulle:block ${position}`}
      >
        {texte}
      </span>
    </div>
  );
}

/** Écart d'un taux à la période précédente, en points */
export function ecartPoints(courant: number, precedent: number | null) {
  if (precedent === null) return null;
  const e = Math.round((courant - precedent) * 100);
  if (!e) return "= stable vs période préc.";
  return `${e > 0 ? "▲ +" : "▼ −"}${Math.abs(e)} pt${Math.abs(e) > 1 ? "s" : ""} vs période préc.`;
}

/**
 * Comportement des invités, global (chemin /stats/parcours avec les filtres) ou d'un lieu.
 * requete : query string des filtres (« ?du=…&au=… »).
 */
export function Comportement({ requete, lieuId, soirs: soirsPage }: { requete: string; lieuId?: number; soirs?: string }) {
  const [soirsLocaux, setSoirs] = useState("");
  /** soirs : choisis par la page (sur la ligne du titre), sinon ici */
  const soirs = soirsPage ?? soirsLocaux;
  const chemin = lieuId ? `/stats/lieux/${lieuId}/parcours` : "/stats/parcours";
  const complete = avecJours(requete, soirs);
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["parcours", chemin, complete],
    queryFn: () => api<StatsParcours>(`${chemin}${complete}`),
    placeholderData: keepPreviousData,
  });

  const barre =
    soirsPage === undefined ? (
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        {isFetching && <span className="text-xs text-ink-muted">mise à jour…</span>}
        <ChoixJours valeur={soirs} onChange={setSoirs} />
      </div>
    ) : null;

  if (error) return <>{barre}<Erreur erreur={error} /></>;
  if (isPending) return <>{barre}<Chargement /></>;
  // Rien reçu : la borne n'envoie pas encore ses parcours (logiciel à mettre à jour)
  if (!data.commencees) {
    return (
      <>
        {barre}
        <Section titre="Parcours des invités">
          <p className="text-sm text-ink-2">
            Aucun parcours reçu sur la période{soirs ? " pour ces jours" : ""}. Les bornes envoient le parcours de chaque séance (de la première page à
            l&apos;impression) depuis la version du logiciel livrée avec l&apos;avenant du 26/10/2026.
          </p>
        </Section>
      </>
    );
  }
  return (
    <>
      {barre}
      <VueParcours data={data} lieuId={lieuId} />
    </>
  );
}

// ─── Sommes sur l'arbre ───

const somme = (l: LigneArbre[], p: (x: LigneArbre) => boolean = () => true) => l.reduce((s, x) => (p(x) ? s + x.nb : s), 0);
const PHOTO_PRISE = (x: LigneArbre) => x.marche !== "avant_photo";
const OFFRE_VUE = (x: LigneArbre) => x.marche === "offre" || x.marche === "paiement";
const DEMANDE = (x: LigneArbre) => x.marche === "paiement";

const LIBELLES_ISSUES: Record<string, string> = { retour: "retours à l'accueil", delai: "inactivités", appel: "photos d'appel sans geste", autre: "autres fins", validee: "photos validées" };
const LIBELLES_STATUTS: Record<string, string> = { annule: "Annulé par l'invité", refuse: "Refus de la banque", expire: "Terminal sans réponse", offert: "Tirage offert", inconnu: "Issue inconnue" };

/** « 35 retours à l'accueil, 24 inactivités » */
function parIssue(l: LigneArbre[]) {
  const n = new Map<string, number>();
  for (const x of l) n.set(x.issue, (n.get(x.issue) ?? 0) + x.nb);
  return [...n].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${nombre(v)} ${LIBELLES_ISSUES[k] ?? k}`).join(", ");
}

// Les cinq marches du ruban et ce qu'on perd entre deux
const MARCHES = ["Séance commencée", "Photo prise", "Offre vue", "Paiement demandé", "Payée et imprimée"];
const PERTES = ["", "partent avant la photo", "ne vont pas jusqu'à l'offre", "ferment l'offre sans payer", "paiements non aboutis"];
const PHRASES = ["", "partent avant de prendre la photo", "prennent la photo sans aller jusqu'à l'offre", "voient l'offre et la ferment sans payer", "lancent un paiement qui n'aboutit pas"];
/** Les mêmes pertes, en nom (« loin devant les paiements non aboutis ») */
const NOMS_PERTES = ["", "départs avant la photo", "arrêts avant l'offre", "offres fermées sans payer", "paiements non aboutis"];

// ─── Vue Parcours ───

function VueParcours({ data, lieuId }: { data: StatsParcours; lieuId?: number }) {
  const l = data.arbre;
  const c = data.commencees;
  const valeurs = [c, somme(l, PHOTO_PRISE), somme(l, OFFRE_VUE), somme(l, DEMANDE), somme(l, (x) => x.sortie === "payee")];
  const pertes = valeurs.map((v, i) => (i ? Math.max(0, valeurs[i - 1] - v) : 0));
  // Ce qu'on sait de chaque perte (au survol)
  const gardeesSansOffre = somme(l, (x) => x.marche === "photo" && x.sortie === "gardee");
  const statuts = new Map<string, number>();
  for (const x of l) if (DEMANDE(x) && x.sortie !== "payee") statuts.set(x.statut ?? "inconnu", (statuts.get(x.statut ?? "inconnu") ?? 0) + x.nb);
  const detailPertes = [
    "",
    parIssue(l.filter((x) => x.marche === "avant_photo")),
    [parIssue(l.filter((x) => x.marche === "photo" && x.sortie === "non_validee")), gardeesSansOffre ? `${nombre(gardeesSansOffre)} valident leur photo sans voir l'offre` : ""].filter(Boolean).join(" · "),
    `${nombre(somme(l, (x) => x.marche === "offre" && x.sortie === "gardee"))} photos validées non payées, ${nombre(somme(l, (x) => x.marche === "offre" && x.sortie === "non_validee"))} reviennent à la photo et abandonnent`,
    [...statuts].map(([k, v]) => `${nombre(v)} ${(LIBELLES_STATUTS[k] ?? LIBELLES_STATUTS.inconnu).toLowerCase()}`).join(", "),
  ];

  return (
    <div className="space-y-5">
      <Synthese valeurs={valeurs} pertes={pertes} />
      <Tuiles data={data} />

      <section className="carte scroll-mt-4 space-y-5 p-5" id="parcours">
        <div>
          <h2 className="text-base font-bold">Le parcours d&apos;un invité</h2>
          <p className="mt-0.5 text-sm text-ink-2">
            Vue d&apos;ensemble : le ruban se rétrécit à chaque étape. Le détail de ce que devient chaque invité est dans l&apos;arbre juste en dessous.
          </p>
        </div>
        <Ruban valeurs={valeurs} pertes={pertes} details={detailPertes} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {MARCHES.map((m, i) => (
            <div key={m} className="flex min-w-0 flex-col gap-1.5">
              <span className="text-2xl leading-none font-extrabold tabular" style={{ color: i === 4 ? VERT : VIOLET }}>{nombre(valeurs[i])}</span>
              <span className="text-sm font-semibold">
                {m}
                {i > 0 && (
                  <span className="font-medium text-ink-2">
                    {" "}· {pct(part(valeurs[i], valeurs[i - 1]))} {["", "des arrivants", "des photos", "des offres", ""][i]}
                    {i === 4 && ` · ${pct(part(valeurs[i], c))} du total`}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <Arbre data={data} />

      <Podium data={data} />

      {data.parBorne.length > 1 && <BorneParBorne data={data} />}

      {/* Sur une fiche lieu : les gabarits du lieu, avec les vignettes du studio */}
      {lieuId !== undefined && <FormatsCadre data={data} lieuId={lieuId} />}
    </div>
  );
}

/** Bandeau : la phrase de synthèse, écrite par règles d'après les pertes du ruban */
function Synthese({ valeurs, pertes }: { valeurs: number[]; pertes: number[] }) {
  const classees = pertes.map((p, i) => ({ p, i })).filter((x) => x.i > 0 && x.p > 0).sort((a, b) => b.p - a.p);
  const [pire, second] = classees;
  if (!pire) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ background: "#EEEDFE" }}>
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-white" style={{ background: VIOLET }} aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>
      </span>
      <p className="min-w-0 flex-[1_1_420px] text-[15px] leading-snug" style={{ color: "#2B2A66" }}>
        <strong>Le point à travailler :</strong> {nombre(pire.p)} invités {PHRASES[pire.i]}, soit {pct(part(pire.p, valeurs[pire.i - 1]))} de ceux qui arrivent jusque-là.{" "}
        {second
          ? `C'est le plus gros décrochage du parcours, ${pire.p >= second.p * 2 ? "loin devant" : "devant"} les ${NOMS_PERTES[second.i]} (${nombre(second.p)}).`
          : "C'est le seul décrochage du parcours."}
      </p>
      <a href="#parcours" className="text-sm font-semibold text-accent hover:underline">Voir le parcours</a>
    </div>
  );
}

/** Les cinq tuiles du haut (couleur selon la position, comme le tableau de bord) */
function Tuiles({ data }: { data: StatsParcours }) {
  const l = data.arbre;
  const c = data.commencees;
  const p = data.precedente;
  const tauxPrec = (x: number) => (p.commencees ? part(x, p.commencees) : null);
  const demandes = somme(l, DEMANDE);
  const payees = somme(l, (x) => x.sortie === "payee");
  const recommencent = somme(l, (x) => x.recommence);
  const recommencentPerdus = somme(l, (x) => x.recommence && x.sortie === "non_validee");
  const nonValidees = l.filter((x) => x.sortie === "non_validee");
  const nbNonValidees = somme(nonValidees);
  const autres = somme(nonValidees, (x) => x.issue !== "retour" && x.issue !== "delai");
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <KpiCouleur
        grand
        teinte="vert"
        libelle="Séances"
        valeur={nombre(c)}
        detail={`${data.soirees ? `${nombre(Math.round(c / data.soirees))} par borne et par soir · ` : ""}${duree(data.dureesMedianesS.seance)} en médiane`}
        courant={c}
        precedente={p.commencees}
      />
      <KpiCouleur
        grand
        teinte="bleu"
        libelle="Jusqu'au paiement"
        valeur={pct(part(demandes, c))}
        ecart={ecartPoints(part(demandes, c), tauxPrec(p.paiementDemande))}
        detail={`${nombre(demandes)} séances demandent à payer`}
      />
      <KpiCouleur
        grand
        teinte="rose"
        libelle="Payées et imprimées"
        valeur={pct(part(payees, c))}
        ecart={ecartPoints(part(payees, c), tauxPrec(p.payees))}
        detail={`${nombre(payees)} séances · ${pct(part(payees, demandes))} des demandes aboutissent`}
      />
      <KpiCouleur
        grand
        teinte="orange"
        libelle="Recommencent"
        valeur={pct(part(recommencent, c))}
        ecart={ecartPoints(part(recommencent, c), tauxPrec(p.recommencent))}
        detail={`${nombre(recommencent)} séances${recommencent ? ` · dont ${pct(part(recommencentPerdus, recommencent))} ne valident finalement pas` : ""}`}
      />
      <KpiCouleur
        grand
        teinte="violet"
        libelle="Ne valident pas leur photo"
        valeur={pct(part(nbNonValidees, c))}
        ecart={ecartPoints(part(nbNonValidees, c), tauxPrec(p.nonValidees))}
        detail={`${nombre(nbNonValidees)} séances · ${nombre(somme(nonValidees, (x) => x.issue === "retour"))} quittent avant de valider, ${nombre(somme(nonValidees, (x) => x.issue === "delai"))} par inactivité${autres ? `, ${nombre(autres)} autres` : ""} · rien n'est enregistré`}
      />
    </div>
  );
}

/** Ruban du parcours : chaque bande a la hauteur de la part des séances ; entre deux marches, la perte et son % de la marche précédente */
function Ruban({ valeurs, pertes, details }: { valeurs: number[]; pertes: number[]; details: string[] }) {
  const H = 180;
  const L = 1200 / valeurs.length;
  const h = valeurs.map((v) => (valeurs[0] ? (v / valeurs[0]) * H : 0));
  const y = (x: number) => (H - x) / 2;
  const pire = Math.max(...pertes);
  return (
    <figure className="relative m-0" role="img" aria-label={`Ruban du parcours : ${valeurs.map((v, i) => `${MARCHES[i]} ${v}`).join(", ")} ; pertes entre les marches : ${pertes.slice(1).join(", ")}`}>
      <svg viewBox={`0 0 1200 ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden>
        {valeurs.map((_, i) => {
          const x0 = i * L;
          const x1 = x0 + L;
          const g = i ? h[i - 1] : h[0];
          const d = h[i];
          return (
            <Fragment key={i}>
              <path d={`M${x0} 0 L${x1} 0 L${x1} ${y(d)} L${x0} ${y(g)} Z`} fill="var(--color-surface-2)" />
              <path d={`M${x0} ${H} L${x1} ${H} L${x1} ${H - y(d)} L${x0} ${H - y(g)} Z`} fill="var(--color-surface-2)" />
              <path d={`M${x0} ${y(g)} L${x1} ${y(d)} L${x1} ${H - y(d)} L${x0} ${H - y(g)} Z`} fill={i === valeurs.length - 1 ? VERT : VIOLET} />
              {i > 0 && <line x1={x0} y1="0" x2={x0} y2={H} stroke="var(--color-surface)" strokeWidth="8" />}
            </Fragment>
          );
        })}
      </svg>
      {pertes.map((p, i) =>
        i === 0 ? null : (
          <div key={i} className="absolute top-1/2 w-[19%] max-w-40 -translate-x-1/2 -translate-y-1/2" style={{ left: `${(i / valeurs.length) * 100}%` }}>
            <Infobulle texte={`${nombre(p)} séances · ${pct(part(p, valeurs[i - 1]))} des ${nombre(valeurs[i - 1])}${details[i] ? ` · ${details[i]}` : ""}`}>
              <div className="rounded-lg border border-line bg-surface px-2 py-1.5 text-center">
                <div className={`font-extrabold leading-none tabular ${p === pire && p > 0 ? "text-xl" : "text-base"}`} style={{ color: ROUGE }}>
                  − {nombre(p)} <span className="text-xs font-bold">· {pct(part(p, valeurs[i - 1]))}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-ink-2">{PERTES[i]}</div>
              </div>
            </Infobulle>
          </div>
        )
      )}
    </figure>
  );
}

// ─── Arbre « Ce que devient chaque invité » ───

interface Noeud {
  cle: string;
  libelle: string;
  nb: number;
  sortie?: Sortie;
  lignes: [string, string][];
  note?: string;
  /** Simple découpage d'un nœud (par issue, par sortie) : fondu dans son parent s'il est seul */
  fusion?: boolean;
  enfants: Noeud[];
}
const noeud = (cle: string, libelle: string, nb: number, o: Partial<Noeud> = {}): Noeud => ({ cle, libelle, nb, lignes: [], enfants: [], ...o });
/** Lignes de détail non nulles */
const detailNonNul = (l: [string, number][]): [string, string][] => l.filter(([, v]) => v > 0).map(([k, v]) => [k, nombre(v)]);

/** Enfants nuls retirés ; un découpage qui ne découpe rien est fondu dans son parent */
function simplifier(n: Noeud): Noeud {
  const enfants = n.enfants.map(simplifier).filter((e) => e.nb > 0);
  if (enfants.length === 1 && enfants[0].fusion && enfants[0].nb === n.nb) {
    const e = enfants[0];
    return { ...n, sortie: e.sortie ?? n.sortie, lignes: [...n.lignes, ...e.lignes], note: n.note ?? e.note, enfants: e.enfants };
  }
  return { ...n, enfants };
}

/** Sortie commune à toutes les feuilles d'un nœud (sa couleur), sinon aucune */
function sortieCommune(n: Noeud): Sortie | undefined {
  if (!n.enfants.length) return n.sortie;
  const s = n.enfants.map(sortieCommune);
  return s.every((x) => x && x === s[0]) ? s[0] : undefined;
}

function construireArbre(data: StatsParcours): Noeud {
  const l = data.arbre;
  const s = (p: (x: LigneArbre) => boolean) => somme(l, p);
  const d = data.dureesMedianesS;
  const c = data.commencees;
  const avecPart = (x: number, de: number) => `${nombre(x)} · ${pct(part(x, de))}`;
  const recommence = (p: (x: LigneArbre) => boolean) => s((x) => p(x) && x.recommence);
  /** Séances non validées d'une marche, par issue */
  const parIssues = (prefixe: string, p: (x: LigneArbre) => boolean): Noeud[] => [
    noeud(`${prefixe}-retour`, "Retourne à l'accueil", s((x) => p(x) && x.issue === "retour"), {
      sortie: "non_validee",
      fusion: true,
      lignes: detailNonNul([["Dont après avoir recommencé", recommence((x) => p(x) && x.issue === "retour")]]),
    }),
    noeud(`${prefixe}-delai`, "Ne fait plus rien", s((x) => p(x) && x.issue === "delai"), {
      sortie: "non_validee",
      fusion: true,
      lignes: detailNonNul([["Dont après avoir recommencé", recommence((x) => p(x) && x.issue === "delai")]]),
    }),
    noeud(`${prefixe}-autre`, "Autre fin", s((x) => p(x) && x.issue !== "retour" && x.issue !== "delai"), {
      sortie: "non_validee",
      fusion: true,
      lignes: detailNonNul(["appel", "autre", "validee"].map((i) => [LIBELLES_ISSUES[i].replace(/^./, (m) => m.toUpperCase()), s((x) => p(x) && x.issue === i)])),
    }),
  ];

  const avant = (x: LigneArbre) => x.marche === "avant_photo";
  const photoSeule = (x: LigneArbre) => x.marche === "photo";
  const offreSeule = (x: LigneArbre) => x.marche === "offre";
  const nbPhoto = s(PHOTO_PRISE);
  const nbOffre = s(OFFRE_VUE);
  const nbDemande = s(DEMANDE);
  const nbPayees = s((x) => x.sortie === "payee");
  const recPhoto = recommence(PHOTO_PRISE);
  const gardeesSansOffre = s((x) => photoSeule(x) && x.sortie === "gardee");

  const racine = noeud("racine", "Séance commencée", c, {
    lignes: [
      ["Séances sur la période", nombre(c)],
      ...(data.soirees ? [["Par borne et par soir", nombre(Math.round(c / data.soirees))] as [string, string]] : []),
      ["Durée médiane d'une séance", duree(d.seance)],
      ...(data.appels.lancees ? [["Photos d'appel lancées par la borne", `${nombre(data.appels.lancees)} · ${nombre(data.appels.engagees)} ont attiré`] as [string, string]] : []),
    ],
    enfants: [
      noeud("avant", "Part avant la photo", s(avant), {
        lignes: [...detailNonNul([["Sans choisir de cadre", s((x) => avant(x) && x.sansCadre)]]), ["Temps passé", `${duree(d.avantPhoto)} en médiane`]],
        enfants: parIssues("avant", avant),
      }),
      noeud("photo", "Photo prise", nbPhoto, {
        lignes: [
          ["Photos prises", avecPart(nbPhoto, c)],
          ["Cadre → photo", `${duree(d.cadreAPhoto)} en médiane`],
          ["Recommencent au moins une fois", avecPart(recPhoto, nbPhoto)],
          ["… et valident ensuite leur photo", `${nombre(s((x) => PHOTO_PRISE(x) && x.recommence && x.sortie !== "non_validee"))} sur ${nombre(recPhoto)}`],
        ],
        enfants: [
          noeud("photo-seule", gardeesSansOffre ? "Ne va pas jusqu'à l'offre" : "Ne valide pas sa photo", s(photoSeule), {
            lignes: detailNonNul([["Dont après avoir recommencé", recommence(photoSeule)]]),
            enfants: [
              ...parIssues("photo", (x) => photoSeule(x) && x.sortie === "non_validee"),
              noeud("photo-gardee", "Valide sa photo sans voir l'offre", gardeesSansOffre, { sortie: "gardee", fusion: true }),
            ],
          }),
          noeud("offre", "Valide et voit l'offre", nbOffre, {
            lignes: [
              ["Offres vues", avecPart(nbOffre, nbPhoto)],
              ["Photo → offre", `${duree(d.photoAOffre)} en médiane`],
            ],
            enfants: [
              noeud("offre-fermee", "Ferme l'offre sans payer", s(offreSeule), {
                lignes: [
                  ["Offres fermées", avecPart(s(offreSeule), nbOffre)],
                  ["Temps passé devant l'offre", `${duree(d.devantOffre)} en médiane`],
                  ...detailNonNul([["Reviennent d'abord à la photo", s((x) => offreSeule(x) && x.retourOffre)]]),
                ],
                enfants: [
                  noeud("offre-non-merci", "« Non merci »", s((x) => offreSeule(x) && x.sortie === "gardee" && x.issue === "validee"), {
                    sortie: "gardee",
                    fusion: true,
                    lignes: [["Ce qui arrive", "Ferme l'offre, photo validée mais pas payée"]],
                  }),
                  noeud("offre-sans-reponse", "Ne répond pas", s((x) => offreSeule(x) && x.sortie === "gardee" && x.issue === "delai"), {
                    sortie: "gardee",
                    fusion: true,
                    lignes: [["Ce qui arrive", "Inactivité devant l'offre"]],
                  }),
                  noeud("offre-accueil", "Retourne à l'accueil", s((x) => offreSeule(x) && x.sortie === "gardee" && x.issue !== "validee" && x.issue !== "delai"), {
                    sortie: "gardee",
                    fusion: true,
                  }),
                  noeud("offre-perdue", "Revient à la photo, abandonne", s((x) => offreSeule(x) && x.sortie === "non_validee"), {
                    sortie: "non_validee",
                    fusion: true,
                    lignes: detailNonNul([
                      ["Revient d'abord à la photo", s((x) => offreSeule(x) && x.sortie === "non_validee" && x.retourOffre)],
                      ["Retour à l'accueil", s((x) => offreSeule(x) && x.sortie === "non_validee" && x.issue === "retour")],
                      ["Inactivité", s((x) => offreSeule(x) && x.sortie === "non_validee" && x.issue === "delai")],
                    ]),
                  }),
                ],
              }),
              noeud("demande", "Demande à payer", nbDemande, {
                lignes: [
                  ["Demandes de paiement", avecPart(nbDemande, nbOffre)],
                  ["Offre → demande", `${duree(d.offreAPaiement)} en médiane`],
                ],
                note: "La suite, étape par étape : page Paiements.",
                enfants: [
                  noeud("payee", "Payée et imprimée", nbPayees, {
                    sortie: "payee",
                    lignes: [
                      ["Payées", avecPart(nbPayees, nbDemande)],
                      ["Paiement → tirage", `${duree(d.paiementAImpression)} en médiane`],
                      ...(data.upsell.proposes
                        ? [["« +1 pour un pote » acceptés", `${nombre(data.upsell.acceptes)} sur ${nombre(data.upsell.proposes)} · ${euros(data.upsell.montantCents)}`] as [string, string]]
                        : []),
                    ],
                  }),
                  noeud("non-abouti", "Paiement non abouti", s((x) => DEMANDE(x) && x.sortie !== "payee"), {
                    lignes: detailNonNul(
                      Object.keys(LIBELLES_STATUTS).map((k) => [LIBELLES_STATUTS[k], s((x) => DEMANDE(x) && x.sortie !== "payee" && (x.statut ?? "inconnu") === k)])
                    ),
                    note: "Le détail est sur la page Paiements.",
                    enfants: [
                      noeud("non-abouti-gardee", "Photo validée, non payée", s((x) => DEMANDE(x) && x.sortie === "gardee"), { sortie: "gardee", fusion: true }),
                      noeud("non-abouti-perdue", "Photo non validée", s((x) => DEMANDE(x) && x.sortie === "non_validee"), { sortie: "non_validee", fusion: true }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
  return simplifier(racine);
}

const PASTILLES: Record<Sortie, { texte: string; classe: string }> = {
  payee: { texte: "payée", classe: "bg-ok-bg text-ok-ink" },
  gardee: { texte: "non payée", classe: "bg-[#EEEDFE] text-[#3F33C7]" },
  non_validee: { texte: "non validée", classe: "bg-crit-bg text-crit-ink" },
};

function Arbre({ data }: { data: StatsParcours }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  // Une seule bulle ouverte ; un clic ailleurs (ou Échap) ferme tout
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (!(e.target instanceof Element && e.target.closest("[data-noeud]"))) setOuvert(null);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(null);
    };
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", fermer);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const racine = construireArbre(data);
  const l = data.arbre;
  const c = data.commencees;
  const payees = somme(l, (x) => x.sortie === "payee");
  const gardees = somme(l, (x) => x.sortie === "gardee");
  const perdues = somme(l, (x) => x.sortie === "non_validee");
  const gardeesNonAbouties = somme(l, (x) => x.sortie === "gardee" && x.marche === "paiement");
  const liste = (morceaux: [number, string][]) => morceaux.filter(([v]) => v > 0).map(([v, t]) => `${nombre(v)} ${t}`).join(", ");

  return (
    <section className="carte space-y-5 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Ce que devient chaque invité</h2>
          <p className="mt-0.5 text-sm text-ink-2">
            Les mêmes {nombre(c)} séances, une fois chacune. Le % est celui de l&apos;étape précédente. Cliquer une bulle pour le détail.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-ink-2">
          {(Object.keys(COULEURS_SORTIE) as Sortie[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <i className="inline-block h-3 w-3 rounded-sm" style={{ background: COULEURS_SORTIE[k] }} />
              {k === "payee" ? "payée" : k === "gardee" ? "photo validée, non payée" : "photo non validée"}
            </span>
          ))}
        </div>
      </div>
      <div className="flex justify-center pb-1 max-xl:justify-start max-xl:overflow-x-auto">
        <ul className="m-0 flex list-none p-0">
          <Branche n={racine} profondeur={0} ouvert={ouvert} basculer={(cle) => setOuvert((o) => (o === cle ? null : cle))} />
        </ul>
      </div>
      <div className="grid gap-3 border-t border-line pt-5 md:grid-cols-3">
        <CarteSortie titre="Payée et imprimée" nb={payees} total={c} fond="bg-ok-bg" ton="text-ok-ink" couleur={VERT}>
          Le seul cas où l&apos;invité repart avec quelque chose : son tirage, et le QR pour retrouver la photo.
        </CarteSortie>
        <CarteSortie titre="Photo validée, non payée" nb={gardees} total={c} fond="bg-[#EEEDFE]" ton="text-[#4A43B8]" couleur={VIOLET_FONCE}>
          L&apos;invité repart sans rien
          {gardees
            ? ` : ${liste([
                [somme(l, (x) => x.sortie === "gardee" && x.marche === "offre"), "ferment l'offre"],
                [gardeesNonAbouties, gardeesNonAbouties > 1 ? "paiements n'aboutissent pas" : "paiement n'aboutit pas"],
                [somme(l, (x) => x.sortie === "gardee" && x.marche === "photo"), "valident sans voir l'offre"],
              ])}.`
            : "."}{" "}
          La photo reste enregistrée sur la borne, lui ne l&apos;a pas.
        </CarteSortie>
        <CarteSortie titre="Photo non validée" nb={perdues} total={c} fond="bg-crit-bg" ton="text-crit-ink" couleur={ROUGE}>
          {perdues
            ? `${liste([
                [somme(l, (x) => x.sortie === "non_validee" && x.marche === "avant_photo"), "avant la photo"],
                [somme(l, (x) => x.sortie === "non_validee" && x.marche === "photo"), "après la photo"],
                [somme(l, (x) => x.sortie === "non_validee" && x.marche === "offre"), "revenus de l'offre"],
                [somme(l, (x) => x.sortie === "non_validee" && x.marche === "paiement"), "après un paiement non abouti"],
              ])}. `
            : ""}
          L&apos;invité repart sans rien, rien n&apos;est enregistré.
        </CarteSortie>
      </div>
    </section>
  );
}

// Traits de l'arbre : un trait horizontal vers chaque enfant, un trait vertical du premier au dernier
const LI_ENFANT =
  "relative flex items-center before:absolute before:top-1/2 before:-left-[22px] before:h-0.5 before:w-[22px] before:bg-line-strong " +
  "first:after:absolute first:after:top-0 first:after:-left-[22px] first:after:h-1/2 first:after:w-1 first:after:bg-surface " +
  "last:after:absolute last:after:top-[calc(50%+2px)] last:after:bottom-0 last:after:-left-[22px] last:after:w-1 last:after:bg-surface only:after:hidden";

function Branche({ n, parent, profondeur, ouvert, basculer }: { n: Noeud; parent?: Noeud; profondeur: number; ouvert: string | null; basculer: (cle: string) => void }) {
  const sortie = sortieCommune(n);
  const couleur = sortie ? COULEURS_SORTIE[sortie] : VIOLET;
  const estOuvert = ouvert === n.cle;
  const feuille = !n.enfants.length;
  return (
    <li className={profondeur ? LI_ENFANT : "relative flex items-center"}>
      <div className="relative w-44 flex-none" data-noeud>
        <button
          type="button"
          onClick={() => basculer(n.cle)}
          aria-expanded={estOuvert}
          className={`w-full rounded-lg border bg-surface px-2.5 py-1.5 text-left transition-shadow hover:shadow-md ${estOuvert ? "border-[#C9CBF8] shadow-md" : "border-line hover:border-[#C9CBF8]"}`}
          style={{ borderLeft: `3px solid ${couleur}` }}
        >
          <span className="flex items-center gap-2">
            <span className="text-lg font-extrabold tabular" style={{ color: couleur }}>{nombre(n.nb)}</span>
            {parent && <span className="text-xs font-semibold text-ink-2 tabular">{pct(part(n.nb, parent.nb))}</span>}
            {feuille && n.sortie && <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${PASTILLES[n.sortie].classe}`}>{PASTILLES[n.sortie].texte}</span>}
          </span>
          <span className="mt-px block text-[13px] leading-tight font-semibold">{n.libelle}</span>
        </button>
        {estOuvert && (
          <div
            className={`absolute -top-1.5 z-50 w-80 cursor-default rounded-xl bg-[#15171C] px-4 py-3.5 text-white shadow-2xl ${profondeur >= 3 ? "right-[calc(100%+14px)]" : "left-[calc(100%+14px)]"}`}
            role="dialog"
            aria-label={n.libelle}
          >
            <span aria-hidden className={`absolute top-5 h-3 w-3 rotate-45 bg-[#15171C] ${profondeur >= 3 ? "-right-1.5" : "-left-1.5"}`} />
            <div className="mb-1.5 text-sm font-bold">
              {n.libelle} <span style={{ color: sortie ? couleur : VIOLET_CLAIR }}>· {nombre(n.nb)}</span>
            </div>
            {parent && (
              <div className="flex justify-between gap-3 border-t border-white/10 py-1 text-[13px]">
                <span className="text-[#C9CCD6]">Part de « {parent.libelle} »</span>
                <b className="text-right">{pct(part(n.nb, parent.nb))}</b>
              </div>
            )}
            {n.lignes.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-t border-white/10 py-1 text-[13px]">
                <span className="text-[#C9CCD6]">{k}</span>
                <b className="text-right tabular">{v}</b>
              </div>
            ))}
            {n.note && <p className="mt-2 text-[13px] leading-snug text-[#E4E6EC]">{n.note}</p>}
          </div>
        )}
      </div>
      {!feuille && (
        <ul className={`relative m-0 flex list-none flex-col justify-center py-0 pr-0 pl-[22px] before:absolute before:top-0 before:bottom-0 before:left-0 before:w-0.5 before:bg-line-strong ${n.enfants.some((e) => e.enfants.length) ? "gap-5" : "gap-1.5"}`}>
          {n.enfants.map((e) => <Branche key={e.cle} n={e} parent={n} profondeur={profondeur + 1} ouvert={ouvert} basculer={basculer} />)}
        </ul>
      )}
    </li>
  );
}

function CarteSortie({ titre, nb, total, fond, ton, couleur, children }: { titre: string; nb: number; total: number; fond: string; ton: string; couleur: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl px-5 py-4 ${fond}`}>
      <span className={`text-xs font-bold tracking-wide uppercase ${ton}`}>{titre}</span>
      <span className="text-3xl leading-none font-extrabold tracking-tight tabular" style={{ color: couleur }}>
        {nombre(nb)} <span className="text-sm font-semibold">· {pct(part(nb, total))}</span>
      </span>
      <span className="text-sm leading-snug">{children}</span>
    </div>
  );
}

// ─── Formats : podium (gris) au taux de séances payées ───

type TypeCadre = "polaroid" | "multishoot" | "strip" | "carte" | "autre" | "aucun";
const TYPES_CADRE: Record<TypeCadre, string> = {
  polaroid: "Polaroïd",
  multishoot: "Planche multishoot",
  strip: "Bandelette",
  carte: "Carte",
  autre: "Autre",
  aucun: "Non choisi",
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
  // 2 – 1 – 3, comme un podium
  const ordre = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium.length === 2 ? [podium[1], podium[0]] : podium;
  const hauteurs = ["h-40", "h-30", "h-20"];
  return (
    <section className="carte space-y-4 p-5">
      <h2 className="text-base font-bold">Formats : qui fait payer</h2>
      {podium.length ? (
        <div className={`mx-auto grid max-w-2xl items-end gap-4 ${ordre.length === 3 ? "grid-cols-3" : ordre.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {ordre.map((x) => {
            const rang = podium.indexOf(x);
            return (
              <Infobulle
                key={x.t}
                className="flex flex-col items-center gap-2"
                texte={`${TYPES_CADRE[x.t]} : ${pct(x.partSeances)} des séances le choisissent · ${pct(x.taux)} payées (${nombre(x.g.payees)} sur ${nombre(x.g.commencees)})`}
              >
                <SchemaFormat type={x.t} grand />
                <div className={`flex w-full flex-col items-center gap-1 rounded-t-xl bg-surface-2 pt-3 ${hauteurs[rang]}`}>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold ${rang === 0 ? "bg-ink text-surface" : "bg-line-strong text-ink"}`}>{rang + 1}</span>
                  <span className={`font-extrabold tabular ${rang === 0 ? "text-3xl" : "text-2xl"}`}>{pct(x.taux)}</span>
                  {rang === 0 && <span className="text-xs font-semibold text-ink-2">payées</span>}
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold">{TYPES_CADRE[x.t]}</div>
                  <div className="text-xs text-ink-2">{pct(x.partSeances)} des séances</div>
                </div>
              </Infobulle>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Pas assez de séances avec un cadre choisi pour comparer les formats.</p>
      )}
      {classes.length > 3 && (
        <p className="border-t border-line pt-3 text-xs text-ink-2">
          Ensuite : {classes.slice(3).map((x) => `${TYPES_CADRE[x.t]} ${pct(x.taux)} payées (${pct(x.partSeances)} des séances)`).join(" · ")}
        </p>
      )}
    </section>
  );
}

// ─── Borne par borne ───

const Etiquette = ({ children }: { children: ReactNode }) => <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-sm">{children}</span>;

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
      {valeurs.map((v, i) => <i key={i} className="block w-1.5 rounded-sm" style={{ height: `${Math.max(2, (v / max) * 20)}px`, background: i === iMax ? VIOLET : VIOLET_CLAIR }} />)}
    </span>
  );
}

function Taux({ valeur, mauvais }: { valeur: number; mauvais?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold">
      <i className="inline-block h-2 w-14 overflow-hidden rounded bg-surface-2"><b className="block h-full rounded" style={{ width: `${valeur * 100}%`, background: mauvais ? ROUGE : VIOLET }} /></i>
      {pct(valeur)}
    </span>
  );
}

function BorneParBorne({ data }: { data: StatsParcours }) {
  const c = data.commencees;
  const parc = {
    paiement: part(somme(data.arbre, DEMANDE), c),
    payees: part(data.payees, c),
    recommencent: part(somme(data.arbre, (x) => x.recommence), c),
    photoAOffre: data.dureesMedianesS.photoAOffre,
  };
  return (
    <section className="carte space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-bold">Borne par borne</h2>
        <Etiquette>Parc : <b>{pct(parc.paiement)} jusqu&apos;au paiement</b> · <b>{pct(parc.payees)} payées</b></Etiquette>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr>
              <th className="pr-3 pb-2 font-medium">Borne</th>
              <th className="pr-3 pb-2 font-medium">Lieu</th>
              <th className="pr-3 pb-2 text-right font-medium">Séances</th>
              <th className="pr-3 pb-2 font-medium">Sur la période</th>
              <th className="pr-3 pb-2 text-right font-medium">Jusqu&apos;au paiement</th>
              <th className="pr-3 pb-2 text-right font-medium">Payées</th>
              <th className="pr-3 pb-2 text-right font-medium">Recommencent</th>
              <th className="pr-3 pb-2 text-right font-medium">Photo → offre</th>
              <th className="pb-2 font-medium">À regarder</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.parBorne.map((b) => {
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

// ─── Fiche lieu : détail des formats et des gabarits (tableau, repliable) ───

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
                  const total: LigneFormat = { cle: t, libelle: TYPES_CADRE[t], commencees: g.commencees, offres: g.offres, payees: g.payees };
                  return (
                    <Fragment key={t}>
                      <tr className="border-t border-line">
                        <td className="py-2 pr-3">
                          <button type="button" className="flex items-center gap-2 text-left font-medium hover:text-accent disabled:hover:text-ink" onClick={() => basculer(t)} disabled={!detail} aria-expanded={detail ? ouvert : undefined}>
                            <SchemaFormat type={t} />
                            <span>
                              {TYPES_CADRE[t]}
                              {detail && <span className="block text-xs font-normal text-ink-muted">{g.gabarits.length} gabarit{g.gabarits.length > 1 ? "s" : ""} · {ouvert ? "masquer" : "détail"}</span>}
                            </span>
                          </button>
                        </td>
                        {cellules(total, t === "aucun" ? null : part(g.commencees, avecCadre))}
                      </tr>
                      {ouvert &&
                        g.gabarits.map((x) => (
                          <tr key={x.cadre ?? "—"} className="border-t border-line/60 bg-surface-2/40">
                            <td className="py-1.5 pr-3 pl-6">
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
