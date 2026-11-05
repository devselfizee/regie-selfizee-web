"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SerieIllustrations } from "@/lib/api";
import { Badge, Chargement, Erreur, Section } from "./Etat";
import { GaleriePhotos } from "./IllustrationsEvenement";

// Paramètres → Séries d'illustrations : la bibliothèque des séries « type » de Selfizee (mariage,
// corporate…), choisies dans les fiches événement pour les photos d'exemple des cadres de la borne, et
// copiées dans le zip de l'événement (mémo ILLUSTRATIONS-ADMIN-WEB § 3a). Festif et chic sont dans le
// logiciel de la borne : pas besoin de les recréer ici.

const CLE = ["illustrations-series"];

// Séries embarquées dans le logiciel de la borne : choisies par leur nom, leurs photos ne sont pas ici
const SERIES_LOGICIEL = [
  { nom: "Festive", detail: "Photos de soirée (série par défaut)." },
  { nom: "Chic", detail: "Photos plus habillées." },
];

export function SeriesIllustrations() {
  const client = useQueryClient();
  const series = useQuery({ queryKey: CLE, queryFn: () => api<SerieIllustrations[]>("/illustrations-series") });
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [nom, setNom] = useState("");
  const creer = useMutation({
    mutationFn: () => api<SerieIllustrations>("/illustrations-series", { method: "POST", json: { nom: nom.trim() } }),
    onSuccess: (s) => {
      setNom("");
      setOuverte(s.id);
      client.invalidateQueries({ queryKey: CLE });
    },
  });

  if (series.error) return <Erreur erreur={series.error} />;
  if (!series.data) return <Chargement />;
  const choisie = series.data.find((s) => s.id === ouverte) ?? null;

  return (
    <div className="space-y-4">
      <Section titre="Séries d'illustrations">
        <p className="mb-4 text-sm text-ink-2">
          Photos d&apos;exemple des cases des cadres de la borne (page « Choisis ton format », cadres de l&apos;accueil), à proposer dans les fiches événement.
          Les séries festive et chic sont déjà dans le logiciel de la borne.
        </p>
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            creer.mutate();
          }}
        >
          <label className="block">
            <span className="etiquette">Nouvelle série</span>
            <input className="champ w-64" maxLength={80} placeholder="Mariage, corporate…" value={nom} onChange={(e) => setNom(e.target.value)} />
          </label>
          <button type="submit" className="bouton" disabled={!nom.trim() || creer.isPending}>
            Créer
          </button>
        </form>
        {creer.error && <div className="mb-3"><Erreur erreur={creer.error} /></div>}
        <h3 className="mb-2 text-sm font-semibold">Séries existantes</h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SERIES_LOGICIEL.map((s) => (
            <li key={s.nom} className="rounded-lg border border-dashed border-line-strong p-3">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{s.nom}</span>
                <Badge ton="neutre">Logiciel de la borne</Badge>
              </span>
              <span className="mt-1 block text-xs text-ink-2">{s.detail} Fournie avec la borne : rien à gérer ici.</span>
            </li>
          ))}
            {series.data.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={ouverte === s.id}
                  onClick={() => setOuverte(ouverte === s.id ? null : s.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${ouverte === s.id ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line hover:border-line-strong"}`}
                >
                  <span className="mb-2 grid grid-cols-4 gap-1">
                    {Array.from({ length: 4 }, (_, i) =>
                      s.apercus[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={s.apercus[i]} alt="" className="aspect-square w-full rounded object-cover" />
                      ) : (
                        <span key={i} className="aspect-square rounded bg-surface-2" />
                      ),
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{s.nom}</span>
                    {!s.actif && <Badge ton="neutre">Retirée</Badge>}
                  </span>
                  <span className="block text-xs text-ink-2">
                    {s.nbImages} photo{s.nbImages > 1 ? "s" : ""} · {s.formes.carre} carrée{s.formes.carre > 1 ? "s" : ""} · {s.formes.paysage} paysage · {s.formes.portrait} portrait
                  </span>
                </button>
              </li>
            ))}
        </ul>
        {!series.data.length && <p className="mt-3 text-sm text-ink-2">Aucune série créée pour l&apos;instant : ajoutez-en une ci-dessus (mariage, corporate…).</p>}
      </Section>
      {choisie && <Serie key={choisie.id} serie={choisie} onSupprimee={() => setOuverte(null)} />}
    </div>
  );
}

function Serie({ serie, onSupprimee }: { serie: SerieIllustrations; onSupprimee: () => void }) {
  const client = useQueryClient();
  const [nom, setNom] = useState(serie.nom);
  const actualiser = () => client.invalidateQueries({ queryKey: CLE });
  const modifier = useMutation({
    mutationFn: (p: { nom?: string; actif?: boolean }) => api(`/illustrations-series/${serie.id}`, { method: "PATCH", json: p }),
    onSuccess: actualiser,
  });
  const supprimer = useMutation({
    mutationFn: () => api(`/illustrations-series/${serie.id}`, { method: "DELETE" }),
    onSuccess: () => {
      actualiser();
      onSupprimee();
    },
  });

  return (
    <Section
      titre={`Série « ${serie.nom} »`}
      actions={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="bouton-second" disabled={modifier.isPending} onClick={() => modifier.mutate({ actif: !serie.actif })}>
            {serie.actif ? "Retirer des choix" : "Remettre dans les choix"}
          </button>
          <button
            type="button"
            className="bouton-second text-crit-ink"
            disabled={supprimer.isPending}
            onClick={() => confirm(`Supprimer la série « ${serie.nom} » et ses photos ? Les événements qui l'utilisent repasseront sur la série festive.`) && supprimer.mutate()}
          >
            Supprimer
          </button>
        </div>
      }
    >
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          modifier.mutate({ nom: nom.trim() });
        }}
      >
        <label className="block">
          <span className="etiquette">Nom</span>
          <input className="champ w-64" maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} />
        </label>
        <button type="submit" className="bouton-second" disabled={!nom.trim() || nom.trim() === serie.nom || modifier.isPending}>
          Renommer
        </button>
        {!serie.actif && <span className="text-xs text-ink-muted">Retirée des choix : les événements qui l&apos;ont déjà la gardent.</span>}
      </form>
      <GaleriePhotos
        cle={["illustrations-serie", serie.id]}
        lire={() => api(`/illustrations-series/${serie.id}/images`)}
        ajouter={(image) => api(`/illustrations-series/${serie.id}/images`, { method: "POST", json: { image } })}
        retirer={(id) => api(`/illustrations-series/${serie.id}/images/${id}`, { method: "DELETE" })}
        vide="Aucune photo : ajoutez-en 6 à 20."
        apresChangement={actualiser}
      />
      {(modifier.error || supprimer.error) && <div className="mt-3"><Erreur erreur={modifier.error ?? supprimer.error} /></div>}
    </Section>
  );
}
