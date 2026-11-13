"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, qs, type LieuListe } from "@/lib/api";
import { jour } from "@/lib/format";
import { PageGuard } from "@/lib/perms";
import { Chargement, EnTete, Erreur, Vide } from "@/components/Etat";
import { ChoixLieu } from "@/components/ChoixLieu";
import { PERIODES, useFiltresPage } from "@/components/FiltresPage";

// Historique de la Régie (retour du 14/11) : une seule chronologie, du plus récent au plus ancien, de tout ce qui est
// déjà enregistré : téléchargements d'événements par les bornes, publications, actions des utilisateurs, alertes,
// envois refusés des bornes. Filtres par type (cases), lieu et période. L'API fusionne les sources à la lecture et
// rend la suite par curseur (« Charger la suite ») : pas de total, la page reste rapide quel que soit le volume.

type Type = "telechargement" | "publication" | "utilisateur" | "alerte" | "borne";
type Ton = "info" | "ok" | "attention" | "critique";
interface Ligne {
  cle: string;
  type: Type;
  date: string;
  titre: string;
  detail: string | null;
  ton: Ton;
  lieu: { id: number; enseigne: string } | null;
  borne: { id: number | null; identifiant: string } | null;
  utilisateur: string | null;
  evenement: { id: number; lieuId: number; parDefaut: boolean; nom: string | null; code: string } | null;
}
interface PageHistorique {
  lignes: Ligne[];
  suivant: string | null;
  typesPermis: Type[];
}

const TYPES: Record<Type, { libelle: string; pastille: string; aide: string }> = {
  telechargement: { libelle: "Téléchargements", pastille: "bg-accent/10 text-accent", aide: "Événements demandés, envoyés, téléchargés ou installés par les bornes" },
  publication: { libelle: "Publications", pastille: "bg-ok-bg text-ok-ink", aide: "Événements publiés pour les bornes" },
  utilisateur: { libelle: "Actions des utilisateurs", pastille: "bg-surface-2 text-ink-2", aide: "Créations, modifications et suppressions faites dans la Régie" },
  alerte: { libelle: "Alertes", pastille: "bg-warn-bg text-warn-ink", aide: "Alertes relevées sur les lieux et les bornes" },
  borne: { libelle: "Bornes", pastille: "bg-crit-bg text-crit-ink", aide: "Envois des bornes refusés ou en partie rejetés" },
};
const POINTS: Record<Ton, string> = { info: "bg-accent", ok: "bg-[#0E9F8A]", attention: "bg-[#D97706]", critique: "bg-crit-ink" };
const LIMITE = 40;
const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const jourParis = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(iso));

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
  const lieux = useQuery({ queryKey: ["lieux", "tdb"], queryFn: () => api<LieuListe[]>("/lieux"), staleTime: 5 * 60_000 });
  const filtres = { du: f.du, au: f.au, lieuId: f.etat.lieuId, types: types.join(","), limite: LIMITE };
  const historique = useInfiniteQuery({
    queryKey: ["historique", filtres],
    queryFn: ({ pageParam }) => api<PageHistorique>(`/historique${qs({ ...filtres, avant: pageParam })}`),
    initialPageParam: "",
    getNextPageParam: (derniere) => derniere.suivant ?? undefined,
  });
  const permis = historique.data?.pages[0]?.typesPermis ?? [];
  const lignes = historique.data?.pages.flatMap((p) => p.lignes) ?? [];
  const jours: { jour: string; lignes: Ligne[] }[] = [];
  for (const l of lignes) {
    const j = jourParis(l.date);
    if (jours.at(-1)?.jour !== j) jours.push({ jour: j, lignes: [] });
    jours.at(-1)!.lignes.push(l);
  }
  const basculer = (t: Type) => setTypes((actuels) => (actuels.includes(t) ? actuels.filter((x) => x !== t) : [...actuels, t]));

  return (
    <>
      <EnTete
        titre="Historique"
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

      {/* Types : rien de coché = tout ; un clic limite l'historique aux types cochés */}
      {permis.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Types d'événements">
          <button
            type="button"
            aria-pressed={types.length === 0}
            onClick={() => setTypes([])}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${types.length === 0 ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-2 hover:text-ink"}`}
          >
            Tout
          </button>
          {permis.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={types.includes(t)}
              title={TYPES[t].aide}
              onClick={() => basculer(t)}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${types.includes(t) ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-2 hover:text-ink"}`}
            >
              {TYPES[t].libelle}
            </button>
          ))}
        </div>
      )}

      {historique.error ? (
        <Erreur erreur={historique.error} />
      ) : historique.isPending ? (
        <Chargement />
      ) : lignes.length === 0 ? (
        <Vide>Rien sur cette période avec ces filtres.</Vide>
      ) : (
        <div className="space-y-6">
          {jours.map((j) => (
            <section key={j.jour}>
              <h2 className="mb-2 flex items-center gap-3 text-xs font-semibold tracking-wider text-ink-2 uppercase">
                {new Date(`${j.jour}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                <span aria-hidden className="h-px flex-1 bg-line" />
              </h2>
              {/* Rail vertical : un point de couleur par ligne (vert : fait, orange : à regarder, rouge : problème) */}
              <ol className="carte relative px-4 py-2 before:absolute before:top-4 before:bottom-4 before:left-[5.6rem] before:w-px before:bg-line">
                {j.lignes.map((l) => (
                  <li key={l.cle} className="relative grid grid-cols-[3.2rem_1.6rem_minmax(0,1fr)] items-start gap-x-2 py-2 text-sm">
                    <span className="tabular pt-0.5 text-ink-muted">{heure.format(new Date(l.date))}</span>
                    <span className="flex justify-center pt-1.5">
                      <span aria-hidden className={`relative z-10 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${POINTS[l.ton]}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap ${TYPES[l.type].pastille}`}>{TYPES[l.type].libelle}</span>
                        <span className="font-medium">{l.titre}</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                        {l.borne &&
                          (l.borne.id ? (
                            <Link href={`/bornes/${l.borne.id}`} className="rounded bg-ink px-1.5 py-0.5 font-bold text-white hover:opacity-85">{l.borne.identifiant}</Link>
                          ) : (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-bold text-ink-2" title="Borne inconnue de la Régie">{l.borne.identifiant}</span>
                          ))}
                        {l.lieu && <Link href={`/lieux/${l.lieu.id}`} className="font-medium text-ink-2 hover:text-accent">{l.lieu.enseigne}</Link>}
                        {l.evenement && (
                          <Link href={l.evenement.parDefaut ? `/lieux/${l.evenement.lieuId}/evenement` : `/lieux/${l.evenement.lieuId}/evenement/${l.evenement.id}`} className="hover:text-accent">
                            Ouvrir l&apos;événement →
                          </Link>
                        )}
                        {l.detail && <span className={l.ton === "critique" ? "text-crit-ink" : ""}>{l.detail}</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          <div className="flex justify-center">
            {historique.hasNextPage ? (
              <button type="button" className="bouton-second" disabled={historique.isFetchingNextPage} onClick={() => historique.fetchNextPage()}>
                {historique.isFetchingNextPage ? "Chargement…" : "Charger la suite"}
              </button>
            ) : (
              <p className="text-xs text-ink-muted">Fin de l&apos;historique sur cette période.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
