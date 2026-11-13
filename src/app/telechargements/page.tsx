"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api";
import { jour } from "@/lib/format";
import { PageGuard } from "@/lib/perms";
import { Badge, Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { FiltresPage, useFiltresPage } from "@/components/FiltresPage";

// Journal des téléchargements d'événements par les bornes (retour du 13/11) : une chronologie, du plus récent au plus
// ancien, de chaque étape (zip demandé, envoyé, téléchargé, installé, échec), avec qui l'a lancée : la mise à jour
// automatique ou un code tapé sur la borne. La table grossit vite : lecture par curseur (« Charger la suite »), jamais
// de total ni de saut de page ; le journal garde 180 jours.

type Etat = "DEMANDE" | "ENVOYE" | "TELECHARGE" | "INSTALLE" | "ECHEC";
interface Ligne {
  id: string;
  date: string;
  code: string;
  version: number;
  etat: Etat;
  declencheur: "AUTO" | "MANUEL" | null;
  message: string | null;
  borne: { id: number; identifiant: string };
  evenement: { id: number; nom: string | null; parDefaut: boolean } | null;
  lieu: { id: number; enseigne: string; ville: string | null } | null;
}
interface PageJournal {
  lignes: Ligne[];
  suivant: string | null;
}

const ETATS: Record<Etat, { libelle: string; ton: "ok" | "warn" | "crit" | "neutre"; aide: string }> = {
  DEMANDE: { libelle: "Zip demandé", ton: "neutre", aide: "La borne a demandé le zip et reçu son lien" },
  ENVOYE: { libelle: "Zip envoyé", ton: "neutre", aide: "La Régie a servi le zip à la borne" },
  TELECHARGE: { libelle: "Téléchargé", ton: "ok", aide: "La borne signale le zip reçu et vérifié" },
  INSTALLE: { libelle: "Installé", ton: "ok", aide: "La borne signale l'événement installé" },
  ECHEC: { libelle: "Échec", ton: "crit", aide: "La borne signale un téléchargement ou une installation raté" },
};
const LIMITE = 50;
const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const jourParis = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));

// Un téléchargement : les étapes d'une borne pour une version d'un événement, regroupées (2 h au plus entre deux)
const ETAPES: Exclude<Etat, "ECHEC">[] = ["DEMANDE", "ENVOYE", "TELECHARGE", "INSTALLE"];
const LIBELLES_ETAPE: Record<Exclude<Etat, "ECHEC">, string> = { DEMANDE: "Demandé", ENVOYE: "Envoyé", TELECHARGE: "Téléchargé", INSTALLE: "Installé" };
interface Telechargement {
  cle: string;
  /** Dernière étape reçue (la plus récente) */
  derniere: Ligne;
  /** Heure de chaque étape franchie */
  etapes: Partial<Record<Etat, string>>;
  echec: Ligne | null;
}

/** Lignes (de la plus récente à la plus ancienne) → téléchargements, dans le même ordre. */
function regrouper(lignes: Ligne[]): Telechargement[] {
  const ouverts = new Map<string, Telechargement & { plusAncienne: number }>();
  const liste: Telechargement[] = [];
  for (const l of lignes) {
    const cle = `${l.borne.id}|${l.code}|${l.version}`;
    const t = new Date(l.date).getTime();
    let g = ouverts.get(cle);
    // Trop loin dans le temps, ou le groupe a déjà sa demande (sa ligne la plus ancienne, les lignes arrivant de la
    // plus récente à la plus ancienne) : tout ce qui suit appartient à un téléchargement précédent
    if (g && (g.plusAncienne - t > 2 * 3_600_000 || g.etapes.DEMANDE)) g = undefined;
    if (!g) {
      g = { cle: `${cle}|${l.id}`, derniere: l, etapes: {}, echec: null, plusAncienne: t };
      ouverts.set(cle, g);
      liste.push(g);
    }
    g.plusAncienne = t;
    g.etapes[l.etat] ??= l.date;
    if (l.etat === "ECHEC") g.echec ??= l;
  }
  return liste;
}

export default function PageTelechargements() {
  return (
    <PageGuard perm="bornes.view">
      <Telechargements />
    </PageGuard>
  );
}

function Telechargements() {
  const f = useFiltresPage("7j");
  const [etat, setEtat] = useState("");
  const [declencheur, setDeclencheur] = useState("");
  const filtres = { du: f.du, au: f.au, parc: f.parc, lieuId: f.lieuId, etat, declencheur, limite: LIMITE };
  const journal = useInfiniteQuery({
    queryKey: ["telechargements-evenements", filtres],
    queryFn: ({ pageParam }) => api<PageJournal>(`/telechargements-evenements${qs({ ...filtres, avant: pageParam })}`),
    initialPageParam: "",
    getNextPageParam: (derniere) => derniere.suivant ?? undefined,
  });
  const lignes = journal.data?.pages.flatMap((p) => p.lignes) ?? [];
  // Chronologie : un intertitre par jour (celui de la dernière étape du téléchargement)
  const jours: { jour: string; telechargements: Telechargement[] }[] = [];
  for (const t of regrouper(lignes)) {
    const j = jourParis(t.derniere.date);
    if (jours.at(-1)?.jour !== j) jours.push({ jour: j, telechargements: [] });
    jours.at(-1)!.telechargements.push(t);
  }

  return (
    <>
      <EnTete
        titre="Téléchargements"
        sousTitre={`Événements chargés par les bornes · ${f.du === f.au ? `le ${jour(f.du)}` : `du ${jour(f.du)} au ${jour(f.au)}`}${journal.isFetching ? " · mise à jour…" : ""}`}
        actions={
          <>
            <select id="tel-etat" aria-label="Étape" className="champ !w-auto" value={etat} onChange={(e) => setEtat(e.target.value)}>
              <option value="">Toutes les étapes</option>
              {(Object.keys(ETATS) as Etat[]).map((e) => (
                <option key={e} value={e}>
                  {ETATS[e].libelle}
                </option>
              ))}
            </select>
            <select id="tel-declencheur" aria-label="Déclencheur" className="champ !w-auto" value={declencheur} onChange={(e) => setDeclencheur(e.target.value)}>
              <option value="">Auto et manuel</option>
              <option value="AUTO">Automatique</option>
              <option value="MANUEL">Manuel (code tapé)</option>
            </select>
            <FiltresPage f={f} prefixe="tel" />
          </>
        }
      />

      {journal.error ? (
        <Erreur erreur={journal.error} />
      ) : journal.isPending ? (
        <Chargement />
      ) : lignes.length === 0 ? (
        <Vide>Aucun téléchargement sur cette période avec ces filtres. Une ligne s&apos;ajoute quand une borne demande, reçoit ou installe le zip d&apos;un événement.</Vide>
      ) : (
        <div className="space-y-6">
          {jours.map((j) => (
            <section key={j.jour}>
              <h2 className="mb-2 flex items-center gap-3 text-xs font-semibold tracking-wider text-ink-2 uppercase">
                {new Date(`${j.jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                <span aria-hidden className="h-px flex-1 bg-line" />
                <span className="font-medium tracking-normal text-ink-muted normal-case">
                  {j.telechargements.length} téléchargement{j.telechargements.length > 1 ? "s" : ""}
                </span>
              </h2>
              <ol className="space-y-2">
                {j.telechargements.map((t) => (
                  <Carte key={t.cle} t={t} />
                ))}
              </ol>
            </section>
          ))}
          <div className="flex justify-center">
            {journal.hasNextPage ? (
              <button type="button" className="bouton-second" disabled={journal.isFetchingNextPage} onClick={() => journal.fetchNextPage()}>
                {journal.isFetchingNextPage ? "Chargement…" : "Charger la suite"}
              </button>
            ) : (
              <p className="text-xs text-ink-muted">Fin du journal sur cette période (180 jours gardés).</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Un téléchargement : qui, quoi, auto ou manuel, et la frise de ses étapes. */
function Carte({ t }: { t: Telechargement }) {
  const l = t.derniere;
  const echec = l.etat === "ECHEC";
  const installe = Boolean(t.etapes.INSTALLE) && !echec;
  const lisere = echec ? "border-l-crit-ink" : installe ? "border-l-[#0E9F8A]" : "border-l-accent";
  return (
    <li className={`carte border-l-4 px-4 py-3 ${lisere}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="tabular text-sm font-semibold">{heure.format(new Date(l.date))}</span>
        <Link href={`/bornes/${l.borne.id}`} className="rounded-md bg-ink px-2 py-0.5 text-xs font-bold text-white hover:opacity-85">{l.borne.identifiant}</Link>
        <span className="min-w-0 text-sm">
          {l.lieu ? <Link href={`/lieux/${l.lieu.id}?onglet=configuration`} className="font-medium hover:text-accent">{l.lieu.enseigne}</Link> : <span className="text-ink-muted">Lieu inconnu</span>}
          <span className="text-ink-muted"> · </span>
          {l.evenement && l.lieu ? (
            <Link href={l.evenement.parDefaut ? `/lieux/${l.lieu.id}/evenement` : `/lieux/${l.lieu.id}/evenement/${l.evenement.id}`} className="hover:text-accent">
              {l.evenement.parDefaut ? "Par défaut" : l.evenement.nom ?? "Événement"}
            </Link>
          ) : (
            <span className="text-warn-ink">Événement inconnu</span>
          )}
        </span>
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.7rem] font-bold text-ink-2">{l.code}</span>
        <span className="text-xs text-ink-muted">v{l.version}</span>
        <span className="ml-auto flex items-center gap-2">
          {l.declencheur === "AUTO" ? (
            <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent" title="Mise à jour automatique : l'événement vient du programme de la borne">Auto</span>
          ) : l.declencheur === "MANUEL" ? (
            <span className="rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-semibold text-warn-ink" title="Code tapé à la main sur la borne">Manuel</span>
          ) : null}
          <span title={ETATS[l.etat].aide}>
            <Badge ton={echec ? "crit" : installe ? "ok" : "neutre"}>{echec ? "Échec" : installe ? "Installé" : "En cours"}</Badge>
          </span>
        </span>
      </div>

      {/* Frise des étapes : un point par étape, plein quand elle est franchie, avec son heure */}
      <ol className="mt-3 flex max-w-2xl items-start" aria-label="Étapes du téléchargement">
        {ETAPES.map((e, i) => {
          const fait = t.etapes[e];
          return (
            <li key={e} className="flex min-w-0 flex-1 items-start last:flex-none">
              <span className="flex min-w-0 flex-col items-center gap-0.5" title={ETATS[e].aide}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem] font-bold ${fait ? "bg-[#0E9F8A] text-white" : "border border-line-strong bg-surface text-ink-muted"}`}>
                  {fait ? "✓" : i + 1}
                </span>
                <span className={`text-xs whitespace-nowrap ${fait ? "font-medium text-ink" : "text-ink-muted"}`}>{LIBELLES_ETAPE[e]}</span>
                <span className="tabular h-4 text-[0.7rem] text-ink-muted">{fait ? heure.format(new Date(fait)) : ""}</span>
              </span>
              {i < ETAPES.length - 1 && <span aria-hidden className={`mx-1.5 mt-2.5 h-0.5 flex-1 rounded ${t.etapes[ETAPES[i + 1]] ? "bg-[#0E9F8A]" : "bg-line"}`} />}
            </li>
          );
        })}
      </ol>
      {t.echec && (
        <p className="mt-2 rounded-md bg-crit-bg px-3 py-1.5 text-xs text-crit-ink">
          Échec signalé à {heure.format(new Date(t.echec.date))}
          {t.echec.message ? ` : ${t.echec.message}` : ""}
        </p>
      )}
    </li>
  );
}
