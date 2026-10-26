"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PREVIEW_BG,
  fetchPersonnesGrouped,
  fetchBackgrounds,
  uploadBackground,
  fetchEventType,
  filterThemesForEvent,
  type PersonGroup,
  type BackgroundItem,
} from "./previewConstants";
import type { PreviewSettings } from "./usePreviewMode";

/** Lit un fichier image en data URL (base64) pour l'upload. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}

interface Props {
  shootCount: number;
  linkAll: boolean;
  setLinkAll: (v: boolean) => void;
  settings: PreviewSettings;
  activeShootIndex: number | null;
  setActiveShootIndex: (idx: number | null) => void;
  updateSetting: (index: number, patch: Partial<{ personUrl?: string; bgColor?: string; bgImageUrl?: string; personScale?: number }>) => void;
  resetPreview: () => void;
  onExit: () => void;
  onDownload: () => void;
}

export function PreviewPanel({
  shootCount, linkAll, setLinkAll,
  settings, activeShootIndex, setActiveShootIndex,
  updateSetting, resetPreview, onExit, onDownload,
}: Props) {
  const effectiveIndex = linkAll ? 0 : (activeShootIndex ?? 0);
  const current = settings[effectiveIndex] || {};

  const [groups, setGroups] = useState<PersonGroup[]>([]);
  const [loadingPersons, setLoadingPersons] = useState(true);
  const [personsError, setPersonsError] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);
  // URL currently being decoded for the canvas. Used to overlay a spinner
  // on the clicked thumbnail until the (full-resolution) image finishes
  // loading — otherwise the user has no signal that their click registered.
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  // Background tab: "color" picks a solid colour, "image" picks from the
  // fonds-verts library. Auto-flips to "image" if the current entry has a
  // bgImageUrl set so the panel reflects what's actually on the canvas.
  const [bgMode, setBgMode] = useState<"color" | "image">("color");
  const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>([]);
  const [loadingBackgrounds, setLoadingBackgrounds] = useState(false);
  const [backgroundsError, setBackgroundsError] = useState<string | null>(null);

  // Type d'événement (mariage, anniversaire…) lu depuis l'uuid de l'URL, pour
  // filtrer les thèmes proposés (retour boss p.11 : pas de « Diplôme » pour un
  // mariage). Silencieux si absent → aucun filtre. On lit window.location
  // (client-only) plutôt que useSearchParams pour éviter toute contrainte de
  // frontière Suspense selon le point de montage de l'éditeur.
  const [eventType, setEventType] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const uuid = new URLSearchParams(window.location.search).get("uuid");
    if (!uuid) return;
    let cancelled = false;
    fetchEventType(uuid).then((t) => { if (!cancelled) setEventType(t); });
    return () => { cancelled = true; };
  }, []);
  const displayGroups = useMemo(() => filterThemesForEvent(groups, eventType), [groups, eventType]);

  function pickPerson(url: string) {
    updateSetting(effectiveIndex, { personUrl: url });
    setLoadingUrl(url);
    const img = new Image();
    img.crossOrigin = "anonymous";
    const clear = () => setLoadingUrl((cur) => (cur === url ? null : cur));
    img.onload = clear;
    img.onerror = clear;
    img.src = url;
  }

  useEffect(() => {
    let cancelled = false;
    setLoadingPersons(true);
    fetchPersonnesGrouped()
      .then((list) => {
        if (cancelled) return;
        setGroups(list);
        setPersonsError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("Failed to load personnes from API:", err);
        setGroups([]);
        setPersonsError("Impossible de charger la liste de personnes");
      })
      .finally(() => {
        if (!cancelled) setLoadingPersons(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Lazy-load the fonds-verts gallery the first time the user opens the
  // image tab. Cached across PreviewPanel mounts via previewConstants.
  //
  // The attempt flag lives in a ref (not state) so updating it from inside
  // the effect doesn't re-trigger the effect — that re-trigger was
  // cancelling the in-flight fetch and bypassing setBackgrounds, which
  // is why the gallery stayed stuck on the skeleton despite the network
  // request resolving with the right items (resolved_items=1 in console).
  const bgFetchAttemptedRef = useRef(false);
  const [retryToken, setRetryToken] = useState(0);
  const [brokenBgUrls, setBrokenBgUrls] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (bgMode !== "image") return;
    if (bgFetchAttemptedRef.current) return;
    bgFetchAttemptedRef.current = true;
    setLoadingBackgrounds(true);
    fetchBackgrounds("fonds-verts")
      .then((list) => {
        setBackgrounds(list);
        setBackgroundsError(null);
      })
      .catch((err: unknown) => {
        console.error("Failed to load backgrounds:", err);
        setBackgrounds([]);
        setBackgroundsError("Impossible de charger les fonds");
      })
      .finally(() => {
        setLoadingBackgrounds(false);
      });
  // retryToken intentionally in deps so retryBackgrounds() can refire.
  }, [bgMode, retryToken]);

  // Manual retry — called by the "Réessayer" button shown on error.
  function retryBackgrounds() {
    bgFetchAttemptedRef.current = false;
    setBackgroundsError(null);
    setBackgrounds([]);
    setRetryToken((t) => t + 1);
  }

  // Upload d'un fond vert lié au compte client, puis refresh de la liste.
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadBgError, setUploadBgError] = useState<string | null>(null);

  async function onBgFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de re-choisir le même fichier
    if (!file) return;
    setUploadBgError(null);
    setUploadingBg(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      await uploadBackground({ imageDataUrl: dataUrl, name: file.name });
      retryBackgrounds(); // recharge la liste (cache invalidé côté helper)
    } catch (err) {
      setUploadBgError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setUploadingBg(false);
    }
  }

  // Keep the tab in sync with the current entry — if the user navigates
  // between shoots and the active one has an image bg, flip the tab to
  // match what's on the canvas.
  useEffect(() => {
    if (current.bgImageUrl) setBgMode("image");
    else if (current.bgColor && !current.bgImageUrl) setBgMode((m) => (m === "image" ? "color" : m));
  }, [current.bgImageUrl, current.bgColor]);

  function pickBackground(url: string) {
    // Image and colour are mutually exclusive on the canvas — clearing
    // bgColor here keeps the panel state consistent with the rendering
    // (renderPreview already prefers bgImageUrl when both are set).
    updateSetting(effectiveIndex, { bgImageUrl: url, bgColor: undefined });
    setLoadingUrl(url);
    const img = new Image();
    img.crossOrigin = "anonymous";
    const clear = () => setLoadingUrl((cur) => (cur === url ? null : cur));
    img.onload = clear;
    img.onerror = clear;
    img.src = url;
  }

  const selectedTheme = selectedThemeId ? displayGroups.find((g) => g.id === selectedThemeId) : null;
  const PAGE_SIZE = 24;

  return (
    <aside className="w-[320px] bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Mode Aperçu</h3>
          <p className="text-xs text-gray-500">Simulez le rendu avec des personnes</p>
        </div>
        <button
          onClick={onExit}
          title="Quitter le mode aperçu"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Link all switch — only meaningful when there are multiple shoots */}
        {shootCount > 1 && (
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
            <div>
              <p className="text-xs font-semibold text-gray-700">Appliquer à tous les shoots</p>
              <p className="text-[10px] text-gray-500">{linkAll ? "Toutes les zones partagent les mêmes réglages" : "Chaque zone a ses propres réglages"}</p>
            </div>
            <button
              onClick={() => setLinkAll(!linkAll)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${linkAll ? "bg-[#4f46e5]" : "bg-gray-300"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${linkAll ? "translate-x-5" : "translate-x-1"}`} />
            </button>
          </div>
        )}

        {/* Shoot selector (when not linking all) */}
        {!linkAll && shootCount > 1 && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1.5">Zone active</p>
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: shootCount }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveShootIndex(i)}
                  className={`w-8 h-8 rounded-md border text-xs font-semibold ${
                    effectiveIndex === i
                      ? "bg-[#4f46e5] text-white border-[#4f46e5]"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >{i + 1}</button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1 leading-tight">Tu peux aussi cliquer un shoot sur le canvas.</p>
          </div>
        )}

        {/* BG: tabs (color / image) ─ image takes precedence over color on
            the canvas, see renderPreview in usePreviewMode. */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-gray-700">Fond du shoot</p>
            <div className="inline-flex bg-gray-100 rounded-md p-0.5 text-[11px] font-medium">
              <button
                onClick={() => setBgMode("color")}
                className={`px-2 py-0.5 rounded ${bgMode === "color" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}
              >Couleur</button>
              <button
                onClick={() => setBgMode("image")}
                className={`px-2 py-0.5 rounded ${bgMode === "image" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}
              >Image</button>
            </div>
          </div>

          {bgMode === "color" ? (
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={current.bgColor || DEFAULT_PREVIEW_BG}
                onChange={(e) => updateSetting(effectiveIndex, { bgColor: e.target.value, bgImageUrl: undefined })}
                className="w-8 h-8 rounded border border-gray-300 cursor-pointer bg-transparent p-0 shrink-0"
              />
              <input
                type="text"
                value={current.bgColor || ""}
                placeholder="#00ff00"
                onChange={(e) => updateSetting(effectiveIndex, { bgColor: e.target.value, bgImageUrl: undefined })}
                className="flex-1 min-w-0 text-xs px-2 py-1.5 border border-gray-300 rounded-md outline-none focus:border-[#4f46e5]"
              />
              {current.bgColor && (
                <button
                  onClick={() => updateSetting(effectiveIndex, { bgColor: undefined })}
                  title="Retirer le fond"
                  className="text-sm text-gray-400 hover:text-gray-700 px-1"
                >✕</button>
              )}
            </div>
          ) : (
            <div>
              {/* Upload d'un fond vert — lié au compte client, réutilisable. */}
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => bgFileInputRef.current?.click()}
                  disabled={uploadingBg}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 py-2 text-[12px] font-semibold text-gray-600 hover:border-[#4f46e5] hover:text-[#4f46e5] transition disabled:opacity-60"
                >
                  {uploadingBg ? "Envoi…" : "＋ Uploader un fond vert"}
                </button>
                <input
                  ref={bgFileInputRef as React.RefObject<HTMLInputElement>}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onBgFileChange}
                />
                {uploadBgError && <p className="mt-1 text-[11px] text-red-600">{uploadBgError}</p>}
              </div>
              {backgroundsError && (
                <div className="flex items-center justify-between mb-1.5 px-2 py-1.5 bg-red-50 border border-red-100 rounded-md">
                  <p className="text-[11px] text-red-700">{backgroundsError}</p>
                  <button
                    onClick={retryBackgrounds}
                    className="text-[10px] text-red-700 underline hover:no-underline"
                  >Réessayer</button>
                </div>
              )}
              {loadingBackgrounds ? (
                <div>
                  {/* Visible label + spinner above the placeholders so
                      the loading state isn't ambiguous with "no items". */}
                  <div className="flex items-center gap-2 text-[11px] text-[#4f46e5] font-semibold py-1 mb-1.5">
                    <div className="w-3.5 h-3.5 border-2 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />
                    <span>Chargement des fonds…</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={`bg-skel-${i}`}
                        className="rounded-md border border-gray-200 bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse aspect-square"
                      />
                    ))}
                  </div>
                </div>
              ) : backgrounds.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-3 text-center">{backgroundsError ? "" : "Aucun fond pour l'instant. Uploade un fond vert ci-dessus pour le réutiliser ici."}</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {backgrounds.map((bg) => {
                    const active = current.bgImageUrl === bg.url;
                    const isLoading = loadingUrl === bg.url;
                    const thumbSrc = bg.thumbUrl || bg.url;
                    const broken = brokenBgUrls.has(thumbSrc);
                    return (
                      <button
                        key={bg.id}
                        onClick={() => {
                          if (active) updateSetting(effectiveIndex, { bgImageUrl: undefined });
                          else pickBackground(bg.url);
                        }}
                        disabled={isLoading}
                        title={bg.name}
                        className={`relative aspect-square rounded-md border-2 overflow-hidden bg-gray-100 ${
                          active ? "border-[#4f46e5]" : "border-gray-200 hover:border-gray-400"
                        } ${isLoading ? "cursor-wait" : ""}`}
                      >
                        {broken ? (
                          // Backend served the JSON but the image file 404'd.
                          // Show the name + a hint so the user sees something
                          // useful instead of an empty square.
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-1 text-center bg-red-50">
                            <svg className="w-4 h-4 text-red-400 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.062 21h13.876c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 18c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <p className="text-[9px] text-red-600 leading-tight truncate w-full">{bg.name}</p>
                            <p className="text-[8px] text-red-400 mt-0.5">fichier introuvable</p>
                          </div>
                        ) : (
                          <>
                            {/* No crossOrigin attribute — we don't need pixel
                                access for the thumbnail and dropping it lets
                                the image load even when the backend's CORS
                                whitelist doesn't include the booth-ui origin. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbSrc}
                              alt={bg.name}
                              className={`w-full h-full object-cover transition-opacity ${isLoading ? "opacity-50" : ""}`}
                              loading="lazy"
                              onError={() => {
                                console.warn("[backgrounds] thumb 404", thumbSrc);
                                setBrokenBgUrls((prev) => {
                                  if (prev.has(thumbSrc)) return prev;
                                  const next = new Set(prev);
                                  next.add(thumbSrc);
                                  return next;
                                });
                              }}
                            />
                            {isLoading && (
                              <div className="absolute inset-0 flex items-center justify-center bg-white/40">
                                <div className="w-5 h-5 border-2 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {current.bgImageUrl && (
                <button
                  onClick={() => updateSetting(effectiveIndex, { bgImageUrl: undefined })}
                  className="mt-2 w-full text-xs text-gray-500 hover:text-gray-800"
                >Retirer l&apos;image de fond</button>
              )}
            </div>
          )}
        </div>

        {/* Person scale */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-gray-700">Zoom du sujet</p>
            <span className="text-[10px] text-gray-500">{Math.round((current.personScale ?? 1) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={current.personScale ?? 1}
            onChange={(e) => updateSetting(effectiveIndex, { personScale: parseFloat(e.target.value) })}
            className="w-full accent-[#4f46e5]"
          />
          <p className="text-[10px] text-gray-400 mt-1 leading-tight">
            Flèches ↑↓←→ pour déplacer le sujet · Maj = pas large
          </p>
        </div>

        {/* Person gallery — single scroll handled by the parent. The header
            (Retour + theme name) stays sticky while photos scroll. */}
        <div>
          {!selectedTheme && (
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-gray-700">Photos par thème</p>
              {loadingPersons && (
                <span className="text-[10px] text-gray-400">Chargement…</span>
              )}
            </div>
          )}
          {personsError && (
            <p className="text-[10px] text-red-600 mb-1.5">{personsError}</p>
          )}
          {loadingPersons && groups.length === 0 ? (
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={`skel-${i}`}
                  className="rounded-lg border border-gray-100 bg-gray-50 animate-pulse h-[88px]"
                />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <p className="text-xs text-gray-500 italic py-4 text-center">Aucune photo disponible</p>
          ) : selectedTheme ? (
            <div>
              <div className="sticky top-0 z-10 bg-white -mx-4 px-4 pt-1 pb-2 mb-2 border-b border-gray-100">
                <button
                  onClick={() => { setSelectedThemeId(null); setVisibleCount(PAGE_SIZE); }}
                  className="flex items-center gap-1 text-xs text-[#4f46e5] font-medium hover:underline mb-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Retour aux thèmes
                </button>
                <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider truncate">
                  {selectedTheme.nom} <span className="text-gray-400 font-normal normal-case">({selectedTheme.persons.length})</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {selectedTheme.persons.slice(0, visibleCount).map((p) => {
                  const active = current.personUrl === p.url;
                  const isLoading = loadingUrl === p.url;
                  return (
                    <button
                      key={`${selectedTheme.id}-${p.id}`}
                      onClick={() => {
                        if (active) updateSetting(effectiveIndex, { personUrl: undefined });
                        else pickPerson(p.url);
                      }}
                      disabled={isLoading}
                      className={`relative aspect-[3/4] rounded-md border-2 overflow-hidden bg-gray-100 ${
                        active ? "border-[#4f46e5]" : "border-gray-200 hover:border-gray-400"
                      } ${isLoading ? "cursor-wait" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.thumbUrl || p.url}
                        alt={p.id}
                        className={`w-full h-full object-contain transition-opacity ${isLoading ? "opacity-50" : ""}`}
                        crossOrigin="anonymous"
                        loading="lazy"
                      />
                      {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/40">
                          <div className="w-5 h-5 border-2 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {visibleCount < selectedTheme.persons.length && (
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="w-full mt-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium"
                >
                  Charger plus ({selectedTheme.persons.length - visibleCount} restant{selectedTheme.persons.length - visibleCount > 1 ? "s" : ""})
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {displayGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => { setSelectedThemeId(g.id); setVisibleCount(PAGE_SIZE); }}
                  className="relative rounded-lg overflow-hidden bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-[#4f46e5] transition-all group p-2 text-left"
                >
                  <div className="grid grid-cols-2 gap-1 mb-1.5">
                    {g.persons.slice(0, 4).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={p.id}
                        src={p.thumbUrl || p.url}
                        alt=""
                        className="w-full aspect-square object-contain rounded bg-white"
                        loading="lazy"
                        crossOrigin="anonymous"
                      />
                    ))}
                  </div>
                  <p className="text-[10px] font-medium text-gray-600 group-hover:text-[#4f46e5] truncate">{g.nom}</p>
                  <span className="text-[8px] text-gray-400">{g.persons.length}</span>
                </button>
              ))}
            </div>
          )}
          {current.personUrl && (
            <button
              onClick={() => updateSetting(effectiveIndex, { personUrl: undefined })}
              className="mt-2 w-full text-xs text-gray-500 hover:text-gray-800"
            >Retirer le sujet</button>
          )}
        </div>

        {/* Reset */}
        <button
          onClick={resetPreview}
          className="w-full text-xs text-gray-500 hover:text-gray-800 py-1"
        >Réinitialiser l&apos;aperçu</button>
      </div>

      {/* Footer action */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onDownload}
          className="w-full bg-[#4f46e5] text-white font-semibold rounded-lg py-2.5 hover:bg-[#4338ca] text-sm flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Télécharger l&apos;aperçu (JPEG)
        </button>
      </div>
    </aside>
  );
}
