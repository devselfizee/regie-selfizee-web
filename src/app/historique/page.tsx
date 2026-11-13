"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, qs, type LieuListe } from "@/lib/api";
import { jour } from "@/lib/format";
import { PageGuard } from "@/lib/perms";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { ChoixLieu } from "@/components/ChoixLieu";
import { PERIODES, useFiltresPage } from "@/components/FiltresPage";

// Timeline de la Régie : une seule chronologie, du plus récent au plus ancien, de tout ce qui est déjà enregistré
// (téléchargements d'événements par les bornes, publications, actions des utilisateurs, alertes, envois refusés des
// bornes). Filtres par type, lieu et période. L'API fusionne les sources à la lecture et rend la suite par curseur.
//
// Deux vues (retour du 14/11, « encore le bazar ») :
// - Résumé (par défaut) : par jour, une ligne par NATURE avec son nombre (« Modifications · Lieux × 8 », « Publications
//   d'événements × 3 », « Envois refusés des bornes × 40 »), qu'on déplie pour voir ce qu'elle contient. Dedans, ce
//   qui est identique est encore regroupé. Les étapes d'un téléchargement
//   (demandé, envoyé, téléchargé, installé) tiennent sur UNE ligne avec son état ; une même chose qui se répète dans la
//   journée (une borne refusée toutes les cinq minutes, dix modifications du même lieu) tient sur une ligne, avec
//   « × 12 » et la plage horaire.
// - Détail : une ligne par enregistrement, sans regroupement.
// Colonnes fixes : heure, icône du type (couleur : fait, à regarder, problème), quoi, puis où à droite : la borne ET
// son lieu (« C113 » seul ne dit rien).

type Type = "telechargement" | "publication" | "utilisateur" | "alerte" | "borne";
type Ton = "info" | "ok" | "attention" | "critique";
type Etape = "DEMANDE" | "ENVOYE" | "TELECHARGE" | "INSTALLE" | "ECHEC";
type Vue = "resume" | "detail";
interface Ligne {
  cle: string;
  type: Type;
  date: string;
  titre: string;
  nature?: string;
  detail: string | null;
  ton: Ton;
  lieu: { id: number; enseigne: string } | null;
  borne: { id: number | null; identifiant: string } | null;
  utilisateur: string | null;
  evenement: { id: number; lieuId: number; parDefaut: boolean; nom: string | null; code: string } | null;
  telechargement?: { etat: Etape; code: string; version: number; declencheur: "AUTO" | "MANUEL" | null; message: string | null };
}
interface PageHistorique {
  lignes: Ligne[];
  suivant: string | null;
  typesPermis: Type[];
}

/** Ce que la page affiche : une ligne, ou plusieurs lignes regroupées. */
interface Element {
  cle: string;
  type: Type;
  ton: Ton;
  /** La plus récente et la plus ancienne des lignes regroupées */
  date: string;
  debut: string;
  titre: string;
  nature: string;
  detail: string | null;
  utilisateur: string | null;
  lieu: Ligne["lieu"];
  borne: Ligne["borne"];
  evenement: Ligne["evenement"];
  fois: number;
  /** Téléchargement regroupé : heure de chaque étape vue, code et version, déclencheur, message d'échec */
  etapes?: Partial<Record<Etape, string>>;
  declencheur?: "AUTO" | "MANUEL" | null;
  echec?: string | null;
}

const TYPES: Record<Type, { libelle: string; court: string; point: string; aide: string }> = {
  telechargement: { libelle: "Téléchargements", court: "Téléchargement", point: "bg-accent", aide: "Événements demandés, téléchargés ou installés par les bornes" },
  publication: { libelle: "Publications", court: "Publication", point: "bg-[#0E9F8A]", aide: "Événements publiés pour les bornes" },
  utilisateur: { libelle: "Actions des utilisateurs", court: "Action d'un utilisateur", point: "bg-ink-2", aide: "Créations, modifications et suppressions faites dans la Régie" },
  alerte: { libelle: "Alertes", court: "Alerte", point: "bg-[#D97706]", aide: "Alertes relevées sur les lieux et les bornes" },
  borne: { libelle: "Bornes", court: "Envoi d'une borne", point: "bg-crit-ink", aide: "Envois des bornes refusés ou en partie rejetés" },
};
const TONS: Record<Ton, string> = {
  info: "bg-accent/10 text-accent",
  ok: "bg-ok-bg text-ok-ink",
  attention: "bg-warn-bg text-warn-ink",
  critique: "bg-crit-bg text-crit-ink",
};
const ETAPES: { etat: Etape; libelle: string }[] = [
  { etat: "DEMANDE", libelle: "Demandé" },
  { etat: "ENVOYE", libelle: "Envoyé" },
  { etat: "TELECHARGE", libelle: "Téléchargé" },
  { etat: "INSTALLE", libelle: "Installé" },
];
const LIMITE = 100;
const HEURE = 3_600_000;
const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const hm = (iso: string) => heure.format(new Date(iso));
const jourParis = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));

const seule = (l: Ligne): Element => ({
  cle: l.cle, type: l.type, ton: l.ton, date: l.date, debut: l.date, titre: l.titre, nature: l.nature ?? TYPES[l.type].libelle, detail: l.detail, utilisateur: l.utilisateur, lieu: l.lieu, borne: l.borne, evenement: l.evenement, fois: 1,
});

/**
 * Lignes (de la plus récente à la plus ancienne) → éléments affichés, dans le même ordre. Vue Détail : une ligne par
 * enregistrement. Vue Résumé : les étapes d'un téléchargement ensemble, et ce qui se répète dans la journée ensemble.
 */
function regrouper(lignes: Ligne[], vue: Vue): Element[] {
  if (vue === "detail") return lignes.map(seule);
  const ouverts = new Map<string, Element>();
  const liste: Element[] = [];
  for (const l of lignes) {
    const t = new Date(l.date).getTime();
    const tel = l.telechargement;
    const cle = tel
      ? `tel|${l.borne?.identifiant ?? ""}|${tel.code}|${tel.version}`
      : `${jourParis(l.date)}|${l.type}|${l.titre}|${l.borne?.identifiant ?? ""}|${l.lieu?.id ?? ""}|${l.detail ?? ""}`;
    let g = ouverts.get(cle);
    // Téléchargement : au-delà de 2 h, ou la demande (sa première étape) déjà vue : c'est un téléchargement précédent
    if (g && tel && (new Date(g.debut).getTime() - t > 2 * HEURE || g.etapes?.DEMANDE)) g = undefined;
    if (!g) {
      g = seule(l);
      if (tel) {
        const nom = l.evenement ? (l.evenement.parDefaut ? "Événement par défaut" : (l.evenement.nom ?? "Événement")) : "Événement inconnu de la Régie";
        Object.assign(g, { titre: `${nom} · ${tel.code} v${tel.version}`, detail: null, etapes: {}, declencheur: tel.declencheur, echec: null });
      }
      ouverts.set(cle, g);
      liste.push(g);
    } else {
      g.debut = l.date;
      if (!tel) g.fois++;
    }
    if (tel && g.etapes) {
      g.etapes[tel.etat] ??= l.date;
      g.declencheur ??= tel.declencheur;
      if (tel.etat === "ECHEC") g.echec ??= tel.message ?? "Échec signalé par la borne";
    }
  }
  // Téléchargements : couleur d'après l'état final (un échec suivi d'une installation réussie : c'est installé)
  for (const g of liste) {
    if (!g.etapes) continue;
    const rate = Boolean(g.etapes.ECHEC) && !(g.etapes.INSTALLE && g.etapes.INSTALLE > g.etapes.ECHEC!);
    g.ton = rate ? "critique" : g.etapes.INSTALLE || g.etapes.TELECHARGE ? "ok" : "info";
    if (!rate) g.echec = null;
    g.nature = rate ? "Téléchargements en échec" : g.etapes.INSTALLE ? "Événements installés sur les bornes" : g.etapes.TELECHARGE ? "Événements téléchargés" : "Téléchargements en cours";
  }
  return liste;
}

/** Résumé d'un jour : une nature (« Modifications · Lieux »), son nombre, et ce qu'elle contient. */
interface Nature {
  cle: string;
  libelle: string;
  type: Type;
  ton: Ton;
  date: string;
  debut: string;
  /** Nombre de faits : un téléchargement compte pour un, une répétition pour toutes ses fois */
  nombre: number;
  elements: Element[];
}
const GRAVITE: Record<Ton, number> = { info: 0, ok: 1, attention: 2, critique: 3 };

function parNature(elements: Element[]): Nature[] {
  const natures = new Map<string, Nature>();
  for (const e of elements) {
    const cle = `${e.type}|${e.nature}`;
    const n = natures.get(cle);
    if (!n) natures.set(cle, { cle, libelle: e.nature, type: e.type, ton: e.ton, date: e.date, debut: e.debut, nombre: e.fois, elements: [e] });
    else {
      n.nombre += e.fois;
      n.elements.push(e);
      if (e.debut < n.debut) n.debut = e.debut;
      if (GRAVITE[e.ton] > GRAVITE[n.ton]) n.ton = e.ton;
    }
  }
  return [...natures.values()];
}

/** « C113 (La Ruche), S12 (Le Hangar) et 3 autres » : où ça s'est passé, en bref. */
function ouEnBref(elements: Element[]): string | null {
  const noms = [...new Set(elements.map((e) => (e.borne ? `${e.borne.identifiant}${e.lieu ? ` (${e.lieu.enseigne})` : ""}` : (e.lieu?.enseigne ?? ""))).filter(Boolean))];
  if (!noms.length) return null;
  return noms.length > 3 ? `${noms.slice(0, 2).join(", ")} et ${noms.length - 2} autres` : noms.join(", ");
}

/** Une nature du résumé : repliée par défaut, se déplie sur ses lignes. */
function LigneNature({ n }: { n: Nature }) {
  const ou = ouEnBref(n.elements);
  // Qui : la nature regroupe toutes les personnes ; leurs noms sont rappelés ici, et ligne par ligne une fois déplié
  const personnes = [...new Set(n.elements.map((e) => e.utilisateur).filter((u): u is string => Boolean(u)))];
  const qui = personnes.length ? `par ${personnes.length > 3 ? `${personnes.slice(0, 2).join(", ")} et ${personnes.length - 2} autres` : personnes.join(", ")}` : null;
  const plage = hm(n.debut) !== hm(n.date) ? `de ${hm(n.debut)} à ${hm(n.date)}` : `à ${hm(n.date)}`;
  return (
    <li>
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 text-sm hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full ${TONS[n.ton]}`}>
            <Icone type={n.type} />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium text-ink">{n.libelle}</span>
              <span className="tabular rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-bold text-white">{n.nombre}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-ink-muted">{[plage, qui, ou].filter(Boolean).join(" · ")}</span>
          </span>
          <span aria-hidden className="text-ink-muted transition-transform group-open:rotate-90">›</span>
        </summary>
        <ol className="divide-y divide-line border-t border-line bg-surface-2/40">
          {n.elements.map((e) => (
            <LigneTimeline key={e.cle} e={e} />
          ))}
        </ol>
      </details>
    </li>
  );
}

const etatFinal = (e: Element): { libelle: string; classe: string } => {
  if (e.ton === "critique") return { libelle: "Échec", classe: TONS.critique };
  if (e.etapes?.INSTALLE) return { libelle: "Installé", classe: TONS.ok };
  if (e.etapes?.TELECHARGE) return { libelle: "Téléchargé", classe: TONS.ok };
  return { libelle: "En cours", classe: TONS.info };
};

/** Icône du type, 16 px, au trait. */
function Icone({ type }: { type: Type }) {
  const traits: Record<Type, ReactNode> = {
    telechargement: <path d="M8 2.5v7m0 0L5 6.7m3 2.8 3-2.8M3 11.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" />,
    publication: <path d="M8 10.5v-7m0 0L5 6.3m3-2.8 3 2.8M3 11.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" />,
    utilisateur: <path d="M8 8a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 8 8Zm-4.8 5.3c.5-2 2.4-3.3 4.8-3.3s4.3 1.3 4.8 3.3" />,
    alerte: <path d="M8 2.6 1.9 13h12.2L8 2.6Zm0 4.2v3m0 1.7v.1" />,
    borne: <path d="M4.5 2.5h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Zm1.7 3.7 3.6 3.6m0-3.6L6.2 9.8" />,
  };
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {traits[type]}
    </svg>
  );
}

export default function PageHistoriqueRegie() {
  return (
    <PageGuard perm="bornes.view">
      <Historique />
    </PageGuard>
  );
}

function Historique() {
  const f = useFiltresPage("7j");
  // Types cochés ; vide : tous ceux que l'utilisateur a le droit de voir
  const [types, setTypes] = useState<Type[]>([]);
  const [vue, setVue] = useState<Vue>("resume");
  const lieux = useQuery({ queryKey: ["lieux", "tdb"], queryFn: () => api<LieuListe[]>("/lieux"), staleTime: 5 * 60_000 });
  const filtres = { du: f.du, au: f.au, lieuId: f.etat.lieuId, types: types.join(","), limite: LIMITE };
  const historique = useInfiniteQuery({
    queryKey: ["historique", filtres],
    queryFn: ({ pageParam }) => api<PageHistorique>(`/historique${qs({ ...filtres, avant: pageParam })}`),
    initialPageParam: "",
    getNextPageParam: (derniere) => derniere.suivant ?? undefined,
    // L'ancienne liste reste affichée pendant qu'un filtre charge : la barre des types ne disparaît plus (focus gardé)
    placeholderData: (precedent) => precedent,
  });
  const permis = historique.data?.pages[0]?.typesPermis ?? [];
  const lignes = historique.data?.pages.flatMap((p) => p.lignes) ?? [];
  const jours: { jour: string; elements: Element[]; lignes: number }[] = [];
  for (const e of regrouper(lignes, vue)) {
    const j = jourParis(e.date);
    if (jours.at(-1)?.jour !== j) jours.push({ jour: j, elements: [], lignes: 0 });
    jours.at(-1)!.elements.push(e);
  }
  const basculer = (t: Type) => setTypes((actuels) => (actuels.includes(t) ? actuels.filter((x) => x !== t) : [...actuels, t]));
  const puce = (actif: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${actif ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-2 hover:text-ink"}`;
  const onglet = (actif: boolean) => `rounded-md px-3 py-1 text-sm font-medium transition-colors ${actif ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`;

  return (
    <>
      <EnTete
        titre="Timeline"
        sousTitre={`Tout ce qui s'est passé · ${f.du === f.au ? `le ${jour(f.du)}` : `du ${jour(f.du)} au ${jour(f.au)}`}${historique.isFetching ? " · mise à jour…" : ""}`}
        actions={
          <>
            <div className="w-72 max-w-full">
              <ChoixLieu id="hist-lieu" lieux={lieux.data ?? []} valeur={f.etat.lieuId} onChange={(lieuId) => f.set({ lieuId })} />
            </div>
            <select id="hist-periode" aria-label="Période" className="champ !w-auto" value={f.etat.cle} onChange={(e) => f.set({ cle: e.target.value })}>
              {PERIODES.map((p) => (
                <option key={p.cle} value={p.cle}>
                  {p.libelle}
                </option>
              ))}
            </select>
            {f.etat.cle === "perso" && (
              <>
                <input id="hist-du" aria-label="Du" type="date" className="champ !w-auto" value={f.etat.perso.du} max={f.etat.perso.au} onChange={(e) => e.target.value && f.set({ perso: { ...f.etat.perso, du: e.target.value } })} />
                <input id="hist-au" aria-label="Au" type="date" className="champ !w-auto" value={f.etat.perso.au} min={f.etat.perso.du} onChange={(e) => e.target.value && f.set({ perso: { ...f.etat.perso, au: e.target.value } })} />
              </>
            )}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {/* Types : rien de coché = tout ; un clic limite la timeline aux types cochés. La pastille reprend la couleur du type. */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Types d'événements">
          {permis.length > 1 && (
            <>
              <button type="button" aria-pressed={types.length === 0} onClick={() => setTypes([])} className={puce(types.length === 0)}>
                Tout
              </button>
              {permis.map((t) => (
                <button key={t} type="button" aria-pressed={types.includes(t)} title={TYPES[t].aide} onClick={() => basculer(t)} className={puce(types.includes(t))}>
                  <span aria-hidden className={`h-2 w-2 rounded-full ${TYPES[t].point}`} />
                  {TYPES[t].libelle}
                </button>
              ))}
            </>
          )}
        </div>
        {/* Résumé : mêmes natures regroupées avec leur nombre ; Détail : une ligne par enregistrement */}
        <div className="inline-flex rounded-lg bg-surface-2 p-1" role="tablist" aria-label="Vue de la timeline">
          <button type="button" role="tab" aria-selected={vue === "resume"} className={onglet(vue === "resume")} title="Par jour, une ligne par nature (créations, modifications, publications…) avec son nombre ; cliquer pour déplier" onClick={() => setVue("resume")}>
            Résumé
          </button>
          <button type="button" role="tab" aria-selected={vue === "detail"} className={onglet(vue === "detail")} title="Une ligne par enregistrement, sans regroupement" onClick={() => setVue("detail")}>
            Détail
          </button>
        </div>
      </div>

      {historique.error ? (
        <Erreur erreur={historique.error} />
      ) : historique.isPending ? (
        <Chargement />
      ) : lignes.length === 0 ? (
        <Vide>Rien sur cette période avec ces filtres.</Vide>
      ) : (
        <div className={`space-y-6 ${historique.isPlaceholderData ? "opacity-60" : ""}`}>
          {jours.map((j) => (
            <section key={j.jour}>
              <h2 className="mb-2 flex items-baseline gap-3">
                <span className="text-sm font-semibold text-ink first-letter:uppercase">
                  {new Date(`${j.jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                </span>
                <span aria-hidden className="h-px flex-1 bg-line" />
              </h2>
              <ol className="carte divide-y divide-line overflow-hidden">
                {vue === "resume" ? parNature(j.elements).map((n) => <LigneNature key={n.cle} n={n} />) : j.elements.map((e) => <LigneTimeline key={e.cle} e={e} />)}
              </ol>
            </section>
          ))}
          <div className="flex justify-center">
            {historique.hasNextPage ? (
              <button type="button" className="bouton-second" disabled={historique.isFetchingNextPage} onClick={() => historique.fetchNextPage()}>
                {historique.isFetchingNextPage ? "Chargement…" : "Charger la suite"}
              </button>
            ) : (
              <p className="text-xs text-ink-muted">Fin de la timeline sur cette période.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Une ligne : heure · icône · quoi (titre, puis précisions en petit) · où (borne et son lieu), à droite sur grand écran. */
function LigneTimeline({ e }: { e: Element }) {
  const final = e.etapes ? etatFinal(e) : null;
  const plage = e.fois > 1 ? (hm(e.debut) !== hm(e.date) ? `De ${hm(e.debut)} à ${hm(e.date)}` : null) : null;
  return (
    <li className="grid grid-cols-[2.75rem_1.75rem_minmax(0,1fr)] items-start gap-x-3 px-4 py-2.5 text-sm hover:bg-surface-2/60 md:grid-cols-[2.75rem_1.75rem_minmax(0,1fr)_minmax(0,18rem)]">
      <time dateTime={e.date} className="tabular pt-1 text-xs text-ink-muted">
        {hm(e.date)}
      </time>
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${TONS[e.ton]}`} title={TYPES[e.type].court}>
        <Icone type={e.type} />
      </span>

      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-6">
          <span className="font-medium text-ink">{e.titre}</span>
          {e.fois > 1 && (
            <span className="rounded-full bg-ink px-2 py-0.5 text-[0.7rem] font-bold text-white" title={`${e.fois} fois ce jour-là`}>× {e.fois}</span>
          )}
          {final && <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${final.classe}`}>{final.libelle}</span>}
          {e.declencheur === "AUTO" && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-semibold text-ink-2" title="Mise à jour automatique : l'événement vient du programme de la borne">Auto</span>
          )}
          {e.declencheur === "MANUEL" && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-semibold text-ink-2" title="Code tapé à la main sur la borne">Manuel</span>
          )}
        </p>
        {e.etapes ? (
          <>
            {/* Étapes du téléchargement, dans l'ordre, avec l'heure de celles qui ont eu lieu */}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
              {ETAPES.map((s, i) => (
                <span key={s.etat} className={`inline-flex items-center gap-1.5 ${e.etapes![s.etat] ? "text-ink-2" : "opacity-50"}`}>
                  {i > 0 && <span aria-hidden>›</span>}
                  {s.libelle}
                  {e.etapes![s.etat] && <span className="tabular">{hm(e.etapes![s.etat]!)}</span>}
                </span>
              ))}
            </p>
            {e.echec && <p className="mt-0.5 text-xs text-crit-ink">{e.echec}</p>}
          </>
        ) : (
          (e.detail || plage) && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {plage && <span className="font-medium text-ink-2">{plage}</span>}
              {plage && e.detail && " · "}
              {e.detail && <span className={e.ton === "critique" ? "text-crit-ink" : ""}>{e.detail}</span>}
            </p>
          )
        )}
      </div>

      {/* Où : sous le texte sur petit écran, colonne de droite sinon. La borne est toujours suivie de son lieu. */}
      <div className="col-start-3 mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted md:col-start-4 md:mt-0 md:justify-end md:pt-1">
        {e.borne &&
          (e.borne.id ? (
            <Link href={`/bornes/${e.borne.id}`} className="rounded bg-ink px-1.5 py-0.5 font-bold text-white hover:opacity-85">{e.borne.identifiant}</Link>
          ) : (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-bold text-ink-2" title="Borne inconnue de la Régie">{e.borne.identifiant}</span>
          ))}
        {e.lieu ? (
          <Link href={`/lieux/${e.lieu.id}`} className="truncate font-medium text-ink-2 hover:text-accent">{e.lieu.enseigne}</Link>
        ) : (
          e.borne && <span className="italic">{e.borne.id ? "Installée dans aucun lieu" : "Borne inconnue de la Régie"}</span>
        )}
        {e.evenement && (
          <Link
            href={e.evenement.parDefaut ? `/lieux/${e.evenement.lieuId}/evenement` : `/lieux/${e.evenement.lieuId}/evenement/${e.evenement.id}`}
            className="whitespace-nowrap hover:text-accent"
            title="Ouvrir l'événement"
          >
            Événement →
          </Link>
        )}
      </div>
    </li>
  );
}
