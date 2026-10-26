"use client";
import React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { loadImageAsync, downscaleImage } from "../canvas/canvasUtils";
import { apiUrl } from "@/studio/lib/api";
import { useLoadingClick } from "../hooks/useLoadingClick";
import { ThumbSpinner } from "./ThumbSpinner";
import {
  fetchBiblioImages,
  fetchBiblioColors,
  fetchBiblioEvents,
  type BiblioImage,
  type BiblioColor,
  type BiblioEvent,
} from "@/studio/lib/biblio";

// Module-level cache for the biblio colours / events catalogues. Both
// lists rarely change in a session (admin-managed taxonomies) so we
// hold them in memory once fetched. Survives modal close + re-open
// without a re-fetch.
let biblioColorsCache: BiblioColor[] | null = null;
let biblioEventsCache: BiblioEvent[] | null = null;
let biblioColorsInflight: Promise<BiblioColor[]> | null = null;
let biblioEventsInflight: Promise<BiblioEvent[]> | null = null;
function getBiblioColors(): Promise<BiblioColor[]> {
  if (biblioColorsCache) return Promise.resolve(biblioColorsCache);
  if (biblioColorsInflight) return biblioColorsInflight;
  biblioColorsInflight = fetchBiblioColors().then((items) => {
    biblioColorsCache = items;
    biblioColorsInflight = null;
    return items;
  });
  return biblioColorsInflight;
}
function getBiblioEvents(): Promise<BiblioEvent[]> {
  if (biblioEventsCache) return Promise.resolve(biblioEventsCache);
  if (biblioEventsInflight) return biblioEventsInflight;
  biblioEventsInflight = fetchBiblioEvents().then((items) => {
    biblioEventsCache = items;
    biblioEventsInflight = null;
    return items;
  });
  return biblioEventsInflight;
}

export interface PexelsPhoto {
  id: number;
  src: { tiny: string; medium: string; large: string; large2x?: string };
  alt: string;
  photographer: string;
}

interface LibraryCategory {
  id: string;
  name: string;
  slug: string;
  keywords: string[];
  elements: { id: number; name: string; thumbnail: string; url: string }[];
}

interface PixabayHit {
  id: string;
  thumb: string;
  medium: string;
  large: string;
  tags: string;
  downloads?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PanelPhotos({ canvasRef, canvasWidth, canvasHeight, bleedPx = 0 }: { canvasRef: React.RefObject<any>; canvasWidth: number; canvasHeight: number; bleedPx?: number }) {
  const BLEED_PX = bleedPx;
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<ModalTab>("elements");
  const [browsingCategories, setBrowsingCategories] = useState(false);

  // Library
  const [library, setLibrary] = useState<LibraryCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryPixabay, setCategoryPixabay] = useState<PixabayHit[]>([]);
  const [categoryPixabayLoading, setCategoryPixabayLoading] = useState(false);
  const categoryPixabayRef = useRef<AbortController | null>(null);

  // Pexels photos
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  // Pixabay illustrations (transparent = elements)
  const [illustrations, setIllustrations] = useState<PixabayHit[]>([]);
  const [illusLoading, setIllusLoading] = useState(false);
  const [illusHasMore, setIllusHasMore] = useState(false);
  const [illusPage, setIllusPage] = useState(1);

  // Pixabay illustrations (all = illustrations section)
  const [illusAll, setIllusAll] = useState<PixabayHit[]>([]);
  const [illusAllLoading, setIllusAllLoading] = useState(false);
  const [illusAllHasMore, setIllusAllHasMore] = useState(false);
  const [illusAllPage, setIllusAllPage] = useState(1);

  // Pexels pagination
  const [photosHasMore, setPhotosHasMore] = useState(false);
  const [photosPage, setPhotosPage] = useState(1);

  // ── bibliotheques-back (3 lean state buckets, one per image_type) ──
  // Each source has its own cursor; the "Charger +" handlers below
  // increment both the Pixabay/Pexels page AND the matching biblio
  // page so users see a unified pagination control per block.
  const [biblioElements, setBiblioElements] = useState<BiblioImage[]>([]);
  const [biblioElementsPage, setBiblioElementsPage] = useState(1);
  const [biblioElementsHasMore, setBiblioElementsHasMore] = useState(false);
  const [biblioElementsLoading, setBiblioElementsLoading] = useState(false);
  const [biblioIllustrations, setBiblioIllustrations] = useState<BiblioImage[]>([]);
  const [biblioIllustrationsPage, setBiblioIllustrationsPage] = useState(1);
  const [biblioIllustrationsHasMore, setBiblioIllustrationsHasMore] = useState(false);
  const [biblioIllustrationsLoading, setBiblioIllustrationsLoading] = useState(false);
  const [biblioPhotos, setBiblioPhotos] = useState<BiblioImage[]>([]);
  const [biblioPhotosPage, setBiblioPhotosPage] = useState(1);
  const [biblioPhotosHasMore, setBiblioPhotosHasMore] = useState(false);
  const [biblioPhotosLoading, setBiblioPhotosLoading] = useState(false);

  // Current query for pagination
  const [currentQuery, setCurrentQuery] = useState("");

  const pexelsRef = useRef<AbortController | null>(null);
  const pixabayRef = useRef<AbortController | null>(null);
  const pixabayAllRef = useRef<AbortController | null>(null);
  const biblioElementsRef = useRef<AbortController | null>(null);
  const biblioIllustrationsRef = useRef<AbortController | null>(null);
  const biblioPhotosRef = useRef<AbortController | null>(null);

  // Load library on mount
  useEffect(() => {
    fetch("/data/elements-library.json")
      .then((r) => r.json())
      .then((data) => setLibrary(data))
      .catch(() => {});
  }, []);

  // Select a category and fetch Pixabay transparent results for it
  function selectCategory(slug: string) {
    setSelectedCategory(slug);
    const cat = library.find((c) => c.slug === slug);
    if (!cat) return;
    categoryPixabayRef.current?.abort();
    const controller = new AbortController();
    categoryPixabayRef.current = controller;
    setCategoryPixabayLoading(true);
    setCategoryPixabay([]);
    fetch(apiUrl(`/api/pixabay?query=${encodeURIComponent(cat.name.replace(/&amp;/g, "&"))}&per_page=60&image_type=illustration&color=transparent`), { signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        setCategoryPixabay((data.hits || []).map((h: any) => ({
          id: `cpx-${h.id}`,
          thumb: h.previewURL,
          medium: h.webformatURL,
          large: h.largeImageURL || h.webformatURL,
          tags: h.tags || "",
          downloads: h.downloads || 0,
        })));
      })
      .catch((e: any) => { if (e?.name !== "AbortError") setCategoryPixabay([]); })
      .finally(() => setCategoryPixabayLoading(false));
  }

  // Filtered library
  const filteredLibrary = query.trim()
    ? library.filter((cat) => {
        const q = query.toLowerCase();
        return cat.name.toLowerCase().includes(q)
          || cat.slug.includes(q)
          || cat.keywords.some((kw) => kw.includes(q));
      })
    : [];

  const displayedCategory = selectedCategory
    ? library.find((c) => c.slug === selectedCategory)
    : null;

  const mapPixabayHits = (hits: any[], prefix: string): PixabayHit[] =>
    (hits || []).map((h: any) => ({
      id: `${prefix}-${h.id}`,
      thumb: h.previewURL,
      medium: h.webformatURL,
      large: h.largeImageURL || h.webformatURL,
      tags: h.tags || "",
    }));

  // Unified search: Pexels + Pixabay + bibliotheques-back in parallel
  async function doSearch(q: string) {
    if (!q.trim()) return;
    setSearched(true);
    setSelectedCategory(null);
    setCurrentQuery(q);

    loadPhotos(q, 1, false);
    loadElements(q, 1, false);
    loadIllustrations(q, 1, false);
    loadBiblio("element", q, 1, false);
    loadBiblio("illustration", q, 1, false);
    loadBiblio("photo", q, 1, false);
  }

  // Generic loader for the bibliotheques-back source, parametrised by
  // image_type. Each type maps to one block in the studio's Images tab.
  function loadBiblio(type: "element" | "illustration" | "photo", q: string, page: number, append: boolean) {
    const refSetter = type === "element" ? biblioElementsRef
      : type === "illustration" ? biblioIllustrationsRef
      : biblioPhotosRef;
    const setItems = type === "element" ? setBiblioElements
      : type === "illustration" ? setBiblioIllustrations
      : setBiblioPhotos;
    const setLoading = type === "element" ? setBiblioElementsLoading
      : type === "illustration" ? setBiblioIllustrationsLoading
      : setBiblioPhotosLoading;
    const setPage = type === "element" ? setBiblioElementsPage
      : type === "illustration" ? setBiblioIllustrationsPage
      : setBiblioPhotosPage;
    const setHasMore = type === "element" ? setBiblioElementsHasMore
      : type === "illustration" ? setBiblioIllustrationsHasMore
      : setBiblioPhotosHasMore;
    refSetter.current?.abort();
    const c = new AbortController();
    refSetter.current = c;
    setLoading(true);
    fetchBiblioImages({ type, q, page, perPage: 30, signal: c.signal })
      .then((res) => {
        if (append) {
          setItems((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            return [...prev, ...res.items.filter((it) => !ids.has(it.id))];
          });
        } else {
          setItems(res.items);
        }
        setPage(res.page);
        setHasMore(res.hasMore);
      })
      .catch((e) => { if ((e as { name?: string })?.name !== "AbortError" && !append) setItems([]); })
      .finally(() => setLoading(false));
  }

  function loadPhotos(q: string, page: number, append: boolean) {
    pexelsRef.current?.abort();
    const c = new AbortController();
    pexelsRef.current = c;
    setPhotosLoading(true);
    fetch(apiUrl(`/api/pexels?query=${encodeURIComponent(q)}&per_page=80&page=${page}`), { signal: c.signal })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const p = data.photos || [];
        setPhotos((prev) => {
          if (!append) return p;
          const ids = new Set(prev.map((x: PexelsPhoto) => x.id));
          return [...prev, ...p.filter((x: PexelsPhoto) => !ids.has(x.id))];
        });
        setPhotosHasMore(page * 80 < (data.total_results || 0));
        setPhotosPage(page);
      })
      .catch((e) => { if (e?.name !== "AbortError" && !append) setPhotos([]); })
      .finally(() => setPhotosLoading(false));
  }

  function loadElements(q: string, page: number, append: boolean) {
    pixabayRef.current?.abort();
    const c = new AbortController();
    pixabayRef.current = c;
    setIllusLoading(true);
    // per_page=60 instead of 200 so "Charger +" appears much earlier —
    // with 200 most queries returned everything in one shot and the
    // pagination button never showed, giving users the impression that
    // there were no more results.
    fetch(apiUrl(`/api/pixabay?query=${encodeURIComponent(q)}&per_page=60&page=${page}&image_type=illustration&color=transparent`), { signal: c.signal })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const hits = mapPixabayHits(data.hits, "px");
        if (append) {
          setIllustrations((prev) => { const ids = new Set(prev.map((p) => p.id)); return [...prev, ...hits.filter((h) => !ids.has(h.id))]; });
        } else { setIllustrations(hits); }
        setIllusHasMore(page * 60 < (data.totalHits || 0));
        setIllusPage(page);
      })
      .catch((e) => { if (e?.name !== "AbortError" && !append) setIllustrations([]); })
      .finally(() => setIllusLoading(false));
  }

  function loadIllustrations(q: string, page: number, append: boolean) {
    pixabayAllRef.current?.abort();
    const c = new AbortController();
    pixabayAllRef.current = c;
    setIllusAllLoading(true);
    fetch(apiUrl(`/api/pixabay?query=${encodeURIComponent(q)}&per_page=60&page=${page}&image_type=illustration`), { signal: c.signal })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const hits = mapPixabayHits(data.hits, "pxa");
        if (append) {
          setIllusAll((prev) => { const ids = new Set(prev.map((p) => p.id)); return [...prev, ...hits.filter((h) => !ids.has(h.id))]; });
        } else { setIllusAll(hits); }
        setIllusAllHasMore(page * 60 < (data.totalHits || 0));
        setIllusAllPage(page);
      })
      .catch((e) => { if (e?.name !== "AbortError" && !append) setIllusAll([]); })
      .finally(() => setIllusAllLoading(false));
  }

  // Add image to canvas — SVGs added as editable groups, PNGs as images
  const addImageToCanvas = useCallback(async (imageUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fabric = await import("fabric");

    // SVG: parse and add as group (colors editable)
    if (isSvgUrl(imageUrl)) {
      try {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error("fetch failed");
        const svgText = await res.text();
        const result = await fabric.loadSVGFromString(svgText);
        const validObjects = result.objects.filter(Boolean) as any[];
        if (!validObjects.length) {
          // Fallback: add as rasterized image
          addRasterImage(canvas, fabric, imageUrl);
          return;
        }
        const group = fabric.util.groupSVGElements(validObjects, result.options);
        const maxW = canvasWidth * 0.5;
        const maxH = canvasHeight * 0.5;
        const scale = Math.min(maxW / (group.width || 1), maxH / (group.height || 1));
        group.set({
          scaleX: scale, scaleY: scale,
          left: BLEED_PX + canvasWidth / 2, top: BLEED_PX + canvasHeight / 2,
          originX: "center", originY: "center",
        });
        canvas.add(group);
        canvas.setActiveObject(group);
        canvas.renderAll();
      } catch {
        // Fallback to rasterized image on any error
        addRasterImage(canvas, fabric, imageUrl);
      }
      return;
    }

    // PNG/JPG: add as rasterized image
    addRasterImage(canvas, fabric, imageUrl);

    async function addRasterImage(canvas: any, fabric: any, url: string) {
      try {
        const imgEl = await loadImageAsync(url);
        const maxDim = 2048;
        const w = imgEl.naturalWidth || imgEl.width;
        const h = imgEl.naturalHeight || imgEl.height;
        let fImg;
        if (w > maxDim || h > maxDim) {
          const result = await downscaleImage(imgEl, maxDim);
          if (result.dataUrl) {
            const di = await loadImageAsync(result.dataUrl);
            if (result.bitmap) result.bitmap.close();
            fImg = new fabric.FabricImage(di, { objectCaching: false });
          }
        }
        if (!fImg) fImg = new fabric.FabricImage(imgEl, { objectCaching: false });
        const maxW = canvasWidth * 0.5;
        const maxH = canvasHeight * 0.5;
        const scale = Math.min(maxW / fImg.width!, maxH / fImg.height!);
        fImg.set({
          scaleX: scale, scaleY: scale,
          left: BLEED_PX + canvasWidth / 2, top: BLEED_PX + canvasHeight / 2,
          originX: "center", originY: "center",
        });
        canvas.add(fImg);
        canvas.setActiveObject(fImg);
        canvas.renderAll();
      } catch { alert("Impossible de charger cette image"); }
    }
  }, [canvasRef, canvasWidth, canvasHeight, BLEED_PX]);

  // Tracks which thumbnail is currently being added to the canvas so the UI
  // can show a spinner instead of leaving the user wondering whether the
  // click registered.
  const { loadingKey, run } = useLoadingClick();
  const handlePick = useCallback(
    (key: string, url: string) => run(key, () => addImageToCanvas(url)),
    [run, addImageToCanvas],
  );

  const isSearching = photosLoading || illusLoading || illusAllLoading
    || biblioElementsLoading || biblioIllustrationsLoading || biblioPhotosLoading;
  const hasResults = filteredLibrary.length > 0 || photos.length > 0
    || illustrations.length > 0 || illusAll.length > 0
    || biblioElements.length > 0 || biblioIllustrations.length > 0 || biblioPhotos.length > 0;

  return (
    <div className="space-y-3">
      {/* Search bar — prominent */}
      <form onSubmit={(e) => { e.preventDefault(); doSearch(query); }} className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher photos, illustrations..."
            className="w-full px-3 py-2.5 pr-8 rounded-xl bg-white border-2 border-[#4f46e5]/30 text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:border-[#4f46e5] shadow-sm"
          />
          {searched && (
            <button
              type="button"
              onClick={() => {
                setQuery(""); setSearched(false);
                setPhotos([]); setIllustrations([]); setIllusAll([]);
                setBiblioElements([]); setBiblioIllustrations([]); setBiblioPhotos([]);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-gray-300 hover:bg-gray-400 text-white transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <button type="submit" className="px-3 py-2.5 bg-[#4f46e5] rounded-xl text-white hover:bg-[#4338ca] transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </form>

      {/* Back button */}
      {(selectedCategory || searched || browsingCategories) && (
        <button
          onClick={() => {
            if (selectedCategory) { setSelectedCategory(null); setCategoryPixabay([]); }
            else if (searched) { setQuery(""); setSearched(false); setPhotos([]); setIllustrations([]); setIllusAll([]); }
            else { setBrowsingCategories(false); }
          }}
          className="flex items-center gap-1 text-xs text-[#4f46e5] font-medium hover:underline"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Retour
        </button>
      )}

      {/* ── Default view: discovery page ── */}
      {!searched && !selectedCategory && !browsingCategories && (
        <DefaultView
          library={library}
          onSelectCategory={selectCategory}
          onSearch={(q) => { setQuery(q); doSearch(q); }}
          onOpenModal={(tab) => { setModalInitialTab(tab); setShowModal(true); }}
          onBrowseCategories={() => setBrowsingCategories(true)}
        />
      )}

      {/* ── Category browsing view ── */}
      {!searched && !selectedCategory && browsingCategories && (
        <CategoriesView
          library={library}
          onSelectCategory={selectCategory}
          onBack={() => setBrowsingCategories(false)}
        />
      )}

      {/* ── Category detail view: Selfizee + Pixabay ── */}
      {displayedCategory && (
        <div className="space-y-3 h-[calc(100dvh_-_260px)] overflow-y-auto">
          <div className="grid grid-cols-3 gap-1.5">
            {displayedCategory.elements.map((el) => {
              const key = `cat-sf-${el.id}`;
              return (
                <div key={key} className="relative group rounded-lg overflow-hidden cursor-pointer border border-gray-100 hover:border-[#4f46e5] transition-all bg-gray-50" onClick={() => handlePick(key, el.url)} title={el.name}>
                  <img src={el.thumbnail} alt={el.name} className="w-full aspect-square object-contain p-1.5" loading="lazy" />
                  <HoverPlus isSvg={isSvgUrl(el.url)} />
                  {loadingKey === key && <ThumbSpinner />}
                </div>
              );
            })}
            {categoryPixabay.map((hit) => {
              const key = `cat-${hit.id}`;
              return (
                <div key={key} className="relative group rounded-lg overflow-hidden cursor-pointer border border-gray-100 hover:border-[#4f46e5] transition-all bg-gray-50" onClick={() => handlePick(key, hit.large)} title={hit.tags}>
                  <img src={hit.thumb} alt={hit.tags} className="w-full aspect-square object-contain p-1.5" loading="lazy" />
                  <HoverPlus isSvg={isSvgUrl(hit.large)} />
                  {loadingKey === key && <ThumbSpinner />}
                </div>
              );
            })}
          </div>
          {categoryPixabayLoading && <p className="text-gray-400 text-[10px] text-center py-2">Chargement Pixabay...</p>}
        </div>
      )}

      {/* ── Search results ── */}
      {searched && !selectedCategory && (
        <SearchResults
          filteredLibrary={filteredLibrary}
          illustrations={illustrations}
          illusAll={illusAll}
          photos={photos}
          biblioElements={biblioElements}
          biblioIllustrations={biblioIllustrations}
          biblioPhotos={biblioPhotos}
          isSearching={isSearching}
          hasResults={hasResults}
          illusLoading={illusLoading}
          illusAllLoading={illusAllLoading}
          photosLoading={photosLoading}
          illusHasMore={illusHasMore || biblioElementsHasMore}
          illusAllHasMore={illusAllHasMore || biblioIllustrationsHasMore}
          photosHasMore={photosHasMore || biblioPhotosHasMore}
          handlePick={handlePick}
          loadingKey={loadingKey}
          // Each "Charger +" increments BOTH the Pixabay/Pexels page
          // AND the matching biblio page. Sources with no further pages
          // no-op gracefully (loadBiblio returns hasMore:false).
          onLoadMoreElements={() => {
            if (illusHasMore) loadElements(currentQuery, illusPage + 1, true);
            if (biblioElementsHasMore) loadBiblio("element", currentQuery, biblioElementsPage + 1, true);
          }}
          onLoadMoreIllus={() => {
            if (illusAllHasMore) loadIllustrations(currentQuery, illusAllPage + 1, true);
            if (biblioIllustrationsHasMore) loadBiblio("illustration", currentQuery, biblioIllustrationsPage + 1, true);
          }}
          onLoadMorePhotos={() => {
            if (photosHasMore) loadPhotos(currentQuery, photosPage + 1, true);
            if (biblioPhotosHasMore) loadBiblio("photo", currentQuery, biblioPhotosPage + 1, true);
          }}
        />
      )}

      {/* Recherche avancée after results */}
      {searched && !selectedCategory && (
        <button onClick={() => { setModalInitialTab("elements"); setShowModal(true); }}
          className="w-full py-2.5 rounded-xl bg-[#4f46e5] text-white text-sm font-semibold hover:bg-[#4338ca] transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
          Recherche avancée
        </button>
      )}


      {showModal && (
        <AdvancedSearchModal
          onClose={() => setShowModal(false)}
          onSelect={(url) => { addImageToCanvas(url); setShowModal(false); }}
          initialQuery={searched ? query : ""}
          initialTab={modalInitialTab}
        />
      )}
    </div>
  );
}

/* ── Default discovery view ── */

const POPULAR_TAGS = [
  "noël", "fleurs", "confettis", "ballons",
  "tropical", "vintage", "chiffres", "sport",
];

function DefaultView({ library, onSearch, onOpenModal, onBrowseCategories }: {
  library: LibraryCategory[];
  onSelectCategory: (slug: string) => void;
  onSearch: (q: string) => void;
  onOpenModal: (tab: ModalTab) => void;
  onBrowseCategories: () => void;
}) {
  const THEMES = [
    { label: "Mariage", query: "mariage", selfizeeSlugs: ["mariage", "floral-vegetal", "chic", "dore"] },
    { label: "Anniversaire", query: "anniversaire", selfizeeSlugs: ["anniversaires-fetes", "ballons", "confettis"] },
    { label: "Fête", query: "fête", selfizeeSlugs: ["disco", "reveillon-nouvel-an", "carnaval"] },
  ];

  const [previews, setPreviews] = useState<Record<string, string[]>>({});

  // Build the home-view theme preview strips. Strategy:
  // 1. Try /data/theme-previews.json (pre-baked local JSON pointing at
  //    images downloaded once into public/data/theme-previews/). This
  //    is the fastest path — zero remote API calls, zero external CDN
  //    hits, works offline.
  // 2. Fall back to the localStorage cache (30-day TTL) populated by
  //    an earlier successful fetch.
  // 3. Last resort: fetch live from /api/pexels + /api/pixabay, cache
  //    the resulting URLs in localStorage, and display.
  //
  // The mix is "1 photo + 1 illustration + 3 elements" per theme so
  // the strip stays visually varied (real photos + flat illustrations
  // + brand elements). Live fetches happen only on the very first
  // visit or after cache expiry.
  useEffect(() => {
    if (library.length === 0) return;
    const CACHE_KEY = "selfizee_theme_previews_cache_v1";
    const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

    // Helper: pick local selfizee element thumbs for a theme.
    const selfizeeFor = (theme: typeof THEMES[number], count: number) =>
      library
        .filter((c) => theme.selfizeeSlugs.includes(c.slug))
        .flatMap((c) => c.elements)
        .slice(0, count)
        .map((e) => e.thumbnail);

    const interleave = (photo: string | null, illus: string | null, elements: string[]): string[] => {
      const strip: string[] = [];
      if (photo) strip.push(photo);
      if (elements[0]) strip.push(elements[0]);
      if (illus) strip.push(illus);
      if (elements[1]) strip.push(elements[1]);
      if (elements[2]) strip.push(elements[2]);
      return strip.slice(0, 6);
    };

    let cancelled = false;

    (async () => {
      // 1. Try pre-baked local JSON
      try {
        const res = await fetch("/data/theme-previews.json", { cache: "force-cache" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data && typeof data === "object") {
            const next: Record<string, string[]> = {};
            THEMES.forEach((t) => {
              const entry = data[t.query];
              if (entry) {
                next[t.query] = interleave(entry.photo || null, entry.illustration || null, selfizeeFor(t, 3));
              }
            });
            if (Object.keys(next).length > 0) {
              setPreviews(next);
              return; // Done — no further fetches
            }
          }
        }
      } catch { /* file doesn't exist — fall through */ }

      if (cancelled) return;

      // 2. localStorage cache
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.ts === "number" && Date.now() - parsed.ts < TTL_MS && parsed.themes) {
            const next: Record<string, string[]> = {};
            THEMES.forEach((t) => {
              const entry = parsed.themes[t.query];
              if (entry) {
                next[t.query] = interleave(entry.photo || null, entry.illustration || null, selfizeeFor(t, 3));
              }
            });
            if (Object.keys(next).length > 0) {
              setPreviews(next);
              return;
            }
          }
        }
      } catch { /* ignore corrupt cache */ }

      // 3. Live fetch — only runs on cold cache. Cache the result for
      //    the next 30 days so the user only pays this cost once.
      const themeResults: Record<string, { photo: string | null; illustration: string | null }> = {};
      await Promise.all(THEMES.map(async (theme) => {
        const [photo, illus] = await Promise.all([
          fetch(apiUrl(`/api/pexels?query=${encodeURIComponent(theme.query)}&per_page=1&skip_translate=1`))
            .then((r) => r.ok ? r.json() : null)
            .then((d) => d?.photos?.[0]?.src?.tiny || null)
            .catch(() => null),
          fetch(apiUrl(`/api/pixabay?query=${encodeURIComponent(theme.query)}&per_page=1&image_type=illustration&color=transparent`))
            .then((r) => r.ok ? r.json() : null)
            .then((d) => d?.hits?.[0]?.previewURL || null)
            .catch(() => null),
        ]);
        themeResults[theme.query] = { photo, illustration: illus };
      }));

      if (cancelled) return;

      const next: Record<string, string[]> = {};
      THEMES.forEach((t) => {
        const r = themeResults[t.query];
        next[t.query] = interleave(r?.photo || null, r?.illustration || null, selfizeeFor(t, 3));
      });
      setPreviews(next);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), themes: themeResults }));
      } catch { /* quota */ }
    })();

    return () => { cancelled = true; };
  }, [library]);

  const month = new Date().getMonth();
  const [showCalendar, setShowCalendar] = useState(false);

  const CALENDAR: { month: string; short: string; events: { label: string; query: string }[] }[] = [
    { month: "Janvier", short: "Jan", events: [{ label: "Bonne année", query: "voeux" }, { label: "Épiphanie", query: "épiphanie" }, { label: "Soldes hiver", query: "soldes hiver" }] },
    { month: "Février", short: "Fév", events: [{ label: "Chandeleur", query: "chandeleur" }, { label: "Saint-Valentin", query: "saint-valentin" }, { label: "Mardi gras", query: "mardi gras" }, { label: "Carnaval", query: "carnaval" }] },
    { month: "Mars", short: "Mar", events: [{ label: "Journée de la femme", query: "journée internationale de la femme" }, { label: "Printemps", query: "printemps" }, { label: "Fête grands-mères", query: "fête des grands-mères" }, { label: "Saint-Patrick", query: "saint-patrick" }] },
    { month: "Avril", short: "Avr", events: [{ label: "Poisson d'avril", query: "poisson d'avril" }, { label: "Pâques", query: "pâques" }] },
    { month: "Mai", short: "Mai", events: [{ label: "Fête du travail", query: "muguet" }, { label: "Fête des mères", query: "fête des mères" }] },
    { month: "Juin", short: "Jun", events: [{ label: "Fête des pères", query: "fête des pères" }, { label: "Fête de la musique", query: "fête de la musique" }, { label: "Été", query: "été" }, { label: "Soldes été", query: "soldes été" }] },
    { month: "Juillet", short: "Jul", events: [{ label: "14 juillet", query: "14 juillet france" }, { label: "Vacances", query: "plage" }] },
    { month: "Août", short: "Aoû", events: [{ label: "Été", query: "été" }, { label: "Tropical", query: "tropical" }] },
    { month: "Septembre", short: "Sep", events: [{ label: "Rentrée", query: "rentrée" }, { label: "Automne", query: "automne" }, { label: "Journée des familles", query: "journée des familles" }] },
    { month: "Octobre", short: "Oct", events: [{ label: "Octobre Rose", query: "octobre rose" }, { label: "Halloween", query: "halloween" }, { label: "Oktoberfest", query: "oktoberfest" }] },
    { month: "Novembre", short: "Nov", events: [{ label: "Beaujolais nouveau", query: "beaujolais nouveau" }, { label: "Black Friday", query: "black friday" }, { label: "Fête grands-pères", query: "fête des grands-pères" }] },
    { month: "Décembre", short: "Déc", events: [{ label: "Noël", query: "noël" }, { label: "Réveillon", query: "réveillon nouvel an" }] },
  ];
  const seasonal = CALENDAR[month]?.events || [];

  return (
    <div className="space-y-5">
      {/* 3 theme cards */}
      <div className="space-y-3">
        {THEMES.map((theme) => (
          <button key={theme.query} onClick={() => onSearch(theme.query)} className="w-full rounded-xl overflow-hidden border border-gray-100 hover:border-[#4f46e5] transition-all group">
            <div className="flex gap-0.5 h-14">
              {(previews[theme.query] || []).length > 0
                ? (previews[theme.query]).map((src, i) => (
                    <img key={i} src={src} alt="" className="flex-1 h-full object-cover" loading="lazy" />
                  ))
                : <div className="w-full h-full bg-gradient-to-r from-purple-50 to-indigo-50 animate-pulse" />
              }
            </div>
            <div className="px-3 py-1.5 flex items-center justify-between bg-white">
              <p className="text-xs font-semibold text-gray-800 group-hover:text-[#4f46e5]">{theme.label}</p>
              <svg className="w-4 h-4 text-gray-300 group-hover:text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </button>
        ))}
      </div>

      {/* Seasonal + calendar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">En ce moment</p>
          <button onClick={() => setShowCalendar(!showCalendar)} className="text-[10px] text-[#4f46e5] font-medium hover:underline flex items-center gap-0.5">
            {showCalendar ? (
              <>Réduire</>
            ) : (
              <>Voir + <span className="text-[8px] opacity-70">▸</span></>
            )}
          </button>
        </div>
        {/* Current month highlights */}
        <div className="flex gap-1.5 mb-2">
          {seasonal.map((s) => (
            <button key={s.query} onClick={() => onSearch(s.query)}
              className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#4f46e5]/5 to-[#ec4899]/5 border border-[#4f46e5]/10 hover:border-[#4f46e5]/30 text-xs font-medium text-gray-600 hover:text-[#4f46e5] transition-all"
            >{s.label}</button>
          ))}
        </div>
        {/* Full year calendar — vertical timeline */}
        {showCalendar && (
          <div className="max-h-[260px] overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/60">
            {/* Inner wrapper is the positioning context so the rail spans
                the FULL content height (not just the visible viewport). */}
            <div className="relative pl-4 pr-2 py-3">
              <div className="absolute left-[22px] top-3 bottom-3 w-px bg-gradient-to-b from-[#4f46e5]/20 via-gray-200 to-[#ec4899]/20" />
              <div className="space-y-3">
                {CALENDAR.map((m, i) => {
                  const isCurrent = i === month;
                  return (
                    <div key={m.month} className="relative flex items-start gap-3">
                      {/* Station dot — highlighted for current month */}
                      <div className="relative flex-shrink-0 w-4 flex items-center justify-center pt-[3px]">
                        <div className={`w-2.5 h-2.5 rounded-full border-2 ${
                          isCurrent
                            ? "bg-[#4f46e5] border-[#4f46e5] shadow-[0_0_0_3px_rgba(124,58,237,0.15)]"
                            : "bg-white border-gray-300"
                        }`} />
                      </div>
                      {/* Month + events */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isCurrent ? "text-[#4f46e5]" : "text-gray-400"}`}>
                          {m.month}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {m.events.map((e) => (
                            <button
                              key={e.query}
                              onClick={() => onSearch(e.query)}
                              className="px-2 py-0.5 rounded-full text-[10px] bg-white border border-gray-200 text-gray-600 hover:border-[#4f46e5] hover:text-[#4f46e5] transition-colors"
                            >
                              {e.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {POPULAR_TAGS.map((tag) => (
          <button key={tag} onClick={() => onSearch(tag)}
            className="px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-500 hover:bg-[#4f46e5] hover:text-white transition-colors"
          >{tag}</button>
        ))}
      </div>

      {/* Recherche avancée */}
      <button onClick={() => onOpenModal("elements")}
        className="w-full py-2.5 rounded-xl bg-[#4f46e5] text-white text-sm font-semibold hover:bg-[#4338ca] transition-all flex items-center justify-center gap-2 shadow-sm"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
        Recherche avancée
      </button>

      {/* Catégories Selfizee */}
      <button onClick={onBrowseCategories}
        className="w-full py-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-[10px] text-gray-400 hover:text-gray-600 transition-all text-center"
      >Parcourir les 97 catégories Selfizee</button>
    </div>
  );
}

/* ── Categories browsing view ── */

const FEATURED_CATEGORIES = [
  "mariage", "anniversaires-fetes", "noel", "floral-vegetal",
  "ete", "tropical", "disco", "halloween", "sport", "plage",
  "enfance", "chic", "musique", "dore",
];

function CategoriesView({ library, onSelectCategory, onBack }: {
  library: LibraryCategory[];
  onSelectCategory: (slug: string) => void;
  onBack: () => void;
}) {
  const featuredCats = FEATURED_CATEGORIES
    .map((slug) => library.find((c) => c.slug === slug))
    .filter(Boolean) as LibraryCategory[];
  const otherCats = library
    .filter((c) => !FEATURED_CATEGORIES.includes(c.slug))
    .sort((a, b) => b.elements.length - a.elements.length);
  const sortedCats = [...featuredCats, ...otherCats];

  return (
    <div className="space-y-2 h-[calc(100dvh_-_260px)] overflow-y-auto">
      <div className="grid grid-cols-2 gap-1.5">
        {sortedCats.map((cat) => (
          <button
            key={cat.slug}
            onClick={() => onSelectCategory(cat.slug)}
            className="relative rounded-lg overflow-hidden bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-[#4f46e5] transition-all group p-2"
          >
            <div className="flex gap-1 mb-1.5">
              {cat.elements.slice(0, 6).map((el) => (
                <img key={el.id} src={el.thumbnail} alt="" className="w-8 h-8 object-contain rounded" loading="lazy" />
              ))}
            </div>
            <p className="text-[10px] font-medium text-gray-600 group-hover:text-[#4f46e5] truncate">{cat.name.replace(/&amp;/g, "&")}</p>
            <span className="text-[8px] text-gray-400">{cat.elements.length}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Hover overlay with + icon + optional SVG badge ── */

function HoverPlus({ isSvg }: { isSvg?: boolean }) {
  return (
    <>
      {isSvg && (
        <div className="absolute top-1 left-1 w-4 h-4 rounded-sm overflow-hidden shadow-sm opacity-80 group-hover:opacity-100 transition-opacity" title="SVG — couleurs modifiables">
          <div className="w-full h-full" style={{ background: "conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #6366f1, #ec4899, #ef4444)" }} />
        </div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
        <div className="p-2 bg-white/90 rounded-xl text-gray-800 shadow-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </div>
      </div>
    </>
  );
}

/** Check if a URL points to an SVG file */
function isSvgUrl(url: string): boolean {
  return /\.svg(\?|$)/i.test(url);
}

/* ── Search results with collapsible sections ── */

function SearchResults({
  filteredLibrary, illustrations, illusAll, photos,
  biblioElements, biblioIllustrations, biblioPhotos,
  isSearching, hasResults, illusLoading, illusAllLoading, photosLoading,
  illusHasMore, illusAllHasMore, photosHasMore,
  handlePick, loadingKey, onLoadMoreElements, onLoadMoreIllus, onLoadMorePhotos,
}: {
  filteredLibrary: LibraryCategory[];
  illustrations: PixabayHit[];
  illusAll: PixabayHit[];
  photos: PexelsPhoto[];
  biblioElements: BiblioImage[];
  biblioIllustrations: BiblioImage[];
  biblioPhotos: BiblioImage[];
  isSearching: boolean;
  hasResults: boolean;
  illusLoading: boolean;
  illusAllLoading: boolean;
  photosLoading: boolean;
  illusHasMore: boolean;
  illusAllHasMore: boolean;
  photosHasMore: boolean;
  handlePick: (key: string, url: string) => void;
  loadingKey: string | null;
  onLoadMoreElements: () => void;
  onLoadMoreIllus: () => void;
  onLoadMorePhotos: () => void;
}) {
  const [showAllElements, setShowAllElements] = useState(false);
  const [showAllIllus, setShowAllIllus] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  // Merge bibliotheques-back + Selfizee static + Pixabay into "Éléments".
  // Order matters: biblio comes FIRST (curated, freshest), then the
  // local Selfizee snapshot, then Pixabay's broad pool. Same idea for
  // illustrations and photos below.
  const selfizeeElements = (() => {
    const seen = new Set<number>();
    return filteredLibrary.flatMap((cat) => cat.elements)
      .filter((el) => { if (seen.has(el.id)) return false; seen.add(el.id); return true; });
  })();

  const allElements = [
    ...biblioElements
      .filter((it) => it.thumbnail && it.fullSize)
      .map((it) => ({ id: `bib-${it.id}`, thumb: it.thumbnail as string, large: it.fullSize as string, label: it.name })),
    ...selfizeeElements.map((el) => ({ id: `sf-${el.id}`, thumb: el.thumbnail, large: el.url, label: el.name })),
    ...illustrations.map((hit) => ({ id: hit.id, thumb: hit.thumb, large: hit.large, label: hit.tags })),
  ];

  const ELEMENTS_PREVIEW = 12;
  const PHOTOS_PREVIEW = 12;
  const visibleElements = showAllElements ? allElements : allElements.slice(0, ELEMENTS_PREVIEW);
  const visiblePhotos = showAllPhotos ? photos : photos.slice(0, PHOTOS_PREVIEW);

  return (
    <div className="space-y-3 h-[calc(100dvh_-_260px)] overflow-y-auto">
      {isSearching && !hasResults && (
        <p className="text-gray-400 text-xs text-center py-4">Recherche...</p>
      )}

      {/* Éléments (Selfizee + Pixabay mixed) */}
      {(allElements.length > 0 || illusLoading) && (
        <div>
          <div className="flex items-center justify-between mb-2 pb-0 pt-1">
            <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">
              Éléments
            </p>
            {allElements.length > ELEMENTS_PREVIEW && (
              <button
                onClick={() => setShowAllElements(!showAllElements)}
                className="text-[10px] text-[#4f46e5] font-medium hover:underline"
              >
                {showAllElements ? "Réduire" : "Voir tout"}
              </button>
            )}
          </div>
          {illusLoading && allElements.length === 0 && <p className="text-gray-400 text-[10px] text-center py-1">Recherche...</p>}
          <div className="grid grid-cols-3 gap-1.5">
            {visibleElements.map((el) => {
              const key = `el-${el.id}`;
              return (
                <div key={key} className="relative group rounded-lg overflow-hidden cursor-pointer border border-gray-100 hover:border-[#4f46e5] transition-all bg-gray-50" onClick={() => handlePick(key, el.large)} title={el.label}>
                  <img src={el.thumb} alt={el.label} className="w-full aspect-square object-contain p-1.5" loading="lazy" />
                  <HoverPlus isSvg={isSvgUrl(el.large)} />
                  {loadingKey === key && <ThumbSpinner />}
                </div>
              );
            })}
          </div>
          {showAllElements && illusHasMore && !illusLoading && (
            <button onClick={onLoadMoreElements} className="w-full mt-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium">Charger +</button>
          )}
          {illusLoading && allElements.length > 0 && <p className="text-gray-400 text-[10px] text-center py-1">Chargement...</p>}
        </div>
      )}

      {/* Illustrations (Pixabay all, not just transparent) */}
      {(illusAll.length > 0 || illusAllLoading || biblioIllustrations.length > 0) && (() => {
        const allIllus = [
          ...biblioIllustrations
            .filter((it) => it.thumbnail && it.fullSize)
            .map((it) => ({ id: `bib-${it.id}`, thumb: it.thumbnail as string, large: it.fullSize as string, label: it.name })),
          ...illusAll.map((hit) => ({ id: hit.id, thumb: hit.thumb, large: hit.large, label: hit.tags })),
        ];
        const visibleIllus = showAllIllus ? allIllus : allIllus.slice(0, 12);
        return (
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">
              Illustrations
            </p>
            {allIllus.length > 6 && (
              <button onClick={() => setShowAllIllus(!showAllIllus)} className="text-[10px] text-[#4f46e5] font-medium hover:underline">
                {showAllIllus ? "Réduire" : "Voir tout"}
              </button>
            )}
          </div>
          {illusAllLoading && allIllus.length === 0 && <p className="text-gray-400 text-[10px] text-center py-1">Recherche...</p>}
          <div className="grid grid-cols-3 gap-1.5">
            {visibleIllus.map((hit) => {
              const key = `il-${hit.id}`;
              return (
                <div key={key} className="relative group rounded-lg overflow-hidden cursor-pointer border border-gray-100 hover:border-[#4f46e5] transition-all bg-gray-50" onClick={() => handlePick(key, hit.large)} title={hit.label}>
                  <img src={hit.thumb} alt={hit.label} className="w-full aspect-square object-cover" loading="lazy" />
                  <HoverPlus isSvg={isSvgUrl(hit.large)} />
                  {loadingKey === key && <ThumbSpinner />}
                </div>
              );
            })}
          </div>
          {showAllIllus && illusAllHasMore && !illusAllLoading && (
            <button onClick={onLoadMoreIllus} className="w-full mt-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium">Charger +</button>
          )}
          {illusAllLoading && allIllus.length > 0 && <p className="text-gray-400 text-[10px] text-center py-1">Chargement...</p>}
        </div>
        );
      })()}

      {/* Photos */}
      {(photos.length > 0 || photosLoading || biblioPhotos.length > 0) && (() => {
        // bibliotheques-back photos prepended to Pexels. Same UX as the
        // other blocks: biblio items first, paginated source after.
        type DisplayPhoto = { id: string; thumb: string; large: string; alt: string };
        const allPhotos: DisplayPhoto[] = [
          ...biblioPhotos
            .filter((it) => it.thumbnail && it.fullSize)
            .map((it) => ({ id: `bib-${it.id}`, thumb: it.thumbnail as string, large: it.fullSize as string, alt: it.name })),
          ...photos.map((p) => ({ id: `ph-${p.id}`, thumb: p.src.tiny, large: p.src.large, alt: p.alt })),
        ];
        const visibleAllPhotos = showAllPhotos ? allPhotos : allPhotos.slice(0, PHOTOS_PREVIEW);
        return (
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] text-gray-600 font-bold uppercase tracking-wider">
              Photos
            </p>
            {allPhotos.length > PHOTOS_PREVIEW && (
              <button onClick={() => setShowAllPhotos(!showAllPhotos)} className="text-[10px] text-[#4f46e5] font-medium hover:underline">
                {showAllPhotos ? "Réduire" : "Voir tout"}
              </button>
            )}
          </div>
          {photosLoading && allPhotos.length === 0 && <p className="text-gray-400 text-[10px] text-center py-1">Recherche...</p>}
          <div className="grid grid-cols-3 gap-1.5">
            {visibleAllPhotos.map((photo) => (
              <div key={photo.id} className="relative group rounded-lg overflow-hidden">
                <img src={photo.thumb} alt={photo.alt} className="w-full aspect-square object-cover" loading="lazy" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <button onClick={() => handlePick(photo.id, photo.large)} className="p-2 bg-white/90 rounded-xl text-gray-800 hover:bg-white transition-colors shadow-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
                {loadingKey === photo.id && <ThumbSpinner />}
              </div>
            ))}
          </div>
          {showAllPhotos && photosHasMore && !photosLoading && (
            <button onClick={onLoadMorePhotos} className="w-full mt-2 py-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium">Charger +</button>
          )}
          {photosLoading && allPhotos.length > 0 && <p className="text-gray-400 text-[10px] text-center py-1">Chargement...</p>}
        </div>
        );
      })()}

      {/* No results */}
      {!isSearching && !hasResults && (
        <p className="text-gray-400 text-xs text-center py-4">Aucun résultat.</p>
      )}
    </div>
  );
}

/* ── Advanced search modal (fullscreen) ── */

const COLORS = [
  { value: "", label: "Toutes", swatch: "bg-gradient-to-br from-red-400 via-green-400 to-blue-400" },
  { value: "red", label: "Rouge", swatch: "bg-red-500", hex: "#ef4444" },
  { value: "orange", label: "Orange", swatch: "bg-orange-500", hex: "#f97316" },
  { value: "yellow", label: "Jaune", swatch: "bg-yellow-400", hex: "#facc15" },
  { value: "green", label: "Vert", swatch: "bg-green-500", hex: "#22c55e" },
  { value: "turquoise", label: "Turquoise", swatch: "bg-teal-400", hex: "#2dd4bf" },
  { value: "blue", label: "Bleu", swatch: "bg-blue-500", hex: "#3b82f6" },
  { value: "violet", label: "Violet", swatch: "bg-violet-500", hex: "#6366f1" },
  { value: "pink", label: "Rose", swatch: "bg-indigo-400", hex: "#f472b6" },
  { value: "brown", label: "Marron", swatch: "bg-amber-700", hex: "#b45309" },
  { value: "black", label: "Noir", swatch: "bg-black", hex: "#000000" },
  { value: "gray", label: "Gris", swatch: "bg-gray-400", hex: "#9ca3af" },
  { value: "white", label: "Blanc", swatch: "bg-white border border-gray-300", hex: "#ffffff" },
];

// Euclidean RGB distance between two #RRGGBB hex strings. Used when
// mapping a Pixabay-style color name to the closest biblio color id
// for cross-source filtering. Cheap + good enough for ~10-30 anchors.
function hexDistance(a: string, b: string): number {
  const parse = (h: string) => {
    const s = h.replace("#", "");
    const v = s.length === 3
      ? s.split("").map((c) => parseInt(c + c, 16))
      : [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    return v;
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function closestBiblioColorId(hex: string, palette: { id: number; hex: string }[]): number | undefined {
  if (!hex || palette.length === 0) return undefined;
  let bestId: number | undefined;
  let bestDist = Infinity;
  for (const c of palette) {
    if (!c.hex) continue;
    const d = hexDistance(hex, c.hex);
    if (d < bestDist) { bestDist = d; bestId = c.id; }
  }
  // Threshold: 100 in 0-441 range (the max RGB distance is sqrt(255^2*3)
  // ≈ 441). 100 is "visibly similar"; anything beyond is too different
  // to be a useful match — return undefined so we don't filter biblio
  // with an unrelated colour.
  return bestDist > 100 ? undefined : bestId;
}

const ORIENTATIONS = [
  { value: "", label: "Toutes" },
  { value: "landscape", label: "Paysage" },
  { value: "portrait", label: "Portrait" },
];

type ModalTab = "elements" | "illustrations" | "photos";

interface ModalImage {
  id: string;
  thumb: string;
  large: string;
  alt: string;
}

function AdvancedSearchModal({ onClose, onSelect, initialQuery = "", initialTab = "elements" }: { onClose: () => void; onSelect: (url: string) => void | Promise<void>; initialQuery?: string; initialTab?: ModalTab }) {
  const { loadingKey: modalLoadingKey, run: modalRun } = useLoadingClick();
  const handleModalPick = (key: string, url: string) => modalRun(key, async () => onSelect(url));
  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const [images, setImages] = useState<ModalImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [color, setColor] = useState("");
  const [orientation, setOrientation] = useState("");
  const [order, setOrder] = useState<"popular" | "latest">("popular");
  const [library, setLibrary] = useState<LibraryCategory[]>([]);
  // Biblio catalogues — `biblioColors` is consulted only by the
  // closest-hex mapping helper (no dedicated colour dropdown; the
  // existing Pixabay-style colour picker drives both sources).
  // `biblioEvents` powers the Calendrier marketing dropdown which
  // has no Pixabay/Pexels equivalent so it lives on its own.
  const [biblioColors, setBiblioColors] = useState<BiblioColor[]>([]);
  const [biblioEvents, setBiblioEvents] = useState<BiblioEvent[]>([]);
  const [biblioEventId, setBiblioEventId] = useState<number | "">("");
  const controllerRef = useRef<AbortController | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Load library + biblio catalogues (colours + marketing events)
  useEffect(() => {
    fetch("/data/elements-library.json")
      .then((r) => r.json())
      .then((data) => setLibrary(data))
      .catch(() => {});
    // Fire-and-forget — both helpers cache module-side so repeat opens
    // of the modal don't refetch. Empty arrays on failure (offline /
    // biblio not configured) → the dropdowns simply don't render.
    getBiblioColors().then(setBiblioColors).catch(() => {});
    getBiblioEvents().then(setBiblioEvents).catch(() => {});
  }, []);

  // Get Selfizee matches for current query
  function getSelfizeeResults(q: string): ModalImage[] {
    if (!q.trim()) return [];
    const lower = q.toLowerCase();
    const seen = new Set<number>();
    return library
      .filter((cat) => cat.name.toLowerCase().includes(lower) || cat.slug.includes(lower) || cat.keywords.some((kw) => kw.includes(lower)))
      .flatMap((cat) => cat.elements)
      .filter((el) => { if (seen.has(el.id)) return false; seen.add(el.id); return true; })
      .map((el) => ({ id: `sf-${el.id}`, thumb: el.thumbnail, large: el.url, alt: el.name }));
  }

  const doSearch = useCallback(async (q: string, p: number, col: string, ori: string, source: ModalTab, append = false, sort = order) => {
    if (!q.trim()) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);

    try {
      let results: ModalImage[] = [];
      let total = 0;
      let count = 0;

      // Biblio (bibliotheques-back) call runs in parallel with the
      // Pexels/Pixabay one. Map the studio's tab → API image_type.
      const biblioType: "element" | "illustration" | "photo" =
        source === "elements" ? "element"
        : source === "illustrations" ? "illustration"
        : "photo";
      const biblioOrientation =
        ori === "landscape" || ori === "portrait" || ori === "square" ? ori : undefined;

      // Single-source colour picker: the existing Pixabay-style
      // chips drive BOTH Pixabay/Pexels (text name "red","blue",...)
      // AND biblio (numeric colorId). Pixabay name → biblio id is
      // resolved by Euclidean RGB distance against the biblio palette
      // — anything beyond visible-similarity threshold (100/441)
      // returns undefined so biblio falls back to unfiltered rather
      // than showing a wrong colour. "transparent" is the synthetic
      // forced on the elements tab — not a user pick, never mapped.
      let effectiveBiblioColorId: number | undefined;
      if (col && col !== "transparent") {
        const palette = COLORS.find((c) => c.value === col);
        if (palette?.hex) {
          effectiveBiblioColorId = closestBiblioColorId(palette.hex, biblioColors);
        }
      }
      const effectiveBiblioEventId = biblioEventId === "" ? undefined : biblioEventId;

      const biblioPromise = fetchBiblioImages({
        type: biblioType,
        q,
        page: p,
        perPage: 30,
        orientation: biblioOrientation,
        colorId: effectiveBiblioColorId,
        eventId: effectiveBiblioEventId,
        signal: controller.signal,
      });

      if (source === "photos") {
        const params = new URLSearchParams({ query: q, per_page: "80", page: String(p) });
        if (col) params.set("color", col);
        if (ori) params.set("orientation", ori);
        const res = await fetch(apiUrl(`/api/pexels?${params.toString()}`), { signal: controller.signal });
        if (!res.ok) throw new Error("err");
        const data = await res.json();
        total = data.total_results || 0;
        count = (data.photos || []).length;
        results = (data.photos || []).map((p: any) => ({
          id: `pexels-${p.id}`, thumb: p.src.medium, large: p.src.large, alt: p.alt || "",
        }));
      } else {
        const params = new URLSearchParams({ query: q, per_page: "60", page: String(p), image_type: "illustration", order: sort });
        if (source === "elements") params.set("color", "transparent");
        else if (col) params.set("color", col);
        if (ori && ori !== "square") params.set("orientation", ori === "landscape" ? "horizontal" : "vertical");
        const res = await fetch(apiUrl(`/api/pixabay?${params.toString()}`), { signal: controller.signal });
        if (!res.ok) throw new Error("err");
        const data = await res.json();
        total = data.totalHits || 0;
        count = (data.hits || []).length;
        results = (data.hits || []).map((h: any) => ({
          id: `px-${source}-${h.id}`, thumb: h.previewURL, large: h.largeImageURL || h.webformatURL, alt: h.tags || "",
        }));
      }

      // Await the biblio fetch + map its items to the ModalImage shape.
      // Empty array on failure (the client returns {items:[]} so this
      // never throws — modal degrades gracefully if biblio is offline).
      const biblioRes = await biblioPromise;
      const biblioResults: ModalImage[] = (biblioRes.items || [])
        .filter((it) => it.thumbnail && it.fullSize)
        .map((it) => ({
          id: `bib-${it.id}`,
          thumb: it.thumbnail as string,
          large: it.fullSize as string,
          alt: it.name,
        }));

      if (append) {
        // On "Charger +" both sources fetch the next page in parallel;
        // append biblio first then the Pexels/Pixabay batch, dedupe by id.
        setImages((prev) => {
          const ids = new Set(prev.map((i) => i.id));
          return [
            ...prev,
            ...biblioResults.filter((r) => !ids.has(r.id)),
            ...results.filter((r) => !ids.has(r.id)),
          ];
        });
      } else {
        // First page: biblio first, then Selfizee static (for elements /
        // illustrations only), then Pexels/Pixabay. Dedupe ids across
        // sources so the same image (rare) never appears twice.
        if (source !== "photos") {
          const selfizee = getSelfizeeResults(q);
          const seen = new Set<string>();
          const dedup = (arr: ModalImage[]) =>
            arr.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
          setImages([
            ...dedup(biblioResults),
            ...dedup(selfizee),
            ...dedup(results),
          ]);
        } else {
          const seen = new Set<string>();
          const dedup = (arr: ModalImage[]) =>
            arr.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
          setImages([...dedup(biblioResults), ...dedup(results)]);
        }
      }
      // hasMore = either source still has pages. Total reported is the
      // Pexels/Pixabay one since biblio's total may not align with the
      // user's mental model of "search result count".
      setTotalResults(total);
      const perPage = source === "photos" ? 80 : 60;
      setHasMore(biblioRes.hasMore || (p * perPage < total));
      setPage(p);
    } catch (e: any) {
      if (e?.name !== "AbortError" && !append) setImages([]);
    }
    setLoading(false);
    // Captures biblioColors (used by the hex→id mapping) and
    // biblioEventId via closure; recreate when they change so the
    // next call sees fresh values. order is also captured as the
    // default sort param — same deal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biblioColors, biblioEventId, order]);

  const DEFAULT_QUERIES: Record<ModalTab, string> = {
    elements: "fête",
    illustrations: "mariage",
    photos: "celebration party",
  };

  const PLACEHOLDERS: Record<ModalTab, string> = {
    elements: "Ex: confettis, ballons, coeurs, couronne...",
    illustrations: "Ex: mariage, tropical, noël, vintage...",
    photos: "Ex: fête, mariage, confettis, plage...",
  };

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      const q = initialQuery.trim() || DEFAULT_QUERIES[initialTab || "elements"];
      if (!initialQuery.trim()) setQuery(q);
      doSearch(q, 1, color, orientation, tab);
      return;
    }
    const q = query.trim() || DEFAULT_QUERIES[tab];
    doSearch(q, 1, color, orientation, tab);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [color, orientation, tab, order, biblioEventId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(query, 1, color, orientation, tab);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header: title + subtitle + close */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Recherche avancée</h2>
            <p className="text-[10px] text-gray-400">+ de 4 millions de photos, illustrations et éléments</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Search bar + all filters in one block */}
        <div className="px-6 py-3 space-y-2.5 border-b border-gray-50">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 relative">
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={PLACEHOLDERS[tab]}
                autoFocus
                className="w-full px-4 py-2.5 pr-8 rounded-xl bg-gray-100 border border-gray-200 text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/20"
              />
              {query && (
                <button type="button" onClick={() => { setQuery(""); setImages([]); setTotalResults(0); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-gray-300 hover:bg-gray-400 text-white transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            <button type="submit" className="px-4 py-2.5 bg-[#4f46e5] text-white rounded-xl hover:bg-[#4338ca] transition-colors font-medium text-sm">Rechercher</button>
          </form>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Type filter */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {([
                { id: "elements" as const, label: "Éléments" },
                { id: "illustrations" as const, label: "Illustrations" },
                { id: "photos" as const, label: "Photos" },
              ]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setImages([]); setPage(1); setTotalResults(0); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Orientation — photos only */}
            {tab === "photos" && (
              <div className="flex gap-1">
                {ORIENTATIONS.map((o) => (
                  <button key={o.value} onClick={() => setOrientation(o.value)}
                    className={`px-2 py-1 rounded-lg text-[10px] transition-colors ${orientation === o.value ? "bg-[#4f46e5] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                  >{o.label}</button>
                ))}
              </div>
            )}

            {/* Color — not for elements (forced transparent) */}
            {tab !== "elements" && (
              <div className="flex gap-1 items-center">
                {COLORS.map((c) => (
                  <button key={c.value} onClick={() => setColor(c.value)} title={c.label}
                    className={`w-[18px] h-[18px] rounded-full ${c.swatch} transition-all ${color === c.value ? "ring-2 ring-[#4f46e5] ring-offset-1 scale-110" : "hover:scale-110"}`}
                    style={{ width: 18, height: 18 }}
                  />
                ))}
              </div>
            )}

            {/* Sort — Pixabay tabs only */}
            {tab !== "photos" && (
              <div className="flex gap-1">
                {([{ value: "popular", label: "Populaires" }, { value: "latest", label: "Récents" }] as const).map((s) => (
                  <button key={s.value} onClick={() => setOrder(s.value)}
                    className={`px-2 py-1 rounded-lg text-[10px] transition-colors ${order === s.value ? "bg-[#4f46e5] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                  >{s.label}</button>
                ))}
              </div>
            )}

            {/* Calendrier marketing — filter biblio by eventId. */}
            {biblioEvents.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 font-medium">Calendrier marketing</span>
                <select
                  value={biblioEventId}
                  onChange={(e) => setBiblioEventId(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                  className="text-[10px] px-2 py-1 rounded-lg bg-gray-100 border border-gray-200 text-gray-700 focus:outline-none focus:border-[#4f46e5]"
                >
                  <option value="">Tous</option>
                  {biblioEvents.filter((e) => e.imageCount > 0).map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Results count */}
        {totalResults > 0 && !loading && (
          <div className="px-6 py-1.5 text-xs text-gray-400">{totalResults.toLocaleString("fr-FR")} résultats</div>
        )}

        {/* Grid */}
        <div ref={gridRef} className="flex-1 overflow-y-auto px-6 py-4">
          {loading && images.length === 0 && (
            <div className="flex items-center justify-center h-full"><p className="text-gray-400 text-sm">Recherche en cours...</p></div>
          )}
          {!loading && images.length === 0 && query && (
            <div className="flex items-center justify-center h-full"><p className="text-gray-400 text-sm">Aucun résultat.</p></div>
          )}
          {!query && images.length === 0 && !loading && (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <svg className="w-12 h-12 text-gray-200 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <p className="text-gray-500 text-sm font-medium">Explorez + de 4 millions d{"'"}images</p>
                <p className="text-gray-400 text-xs mt-1">Tapez un mot-clé : mariage, tropical, confettis...</p>
              </div>
            </div>
          )}

          {images.length > 0 && tab === "photos" && (
            <div className="columns-3 sm:columns-4 md:columns-5 gap-2">
              {images.map((img) => (
                <div key={img.id} className="relative group rounded-xl overflow-hidden cursor-pointer mb-2 break-inside-avoid" onClick={() => handleModalPick(img.id, img.large)}>
                  <img src={img.thumb} alt={img.alt} className="w-full h-auto" loading="lazy" />
                  <HoverPlus isSvg={isSvgUrl(img.large)} />
                  {modalLoadingKey === img.id && <ThumbSpinner />}
                </div>
              ))}
            </div>
          )}

          {images.length > 0 && tab !== "photos" && (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {images.map((img) => (
                <div key={img.id} className="relative group rounded-xl overflow-hidden cursor-pointer border border-gray-100 hover:border-[#4f46e5] transition-all bg-gray-50" onClick={() => handleModalPick(img.id, img.large)} title={img.alt}>
                  <img src={img.thumb} alt={img.alt} className="w-full aspect-square object-contain p-1" loading="lazy" />
                  <HoverPlus isSvg={isSvgUrl(img.large)} />
                  {modalLoadingKey === img.id && <ThumbSpinner />}
                </div>
              ))}
            </div>
          )}

          {hasMore && !loading && (
            <div className="text-center py-6">
              <button onClick={() => doSearch(query, page + 1, color, orientation, tab, true)}
                className="px-6 py-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors text-sm font-medium">
                Charger +
              </button>
            </div>
          )}
          {loading && images.length > 0 && <p className="text-center py-4 text-gray-400 text-xs">Chargement...</p>}
        </div>
      </div>
    </div>
  );
}

export default React.memo(PanelPhotos);
