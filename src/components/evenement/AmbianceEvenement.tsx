"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type IllustrationEvenement, type ReglagesEvenement, type SerieIllustrations } from "@/lib/api";
import type { RemplissagePhotos } from "../IllustrationGabarit";
import { Erreur } from "../Etat";
import { MAX_PAR_SERIE, reduire } from "../IllustrationsEvenement";
import { BoutonChanger, Ligne, Panneau, Pastille } from "./Blocs";
import { libelleTon, TONS, type Ton } from "./tons";

// Bloc « 3 · Ambiance et style » de la page d'un événement (maquettes du 10/11/2026, captures 07 à 11) : quatre
// lignes repliées avec « Changer ». Le ton se choisit en comparant les quatre cartes ; les photos
// d'illustration ont six sources, dont les photos du client (sur le lieu, reprises par tous ses événements).

type Lieu = ReglagesEvenement["lieu"];
type Forme = IllustrationEvenement["forme"];
type PhotoVignette = { id: number; forme: Forme; vignette: string };

const THEMES: Record<ReglagesEvenement["theme"], string> = { nightlife: "Nightlife" };
const FORMES: Record<Forme, string> = { carre: "carré", portrait: "portrait", paysage: "paysage" };
const DEGRADES: Record<"festif" | "chic", string[]> = {
  festif: ["from-pink-500 to-orange-400", "from-pink-400 to-orange-300", "from-pink-300 to-orange-200"],
  chic: ["from-slate-700 to-amber-200", "from-slate-500 to-amber-200", "from-slate-400 to-amber-100"],
};
type Source = "logiciel" | "serie" | "client" | "photos" | "camera" | "aucune";
const SOURCES: { cle: Source; libelle: string }[] = [
  { cle: "logiciel", libelle: "Série du logiciel" },
  { cle: "serie", libelle: "Notre bibliothèque" },
  { cle: "client", libelle: "Photos du client" },
  { cle: "photos", libelle: "Photos de l'événement" },
  { cle: "camera", libelle: "Caméra en direct" },
  { cle: "aucune", libelle: "Aucune" },
];
const sourceDe = (i: Lieu["illustrations"]): Source => (i === "festif" || i === "chic" ? "logiciel" : i);

/**
 * Les photos d'illustration choisies : libellé, trois vignettes et remplissage de l'aperçu de la borne. Partagé
 * entre la ligne du bloc et l'aperçu du sommaire (mêmes requêtes, mises en cache).
 */
export function useIllustrations({ lieu, apiEvenement, lieuId, enregistre }: { lieu: Lieu; apiEvenement: string; lieuId: number; enregistre: boolean }) {
  const series = useQuery({ queryKey: ["illustrations-series"], queryFn: () => api<SerieIllustrations[]>("/illustrations-series") });
  const photos = useQuery({
    queryKey: ["illustrations-evenement", apiEvenement],
    queryFn: () => api<IllustrationEvenement[]>(`${apiEvenement}/illustrations`),
    enabled: enregistre,
  });
  const client = useQuery({ queryKey: ["illustrations-client", lieuId], queryFn: () => api<PhotoVignette[]>(`/lieux/${lieuId}/illustrations-client`) });
  const serie = (series.data ?? []).find((s) => s.id === lieu.illustrationsSerieId);
  const photosCadres = (photos.data ?? []).filter((p) => p.cible === "cadres");
  const i = lieu.illustrations;
  const vignettes = i === "photos" ? photosCadres.map((p) => p.vignette) : i === "client" ? (client.data ?? []).map((p) => p.vignette) : i === "serie" ? serie?.apercus ?? [] : [];
  const nb = i === "photos" ? photosCadres.length : i === "client" ? client.data?.length ?? 0 : i === "serie" ? serie?.nbImages ?? 0 : null;
  const libelle =
    i === "festif" ? "Série du logiciel · Festive"
    : i === "chic" ? "Série du logiciel · Chic"
    : i === "serie" ? `Notre bibliothèque${serie ? ` · ${serie.nom}` : " · série à choisir"}`
    : i === "client" ? "Photos du client"
    : i === "photos" ? "Photos de l'événement"
    : i === "camera" ? "Caméra en direct"
    : "Aucune, cases unies";
  const remplissage: RemplissagePhotos =
    i === "camera" ? { mode: "camera" } : i === "aucune" ? { mode: "unie" } : vignettes.length ? { mode: "photos", sources: vignettes } : { mode: "silhouette" };
  return { series, photos, client, serie, vignettes, nb, libelle, remplissage };
}

/** Trois vignettes de la source choisie (ou les couleurs d'une série du logiciel). */
function Vignettes({ illustrations, sources }: { illustrations: Lieu["illustrations"]; sources: string[] }) {
  if (illustrations === "camera" || illustrations === "aucune") return null;
  return (
    <span className="flex gap-1.5" aria-hidden>
      {[0, 1, 2].map((k) =>
        sources[k] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={k} src={sources[k]} alt="" className="size-14 rounded-lg object-cover" />
        ) : (
          <span key={k} className={`size-14 rounded-lg bg-gradient-to-br ${DEGRADES[illustrations === "chic" ? "chic" : "festif"][k]}`} />
        ),
      )}
    </span>
  );
}

export function AmbianceEvenement({ r, setR, apiEvenement, lieuId, enseigne, enregistre }: {
  r: ReglagesEvenement;
  setR: (f: (r: ReglagesEvenement) => ReglagesEvenement) => void;
  apiEvenement: string;
  lieuId: number;
  enseigne: string;
  enregistre: boolean;
}) {
  const lieu = r.lieu;
  const majLieu = (p: Partial<Lieu>) => setR((x) => ({ ...x, lieu: { ...x.lieu, ...p } }));
  const [ouvert, setOuvert] = useState<"theme" | "ton" | "photos" | "accueil" | null>(lieu.illustrations === "serie" && !lieu.illustrationsSerieId ? "photos" : null);
  const basculer = (l: NonNullable<typeof ouvert>) => setOuvert(ouvert === l ? null : l);
  const ill = useIllustrations({ lieu, apiEvenement, lieuId, enregistre });
  const source = sourceDe(lieu.illustrations);
  const proposees = (ill.series.data ?? []).filter((s) => s.actif || s.id === lieu.illustrationsSerieId || s.id === lieu.illustrationsAccueilSerieId);

  const choisirSource = (s: Source) => {
    if (s === source) return;
    if (s === "logiciel") majLieu({ illustrations: "festif" });
    else if (s === "serie") majLieu({ illustrations: "serie", illustrationsSerieId: lieu.illustrationsSerieId ?? proposees.find((x) => x.actif)?.id ?? null });
    else majLieu({ illustrations: s });
  };

  const libelleAccueil: Record<Lieu["illustrationsAccueil"], string> = {
    memes: "Même série que les cadres",
    festif: "Série du logiciel · Festive",
    chic: "Série du logiciel · Chic",
    serie: `Notre bibliothèque · ${proposees.find((s) => s.id === lieu.illustrationsAccueilSerieId)?.nom ?? "série à choisir"}`,
    client: "Photos du client",
    photos: "Photos dédiées à l'accueil",
  };
  const avecAccueil = lieu.illustrations !== "camera" && lieu.illustrations !== "aucune";

  return (
    <div>
      <Ligne
        libelle="Thème"
        valeur={THEMES[r.theme]}
        action={<BoutonChanger ouvert={ouvert === "theme"} onClick={() => basculer("theme")} />}
        detail={
          ouvert === "theme" && (
            <div role="radiogroup" aria-label="Thème de la borne" className="flex flex-wrap items-center gap-2">
              {Object.entries(THEMES).map(([v, t]) => (
                <Pastille key={v} actif={r.theme === v} onClick={() => setR((x) => ({ ...x, theme: v as ReglagesEvenement["theme"] }))}>{t}</Pastille>
              ))}
              <span className="text-xs text-ink-muted">D&apos;autres thèmes (Halloween, personnalisés) viendront quand la borne saura les afficher.</span>
            </div>
          )
        }
      />

      <Ligne
        libelle="Ton des textes"
        valeur={libelleTon(lieu.ton)}
        action={<BoutonChanger ouvert={ouvert === "ton"} onClick={() => basculer("ton")} />}
        detail={ouvert === "ton" && <ChoixTon ton={lieu.ton} onChange={(ton) => majLieu({ ton })} />}
      />

      <Ligne
        libelle="Photos d'illustration"
        valeur={
          <span className="flex flex-wrap items-center gap-3">
            <Vignettes illustrations={lieu.illustrations} sources={ill.vignettes} />
            <span>
              {ill.libelle}
              {ill.nb !== null && <span className="font-normal text-ink-muted"> · {ill.nb} photo{ill.nb > 1 ? "s" : ""}</span>}
            </span>
          </span>
        }
        action={<BoutonChanger ouvert={ouvert === "photos"} onClick={() => basculer("photos")} />}
        detail={
          ouvert === "photos" && (
            <div className="space-y-3">
              <div role="radiogroup" aria-label="Source des photos d'illustration" className="flex flex-wrap gap-2">
                {SOURCES.map((s) => (
                  <Pastille key={s.cle} actif={source === s.cle} onClick={() => choisirSource(s.cle)}>{s.libelle}</Pastille>
                ))}
              </div>
              {source === "logiciel" && (
                <Panneau titre="Choisir une série du logiciel">
                  <div role="radiogroup" aria-label="Série du logiciel" className="flex flex-wrap gap-3">
                    {(["festif", "chic"] as const).map((v) => (
                      <CarteSerie key={v} actif={lieu.illustrations === v} nom={v === "festif" ? "Festive" : "Chic"} detail="dans la borne" onClick={() => majLieu({ illustrations: v })}>
                        {DEGRADES[v].map((d) => <span key={d} className={`size-12 rounded-md bg-gradient-to-br ${d}`} />)}
                      </CarteSerie>
                    ))}
                  </div>
                </Panneau>
              )}
              {source === "serie" && (
                <Panneau
                  titre="Choisir une série de la bibliothèque"
                  droite={<Link href="/parametres?rubrique=illustrations" className="text-sm font-semibold text-accent hover:underline">Gérer la bibliothèque →</Link>}
                >
                  {ill.series.isLoading ? (
                    <p className="text-sm text-ink-2">Chargement des séries…</p>
                  ) : proposees.length ? (
                    <div role="radiogroup" aria-label="Série de la bibliothèque" className="flex flex-wrap gap-3">
                      {proposees.map((s) => (
                        <CarteSerie key={s.id} actif={lieu.illustrationsSerieId === s.id} nom={s.nom} detail={`${s.nbImages} photo${s.nbImages > 1 ? "s" : ""}`} onClick={() => majLieu({ illustrationsSerieId: s.id })}>
                          {[0, 1, 2].map((k) =>
                            s.apercus[k] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={k} src={s.apercus[k]} alt="" className="size-12 rounded-md object-cover" />
                            ) : (
                              <span key={k} className="size-12 rounded-md bg-line" />
                            ),
                          )}
                        </CarteSerie>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-warn-ink">Aucune série dans la bibliothèque pour l&apos;instant.</p>
                  )}
                </Panneau>
              )}
              {source === "client" && (
                <GrillePhotos
                  titre={`Photos d'${enseigne}`}
                  droite={<span className="text-sm text-ink-muted">reprises par tous les événements du lieu</span>}
                  cle={["illustrations-client", lieuId]}
                  lire={() => api<PhotoVignette[]>(`/lieux/${lieuId}/illustrations-client`)}
                  ajouter={(image) => api(`/lieux/${lieuId}/illustrations-client`, { method: "POST", json: { image } })}
                  retirer={(id) => api(`/lieux/${lieuId}/illustrations-client/${id}`, { method: "DELETE" })}
                />
              )}
              {source === "photos" &&
                (enregistre ? (
                  <PhotosEvenement apiEvenement={apiEvenement} lieuId={lieuId} cible="cadres" titre="Photos de cet événement" />
                ) : (
                  <Panneau><p className="text-sm text-ink-2">Enregistrez d&apos;abord l&apos;événement pour y ajouter des photos.</p></Panneau>
                ))}
              {source === "camera" && <p className="text-sm text-ink-2">L&apos;image de la caméra en direct dans les cases des cadres.</p>}
              {source === "aucune" && <p className="text-sm text-ink-2">Cases unies, sans photo.</p>}
            </div>
          )
        }
      />

      {avecAccueil && (
        <Ligne
          libelle="Cadres de l'accueil"
          valeur={libelleAccueil[lieu.illustrationsAccueil]}
          action={<BoutonChanger ouvert={ouvert === "accueil"} onClick={() => basculer("accueil")} />}
          detail={
            ouvert === "accueil" && (
              <div className="space-y-3">
                <div role="radiogroup" aria-label="Photos des cadres de l'accueil" className="flex flex-wrap gap-2">
                  {(["memes", "festif", "chic", "client", "photos"] as const).map((v) => (
                    <Pastille key={v} actif={lieu.illustrationsAccueil === v} onClick={() => majLieu({ illustrationsAccueil: v })}>
                      {v === "photos" ? "Photos dédiées" : libelleAccueil[v]}
                    </Pastille>
                  ))}
                  {proposees.map((s) => (
                    <Pastille
                      key={s.id}
                      actif={lieu.illustrationsAccueil === "serie" && lieu.illustrationsAccueilSerieId === s.id}
                      onClick={() => majLieu({ illustrationsAccueil: "serie", illustrationsAccueilSerieId: s.id })}
                    >
                      Bibliothèque · {s.nom}
                    </Pastille>
                  ))}
                </div>
                <p className="text-xs text-ink-muted">Une autre série pour montrer d&apos;autres têtes sur l&apos;accueil que sur la page de choix.</p>
                {lieu.illustrationsAccueil === "photos" &&
                  (enregistre ? (
                    <PhotosEvenement apiEvenement={apiEvenement} lieuId={lieuId} cible="accueil" titre="Photos de l'accueil" />
                  ) : (
                    <Panneau><p className="text-sm text-ink-2">Enregistrez d&apos;abord l&apos;événement pour y ajouter des photos.</p></Panneau>
                  ))}
              </div>
            )
          }
        />
      )}
    </div>
  );
}

/** Les quatre tons côte à côte, pour comparer avant de choisir ; dessous, toutes les phrases du ton choisi. */
function ChoixTon({ ton, onChange }: { ton: Ton; onChange: (t: Ton) => void }) {
  const t = TONS[ton];
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Ton des textes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(TONS) as Ton[]).map((cle) => {
          const x = TONS[cle];
          const actif = cle === ton;
          return (
            <button
              key={cle}
              type="button"
              role="radio"
              aria-checked={actif}
              onClick={() => onChange(cle)}
              className={`flex flex-col rounded-xl border p-3 text-left transition ${actif ? "border-2 border-accent" : "border-line hover:border-line-strong"}`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{x.nom}</span>
                <span className={`text-xs font-semibold ${actif ? "text-ok-ink" : "text-accent"}`}>{actif ? "✓ Utilisé" : "Choisir"}</span>
              </span>
              <span className="mt-1 text-xs text-ink-muted">{x.lieux}</span>
              <span className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
                {x.exemples.map((p) => <span key={p} className="block">« {p} »</span>)}
              </span>
              <span className="mt-3 border-t border-line pt-2 text-xs text-ink-muted">+1 : « {x.exemplePlusUn} »</span>
            </button>
          );
        })}
      </div>
      <p className="text-sm font-semibold">Toutes les phrases du ton choisi</p>
      <Panneau>
        <p className="mb-2 text-xs font-semibold tracking-wider text-ink-2 uppercase">Consignes de pose, avant la photo</p>
        <ul className="mb-4 flex flex-wrap gap-2">
          {t.poses.map((p) => <li key={p} className="rounded-full border border-line bg-surface px-3 py-1 text-sm">{p}</li>)}
        </ul>
        <p className="mb-2 text-xs font-semibold tracking-wider text-ink-2 uppercase">Phrases du « +1 pour un pote »</p>
        <ul className="flex flex-wrap gap-2">
          {t.plusUn.map((p) => <li key={p} className="rounded-full border border-line bg-surface px-3 py-1 text-sm">{p}</li>)}
        </ul>
      </Panneau>
      <p className="text-xs text-ink-muted">La borne tire une phrase au hasard dans la liste à chaque pose.</p>
    </div>
  );
}

function CarteSerie({ actif, nom, detail, onClick, children }: { actif: boolean; nom: string; detail: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={actif}
      onClick={onClick}
      className={`rounded-xl border bg-surface p-2.5 text-left transition ${actif ? "border-2 border-accent" : "border-line hover:border-line-strong"}`}
    >
      <span className="flex gap-1.5" aria-hidden>{children}</span>
      <span className="mt-2 flex items-baseline justify-between gap-4">
        <span className={`text-sm font-semibold ${actif ? "text-accent" : ""}`}>{nom}</span>
        <span className="text-xs text-ink-muted">{detail}</span>
      </span>
    </button>
  );
}

/** Photos de l'événement (cadres ou accueil), avec « Garder aussi pour le client » pour celles des cadres. */
function PhotosEvenement({ apiEvenement, lieuId, cible, titre }: { apiEvenement: string; lieuId: number; cible: IllustrationEvenement["cible"]; titre: string }) {
  const client = useQueryClient();
  const garder = useMutation({
    mutationFn: () => api<{ copiees: number; place: number }>(`${apiEvenement}/illustrations/garder-pour-client`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["illustrations-client", lieuId] }),
  });
  return (
    <GrillePhotos
      titre={titre}
      droite={
        cible === "cadres" && (
          <button
            type="button"
            className="text-sm font-semibold text-accent hover:underline disabled:opacity-50"
            disabled={garder.isPending}
            title="Copie ces photos dans celles du client : tous les événements du lieu pourront les reprendre"
            onClick={() => garder.mutate()}
          >
            {garder.isPending ? "Copie…" : garder.data ? `${garder.data.copiees} photo${garder.data.copiees > 1 ? "s" : ""} gardée${garder.data.copiees > 1 ? "s" : ""} pour le client` : "Garder aussi pour le client →"}
          </button>
        )
      }
      erreurEnPlus={garder.error}
      cle={["illustrations-evenement", apiEvenement]}
      lire={() => api<IllustrationEvenement[]>(`${apiEvenement}/illustrations`)}
      filtre={(p) => (p as IllustrationEvenement).cible === cible}
      ajouter={(image) => api(`${apiEvenement}/illustrations`, { method: "POST", json: { cible, image } })}
      retirer={(id) => api(`${apiEvenement}/illustrations/${id}`, { method: "DELETE" })}
    />
  );
}

/**
 * Grille de photos d'illustration : tuile « + Ajouter » (plusieurs photos d'un coup), vignettes avec leur format et
 * une croix pour retirer, avertissement quand un format manque.
 */
function GrillePhotos({ titre, droite, cle, lire, filtre, ajouter, retirer, erreurEnPlus }: {
  titre: string;
  droite?: ReactNode;
  cle: unknown[];
  lire: () => Promise<PhotoVignette[]>;
  filtre?: (p: PhotoVignette) => boolean;
  ajouter: (image: string) => Promise<unknown>;
  retirer: (id: number) => Promise<unknown>;
  erreurEnPlus?: unknown;
}) {
  const client = useQueryClient();
  const liste = useQuery({ queryKey: cle, queryFn: lire });
  const fichiers = useRef<HTMLInputElement>(null);
  const [envoi, setEnvoi] = useState<{ fait: number; total: number } | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);
  const actualiser = () => client.invalidateQueries({ queryKey: cle });
  const retrait = useMutation({ mutationFn: retirer, onSuccess: actualiser });
  const photos = (liste.data ?? []).filter(filtre ?? (() => true));
  const place = MAX_PAR_SERIE - photos.length;
  const manquent = (["carre", "portrait", "paysage"] as Forme[]).filter((f) => !photos.some((p) => p.forme === f));

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
    <Panneau titre={`${titre} · ${photos.length}`} droite={droite}>
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
        <li>
          <button
            type="button"
            disabled={place <= 0 || envoi !== null}
            onClick={() => fichiers.current?.click()}
            className="flex aspect-[3/2] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-line-strong bg-surface text-sm font-semibold text-accent hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden className="text-lg leading-none">+</span>
            {envoi ? `${envoi.fait} / ${envoi.total}…` : "Ajouter"}
          </button>
          <input ref={fichiers} type="file" accept="image/jpeg,image/png,image/webp,image/bmp" multiple hidden onChange={(e) => envoyer(e.target.files)} />
        </li>
        {photos.map((p) => (
          <li key={p.id} className="relative overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.vignette} alt="" className="aspect-[3/2] w-full object-cover" />
            <span className="absolute bottom-1.5 left-1.5 rounded bg-ink/80 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">{FORMES[p.forme]}</span>
            <button
              type="button"
              aria-label="Retirer cette photo"
              disabled={retrait.isPending}
              onClick={() => retrait.mutate(p.id)}
              className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-surface text-[0.6rem] text-ink shadow hover:bg-crit-bg"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {photos.length > 0 &&
        manquent.map((f) => (
          <p key={f} className="mt-2 text-sm text-warn-ink">
            Aucune photo {FORMES[f]} : les cases {FORMES[f]} prennent la série du logiciel.
          </p>
        ))}
      {photos.length === 0 && !liste.isLoading && <p className="mt-2 text-sm text-ink-2">Aucune photo pour l&apos;instant : la borne prendra la série festive.</p>}
      {(erreur !== null || retrait.error || liste.error || erreurEnPlus) ? (
        <div className="mt-3"><Erreur erreur={erreur ?? retrait.error ?? liste.error ?? erreurEnPlus} /></div>
      ) : null}
    </Panneau>
  );
}
