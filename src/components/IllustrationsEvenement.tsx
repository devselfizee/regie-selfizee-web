"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type GabaritEvenement, type IllustrationEvenement, type ReglagesEvenement, type SerieIllustrations } from "@/lib/api";
import { IllustrationGabarit, type RemplissagePhotos } from "./IllustrationGabarit";
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

const LIBELLES_CADRES: Record<Lieu["illustrations"], string> = {
  festif: "série festive",
  chic: "série chic",
  serie: "série de la bibliothèque",
  photos: "nos photos",
  camera: "caméra en direct",
  aucune: "aucune (cases unies)",
};
const LIBELLES_ACCUEIL: Record<Lieu["illustrationsAccueil"], string> = {
  memes: "les mêmes",
  festif: "série festive",
  chic: "série chic",
  serie: "série de la bibliothèque",
  photos: "photos dédiées",
};
// Thèmes de l'interface de la borne (uiKit) : les autres viendront quand la borne saura les afficher
const THEMES: Record<ReglagesEvenement["theme"], string> = { nightlife: "Nightlife" };

/**
 * Thème de la borne et photos d'exemple des cadres. Replié par défaut sur un résumé (le plus souvent, on
 * garde la série festive) ; l'aperçu de la page « Choisis ton format » reste visible et suit les choix.
 * Le choix se règle avec la fiche (barre « Enregistrer ») ; les photos de l'événement, elles, s'envoient
 * tout de suite à l'API, une fois l'événement enregistré.
 */
export function IllustrationsEvenement({ lieu, majLieu, theme, majTheme, gabarits, apiEvenement, enregistre }: {
  lieu: Lieu;
  majLieu: (p: Partial<Lieu>) => void;
  theme: ReglagesEvenement["theme"];
  majTheme: (t: ReglagesEvenement["theme"]) => void;
  /** Formats de l'événement, dans l'ordre de l'écran de choix : les trois premiers font l'aperçu */
  gabarits: GabaritEvenement[];
  apiEvenement: string;
  enregistre: boolean;
}) {
  // Ouvert d'office si le réglage est incomplet (série à désigner)
  const [ouvert, setOuvert] = useState(lieu.illustrations === "serie" && !lieu.illustrationsSerieId);
  const series = useQuery({ queryKey: ["illustrations-series"], queryFn: () => api<SerieIllustrations[]>("/illustrations-series") });
  const photos = useQuery({
    queryKey: ["illustrations-evenement", apiEvenement],
    queryFn: () => api<IllustrationEvenement[]>(`${apiEvenement}/illustrations`),
    enabled: enregistre && lieu.illustrations === "photos",
  });
  // Les séries retirées des choix restent affichées si l'événement les utilise déjà
  const proposees = (series.data ?? []).filter((s) => s.actif || s.id === lieu.illustrationsSerieId || s.id === lieu.illustrationsAccueilSerieId);
  const valeurAccueil = lieu.illustrationsAccueil === "serie" ? `serie:${lieu.illustrationsAccueilSerieId ?? ""}` : lieu.illustrationsAccueil;
  const nomSerie = (id: number | null) => (series.data ?? []).find((s) => s.id === id)?.nom;

  const libelleCadres = lieu.illustrations === "serie" && nomSerie(lieu.illustrationsSerieId) ? `série « ${nomSerie(lieu.illustrationsSerieId)} »` : LIBELLES_CADRES[lieu.illustrations];
  const libelleAccueil =
    lieu.illustrationsAccueil === "serie" && nomSerie(lieu.illustrationsAccueilSerieId) ? `série « ${nomSerie(lieu.illustrationsAccueilSerieId)} »` : LIBELLES_ACCUEIL[lieu.illustrationsAccueil];

  // Aperçu : les vraies photos quand la Régie les a (nos photos, série de la bibliothèque), des silhouettes
  // pour les séries du logiciel (leurs photos sont dans la borne)
  const sources =
    lieu.illustrations === "photos"
      ? (photos.data ?? []).filter((p) => p.cible === "cadres").map((p) => p.vignette)
      : lieu.illustrations === "serie"
        ? ((series.data ?? []).find((s) => s.id === lieu.illustrationsSerieId)?.apercus ?? [])
        : [];
  const remplissage: RemplissagePhotos =
    lieu.illustrations === "camera" ? { mode: "camera" } : lieu.illustrations === "aucune" ? { mode: "unie" } : sources.length ? { mode: "photos", sources } : { mode: "silhouette" };
  const legende =
    lieu.illustrations === "festif" || lieu.illustrations === "chic"
      ? `Aperçu indicatif : sur la borne, les photos de la ${LIBELLES_CADRES[lieu.illustrations]} du logiciel.`
      : (lieu.illustrations === "photos" || lieu.illustrations === "serie") && !sources.length
        ? "Pas encore de photo : la borne prendra la série festive."
        : "Aperçu de la page « Choisis ton format » de la borne.";

  return (
    <Section
      titre="Thème et photos d'exemple"
      actions={
        <button type="button" className="bouton-second" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
          {ouvert ? "Replier" : "Modifier"}
        </button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          {!ouvert ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-ink-2">Thème de la borne</dt>
              <dd>{THEMES[theme]}</dd>
              <dt className="text-ink-2">Photos des cadres</dt>
              <dd className="first-letter:uppercase">{libelleCadres}</dd>
              {lieu.illustrations !== "aucune" && lieu.illustrations !== "camera" && (
                <>
                  <dt className="text-ink-2">Cadres de l&apos;accueil</dt>
                  <dd className="first-letter:uppercase">{libelleAccueil}</dd>
                </>
              )}
              <dd className="col-span-2 mt-2 text-xs text-ink-muted">
                Photos d&apos;exemple dans les cases des cadres (page « Choisis ton format » et accueil), tirées au sort par la borne pour donner envie.
              </dd>
            </dl>
          ) : (
            <>
              <label className="mb-4 block max-w-xs">
                <span className="etiquette">Thème de la borne</span>
                <select className="champ" value={theme} onChange={(e) => majTheme(e.target.value as ReglagesEvenement["theme"])}>
                  {Object.entries(THEMES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                <span className="mt-1 block text-xs text-ink-muted">D&apos;autres thèmes (Halloween, personnalisés) viendront.</span>
              </label>
              <p className="mb-2 text-sm text-ink-2">
                Photos d&apos;exemple dans les cases des cadres (page « Choisis ton format » et cadres de l&apos;accueil), tirées au sort par la borne pour donner envie.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Photos d'exemple des cadres">
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
            </>
          )}
        </div>
        <ApercuChoixFormat gabarits={gabarits} remplissage={remplissage} legende={legende} />
      </div>
    </Section>
  );
}

/** La page « Choisis ton format » de la borne en miniature : les trois premiers formats, cases remplies. */
function ApercuChoixFormat({ gabarits, remplissage, legende }: { gabarits: GabaritEvenement[]; remplissage: RemplissagePhotos; legende: string }) {
  const montres = (gabarits.length ? gabarits : (["bandelette", "pola", "planche"] as GabaritEvenement[])).slice(0, 3);
  return (
    <figure className="self-start">
      <div className="rounded-lg bg-gradient-to-b from-[#3b0b58] to-[#5a1870] p-3 shadow-inner" aria-hidden>
        <p className="mb-2 text-center text-xs font-black tracking-wider text-[#ffe14d] [text-shadow:0_1px_0_#e11d74]">CHOISIS TON FORMAT</p>
        <div className="flex h-32 items-center justify-center gap-2">
          {montres.map((g, i) => (
            <IllustrationGabarit key={`${g}-${i}`} gabarit={g} remplissage={remplissage} className="h-full max-w-[32%]" />
          ))}
        </div>
      </div>
      <figcaption className="mt-1.5 text-xs text-ink-muted">{legende}</figcaption>
    </figure>
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
