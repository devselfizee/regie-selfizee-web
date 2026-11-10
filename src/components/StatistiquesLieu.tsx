"use client";

import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Alerte, type LieuFiche, type StatsLieu, type StatutAlerte } from "@/lib/api";
import { CARTE_BANCAIRE, dateHeure, euros, eurosRond, JOURS_COURTS, JOURS_SEMAINE, MOYENS, nombre, pct } from "@/lib/format";
import { Gate } from "@/lib/perms";
import { Badge, Vide } from "./Etat";
import { KpiCouleur } from "./KpiCouleur";
import { NIVEAUX } from "./ListeAlertes";

// Onglet Statistiques de la fiche lieu (maquette fiche-lieu.html du 10/11/2026) : alerte sur une ligne,
// tuiles, carte soirées × heures, comparaison aux lieux du même type, jours, meilleures dates, formules.

// Une seule teinte violette dans les graphiques : l'intensité porte la valeur
const VIOLET = "#5B4CF5";
const violet = (alpha: number) => `rgba(91, 76, 245, ${alpha.toFixed(3)})`;

// ─── Réponse de GET /stats/fiche-lieu/:id ───

export interface IndicateursLieu {
  soirees: number;
  caTtcCents: number;
  caHtCents: number;
  nbVentes: number;
  caParSoireeTtcCents: number | null;
  caParSoireeHtCents: number | null;
  ventesParSoiree: number | null;
  panierTtcCents: number | null;
  panierHtCents: number | null;
  seances: number;
  seancesPayees: number;
  tauxPayees: number | null;
  refus: number;
  annulations: number;
  tauxRefusAnnulations: number | null;
}

type CleMediane = "caParSoireeTtcCents" | "caParSoireeHtCents" | "ventesParSoiree" | "panierTtcCents" | "panierHtCents" | "tauxPayees" | "tauxRefusAnnulations";

export interface StatsFicheLieu {
  periode: { du: string; au: string };
  heureBascule: number;
  lieu: IndicateursLieu | null;
  parSoir: { jourSemaine: number; soirees: number }[];
  cases: { jourSemaine: number; heure: number; caTtcCents: number; caHtCents: number; nbVentes: number }[];
  precedente: { du: string; au: string; comparable: boolean; raison: "vide" | "partielle" | null; debutActivite: string | null };
  comparaison: { typeLieu: string; nbLieux: number; lieuDemo: boolean; medianes: Record<CleMediane, number | null> | null };
}

export function useStatsFicheLieu(lieuId: number, requete: string) {
  return useQuery({
    queryKey: ["stats-fiche-lieu", lieuId, requete],
    queryFn: () => api<StatsFicheLieu>(`/stats/fiche-lieu/${lieuId}${requete}`),
    placeholderData: (avant) => avant,
  });
}

// ─── Petites briques ───

/** Infobulle au survol (bulle sombre), jamais affichée en permanence */
export function Bulle({ texte, children, className = "", bloc = false }: { texte: ReactNode; children: ReactNode; className?: string; bloc?: boolean }) {
  const Balise = bloc ? "div" : "span";
  return (
    <Balise className={`group/bulle relative ${bloc ? "" : "inline-block"} ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-max max-w-xs -translate-x-1/2 rounded-md bg-[#15171C] px-2.5 py-1.5 text-left text-xs font-semibold leading-snug text-white shadow-lg group-hover/bulle:block"
      >
        {texte}
      </span>
    </Balise>
  );
}

/** Carte de bloc : titre, sous-titre court éventuel, actions (légende) à droite */
export function Bloc({ titre, sousTitre, actions, children, className = "" }: { titre: string; sousTitre?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`carte p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{titre}</h2>
          {sousTitre && <p className="mt-0.5 text-xs text-ink-muted">{sousTitre}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** « Ven. 09/10/26 » : jour de la semaine et année sur deux chiffres */
const jourCourtFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" });
export function dateAvecJour(ymd: string): string {
  const [a, m, j] = ymd.slice(0, 10).split("-");
  const nom = jourCourtFmt.format(new Date(`${ymd.slice(0, 10)}T00:00:00Z`));
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${j}/${m}/${a.slice(2)}`;
}

const decimal1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${nombre(n)} ${n > 1 ? motPluriel : mot}`;

// ─── Alerte ouverte, sur une ligne avec ses actions ───

const BORDURES = { crit: "border-l-bad", warn: "border-l-warn-ink", neutre: "border-l-accent" } as const;

export function AlertesLieu({ alertes }: { alertes: Alerte[] }) {
  if (!alertes.length) return null;
  return (
    <div className="mb-6 space-y-2">
      {alertes.map((a) => (
        <LigneAlerte key={a.id} a={a} />
      ))}
    </div>
  );
}

function LigneAlerte({ a }: { a: Alerte }) {
  const client = useQueryClient();
  const maj = useMutation({
    mutationFn: (statut: StatutAlerte) => api(`/alertes/${a.id}`, { method: "PATCH", json: { statut } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["alertes"] }),
  });
  const niveau = NIVEAUX[a.niveau];
  return (
    <div className={`carte flex flex-wrap items-center justify-between gap-3 border-l-4 px-4 py-2.5 ${BORDURES[niveau.ton]}`}>
      <div className="min-w-0 flex-1 text-sm">
        <Badge ton={niveau.ton}>{niveau.libelle}</Badge> <span className="ml-1 font-semibold">{a.libelleType}</span>
        <span className="text-ink-2"> · {a.message}</span>
        <span className="ml-1 text-xs text-ink-muted">
          {dateHeure(a.detecteeLe)}
          {a.statut === "PRISE_EN_CHARGE" && a.assignee && ` · prise en charge par ${[a.assignee.prenom, a.assignee.nom].filter(Boolean).join(" ")}`}
        </span>
        {maj.error && <span className="ml-2 text-xs text-bad">{maj.error.message}</span>}
      </div>
      <Gate perm="alertes.traiter">
        <div className="flex gap-1">
          {a.statut === "NOUVELLE" && (
            <button type="button" className="bouton-second !px-2 !py-1 text-xs" disabled={maj.isPending} onClick={() => maj.mutate("PRISE_EN_CHARGE")}>
              Je m&apos;en occupe
            </button>
          )}
          <button type="button" className="bouton-second !px-2 !py-1 text-xs" disabled={maj.isPending} onClick={() => maj.mutate("RESOLUE")}>
            Résolue
          </button>
          <button type="button" className="bouton-second !px-2 !py-1 text-xs" disabled={maj.isPending} onClick={() => maj.mutate("IGNOREE")}>
            Ignorer
          </button>
        </div>
      </Gate>
    </div>
  );
}

// ─── Les 4 tuiles ───

/**
 * CA, ventes, panier moyen, refus / annulations. Pas de « vs période préc. » quand la période précédente
 * est vide ou partielle (lieu équipé pendant cette période).
 */
export function TuilesLieu({ k, p, f, ht }: { k: StatsLieu["kpis"]["courant"]; p: StatsLieu["kpis"]["precedente"]; f: StatsFicheLieu | undefined; ht: boolean }) {
  const suffixe = ht ? "HT" : "TTC";
  const comparable = f?.precedente.comparable === true;
  const cmp = (courant: number, precedente: number) => (comparable ? { courant, precedente } : {});
  const soirees = f?.lieu?.soirees ?? 0;
  const parSoiree = f?.lieu ? (ht ? f.lieu.caParSoireeHtCents : f.lieu.caParSoireeTtcCents) : null;
  const demandes = k.nbVentes + k.nbRefusees + k.nbAnnulees;
  const ca = ht ? k.caHtCents : k.caTtcCents;

  const bulleCa = [
    soirees ? pluriel(soirees, "soirée ouverte", "soirées ouvertes") : null,
    k.nbIncertaines ? `dont ${euros(k.caIncertainTtcCents ?? 0)} TTC à confirmer au rapprochement (${pluriel(k.nbIncertaines, "vente")})` : null,
    k.tests?.nbVentes ? `hors CA : ${pluriel(k.tests.nbVentes, "vente")} avec les cartes de test (${euros(k.tests.caTtcCents)})` : null,
    f && !comparable ? raisonSansComparaison(f.precedente) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Bulle bloc texte={bulleCa || `CA ${suffixe}`}>
        <KpiCouleur
          teinte="vert"
          icone="billet"
          libelle={`CA ${suffixe}`}
          valeur={eurosRond(ca)}
          detail={[ht ? `TTC ${eurosRond(k.caTtcCents)}` : `HT ${eurosRond(k.caHtCents)}`, parSoiree !== null ? `${euros(parSoiree)} par soirée ouverte` : null].filter(Boolean).join(" · ")}
          {...cmp(ca, ht ? p.caHtCents : p.caTtcCents)}
        />
      </Bulle>
      <Bulle bloc texte={f?.lieu && soirees ? `${pluriel(f.lieu.nbVentes, "vente")} sur ${pluriel(soirees, "soirée")} · ${decimal1.format(f.lieu.nbVentes / soirees)} par soirée` : pluriel(k.nbVentes, "vente")}>
        <KpiCouleur teinte="bleu" icone="image" libelle="Ventes" valeur={nombre(k.nbVentes)} detail={`${nombre(k.photosAchetees)} photos achetées`} {...cmp(k.nbVentes, p.nbVentes)} />
      </Bulle>
      <Bulle bloc texte={`${euros(ca)} ÷ ${pluriel(k.nbVentes, "vente")}`}>
        <KpiCouleur teinte="rose" icone="sac" libelle="Panier moyen" valeur={euros(k.panierMoyenCents)} detail={`${suffixe} par vente`} {...cmp(k.panierMoyenCents, p.panierMoyenCents)} />
      </Bulle>
      <Bulle bloc texte={`${pluriel(k.nbRefusees, "refus", "refus")} du terminal et ${pluriel(k.nbAnnulees, "annulation")} par l'invité, sur ${pluriel(demandes, "demande")} de paiement`}>
        <KpiCouleur
          teinte="orange"
          icone="pourcent"
          libelle="Refus / annulations"
          valeur={pct(demandes ? (k.nbRefusees + k.nbAnnulees) / demandes : 0)}
          detail={`${pluriel(k.nbRefusees, "refus", "refus")} · ${pluriel(k.nbAnnulees, "annulation")}`}
        />
      </Bulle>
    </div>
  );
}

function raisonSansComparaison(p: StatsFicheLieu["precedente"]) {
  if (p.raison === "vide") return "pas de comparaison : aucune activité la période précédente";
  if (p.raison === "partielle") return `pas de comparaison : période précédente incomplète${p.debutActivite ? ` (borne installée le ${p.debutActivite.split("-").reverse().join("/")})` : ""}`;
  return null;
}

// ─── Légende de la courbe ───

export function LegendeCourbe({ zone, feries, interventions }: { zone: string | null | undefined; feries: boolean; interventions: number }) {
  const element = (marque: ReactNode, texte: string) => (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      {marque}
      {texte}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {element(<i aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-surface-2" />, `vacances scolaires${zone ? ` (zone ${zone})` : ""}`)}
      {element(<i aria-hidden className="inline-block h-2.5 w-0.5 bg-[#B54708]" />, "calendrier marketing")}
      {element(<i aria-hidden className="inline-block h-2.5 w-0.5 bg-ink" />, feries ? "férié, événement du journal" : "événement du journal")}
      {interventions > 0 && element(<i aria-hidden className="inline-block h-2.5 w-0.5 bg-ink-muted" />, `intervention SAV (${interventions})`)}
    </div>
  );
}

// ─── Quand ça vend : CA moyen par soirée et par heure ───

/** Heures dans l'ordre de la soirée : de l'heure de bascule (6 h) à 5 h le lendemain */
const ordreSoiree = (h: number, bascule: number) => (h - bascule + 24) % 24;

/** Heures où il y a eu des ventes (colonnes de la carte) */
export function heuresAvecVentes(f: StatsFicheLieu): number[] {
  return [...new Set(f.cases.filter((c) => c.nbVentes > 0).map((c) => c.heure))].sort((a, b) => ordreSoiree(a, f.heureBascule) - ordreSoiree(b, f.heureBascule));
}

const valeurCase = (cents: number) => (cents <= 0 ? "·" : cents < 1000 ? decimal1.format(cents / 100) : nombre(Math.round(cents / 100)));

export function CarteSoirees({ f, ht }: { f: StatsFicheLieu; ht: boolean }) {
  const soirs = f.parSoir.filter((s) => s.soirees > 0);
  const heures = heuresAvecVentes(f);
  if (!soirs.length || !heures.length) return <Vide>Aucune vente sur la période.</Vide>;
  const ca = (c: StatsFicheLieu["cases"][number]) => (ht ? c.caHtCents : c.caTtcCents);
  const parCle = new Map(f.cases.map((c) => [`${c.jourSemaine}-${c.heure}`, c]));
  // Moyenne par soirée ouverte de ce jour (voulue ici, pas la médiane)
  const moyenne = (dow: number, h: number, nbSoirees: number) => {
    const c = parCle.get(`${dow}-${h}`);
    return c ? ca(c) / nbSoirees : 0;
  };
  const max = Math.max(1, ...soirs.flatMap((s) => heures.map((h) => moyenne(s.jourSemaine, h, s.soirees))));
  return (
    <table className="w-full table-fixed border-separate border-spacing-0.5 text-xs">
      <thead>
        <tr className="text-ink-2">
          <th className="w-24" />
          {heures.map((h) => (
            <th key={h} className="pb-1 text-center font-medium">{h} h</th>
          ))}
          <th className="w-20 pb-1 text-right font-medium">Par soirée</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {soirs.map((s) => {
          const total = f.cases.filter((c) => c.jourSemaine === s.jourSemaine).reduce((t, c) => t + ca(c), 0);
          return (
            <tr key={s.jourSemaine}>
              <td className="pr-2 text-sm font-medium">
                {JOURS_SEMAINE[s.jourSemaine]} soir
                <span className="block text-xs font-normal text-ink-muted">{pluriel(s.soirees, "soirée")}</span>
              </td>
              {heures.map((h) => {
                const v = moyenne(s.jourSemaine, h, s.soirees);
                const c = parCle.get(`${s.jourSemaine}-${h}`);
                const r = v / max;
                return (
                  <td key={h} className="p-0">
                    <Bulle
                      bloc
                      texte={`${JOURS_SEMAINE[s.jourSemaine]} soir, ${h} h : ${euros(Math.round(v))} en moyenne · ${euros(c ? ca(c) : 0)} sur ${pluriel(s.soirees, "soirée")}${c ? ` · ${pluriel(c.nbVentes, "vente")}` : ""}`}
                    >
                      <div
                        className={`flex h-9 items-center justify-center rounded-md font-semibold ${v <= 0 ? "bg-surface-2 text-ink-muted" : r > 0.55 ? "text-white" : "text-ink"}`}
                        style={v > 0 ? { background: violet(0.12 + 0.88 * r) } : undefined}
                      >
                        {valeurCase(v)}
                      </div>
                    </Bulle>
                  </td>
                );
              })}
              <td className="pl-2 text-right text-sm font-semibold whitespace-nowrap">
                {euros(Math.round(total / s.soirees))}
                <span className="block text-xs font-normal text-ink-muted">{eurosRond(total)} au total</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Face aux autres lieux du même type ───

export function FaceAuxAutres({ f, ht, enseigne }: { f: StatsFicheLieu; ht: boolean; enseigne: string }) {
  const { medianes: m, nbLieux, typeLieu } = f.comparaison;
  const l = f.lieu;
  if (!l || !l.soirees) return <Vide>Aucune soirée ouverte sur la période.</Vide>;
  if (!m) return <Vide>Moins de 3 lieux « {typeLieu} » ouverts sur la période : pas de médiane.</Vide>;
  const lignes: { libelle: string; lieu: number | null; med: number | null; format: (v: number) => string; echelle?: number; bulle: string }[] = [
    {
      libelle: "CA / soirée ouverte",
      lieu: ht ? l.caParSoireeHtCents : l.caParSoireeTtcCents,
      med: ht ? m.caParSoireeHtCents : m.caParSoireeTtcCents,
      format: (v) => euros(Math.round(v)),
      bulle: `${eurosRond(ht ? l.caHtCents : l.caTtcCents)} sur ${pluriel(l.soirees, "soirée")}`,
    },
    {
      libelle: "Ventes / soirée",
      lieu: l.ventesParSoiree,
      med: m.ventesParSoiree,
      format: (v) => decimal1.format(v),
      bulle: `${pluriel(l.nbVentes, "vente")} sur ${pluriel(l.soirees, "soirée")}`,
    },
    {
      libelle: "Panier moyen",
      lieu: ht ? l.panierHtCents : l.panierTtcCents,
      med: ht ? m.panierHtCents : m.panierTtcCents,
      format: (v) => euros(Math.round(v)),
      bulle: `${eurosRond(ht ? l.caHtCents : l.caTtcCents)} ÷ ${pluriel(l.nbVentes, "vente")}`,
    },
    {
      libelle: "Séances payées",
      lieu: l.tauxPayees,
      med: m.tauxPayees,
      format: pct,
      echelle: 1,
      bulle: l.seances ? `${nombre(l.seancesPayees)} payées sur ${pluriel(l.seances, "séance")}` : "aucun parcours invité reçu",
    },
    {
      libelle: "Refus et annulations",
      lieu: l.tauxRefusAnnulations,
      med: m.tauxRefusAnnulations,
      format: pct,
      echelle: 1,
      bulle: `${nombre(l.refus + l.annulations)} sur ${pluriel(l.nbVentes + l.refus + l.annulations, "demande")} de paiement`,
    },
  ];
  return (
    <div className="divide-y divide-line">
      {lignes.map((x) => {
        const echelle = x.echelle ?? Math.max(x.lieu ?? 0, x.med ?? 0) * 1.2;
        const largeur = (v: number | null) => `${echelle > 0 && v !== null ? Math.min(100, (v / echelle) * 100) : 0}%`;
        return (
          <Bulle
            key={x.libelle}
            bloc
            texte={`${enseigne} ${x.lieu === null ? "—" : x.format(x.lieu)} (${x.bulle}) · médiane des ${nombre(nbLieux)} lieux ${x.med === null ? "—" : x.format(x.med)}`}
          >
            <div className="grid grid-cols-[8.5rem_minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3 py-2 text-sm">
              <span className="font-medium">{x.libelle}</span>
              <div className="relative h-2.5 rounded-full bg-surface-2">
                <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: largeur(x.lieu), background: VIOLET }} />
                {x.med !== null && <em aria-hidden className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: largeur(x.med) }} />}
              </div>
              <span className="tabular text-right font-semibold">{x.lieu === null ? "—" : x.format(x.lieu)}</span>
              <span className="tabular text-right text-xs text-ink-2">méd. {x.med === null ? "—" : x.format(x.med)}</span>
            </div>
          </Bulle>
        );
      })}
    </div>
  );
}

// ─── CA moyen par jour de la semaine ───

export function JoursSemaineBarres({ jours, horaires }: { jours: StatsLieu["joursSemaine"]; horaires: LieuFiche["horaires"] }) {
  const max = Math.max(1, ...jours.map((j) => j.caMoyenCents));
  return (
    <div className="flex h-56 items-end gap-3" role="img" aria-label={`CA moyen par jour : ${jours.map((j) => `${JOURS_SEMAINE[j.jourSemaine]} ${eurosRond(j.caMoyenCents)}`).join(", ")}`}>
      {jours.map((j) => {
        const ferme = horaires.length > 0 && !horaires.some((h) => h.jourSemaine === j.jourSemaine);
        const bulle = j.joursAvecVente
          ? `${JOURS_SEMAINE[j.jourSemaine]} : ${euros(j.caMoyenCents)} en moyenne sur ${pluriel(j.joursAvecVente, "jour")} avec des ventes · ${euros(j.caTtcCents)} au total`
          : `${JOURS_SEMAINE[j.jourSemaine]} : ${ferme ? "fermé" : "aucune vente"}`;
        return (
          <Bulle key={j.jourSemaine} bloc texte={bulle} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <b className="tabular text-xs">{j.caMoyenCents ? eurosRond(j.caMoyenCents) : ""}</b>
            <i className="block w-full rounded-t" style={{ height: `${(j.caMoyenCents / max) * 85}%`, background: violet(0.3) }} />
            <span className="text-xs text-ink-muted">{JOURS_COURTS[j.jourSemaine]}</span>
          </Bulle>
        );
      })}
    </div>
  );
}

// ─── Meilleures dates ───

export function MeilleuresDates({ dates }: { dates: StatsLieu["meilleuresDates"] }) {
  if (!dates.length) return <Vide>—</Vide>;
  const max = Math.max(1, ...dates.map((d) => d.caTtcCents));
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-ink-2">
        <tr>
          <th className="pb-2 pr-3 font-medium">Date</th>
          <th className="pb-2 pr-3 text-right font-medium">Ventes</th>
          <th className="pb-2 font-medium">CA</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {dates.map((d) => (
          <tr key={d.jour} className="border-t border-line">
            <td className="py-1.5 pr-3 font-medium">{dateAvecJour(d.jour)}</td>
            <td className="py-1.5 pr-3 text-right">{nombre(d.nbVentes)}</td>
            <td className="py-1.5">
              <span className="flex items-center gap-2 font-semibold">
                <i className="relative block h-2 w-24 shrink-0 rounded-full bg-surface-2">
                  <b className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(d.caTtcCents / max) * 100}%`, background: VIOLET }} />
                </i>
                {euros(d.caTtcCents)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Formules vendues ───

/** Une ligne par formule, variantes de prix regroupées ; moyens de paiement sur une ligne en bas */
export function FormulesVendues({ s }: { s: Pick<StatsLieu, "formules" | "moyensPaiement" | "modulesPaiement"> }) {
  const groupes = new Map<string, { libelle: string; nbVentes: number; ca: number; prix: { montant: number | undefined; nb: number }[] }>();
  for (const f of s.formules) {
    const libelle = f.libelle ?? f.code;
    const g = groupes.get(libelle) ?? { libelle, nbVentes: 0, ca: 0, prix: [] };
    g.nbVentes += f.nbVentes;
    g.ca += f.caTtcCents;
    g.prix.push({ montant: f.montantCents, nb: f.nbVentes });
    groupes.set(libelle, g);
  }
  const lignes = [...groupes.values()].sort((a, b) => b.ca - a.ca || b.nbVentes - a.nbVentes);
  const nbTotal = lignes.reduce((t, g) => t + g.nbVentes, 0);
  const caTotal = lignes.reduce((t, g) => t + g.ca, 0);

  // Moyens de paiement : carte insérée et sans contact réunies en « carte bancaire »
  const utiles = s.moyensPaiement.filter((m) => m.caTtcCents > 0);
  const cartes = utiles.filter((m) => CARTE_BANCAIRE.includes(m.moyen));
  const moyens = [
    ...(cartes.length ? [{ libelle: "carte bancaire", ca: cartes.reduce((t, m) => t + m.caTtcCents, 0), nb: cartes.reduce((t, m) => t + m.nbVentes, 0) }] : []),
    ...utiles.filter((m) => !CARTE_BANCAIRE.includes(m.moyen)).map((m) => {
      const l = MOYENS[m.moyen] ?? m.moyen;
      return { libelle: l.charAt(0).toLowerCase() + l.slice(1), ca: m.caTtcCents, nb: m.nbVentes };
    }),
  ].sort((a, b) => b.ca - a.ca);

  if (!lignes.length) return <Vide>—</Vide>;
  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>
            <th className="pb-2 pr-3 font-medium">Formule</th>
            <th className="hidden pb-2 pr-3 font-medium sm:table-cell">Prix pratiqués</th>
            <th className="pb-2 pr-3 text-right font-medium">Ventes</th>
            <th className="pb-2 pr-3 text-right font-medium">% ventes</th>
            <th className="pb-2 pr-3 text-right font-medium">CA</th>
            <th className="pb-2 font-medium">% CA</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {lignes.map((g) => {
            const prix = g.prix.filter((p) => p.montant !== undefined).sort((a, b) => b.nb - a.nb);
            const partCa = caTotal ? g.ca / caTotal : 0;
            return (
              <tr key={g.libelle} className="border-t border-line">
                <td className="py-2 pr-3 font-medium">
                  <Bulle texte={`${g.libelle} : ${prix.length ? prix.map((p) => `${nombre(p.nb)} à ${euros(p.montant!)}`).join(" · ") : pluriel(g.nbVentes, "vente")}`}>{g.libelle}</Bulle>
                </td>
                <td className="hidden py-2 pr-3 text-ink-2 sm:table-cell">{prix.map((p) => euros(p.montant!)).join(" · ") || "—"}</td>
                <td className="py-2 pr-3 text-right">{nombre(g.nbVentes)}</td>
                <td className="py-2 pr-3 text-right text-ink-2">{pct(nbTotal ? g.nbVentes / nbTotal : 0)}</td>
                <td className="py-2 pr-3 text-right font-semibold">{euros(g.ca)}</td>
                <td className="py-2">
                  <span className="flex items-center gap-2 font-medium">
                    <i className="relative hidden h-2 w-28 shrink-0 rounded-full bg-surface-2 md:block">
                      <b className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${partCa * 100}%`, background: VIOLET }} />
                    </i>
                    {pct(partCa)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {moyens.length > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-2">
          {s.modulesPaiement.length > 1 ? (
            <Bulle texte={`Modules : ${s.modulesPaiement.map((m) => `${m.libelle} ${euros(m.caTtcCents)}`).join(" · ")}`}>Moyens de paiement</Bulle>
          ) : (
            "Moyens de paiement"
          )}{" "}
          :{" "}
          {moyens.map((m, i) => (
            <span key={m.libelle}>
              {i > 0 && " · "}
              <Bulle texte={pluriel(m.nb, "vente")}>
                {m.libelle} {euros(m.ca)}
              </Bulle>
            </span>
          ))}
          .
        </p>
      )}
    </>
  );
}
