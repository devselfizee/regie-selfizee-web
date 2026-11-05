"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type IllustrationEvenement, type ReglagesEvenement, type SerieIllustrations } from "@/lib/api";
import { Badge, Erreur, Section } from "./Etat";

// Photos d'exemple dans les cases des cadres de la borne (kit nightlife, mémo ILLUSTRATIONS-ADMIN-WEB du
// 05/11/2026) : page « Choisis ton format » et cadres de l'accueil. Série du logiciel, série de la
// bibliothèque (Paramètres), photos de l'événement (copiées dans le zip), caméra en direct ou cases
// unies ; l'accueil peut avoir sa série.

type Lieu = ReglagesEvenement["lieu"];
type Forme = IllustrationEvenement["forme"];
export const MAX_PAR_SERIE = 20;

const CHOIX_CADRES: { valeur: Lieu["illustrations"]; titre: string; detail: string }[] = [
  { valeur: "festif", titre: "Série festive", detail: "Photos de soirée du logiciel (défaut)." },
  { valeur: "chic", titre: "Série chic", detail: "Photos plus habillées, du logiciel." },
  { valeur: "serie", titre: "Série de la bibliothèque", detail: "Mariage, corporate… gérées dans Paramètres." },
  { valeur: "photos", titre: "Nos photos", detail: "Celles de l'événement : le lieu, l'équipe, la marque…" },
  { valeur: "camera", titre: "Caméra en direct", detail: "L'image de la caméra dans les cases." },
  { valeur: "aucune", titre: "Aucune", detail: "Cases unies, sans photo." },
];
const FORMES: Record<Forme, string> = { carre: "Carrée", portrait: "Portrait", paysage: "Paysage" };

/**
 * Le choix se règle avec la fiche (barre « Enregistrer ») ; les photos de l'événement, elles, s'envoient
 * tout de suite à l'API, une fois l'événement enregistré.
 */
export function IllustrationsEvenement({ lieu, majLieu, apiEvenement, enregistre }: {
  lieu: Lieu;
  majLieu: (p: Partial<Lieu>) => void;
  apiEvenement: string;
  enregistre: boolean;
}) {
  const series = useQuery({ queryKey: ["illustrations-series"], queryFn: () => api<SerieIllustrations[]>("/illustrations-series") });
  // Les séries retirées des choix restent affichées si l'événement les utilise déjà
  const proposees = (series.data ?? []).filter((s) => s.actif || s.id === lieu.illustrationsSerieId || s.id === lieu.illustrationsAccueilSerieId);
  const valeurAccueil = lieu.illustrationsAccueil === "serie" ? `serie:${lieu.illustrationsAccueilSerieId ?? ""}` : lieu.illustrationsAccueil;

  return (
    <Section titre="Photos d'exemple dans les cadres">
      <p className="mb-4 text-sm text-ink-2">
        Sur la borne, les cases photo des cadres (page « Choisis ton format » et cadres de l&apos;accueil) montrent des photos d&apos;exemple, pour donner envie.
        La borne les tire au sort et les fait tourner.
      </p>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" role="radiogroup" aria-label="Photos d'exemple des cadres">
        {CHOIX_CADRES.map((c) => {
          const actif = lieu.illustrations === c.valeur;
          return (
            <button
              key={c.valeur}
              type="button"
              role="radio"
              aria-checked={actif}
              onClick={() => majLieu({ illustrations: c.valeur, ...(c.valeur === "serie" && !lieu.illustrationsSerieId ? { illustrationsSerieId: proposees.find((s) => s.actif)?.id ?? null } : {}) })}
              className={`rounded-lg border p-3 text-left transition ${actif ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line hover:border-line-strong"}`}
            >
              <span className={`block text-sm font-semibold ${actif ? "text-accent" : "text-ink"}`}>{c.titre}</span>
              <span className="mt-0.5 block text-xs text-ink-2">{c.detail}</span>
            </button>
          );
        })}
      </div>

      {lieu.illustrations === "serie" && (
        <ChoixSerie series={proposees} valeur={lieu.illustrationsSerieId} onChange={(id) => majLieu({ illustrationsSerieId: id })} chargement={series.isLoading} />
      )}
      {lieu.illustrations === "photos" && <Galerie cible="cadres" apiEvenement={apiEvenement} enregistre={enregistre} />}

      {lieu.illustrations !== "aucune" && lieu.illustrations !== "camera" && (
        <div className="mt-5 border-t border-line pt-4">
          <label className="block max-w-sm">
            <span className="etiquette">Cadres de l&apos;accueil</span>
            <select
              className="champ"
              value={valeurAccueil}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith("serie:")) majLieu({ illustrationsAccueil: "serie", illustrationsAccueilSerieId: Number(v.slice(6)) || null });
                else majLieu({ illustrationsAccueil: v as Lieu["illustrationsAccueil"] });
              }}
            >
              <option value="memes">Les mêmes que les cadres</option>
              <option value="festif">Série festive</option>
              <option value="chic">Série chic</option>
              {proposees.map((s) => (
                <option key={s.id} value={`serie:${s.id}`}>Série « {s.nom} »</option>
              ))}
              <option value="photos">Des photos dédiées à l&apos;accueil</option>
            </select>
            <span className="mt-1 block text-xs text-ink-muted">Une autre série pour montrer d&apos;autres têtes sur l&apos;accueil que sur la page de choix.</span>
          </label>
          {lieu.illustrationsAccueil === "photos" && <Galerie cible="accueil" apiEvenement={apiEvenement} enregistre={enregistre} />}
        </div>
      )}
    </Section>
  );
}

function ChoixSerie({ series, valeur, onChange, chargement }: { series: SerieIllustrations[]; valeur: number | null; onChange: (id: number | null) => void; chargement: boolean }) {
  if (chargement) return <p className="mt-4 text-sm text-ink-2">Chargement des séries…</p>;
  if (!series.length) {
    return (
      <p className="mt-4 rounded-md bg-warn-bg p-3 text-sm text-warn-ink">
        Aucune série dans la bibliothèque :{" "}
        <Link href="/parametres?rubrique=illustrations" className="font-medium underline">créez-en une dans Paramètres</Link>.
      </p>
    );
  }
  return (
    <div className="mt-4">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Série de la bibliothèque">
        {series.map((s) => {
          const actif = valeur === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                role="radio"
                aria-checked={actif}
                onClick={() => onChange(s.id)}
                className={`w-full rounded-lg border p-2 text-left transition ${actif ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line hover:border-line-strong"}`}
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
                <span className={`block text-sm font-semibold ${actif ? "text-accent" : "text-ink"}`}>{s.nom}</span>
                <span className="block text-xs text-ink-2">
                  {s.nbImages} photo{s.nbImages > 1 ? "s" : ""}
                  {!s.actif && " · retirée des choix"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">
        Copiée dans l&apos;événement à sa création (la borne fonctionne hors ligne).{" "}
        <Link href="/parametres?rubrique=illustrations" className="text-accent hover:underline">Gérer les séries</Link>
      </p>
    </div>
  );
}

function Galerie({ cible, apiEvenement, enregistre }: { cible: IllustrationEvenement["cible"]; apiEvenement: string; enregistre: boolean }) {
  if (!enregistre) return <p className="mt-4 rounded-md bg-surface-2 p-3 text-sm text-ink-2">Enregistrez d&apos;abord l&apos;événement pour y ajouter des photos.</p>;
  return (
    <GaleriePhotos
      cle={["illustrations-evenement", apiEvenement]}
      lire={() => api<IllustrationEvenement[]>(`${apiEvenement}/illustrations`).then((l) => l.filter((p) => p.cible === cible))}
      ajouter={(image) => api(`${apiEvenement}/illustrations`, { method: "POST", json: { cible, image } })}
      retirer={(id) => api(`${apiEvenement}/illustrations/${id}`, { method: "DELETE" })}
      vide="Aucune photo pour l'instant : la borne prendra la série festive."
    />
  );
}

/** Image → JPEG d'au plus 1600 px de côté (l'API la réduit ensuite à 1200 px) : une photo de téléphone passe. */
async function reduire(fichier: File): Promise<string> {
  const bitmap = await createImageBitmap(fichier);
  const echelle = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * echelle);
  canvas.height = Math.round(bitmap.height * echelle);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Galerie de photos d'exemple : vignettes avec leur forme, ajout de plusieurs photos, retrait. Sert aux
 * photos d'un événement et aux séries de la bibliothèque (Paramètres).
 */
export function GaleriePhotos({ cle, lire, ajouter, retirer, vide, apresChangement }: {
  cle: unknown[];
  lire: () => Promise<{ id: number; forme: Forme; vignette: string }[]>;
  ajouter: (image: string) => Promise<unknown>;
  retirer: (id: number) => Promise<unknown>;
  vide: string;
  apresChangement?: () => void;
}) {
  const client = useQueryClient();
  const liste = useQuery({ queryKey: cle, queryFn: lire });
  const fichiers = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState<{ fait: number; total: number } | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);
  const actualiser = () => {
    client.invalidateQueries({ queryKey: cle });
    apresChangement?.();
  };
  const retrait = useMutation({ mutationFn: retirer, onSuccess: actualiser });

  const photos = liste.data ?? [];
  const place = MAX_PAR_SERIE - photos.length;
  const parForme = (f: Forme) => photos.filter((p) => p.forme === f).length;

  const envoyer = async (choisis: FileList | null) => {
    const a = [...(choisis ?? [])].slice(0, place);
    if (!a.length) return;
    setErreur(null);
    setEnvoi({ fait: 0, total: a.length });
    try {
      for (const [n, f] of a.entries()) {
        await ajouter(await reduire(f));
        setEnvoi({ fait: n + 1, total: a.length });
      }
    } catch (e) {
      setErreur(e);
    } finally {
      setEnvoi(null);
      if (fichiers.current) fichiers.current.value = "";
      actualiser();
    }
  };

  return (
    <div className="mt-4 rounded-lg bg-surface-2 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold tabular">{photos.length} / {MAX_PAR_SERIE}</span>
          <span className="text-ink-2"> · {parForme("carre")} carrée{parForme("carre") > 1 ? "s" : ""} · {parForme("paysage")} paysage · {parForme("portrait")} portrait</span>
        </p>
        <button type="button" className="bouton-second" disabled={place <= 0 || envoi !== null} onClick={() => fichiers.current?.click()}>
          {envoi ? `Envoi ${envoi.fait} / ${envoi.total}…` : "+ Ajouter des photos"}
        </button>
        <input ref={fichiers} type="file" accept="image/jpeg,image/png,image/webp,image/bmp" multiple hidden onChange={(e) => envoyer(e.target.files)} />
      </div>
      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {photos.map((p) => (
            <li key={p.id} className="group relative overflow-hidden rounded-md border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.vignette} alt="" className="aspect-square w-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1.5 py-0.5 text-[0.65rem] font-medium text-white">{FORMES[p.forme]}</span>
              <button
                type="button"
                aria-label="Retirer cette photo"
                disabled={retrait.isPending}
                onClick={() => retrait.mutate(p.id)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface/90 text-xs text-ink shadow opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">{liste.isLoading ? "Chargement…" : vide}</p>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        6 à 20 photos, sujet bien au centre (la borne recadre sans déformer). Des carrées et des paysage couvrent la plupart des cadres. Personnes visibles : droit à l&apos;image à obtenir.
      </p>
      {photos.length > 0 && parForme("carre") === 0 && <p className="mt-1"><Badge ton="warn">Aucune photo carrée : le pola et la planche prendront les autres, recadrées</Badge></p>}
      {(erreur !== null || retrait.error || liste.error) && <div className="mt-3"><Erreur erreur={erreur ?? retrait.error ?? liste.error} /></div>}
    </div>
  );
}
