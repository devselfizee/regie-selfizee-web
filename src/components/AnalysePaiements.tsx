"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { eurosRond, jour, nombre, pct } from "@/lib/format";
import { Chargement, EnTete, Erreur, Section } from "./Etat";
import { FiltresPage, useFiltresPage } from "./FiltresPage";
import { KpiCouleur } from "./KpiCouleur";

// Analyses → Paiements (maquette paiements.html) : ce qui se passe entre l'appui sur « Payer » et le tirage.
// Unité : la demande de paiement, une par séance. Chiffres calculés par l'API (/stats/paiements-analyse).

// ─── Types (miroir de api/src/stats/analysePaiements.ts) ───

interface Somme {
  nb: number;
  montantCents: number;
}
interface Issue extends Somme {
  paye: { nb: number; offerts: number; delaiMedianS: number | null };
  part: Somme;
}
interface Cles {
  demandes: number;
  aboutis: number;
  offerts: number;
  demandeATirageMedianeS: number | null;
}
interface GroupeHoraire {
  demandes: number;
  annulations: number;
  refusBanque: number;
  demandeATirageMedianeS: number | null;
}
export interface AnalyseDesPaiements {
  periode: { du: string; au: string };
  seuils: { attenteS: number; lentS: number };
  bornes: { id: number; identifiant: string }[];
  demandes: number;
  aboutis: number;
  precedente: Cles;
  offerts: Somme;
  incertains: Somme;
  encaisseCents: number;
  demandeATirage: { nb: number; medianeS: number | null; p90S: number | null; auDelaSeuil: number };
  histogramme: { de: number; a: number | null; nb: number }[];
  arbre: {
    demandes: number;
    demandesRepetees: number;
    pageAPayerMedianeS: number | null;
    annule: { nb: number; parInvite: number; parTerminal: number; delaiMedianS: number | null; vite: Issue; attente: Issue; inconnu: Issue };
    verdict: {
      nb: number;
      accepte: { nb: number; delaiMedianS: number | null; preleve: number; incertain: Somme; offert: Somme };
      refusBanque: Issue;
      refusTerminal: Issue;
      muet: { nb: number; passages: number; relanceAccepte: { nb: number; delaiMedianS: number | null }; relancePart: Somme; part: Somme };
    };
    sansVente: Issue;
  };
  parTranche: { debut: number; demandes: number; aboutis: number; annules: number; muets: number; refus: number; inconnus: number }[];
  avantMinuit: GroupeHoraire;
  apres2h: GroupeHoraire;
  parBorne: {
    borneId: number;
    identifiant: string;
    lieu: { id: number; enseigne: string };
    demandes: number;
    aboutis: number;
    demandeATirageMedianeS: number | null;
    muets: number;
    refusBanque: number;
    offerts: Somme;
  }[];
}

// ─── Couleurs : une seule teinte violette, rouge réservé aux pertes (règles des maquettes) ───

const VIOLET = "#5B4CF5";
const VIOLET_CLAIR = "#C9CBF8";
const CHOIX = "#8A80F0";
const BANQUE = "#B54708";
const PERTE = "#B42318";
const PAYE = "var(--color-good)";
const BULLE = "#15171C";

type Ton = "neutre" | "paye" | "choix" | "banque" | "technique";
const TONS: Record<Ton, string> = { neutre: VIOLET, paye: PAYE, choix: CHOIX, banque: BANQUE, technique: PERTE };

const PAS_REMONTE = "donnée pas encore remontée par les bornes";

const part = (a: number, b: number) => (b ? a / b : 0);
const secondesFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const duree = (s: number | null | undefined) =>
  s === null || s === undefined ? "—" : s < 60 ? `${secondesFmt.format(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")}`;
const pluriel = (n: number, mot: string) => `${nombre(n)} ${mot}${n > 1 ? "s" : ""}`;
const tranche = (h: number) => `${h} h – ${(h + 2) % 24} h`;

export function AnalysePaiements() {
  // Mêmes filtres que le tableau de bord, sur la ligne du titre (retour de Sébastien du 13/11)
  const f = useFiltresPage("30j");
  const [borneId, setBorneId] = useState("");
  const requete = qs({ du: f.du, au: f.au, lieuId: f.lieuId, parc: f.parc, borneId: borneId || undefined });
  const { data, error, isPending, isFetching } = useQuery({
    queryKey: ["paiements-analyse", requete],
    queryFn: () => api<AnalyseDesPaiements>(`/stats/paiements-analyse${requete}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <EnTete
        titre="Analyse des paiements"
        sousTitre={`${f.du === f.au ? `Le ${jour(f.du)}` : `Du ${jour(f.du)} au ${jour(f.au)}`}${isFetching ? " · mise à jour…" : ""}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
          <label>
            <span className="sr-only">Borne</span>
            <select className="champ !w-auto" value={borneId} onChange={(e) => setBorneId(e.target.value)}>
              <option value="">Toutes les bornes</option>
              {(data?.bornes ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.identifiant}</option>
              ))}
            </select>
          </label>
          <FiltresPage f={f} prefixe="ap" />
          </div>
        }
      />
      {error ? <Erreur erreur={error} /> : isPending ? <Chargement /> : <Contenu data={data} />}
    </>
  );
}

function Contenu({ data }: { data: AnalyseDesPaiements }) {
  // Rien reçu : la borne n'envoie pas encore ses parcours (logiciel à mettre à jour)
  if (!data.demandes) {
    return (
      <Section titre="Analyse des paiements">
        <p className="text-sm text-ink-2">
          Aucune demande de paiement sur la période. Les bornes envoient le parcours de chaque séance (dont l&apos;appui sur « Payer ») depuis la version du
          logiciel livrée avec l&apos;avenant du 26/10/2026.
        </p>
      </Section>
    );
  }
  const p = data.precedente;
  const comparer = (courant: number | null, precedente: number | null) =>
    p.demandes && courant !== null && precedente !== null ? { courant, precedente } : {};
  const d = data.demandeATirage;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCouleur
          teinte="vert"
          icone="billet"
          libelle="Aboutis"
          valeur={`${nombre(data.aboutis)} / ${nombre(data.demandes)}`}
          detail={`${pct(part(data.aboutis, data.demandes))} des demandes de paiement`}
          {...comparer(data.aboutis, p.aboutis)}
        />
        <KpiCouleur teinte="bleu" icone="numerique" libelle="Carte → accepté" valeur="—" detail={`Heure de présentation de la carte : ${PAS_REMONTE}`} />
        <KpiCouleur
          teinte="rose"
          icone="imprimante"
          libelle="Demande → tirage lancé"
          valeur={duree(d.medianeS)}
          detail={`médiane, sur ${pluriel(d.nb, "paiement")} abouti${d.nb > 1 ? "s" : ""}`}
          {...comparer(d.medianeS, p.demandeATirageMedianeS)}
        />
        <KpiCouleur
          teinte="orange"
          icone="sac"
          libelle="Autorisé, non prélevé"
          valeur={`${nombre(data.offerts.nb)} · ${eurosRond(data.offerts.montantCents)}`}
          detail={`« accepté » à l'écran, enregistrement jamais confirmé : rien n'est prélevé · ${pct(part(data.offerts.nb, data.aboutis))} des aboutis`}
          {...comparer(data.offerts.nb, p.offerts)}
        />
      </div>

      <Frise />
      <Arbre data={data} />
      <Histogramme data={data} />

      <div className="grid items-start gap-4 xl:grid-cols-[6fr_5fr]">
        <TerminalParTerminal data={data} />
        <ParHeure data={data} />
      </div>
    </div>
  );
}

// ─── Petites briques ───

/** Infobulle sombre au survol (aucune n'est affichée en permanence) */
function Infobulle({ texte, children, className = "" }: { texte: string; children: ReactNode; className?: string }) {
  return (
    <span className={`group relative ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 hidden -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white shadow-lg group-hover:block"
        style={{ background: BULLE }}
      >
        {texte}
      </span>
    </span>
  );
}

function Titre({ titre, sous, droite }: { titre: string; sous?: ReactNode; droite?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-bold">{titre}</h2>
        {sous && <p className="mt-0.5 text-sm text-ink-2">{sous}</p>}
      </div>
      {droite}
    </div>
  );
}

function Legende({ elements }: { elements: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-ink-2">
      {elements.map(([l, c]) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}

// ─── Le temps médian d'un paiement ───

// Les bornes ne remontent que l'heure de « Payer » et celle du départ du tirage : les durées entre étapes restent vides
const ETAPES_FRISE = ["La borne demande le paiement", "Le terminal attend la carte", "La carte est présentée", "Accepté · le tirage part", "Prélevé"];
const SEGMENTS_FRISE = ["mise en route", "l'invité sort sa carte", "le terminal répond", "enregistrement"];

function Frise() {
  return (
    <section className="carte space-y-4 p-5">
      <Titre titre="Le temps médian d'un paiement" sous="Entre deux étapes, pour un paiement qui aboutit." />
      <div className="relative">
        <div aria-hidden className="absolute top-4 right-[8%] left-[8%] h-0.5 bg-line" />
        <ol className="relative grid grid-cols-[1.4fr_1fr_1.4fr_1fr_1.4fr_1fr_1.4fr_1fr_1.4fr] items-start gap-1">
          {ETAPES_FRISE.flatMap((e, i) => [
            <li key={e} className="flex min-w-0 flex-col items-center gap-2 text-center">
              <span className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold text-white" style={{ background: i >= 3 ? PAYE : VIOLET }}>
                {i + 1}
              </span>
              <span className="text-xs leading-tight font-semibold sm:text-sm">{e}</span>
            </li>,
            ...(i < SEGMENTS_FRISE.length
              ? [
                  <li key={`s${i}`} className="flex min-w-0 flex-col items-center gap-1.5 pt-0.5 text-center">
                    <Infobulle texte={`${SEGMENTS_FRISE[i]} : ${PAS_REMONTE}`}>
                      <span className="relative z-10 rounded-full border border-line bg-surface px-2.5 py-0.5 text-sm font-extrabold text-ink-muted">—</span>
                    </Infobulle>
                    <span className="text-xs text-ink-2">{SEGMENTS_FRISE[i]}</span>
                  </li>,
                ]
              : []),
          ])}
        </ol>
      </div>
      <p className="border-t border-line pt-3 text-xs text-ink-muted">
        Heure de chaque étape (terminal prêt, carte présentée, réponse du terminal, enregistrement) : {PAS_REMONTE}.
      </p>
    </section>
  );
}

// ─── Ce qui se passe après « Payer » ───

interface Noeud {
  cle: string;
  nb: number;
  libelle: string;
  ton: Ton;
  /** À droite du chiffre : montant perdu ou pastille */
  droite?: ReactNode;
  details: [string, string][];
  note?: string;
  enfants?: Noeud[];
}

const Pastille = ({ ton, children }: { ton: Ton; children: ReactNode }) => (
  <span
    className="ml-auto rounded-full px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap"
    style={ton === "paye" ? { background: "var(--color-ok-bg)", color: "var(--color-ok-ink)" } : { background: `${TONS[ton]}1A`, color: TONS[ton] }}
  >
    {children}
  </span>
);
const Perte = ({ ton, cents }: { ton: Ton; cents: number }) =>
  cents > 0 ? <span className="ml-auto text-xs font-bold whitespace-nowrap" style={{ color: TONS[ton] }}>− {eurosRond(cents)}</span> : undefined;

/** Les deux issues d'une branche : repaie (payé) ou part */
function issues(cle: string, i: Issue, tonPart: Ton, libellePaye: string, libellePart: string): Noeud[] {
  return [
    {
      cle: `${cle}-paye`,
      nb: i.paye.nb,
      libelle: libellePaye,
      ton: "paye",
      droite: <Pastille ton="paye">payé</Pastille>,
      details: [
        ["Passage accepté ensuite", nombre(i.paye.nb)],
        ...(i.paye.delaiMedianS !== null ? ([["Délai entre les deux passages", `${duree(i.paye.delaiMedianS)} en médiane`]] as [string, string][]) : []),
        ...(i.paye.offerts ? ([["Dont autorisés, non prélevés", nombre(i.paye.offerts)]] as [string, string][]) : []),
      ],
    },
    {
      cle: `${cle}-part`,
      nb: i.part.nb,
      libelle: libellePart,
      ton: tonPart,
      droite: <Pastille ton={tonPart}>{tonPart === "choix" ? "choix · non payé" : `non payé · ≈ ${eurosRond(i.part.montantCents)}`}</Pastille>,
      details: [
        ["Séances non payées", nombre(i.part.nb)],
        ...(tonPart === "choix" ? [] : ([["Montant demandé", `≈ ${eurosRond(i.part.montantCents)}`]] as [string, string][])),
      ],
    },
  ];
}

function construireArbre(data: AnalyseDesPaiements): Noeud {
  const a = data.arbre;
  const v = a.verdict;
  const s = data.seuils;
  const repaient = a.annule.vite.paye.nb + a.annule.attente.paye.nb + a.annule.inconnu.paye.nb;
  return {
    cle: "demande",
    nb: a.demandes,
    libelle: "Paiement demandé",
    ton: "neutre",
    details: [
      ["Séances qui appuient sur « Payer »", nombre(a.demandes)],
      ["Plus d'une demande dans la séance", nombre(a.demandesRepetees)],
      ["Page de paiement → « Payer »", `${duree(a.pageAPayerMedianeS)} en médiane`],
    ],
    enfants: [
      {
        cle: "annule",
        nb: a.annule.nb,
        libelle: "Annule au premier passage",
        ton: "choix",
        details: [
          ["Annulé par l'invité", nombre(a.annule.parInvite)],
          ["Annulé par le terminal", nombre(a.annule.parTerminal)],
          ["Délai médian avant annulation", duree(a.annule.delaiMedianS)],
          ["Repaient ensuite", `${nombre(repaient)} · ${pct(part(repaient, a.annule.nb))}`],
        ],
        note: `Le délai entre « Payer » et l'annulation sépare l'annulation immédiate (moins de ${s.attenteS} s) de l'annulation après attente.`,
        enfants: [
          {
            cle: "annule-vite",
            nb: a.annule.vite.nb,
            libelle: "Annule tout de suite",
            ton: "choix",
            details: [
              [`Annulation en moins de ${s.attenteS} s`, nombre(a.annule.vite.nb)],
              ["Repaient", `${nombre(a.annule.vite.paye.nb)} · ${pct(part(a.annule.vite.paye.nb, a.annule.vite.nb))}`],
              ["Partent", `${nombre(a.annule.vite.part.nb)} · ${pct(part(a.annule.vite.part.nb, a.annule.vite.nb))}`],
            ],
            enfants: issues("annule-vite", a.annule.vite, "choix", "Repaie", "Part"),
          },
          {
            cle: "annule-attente",
            nb: a.annule.attente.nb,
            libelle: "Annule après attente",
            ton: "technique",
            droite: <Perte ton="technique" cents={a.annule.attente.part.montantCents} />,
            details: [
              [`Annulation après ${s.attenteS} s ou plus`, nombre(a.annule.attente.nb)],
              ["Repaient", `${nombre(a.annule.attente.paye.nb)} · ${pct(part(a.annule.attente.paye.nb, a.annule.attente.nb))}`],
              ["Partent", `${nombre(a.annule.attente.part.nb)} · ${pct(part(a.annule.attente.part.nb, a.annule.attente.nb))}`],
            ],
            enfants: issues("annule-attente", a.annule.attente, "technique", "Repaie", "Part"),
          },
          {
            cle: "annule-inconnu",
            nb: a.annule.inconnu.nb,
            libelle: "Annule, délai inconnu",
            ton: "neutre",
            details: [["Heure de « Payer » absente du parcours", nombre(a.annule.inconnu.nb)]],
            enfants: issues("annule-inconnu", a.annule.inconnu, "neutre", "Repaie", "Part"),
          },
        ],
      },
      {
        cle: "verdict",
        nb: v.nb,
        libelle: "N'annule pas",
        ton: "neutre",
        details: [["Premier passage jusqu'au verdict du terminal", nombre(v.nb)]],
        enfants: [
          {
            cle: "accepte",
            nb: v.accepte.nb,
            libelle: "Accepté au premier passage",
            ton: "paye",
            details: [
              ["Acceptés", `${nombre(v.accepte.nb)} · ${pct(part(v.accepte.nb, v.nb))}`],
              ["« Payer » → heure de la vente", `${duree(v.accepte.delaiMedianS)} en médiane`],
            ],
            enfants: [
              {
                cle: "preleve",
                nb: v.accepte.preleve,
                libelle: "Prélevé",
                ton: "paye",
                droite: <Pastille ton="paye">encaissé</Pastille>,
                details: [["Enregistrement confirmé", `${nombre(v.accepte.preleve)} · ${pct(part(v.accepte.preleve, v.accepte.nb))}`]],
              },
              {
                cle: "incertain",
                nb: v.accepte.incertain.nb,
                libelle: "Enregistrement non confirmé",
                ton: "neutre",
                droite: <Pastille ton="neutre">à rapprocher</Pastille>,
                details: [
                  ["Sans réponse du terminal ni ticket retrouvé", nombre(v.accepte.incertain.nb)],
                  ["Compté dans le chiffre d'affaires", eurosRond(v.accepte.incertain.montantCents)],
                ],
              },
              {
                cle: "offert",
                nb: v.accepte.offert.nb,
                libelle: "Autorisé, non prélevé",
                ton: "technique",
                droite: <Pastille ton="technique">offert · {eurosRond(v.accepte.offert.montantCents)}</Pastille>,
                details: [
                  ["Enregistrement abandonné", `${nombre(v.accepte.offert.nb)} · ${pct(part(v.accepte.offert.nb, v.accepte.nb))}`],
                  ["Tirage", "sorti à « accepté »"],
                  ["Inscrit au registre", `offert · ${eurosRond(v.accepte.offert.montantCents)}`],
                ],
              },
            ],
          },
          {
            cle: "refus-banque",
            nb: v.refusBanque.nb,
            libelle: "Refusé par la banque",
            ton: "banque",
            droite: <Perte ton="banque" cents={v.refusBanque.part.montantCents} />,
            details: [
              ["Refus", `${nombre(v.refusBanque.nb)} · ${pct(part(v.refusBanque.nb, v.nb))}`],
              ["Repaient ensuite", `${nombre(v.refusBanque.paye.nb)} · ${pct(part(v.refusBanque.paye.nb, v.refusBanque.nb))}`],
            ],
            enfants: issues("refus-banque", v.refusBanque, "banque", "Autre essai, accepté", "Part"),
          },
          {
            cle: "refus-terminal",
            nb: v.refusTerminal.nb,
            libelle: "Refusé par le terminal",
            ton: "technique",
            droite: <Perte ton="technique" cents={v.refusTerminal.part.montantCents} />,
            details: [
              ["Refus avec le motif « terminal »", nombre(v.refusTerminal.nb)],
              ["Repaient ensuite", `${nombre(v.refusTerminal.paye.nb)} · ${pct(part(v.refusTerminal.paye.nb, v.refusTerminal.nb))}`],
            ],
            enfants: issues("refus-terminal", v.refusTerminal, "technique", "Autre essai, accepté", "Part"),
          },
          {
            cle: "muet",
            nb: v.muet.nb,
            libelle: "Terminal sans réponse",
            ton: "technique",
            droite: <Perte ton="technique" cents={v.muet.relancePart.montantCents + v.muet.part.montantCents} />,
            details: [
              ["Aucun verdict du terminal", `${pluriel(v.muet.nb, "séance")} · ${pluriel(v.muet.passages, "passage")}`],
              ["Relancent", nombre(v.muet.nb - v.muet.part.nb)],
            ],
            enfants: [
              {
                cle: "muet-paye",
                nb: v.muet.relanceAccepte.nb,
                libelle: "Relance, accepté",
                ton: "paye",
                droite: <Pastille ton="paye">payé</Pastille>,
                details: [
                  ["Payés après relance", `${nombre(v.muet.relanceAccepte.nb)} · ${pct(part(v.muet.relanceAccepte.nb, v.muet.nb))}`],
                  ["Temps perdu", `${duree(v.muet.relanceAccepte.delaiMedianS)} en médiane`],
                ],
              },
              {
                cle: "muet-relance-part",
                nb: v.muet.relancePart.nb,
                libelle: "Relance, puis part",
                ton: "technique",
                droite: <Pastille ton="technique">non payé · ≈ {eurosRond(v.muet.relancePart.montantCents)}</Pastille>,
                details: [
                  ["Relance sans passage accepté", nombre(v.muet.relancePart.nb)],
                  ["Montant demandé", `≈ ${eurosRond(v.muet.relancePart.montantCents)}`],
                ],
              },
              {
                cle: "muet-part",
                nb: v.muet.part.nb,
                libelle: "Ne relance pas, part",
                ton: "technique",
                droite: <Pastille ton="technique">non payé · ≈ {eurosRond(v.muet.part.montantCents)}</Pastille>,
                details: [
                  ["Un seul passage, sans réponse", nombre(v.muet.part.nb)],
                  ["Montant demandé", `≈ ${eurosRond(v.muet.part.montantCents)}`],
                ],
              },
            ],
          },
        ],
      },
      {
        cle: "sans-vente",
        nb: a.sansVente.nb,
        libelle: "Passages au terminal non reçus",
        ton: "neutre",
        details: [["Parcours reçu, aucune vente rattachée", nombre(a.sansVente.nb)]],
        note: "Seule l'issue de la séance est connue (parcours) : le détail des passages au terminal n'a pas été reçu.",
        enfants: issues("sans-vente", a.sansVente, "neutre", "Payée", "Non payée"),
      },
    ],
  };
}

/** Retire les branches vides (la somme des enfants reste celle du parent) */
const elaguer = (n: Noeud): Noeud => ({ ...n, enfants: n.enfants?.filter((e) => e.nb > 0).map(elaguer) });

function Arbre({ data }: { data: AnalyseDesPaiements }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  // Une seule bulle ouverte ; un clic ailleurs ferme tout
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest("[data-noeud]")) setOuvert(null);
    };
    document.addEventListener("click", fermer);
    return () => document.removeEventListener("click", fermer);
  }, [ouvert]);

  const racine = elaguer(construireArbre(data));
  const a = data.arbre;
  const v = a.verdict;
  const offerts = data.offerts;
  // Pertes : la technique (on peut agir), la banque (on n'y peut rien), le choix de l'invité
  const partisTechnique = [a.annule.attente.part, v.muet.relancePart, v.muet.part, v.refusTerminal.part];
  const technique = { nb: partisTechnique.reduce((t, x) => t + x.nb, 0), cents: partisTechnique.reduce((t, x) => t + x.montantCents, 0) };
  const totalTechnique = technique.cents + offerts.montantCents;
  const repaient = a.annule.vite.paye.nb + a.annule.attente.paye.nb + a.annule.inconnu.paye.nb;

  return (
    <section className="carte relative z-[2] space-y-5 p-5">
      <Titre
        titre="Ce qui se passe après « Payer »"
        sous={`${pluriel(a.demandes, "séance")}, une fois chacune, avec leur chemin complet (relances comprises). Le % est celui de l'étape précédente. Cliquer une bulle pour le détail.`}
        droite={<Legende elements={[["payé", PAYE], ["choix de l'invité", CHOIX], ["banque", BANQUE], ["technique", PERTE]]} />}
      />
      <div className="flex justify-center">
        <BrancheArbre noeud={racine} parent={null} profondeur={0} ouvert={ouvert} setOuvert={setOuvert} />
      </div>
      <div className="grid gap-3 border-t border-line pt-4 md:grid-cols-3">
        <CartePerte titre="Technique · on peut agir" couleur={PERTE} fond="#FBE7E5" valeur={`≈ ${eurosRond(totalTechnique)}`} suffixe={data.encaisseCents ? `${pct(part(totalTechnique, data.encaisseCents))} de l'encaissé` : undefined}>
          <LignePerte libelle={`${pluriel(technique.nb, "invité")} reparti${technique.nb > 1 ? "s" : ""} sans payer, après une attente ou un souci du terminal`} valeur={`≈ ${eurosRond(technique.cents)}`} />
          <LignePerte libelle={`${nombre(offerts.nb)} autorisé${offerts.nb > 1 ? "s" : ""}, non prélevé${offerts.nb > 1 ? "s" : ""}`} valeur={eurosRond(offerts.montantCents)} />
        </CartePerte>
        <CartePerte titre="Banque · on n'y peut rien" couleur={BANQUE} fond="#FCEFDF" valeur={`≈ ${eurosRond(v.refusBanque.part.montantCents)}`}>
          <LignePerte libelle={`${nombre(v.refusBanque.part.nb)} refus sans autre essai accepté`} valeur={`≈ ${eurosRond(v.refusBanque.part.montantCents)}`} />
          <LignePerte libelle={`${nombre(v.refusBanque.paye.nb)} refus repayés ensuite`} valeur={eurosRond(0)} />
        </CartePerte>
        <CartePerte titre="Choix de l'invité" couleur="var(--color-ink-2)" fond="var(--color-surface-2)" valeur={nombre(a.annule.vite.part.nb)} suffixe="séances · non chiffré">
          <LignePerte libelle="Annulation immédiate, sans retour" valeur={nombre(a.annule.vite.part.nb)} />
          <LignePerte libelle="Annulations suivies d'un paiement" valeur={nombre(repaient)} />
        </CartePerte>
      </div>
      {a.sansVente.part.nb > 0 && (
        <p className="text-xs text-ink-muted">
          {pluriel(a.sansVente.part.nb, "séance")} non payée{a.sansVente.part.nb > 1 ? "s" : ""} sans passage au terminal reçu : hors de ces trois cartes.
        </p>
      )}
    </section>
  );
}

function CartePerte({ titre, couleur, fond, valeur, suffixe, children }: { titre: string; couleur: string; fond: string; valeur: string; suffixe?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl p-4" style={{ background: fond }}>
      <span className="text-xs font-bold tracking-wide uppercase" style={{ color: couleur }}>{titre}</span>
      <span className="text-3xl leading-none font-extrabold tracking-tight tabular" style={{ color: couleur }}>
        {valeur} {suffixe && <span className="text-sm font-semibold">{suffixe}</span>}
      </span>
      <div className="space-y-1.5 border-t border-black/10 pt-2">{children}</div>
    </div>
  );
}

const LignePerte = ({ libelle, valeur }: { libelle: string; valeur: string }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span>{libelle}</span>
    <b className="tabular whitespace-nowrap">{valeur}</b>
  </div>
);

function BrancheArbre({
  noeud,
  parent,
  profondeur,
  ouvert,
  setOuvert,
}: {
  noeud: Noeud;
  parent: number | null;
  profondeur: number;
  ouvert: string | null;
  setOuvert: (c: string | null) => void;
}) {
  const enfants = noeud.enfants ?? [];
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-0">
      <BoiteNoeud noeud={noeud} parent={parent} gauche={profondeur >= 2} ouvert={ouvert === noeud.cle} basculer={() => setOuvert(ouvert === noeud.cle ? null : noeud.cle)} />
      {enfants.length > 0 && (
        <ul className="relative flex flex-col justify-center pl-6">
          {enfants.map((e, i) => (
            <li key={e.cle} className={`relative flex items-center ${ouvert && contient(e, ouvert) ? "z-20" : "z-0"} ${enfants.length > 1 && enfants.some((x) => x.enfants?.length) ? "py-2.5" : "py-0.5"}`}>
              {/* Traits de l'arbre (écran large seulement) */}
              <span aria-hidden className="absolute top-1/2 left-[-1.5rem] hidden h-0.5 w-6 bg-line-strong md:block" />
              {enfants.length > 1 && (
                <span
                  aria-hidden
                  className="absolute left-[-1.5rem] hidden w-0.5 bg-line-strong md:block"
                  style={{ top: i === 0 ? "50%" : 0, bottom: i === enfants.length - 1 ? "50%" : 0 }}
                />
              )}
              <BrancheArbre noeud={e} parent={noeud.nb} profondeur={profondeur + 1} ouvert={ouvert} setOuvert={setOuvert} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const contient = (n: Noeud, cle: string): boolean => n.cle === cle || (n.enfants ?? []).some((e) => contient(e, cle));

function BoiteNoeud({ noeud, parent, gauche, ouvert, basculer }: { noeud: Noeud; parent: number | null; gauche: boolean; ouvert: boolean; basculer: () => void }) {
  const couleur = TONS[noeud.ton];
  return (
    <div data-noeud className={`relative w-full flex-none md:w-[13.5rem] ${ouvert ? "z-30" : ""}`}>
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={basculer}
        className="block w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left hover:shadow-md"
        style={{ borderLeft: `3px solid ${couleur}` }}
      >
        <span className="flex items-center gap-2">
          <span className="text-lg font-extrabold tracking-tight tabular" style={{ color: couleur }}>{nombre(noeud.nb)}</span>
          {parent !== null && <span className="text-xs font-semibold text-ink-2">{pct(part(noeud.nb, parent))}</span>}
          {noeud.droite}
        </span>
        <span className="mt-px block text-sm font-semibold">{noeud.libelle}</span>
      </button>
      {ouvert && (
        <div
          className={`absolute top-full left-0 z-40 mt-2 w-80 max-w-[calc(100vw-3rem)] rounded-xl p-4 text-white shadow-xl md:top-[-0.4rem] md:mt-0 ${gauche ? "md:right-[calc(100%+0.9rem)] md:left-auto" : "md:left-[calc(100%+0.9rem)]"}`}
          style={{ background: BULLE }}
        >
          <div className="mb-1.5 text-sm font-bold">
            {noeud.libelle} <span style={{ color: VIOLET_CLAIR }}>· {nombre(noeud.nb)}</span>
          </div>
          {noeud.details.map(([l, v]) => (
            <div key={l} className="flex justify-between gap-3 border-t border-white/10 py-1 text-sm">
              <span className="text-white/75">{l}</span>
              <b className="text-right">{v}</b>
            </div>
          ))}
          {noeud.note && <p className="mt-2 text-sm leading-snug text-white/85">{noeud.note}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Combien de temps pour être accepté ───

function Histogramme({ data }: { data: AnalyseDesPaiements }) {
  const h = data.histogramme;
  const d = data.demandeATirage;
  if (!d.nb) {
    return (
      <Section titre="Combien de temps pour être accepté">
        <p className="text-sm text-ink-2">Aucun paiement abouti avec l&apos;heure de « Payer » et celle du tirage sur la période.</p>
      </Section>
    );
  }
  const max = Math.max(1, ...h.map((b) => b.nb));
  const reguliers = h.filter((b) => b.a !== null).length;
  // Trait de la médiane : position dans les tranches de 2 s
  const posMediane = d.medianeS !== null && d.medianeS < data.seuils.lentS && reguliers ? ((d.medianeS / 2) / h.length) * 100 : null;
  return (
    <section className="carte space-y-3 p-5">
      <Titre
        titre="Combien de temps pour être accepté"
        sous={`${pluriel(d.nb, "paiement")} abouti${d.nb > 1 ? "s" : ""}. Une barre = une tranche de 2 secondes entre « Payer » et le départ du tirage (lancé à l'acceptation) ; sa hauteur = le nombre de paiements.`}
      />
      <div className="relative pt-6">
        <div className="grid h-48 items-end gap-1" style={{ gridTemplateColumns: `repeat(${h.length}, minmax(0, 1fr))` }} role="img" aria-label={`Histogramme du temps avant acceptation, médiane ${duree(d.medianeS)}`}>
          {h.map((b, i) => {
            const lent = b.a === null;
            const texte = `${lent ? `${b.de} s et plus` : `${b.de} à ${b.a} s`} : ${b.nb ? `${pluriel(b.nb, "paiement")} · ${pct(part(b.nb, d.nb))}` : "aucun paiement"}${lent ? " · relance après un terminal sans réponse ou une annulation" : ""}`;
            return (
              <Infobulle key={b.de} texte={texte} className="flex h-full flex-col items-center justify-end gap-0.5">
                <span className="text-[0.7rem] font-bold tabular" style={{ color: lent ? PERTE : undefined }}>{b.nb || ""}</span>
                <i
                  className="block w-full rounded-t-sm"
                  style={{ height: `${(b.nb / max) * 100}%`, minHeight: b.nb ? 2 : 0, background: lent ? "#E89A90" : b.nb >= max / 2 ? VIOLET : VIOLET_CLAIR }}
                />
                <span className="h-3.5 text-[0.7rem] text-ink-2" style={{ color: lent ? PERTE : undefined }}>
                  {lent ? `> ${b.de}` : i % 2 === 0 ? b.de : ""}
                </span>
              </Infobulle>
            );
          })}
        </div>
        {posMediane !== null && (
          <div aria-hidden className="pointer-events-none absolute top-5 bottom-3.5 border-l-2 border-dashed border-ink" style={{ left: `${posMediane}%` }}>
            <span className="absolute -top-5 -translate-x-1/2 text-xs font-bold whitespace-nowrap">médiane {duree(d.medianeS)}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-2">
        <span>secondes entre « Payer » et le départ du tirage</span>
        <span>
          9 sur 10 en moins de {duree(d.p90S)}
          {d.auDelaSeuil > 0 && ` · ${nombre(d.auDelaSeuil)} après plus de ${data.seuils.lentS} s`}
        </span>
      </div>
    </section>
  );
}

// ─── Terminal par terminal ───

function TerminalParTerminal({ data }: { data: AnalyseDesPaiements }) {
  return (
    <section className="carte space-y-3 p-5">
      <Titre
        titre="Terminal par terminal"
        sous="En séances. Sans réponse = au moins un passage sans verdict du terminal. Autorisé non prélevé = « accepté » vu par l'invité, enregistrement jamais confirmé."
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-2">
            <tr>
              <th className="pb-2 pr-3 font-medium">Borne</th>
              <th className="pb-2 pr-3 text-right font-medium">Demandes</th>
              <th className="pb-2 pr-3 text-right font-medium">Aboutis</th>
              <th className="pb-2 pr-3 text-right font-medium">Demande → tirage</th>
              <th className="pb-2 pr-3 text-right font-medium">Sans réponse</th>
              <th className="pb-2 pr-3 text-right font-medium">Refus banque</th>
              <th className="pb-2 text-right font-medium">Autorisé non prélevé</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.parBorne.map((b) => (
              <tr key={b.borneId} className={`border-t border-line ${b.offerts.nb ? "bg-crit-bg/40" : ""}`}>
                <td className="py-2 pr-3">
                  <Link href={`/bornes/${b.borneId}`} className="font-semibold hover:underline">{b.identifiant}</Link>
                  <Link href={`/lieux/${b.lieu.id}`} className="block text-xs text-ink-2 hover:underline">{b.lieu.enseigne}</Link>
                </td>
                <td className="py-2 pr-3 text-right">{nombre(b.demandes)}</td>
                <td className="py-2 pr-3 text-right">
                  <Infobulle texte={`${nombre(b.aboutis)} payées sur ${nombre(b.demandes)}`}>{pct(part(b.aboutis, b.demandes))}</Infobulle>
                </td>
                <td className="py-2 pr-3 text-right">{duree(b.demandeATirageMedianeS)}</td>
                <td className="py-2 pr-3 text-right">{nombre(b.muets)}</td>
                <td className="py-2 pr-3 text-right">{nombre(b.refusBanque)}</td>
                <td className="py-2 text-right font-semibold" style={{ color: b.offerts.nb ? PERTE : undefined }}>
                  {nombre(b.offerts.nb)}
                  {b.offerts.nb > 0 && <span className="font-normal"> · {eurosRond(b.offerts.montantCents)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Par heure (tranches de 2 h, journée de 6 h à 6 h) ───

const PILES: { cle: "aboutis" | "annules" | "muets" | "refus" | "inconnus"; libelle: string; couleur: string }[] = [
  { cle: "refus", libelle: "refus", couleur: BANQUE },
  { cle: "muets", libelle: "sans réponse", couleur: PERTE },
  { cle: "annules", libelle: "annulé", couleur: CHOIX },
  { cle: "inconnus", libelle: "passages non reçus", couleur: "var(--color-line-strong)" },
  { cle: "aboutis", libelle: "abouti", couleur: PAYE },
];

function ParHeure({ data }: { data: AnalyseDesPaiements }) {
  const t = data.parTranche;
  const max = Math.max(1, ...t.map((x) => x.demandes));
  const piles = PILES.filter((p) => t.some((x) => x[p.cle] > 0));
  const am = data.avantMinuit;
  const ap = data.apres2h;
  const comparer = am.demandes > 0 && ap.demandes > 0;
  return (
    <section className="carte space-y-4 p-5">
      <Titre titre="Par heure" droite={<Legende elements={[...piles].reverse().map((p) => [p.libelle, p.couleur])} />} />
      <div className="flex h-48 items-end gap-1.5" role="img" aria-label="Demandes de paiement par tranche de 2 h, selon leur issue">
        {t.map((x) => (
          <Infobulle
            key={x.debut}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            texte={`${tranche(x.debut)} : ${piles.map((p) => `${nombre(x[p.cle])} ${p.libelle}`).join(" · ")}`}
          >
            <span className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: `${(x.demandes / max) * 100}%` }}>
              {piles.map((p) => (x[p.cle] ? <i key={p.cle} className="block w-full" style={{ height: `${part(x[p.cle], x.demandes) * 100}%`, background: p.couleur }} /> : null))}
            </span>
            <span className="text-xs text-ink-2">{x.debut} h</span>
          </Infobulle>
        ))}
      </div>
      {comparer && (
        <table className="w-full text-sm">
          <tbody className="tabular">
            <LigneHoraire libelle="Annulations" avant={pct(part(am.annulations, am.demandes))} apres={pct(part(ap.annulations, ap.demandes))} perteApres={part(ap.annulations, ap.demandes) > part(am.annulations, am.demandes)} />
            <LigneHoraire libelle="Demande → tirage" avant={duree(am.demandeATirageMedianeS)} apres={duree(ap.demandeATirageMedianeS)} />
            <LigneHoraire libelle="Refus banque" avant={pct(part(am.refusBanque, am.demandes))} apres={pct(part(ap.refusBanque, ap.demandes))} />
          </tbody>
        </table>
      )}
    </section>
  );
}

const LigneHoraire = ({ libelle, avant, apres, perteApres }: { libelle: string; avant: string; apres: string; perteApres?: boolean }) => (
  <tr className="border-t border-line">
    <td className="py-1.5">{libelle} avant minuit</td>
    <td className="py-1.5 text-right font-semibold">{avant}</td>
    <td className="py-1.5 pl-4">après 2 h</td>
    <td className="py-1.5 text-right font-semibold" style={{ color: perteApres ? PERTE : undefined }}>{apres}</td>
  </tr>
);
