"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { type Format, type Gabarit } from "@/studio/lib/gabarits";
import React from "react";
import { toast } from "../../Toast";
import { useTypeFormats } from "../hooks/useTypeFormats";
import { useLoadingClick } from "../hooks/useLoadingClick";
import { ThumbSpinner } from "./ThumbSpinner";
import { proxyImageUrl } from "@/studio/lib/imageProxy";
import { apiUrl } from "@/studio/lib/api";
import { getCanvasDimensions, CUSTOM_PROPS } from "../types";
import { getCheckerCanvas } from "../canvas/canvasUtils";
import {
  collectFontFamilies,
  fetchExternalFontsByNames,
  getCustomFonts,
  loadGoogleFont,
  GOOGLE_FONTS,
} from "./fonts";
import { useEditorStore } from "../store/editorStore";
import { modelePermis } from "@/studio/lib/restrictionStudio";

// Catalogue des modèles servi nativement par Kalifun via apiUrl()
// (/editor-api/bibliotheques/*) — plus de backend externe.

// Module-level cache so switching sidebar tabs (which unmounts/remounts
// PanelModeles) doesn't re-fetch the ~5400-row catalogue every time.
// The fetch is heavy (~1.5 GB server memory per request per the API doc);
// we only ever pay it once per session.
let catalogueCache: CatalogueItem[] | null = null;
let catalogueInflight: Promise<CatalogueItem[]> | null = null;

// Module-level state survives the format-switch remount that fires when the
// user clicks a catalogue model with a non-matching format. Without this,
// the user lands back on the "home" view of the Modèles tab after the
// format switches — losing scroll position, filters, and tab context.
type PersistedView = "home" | "vierges" | "catalogue";
type PersistedPanelState = {
  view: PersistedView;
  catalogueSearch: string;
  filterPoses: number | null;
  activeTheme: string | null;
};
const persistedPanelState: PersistedPanelState = {
  view: "home",
  catalogueSearch: "",
  filterPoses: null,
  activeTheme: null,
};

/** Pré-règle le panneau Modèles pour qu'il s'ouvre directement sur le catalogue
 *  Selfizee (utilisé quand on entre dans le studio via « Catalogue Selfizee »). */
export function presetModelesCatalogue(): void {
  persistedPanelState.view = "catalogue";
}

// Modèle choisi depuis la PAGE catalogue (entrée du studio) et à charger
// automatiquement dès que l'éditeur est prêt. Module-level pour survivre au
// montage de l'éditeur ; consommé une seule fois par PanelModeles.
let pendingAutoModel: CatalogueItem | null = null;
export function setPendingAutoModel(item: CatalogueItem | null): void {
  pendingAutoModel = item;
}
function takePendingAutoModel(): CatalogueItem | null {
  const m = pendingAutoModel;
  pendingAutoModel = null;
  return m;
}

export async function fetchCatalogue(): Promise<CatalogueItem[]> {
  if (catalogueCache) return catalogueCache;
  if (catalogueInflight) return catalogueInflight;
  catalogueInflight = (async () => {
    const res = await fetch(apiUrl(`/api/bibliotheques/catalogue`));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const looksGrouped = data.some((e: any) => Array.isArray(e?.bibliotheques));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flat: any[] = looksGrouped ? data.flatMap((e) => e.bibliotheques || []) : data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: CatalogueItem[] = flat
      .map((b: any) => ({
        id: Number(b.id),
        nom: String(b.nom ?? b.name ?? ""),
        format_id: Number(b.format_id) || 0,
        nbr_pose: Number(b.nbr_pose) || 0,
        url_sm_thumbnail: b.url_sm_thumbnail || b.url_xs_thumbnail || b.url_thumbnail || "",
        url_thumbnail: b.url_thumbnail || b.url_md_thumbnail || b.url_sm_thumbnail || "",
        file_url: b.file_url || b.url_thumbnail || b.url_md_thumbnail || "",
      }))
      .filter((it) => it.id && it.file_url && (it.url_sm_thumbnail || it.url_thumbnail));
    catalogueCache = items;
    return items;
  })();
  try {
    return await catalogueInflight;
  } finally {
    catalogueInflight = null;
  }
}

// Pulls a single template's fabric JSON. The CakePHP backend stores designs
// authored against fabric.js v3, so the response goes through normalizeFabricV3JSON
// before being handed to fabric v7 on our side.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchModelOptions(id: number): Promise<any | null> {
  try {
    const res = await fetch(apiUrl(`/api/bibliotheques/options/${id}`));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("Failed to fetch model options:", err);
    return null;
  }
}

// Fabric v3 → v7 compatibility shim. The catalogue was authored against fabric
// v3 so we need to normalize the JSON before fabric v7 can enliven it.
// Handles the shape variations (envelope, stringified payload), bumps the
// version field so the loader doesn't bail, and drops/translates fields that
// changed semantics between v3 and v6+ (clipTo → clipPath, image CORS, filter
// shape). Returns the parsed fabric scene or null when the payload is unusable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeFabricV3JSON(raw: any): any | null {
  if (!raw) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = raw;
  // The CakePHP API wraps the scene as { data: { ..., json_editeur: "<stringified fabric JSON>" } }.
  // Unwrap envelopes/strings until we either reach a fabric scene shape or give up.
  for (let i = 0; i < 6; i++) {
    if (typeof json === "string") {
      try { json = JSON.parse(json); } catch { return null; }
      continue;
    }
    if (json && typeof json === "object" && !Array.isArray(json.objects)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inner = (json as any).json_editeur ?? (json as any).data ?? (json as any).canvasState ?? (json as any).options ?? (json as any).json;
      if (inner) { json = inner; continue; }
    }
    break;
  }
  if (!json || typeof json !== "object" || !Array.isArray(json.objects)) return null;
  // Force the version so fabric v7's loader doesn't trip on the v3 marker.
  json.version = "7.2.0";

  // ── Studio-system adaptation (v3 booth conventions → our flags) ──
  // The legacy booth packs three categories of helper objects into the scene:
  //
  //   1. rectLeft / rectTop / rectRight / rectBottom — invisible bleed masks
  //      around the print area. Drop them; our studio handles bleed natively.
  //
  //   2. creu_<n>-fv — a 0-opacity placeholder image with a clipPath used by
  //      the booth to preview a user photo inside the shoot zone. We fill
  //      shoot zones from real captures, so the placeholder is dead weight.
  //
  //   3. creu_<n> — the rect that "punches" the photo zone into the cadre
  //      via globalCompositeOperation: "destination-out". We REUSE these as
  //      our shoot zones (don't add new ones): strip the composite op and
  //      tag with the studio's flags so re-edits round-trip correctly.
  //
  // Drop the booth's invisible bleed-mask rects and the 0-opacity creu_<n>-fv
  // placeholders — these are booth-only helpers that don't render in the
  // studio. Everything else (cadre, creu_<n>, images, text, …) keeps every
  // single one of its source properties.
  const BORDER_IDS = new Set(["rectLeft", "rectRight", "rectTop", "rectBottom"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json.objects = json.objects.filter((o: any) => {
    if (!o) return false;
    const id = String(o.id ?? "");
    if (BORDER_IDS.has(id)) return false;
    if (/^creu_\d+-fv$/i.test(id)) return false;
    return true;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cadre = json.objects.find((o: any) => String(o.id) === "cadre");
  const leftCadre = cadre ? Number(cadre.left) || 0 : 0;
  const topCadre = cadre ? Number(cadre.top) || 0 : 0;
  const cadreW = cadre ? (Number(cadre.width) || 0) * (Number(cadre.scaleX) || 1) : 0;
  const cadreH = cadre ? (Number(cadre.height) || 0) * (Number(cadre.scaleY) || 1) : 0;
  console.log("[catalogue][debug] normalizer — cadre offsets:", { leftCadre, topCadre, cadreW, cadreH });

  // Rebase ONLY left/top so the cadre's top-left becomes the studio canvas
  // origin (canvas dimensions match the cadre, not the full booth canvas).
  // Every other property stays exactly as authored in json_editeur.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json.objects.forEach((o: any) => {
    o.left = (Number(o.left) || 0) - leftCadre;
    o.top = (Number(o.top) || 0) - topCadre;
  });

  // Tag the cadre as the solid bg + tag creu_<n> rects as shoot zones
  // (only stripping the destination-out composite op which the studio
  // doesn't use). NO other property is touched.
  if (cadre) cadre._isSolidBg = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json.objects.forEach((o: any) => {
    const id = String(o.id ?? "");
    const m = id.match(/^creu_(\d+)$/i);
    if (m && o.globalCompositeOperation === "destination-out") {
      delete o.globalCompositeOperation;
      o._isShootZone = true;
      o._shootIndex = parseInt(m[1], 10);
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fix = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    // v3 stored a clipTo function that doesn't survive JSON anyway; v6+ uses
    // clipPath instead. Drop it so the loader doesn't try to eval anything.
    delete obj.clipTo;
    // v3 also serialized transformMatrix; fabric v6+ derives it from the
    // individual transform props and chokes on a stale matrix.
    delete obj.transformMatrix;
    // Lowercase types are already what v6+ expects, but a few old payloads
    // shipped capitalized "Image"/"Textbox". Normalize to be safe.
    if (typeof obj.type === "string") obj.type = obj.type.toLowerCase();
    // Images need explicit CORS in modern fabric or export-to-canvas taints.
    // v3 wrote "Anonymous" capitalized; the DOM expects lowercase. The CakePHP
    // hosts (booth.selfizee.fr / static-media-booth.selfizee.fr) don't return
    // Access-Control-Allow-Origin, so we route those through our backend
    // image proxy that does.
    if (obj.type === "image" && obj.src) {
      obj.src = proxyImageUrl(obj.src);
      obj.crossOrigin = "anonymous";
    }
    // Drop filters whose shape we can't recognize so fabric doesn't throw.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray(obj.filters)) obj.filters = obj.filters.filter((f: any) => f && typeof f === "object" && f.type);
    if (obj.clipPath) fix(obj.clipPath);
    if (Array.isArray(obj.objects)) obj.objects.forEach(fix);
  };
  json.objects.forEach(fix);

  // Scene effective size = cadre print area (after rebasing, cadre is the
  // bounding box of the design). Fall back to bbox if no cadre rect is
  // present, which keeps the normalizer working for non-standard payloads.
  if (cadreW > 0 && cadreH > 0) {
    json.width = cadreW;
    json.height = cadreH;
  } else if (!Number(json.width) || !Number(json.height)) {
    let maxX = 0;
    let maxY = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json.objects.forEach((o: any) => {
      const x = Number(o.left || 0) + Number(o.width || 0) * Number(o.scaleX || 1);
      const y = Number(o.top || 0) + Number(o.height || 0) * Number(o.scaleY || 1);
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });
    if (maxX > 0) json.width = maxX;
    if (maxY > 0) json.height = maxY;
  }
  return json;
}

export interface CatalogueItem {
  id: number;
  nom: string;
  format_id: number;
  nbr_pose: number;
  url_sm_thumbnail: string;
  url_thumbnail: string;
  file_url: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PanelModeles({ currentFormat, currentGabarit, onSelect, canvasRef, canvasWidth, canvasHeight, bleedPx = 0, typeSlug }: {
  currentFormat: Format;
  currentGabarit: Gabarit;
  onSelect?: (
    format: Format,
    gabarit: Gabarit,
    keepContent?: boolean,
    /** When set, Sidebar serializes the canvas with these dims as the
     *  "previous" dims instead of the live canvas dims. Used after a
     *  catalogue load so smart-repositioning sees prevDims == newDims
     *  and runs as a no-op (we already pre-scaled in PanelModeles). */
    prevDimsOverride?: { width: number; height: number },
  ) => void;
  canvasRef?: React.RefObject<any>;
  canvasWidth: number;
  canvasHeight: number;
  bleedPx?: number;
  /** Current type context. "cadres" unlocks the Selfizee catalogue, other types
   *  only show the blank formats list. */
  typeSlug?: string;
}) {
  const isCadres = (typeSlug || "cadres") === "cadres";
  const { formats: FORMATS } = useTypeFormats(typeSlug);
  type View = "home" | "vierges" | "catalogue";
  // Initialise from the module-level persisted state so the user lands
  // back on the same view (with the same filters/search) after a format
  // switch remount.
  const [view, _setView] = useState<View>(persistedPanelState.view);
  const setView = (v: View) => { persistedPanelState.view = v; _setView(v); };
  const [expandedFormat, setExpandedFormat] = useState<string | null>(currentFormat.id);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [catalogueSearch, _setCatalogueSearch] = useState(persistedPanelState.catalogueSearch);
  const setCatalogueSearch = (s: string) => { persistedPanelState.catalogueSearch = s; _setCatalogueSearch(s); };
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [filterPoses, _setFilterPoses] = useState<number | null>(persistedPanelState.filterPoses);
  const setFilterPoses = (v: number | null) => { persistedPanelState.filterPoses = v; _setFilterPoses(v); };
  const [activeTheme, _setActiveTheme] = useState<string | null>(persistedPanelState.activeTheme);
  const setActiveTheme = (v: string | null) => { persistedPanelState.activeTheme = v; _setActiveTheme(v); };
  const [visibleCount, setVisibleCount] = useState(20);
  const [previewItem, setPreviewItem] = useState<CatalogueItem | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ item?: CatalogueItem; format?: Format; gabarit?: Gabarit } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const { loadingKey: modLoadingKey, run: modRun } = useLoadingClick();
  const setCataloguePending = useEditorStore((s) => s.setCataloguePending);

  // Reset visible count AND scroll position when filters change —
  // otherwise users scrolled to the bottom of a large result set get
  // stuck at the bottom after switching to a filter with fewer items.
  useEffect(() => {
    setVisibleCount(20);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [filterPoses, activeTheme, catalogueSearch]);

  // Pulls the full Modèle catalogue from the CakePHP backend (cached at
  // module level). When the cache is already populated (e.g. user re-opened
  // the panel after switching tabs) we hydrate state synchronously, so no
  // network call and no loading flicker.
  const loadCatalogue = useCallback(async () => {
    if (catalogue.length > 0) return;
    if (catalogueCache) {
      setCatalogue(catalogueCache);
      return;
    }
    setLoadingCatalogue(true);
    try {
      const items = await fetchCatalogue();
      setCatalogue(items);
    } catch (err) {
      console.error("Failed to load catalogue:", err);
    }
    setLoadingCatalogue(false);
  }, [catalogue.length]);

  // Pre-load on mount so the home-card badge can show the real total before
  // the user opens the catalogue. Cadres-only — other type slugs don't expose
  // the catalogue card at all. Cache hits are O(1) so re-mounts on tab
  // switches are essentially free.
  useEffect(() => {
    if (isCadres) loadCatalogue();
  }, [isCadres, loadCatalogue]);

  const openCatalogue = () => {
    setView("catalogue");
    loadCatalogue();
  };

  const addCatalogueImage = async (item: CatalogueItem) => {
    const canvas = canvasRef?.current;
    if (!canvas) return;
    // Check if canvas has user content (more than just background)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasContent = canvas.getObjects().some((o: any) => !o._isShootZone && !o._isSolidBg && !o._isDesignAreaBg && !o._isTextGuide);
    if (hasContent) {
      setConfirmAction({ item });
      return;
    }
    applyCatalogueModel(item);
  };

  // Replaces the canvas content with the template's json_editeur scene. We
  // never fall back to an image overlay — if the JSON can't be loaded the
  // panel surfaces an error and bails.
  //
  // Format sync: when the API's `format_id` matches a local Format's
  // formatBoothId AND the studio is currently on a different format, the
  // scene is stamped onto the current canvas first (so the Sidebar wrapper
  // can serialize it), then onSelect is fired so the editor remounts at the
  // right dimensions and smart-reposition rescales onto the new canvas.
  const applyCatalogueModel = async (item: CatalogueItem) => {
    const canvas = canvasRef?.current;
    if (!canvas) return;

    // Swallow the per-object event storm a catalogue load + format-switch
    // remount produces (each enlivened object would otherwise trigger an
    // "object:added" → debouncedSaveHistory call, flooding undo/redo with
    // N noisy entries). useCanvasInit clears suppressHistoryRef and pushes
    // ONE consolidated entry — labelled with pendingFormatTransitionLabel —
    // after the new mount settles.
    const editorStore = useEditorStore.getState();
    editorStore.suppressHistoryRef.current = true;
    editorStore.setPendingFormatTransitionLabel(`Modèle catalogue — ${item.nom || "sans nom"}`);

    // Show the loading overlay for the entire load. The flag lives in the
    // editor store, so it survives the format-switch remount that happens
    // mid-load — without this the overlay would disappear the instant the
    // editor unmounts and the user would see a blank canvas while the new
    // mount is still booting up.
    setCataloguePending(`Chargement du modèle « ${item.nom || "sans nom"} »`);
    // Safety net: clear the overlay after a generous timeout if anything
    // goes wrong silently. The success path clears it earlier.
    const safetyTimer = window.setTimeout(() => setCataloguePending(null), 30000);

    // Stale-load guard — clicking another template mid-load shouldn't pile up.
    const loadId = Symbol();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (applyCatalogueModel as any)._lastLoad = loadId;

    const raw = await fetchModelOptions(item.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((applyCatalogueModel as any)._lastLoad !== loadId) {
      // Newer click superseded this one — let it own the overlay state.
      return;
    }
    const scene = normalizeFabricV3JSON(raw);

    if (!scene || !Array.isArray(scene.objects) || scene.objects.length === 0) {
      toast("Impossible de charger ce modèle.", "error");
      window.clearTimeout(safetyTimer);
      setCataloguePending(null);
      // Release the history gates we set above so future edits can save.
      const s = useEditorStore.getState();
      s.suppressHistoryRef.current = false;
      s.setPendingFormatTransitionLabel(null);
      return;
    }

    // Match against local formats via formatBoothId. The `format_id` lives on
    // the wrapper (NOT inside the fabric scene).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapper: any = raw && typeof raw === "object" && raw.data && typeof raw.data === "object" ? raw.data : raw;
    const externalFormatId = Number(wrapper?.format_id);
    const matchedFormat: Format | undefined = externalFormatId
      ? FORMATS.find((f) => f.formatBoothId != null && Number(f.formatBoothId) === externalFormatId)
      : undefined;
    const matchedGabarit = matchedFormat?.gabarits[0];
    const needsFormatSwitch =
      !!matchedFormat && !!matchedGabarit && matchedFormat.id !== currentFormat.id && !!onSelect;

    const fabric = await import("fabric");

    // Wipe everything except text guides / design-area bg. The catalogue scene
    // brings its own background (cadre rect) AND its own shoot zones (creu_<n>)
    // — keeping the studio's auto-created shoots would duplicate them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toRemove = canvas.getObjects().filter((o: any) => !o._isTextGuide && !o._isDesignAreaBg);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toRemove.forEach((o: any) => canvas.remove(o));

    // ── Compute the per-axis fit scales ──
    // The booth-side cadre is sized at the print resolution (e.g. 1856×1252
    // for "Carte postale paysage") while the studio canvas runs at
    // CANVAS_BASE-derived dims (e.g. 800×538). The source aspect (1.482)
    // and the studio target aspect (1.487 after rounding canvasHeight)
    // don't perfectly match, so a UNIFORM scale leaves a 1-2% margin on
    // one axis where the cadre bg shows through and any object's pixel
    // position in the export drifts off booth-fidelity by ~0.3%.
    //
    // We apply scaleX = targetDesignW / cadreW and scaleY = targetDesignH /
    // cadreH independently — slight aspect distortion (~0.3% in our case)
    // is invisible in practice, AND it makes every position + bounding
    // box land at the exact same fraction of the studio's design area as
    // the booth's cadre — pixel-perfect match in the export when both
    // sides emit at the same long-edge resolution.
    //
    // Target dims = matched format's design area when format switching,
    // else current canvas's design area.
    const cadreW = Number(scene.width) || canvasWidth;
    const cadreH = Number(scene.height) || canvasHeight;
    // canvasWidth/Height props from Sidebar are the DESIGN area (already
    // exclude bleed — store stores them as `canvasWidth` not `bufferWidth`).
    // So no extra subtraction needed in the fallback branch.
    const targetDims = matchedFormat ? getCanvasDimensions(matchedFormat) : null;
    const targetDesignW = targetDims ? targetDims.canvasWidth : canvasWidth;
    const targetDesignH = targetDims ? targetDims.canvasHeight : canvasHeight;
    const targetBleed = targetDims ? targetDims.BLEED_PX : (bleedPx || 0);
    const targetBufferW = targetDesignW + 2 * targetBleed;
    const targetBufferH = targetDesignH + 2 * targetBleed;
    const fitScaleX = targetDesignW / cadreW;
    const fitScaleY = targetDesignH / cadreH;
    console.log("[catalogue][debug] dims & scale", {
      sourceCadre: { width: cadreW, height: cadreH },
      target: { designW: targetDesignW, designH: targetDesignH, bleed: targetBleed, bufferW: targetBufferW, bufferH: targetBufferH },
      fitScaleX, fitScaleY,
      currentCanvasProps: { canvasWidth, canvasHeight, bleedPx },
      matchedFormat: matchedFormat ? { id: matchedFormat.id, name: matchedFormat.name, formatBoothId: matchedFormat.formatBoothId } : null,
      needsFormatSwitch,
    });
    console.log("[catalogue][debug] normalized scene.objects (input to enliven):",
      JSON.parse(JSON.stringify(scene.objects)));

    // ── Pre-load every fontFamily the model references ──
    // Fabric measures text at enliven time; any font that hasn't loaded yet
    // gets sized with a fallback metric and the layout drifts. Walk the
    // scene, partition into "Google Fonts (in our list) / generic / already
    // registered" vs. "external booth fonts", load both groups, and await
    // document.fonts.ready before enlivening.
    // Tracks any "MONTSERRAT" → "Montserrat" rewrites we'll apply to
    // text objects after enliven so Fabric resolves the loaded font.
    // Built inside the try block below; declared here so it's reachable
    // from the enliven loop further down.
    const fontRewrites = new Map<string, string>();
    try {
      const allFamilies = collectFontFamilies(scene.objects);
      const generic = new Set(["sans-serif", "serif", "monospace"]);
      // canonical-case lookup so "MONTSERRAT" / "montserrat" / "Montserrat"
      // all resolve to the canonical "Montserrat" used in Google's CSS URL.
      const googleCanon = new Map<string, string>(
        GOOGLE_FONTS.map((n) => [n.toLowerCase(), n]),
      );
      const registered = new Set(getCustomFonts().map((f) => f.displayName));
      const googleNeeded: string[] = [];
      const externalNeeded: string[] = [];
      for (const fam of allFamilies) {
        if (!fam || generic.has(fam)) continue;
        if (registered.has(fam)) continue;
        const canon = googleCanon.get(fam.toLowerCase());
        if (canon) {
          googleNeeded.push(canon);
          // If the source uses non-canonical casing, schedule a rewrite
          // on the live text objects below: Fabric does an EXACT match
          // against the loaded FontFace family, and Google's CSS load
          // registers it under the canonical name.
          if (canon !== fam) fontRewrites.set(fam, canon);
        } else {
          externalNeeded.push(fam);
        }
      }
      console.log("[catalogue][debug] fonts to load:", { allFamilies, googleNeeded, externalNeeded, rewrites: Object.fromEntries(fontRewrites) });
      // Run both fetches in parallel — Google CSS load + booth API call.
      const [, externalLoaded] = await Promise.all([
        Promise.all(googleNeeded.map((n) => loadGoogleFont(n))),
        externalNeeded.length > 0
          ? fetchExternalFontsByNames(externalNeeded)
          : Promise.resolve([] as Awaited<ReturnType<typeof fetchExternalFontsByNames>>),
      ]);
      // Fallback: any font we asked the booth API for that didn't come
      // back is probably a Google Font with a non-canonical casing /
      // separator the booth doesn't host (e.g. "MONTSERRAT" maps to
      // Google's "Montserrat", "BebasNeue-Bold" maps to "Bebas Neue").
      // Try them as Google Fonts so they at least render close to the
      // intended typeface instead of falling back to the default.
      const externalLoadedNames = new Set(
        (externalLoaded as { displayName: string }[]).map((f) => f.displayName),
      );
      const fontFallbacks = externalNeeded.filter((n) => !externalLoadedNames.has(n));
      if (fontFallbacks.length > 0) {
        console.log("[catalogue][debug] booth API didn't return — trying as Google Fonts:", fontFallbacks);
        await Promise.all(fontFallbacks.map((n) => {
          const canon = googleCanon.get(n.toLowerCase()) || n;
          if (canon !== n) fontRewrites.set(n, canon);
          return loadGoogleFont(canon);
        }));
      }
      // Final await to make sure the FontFace registrations have all flushed.
      try {
        const docFonts = (document as any).fonts;
        if (docFonts?.ready) await docFonts.ready;
      } catch { /* ignore */ }
    } catch (err) {
      console.warn("[catalogue] font preload failed (continuing with fallbacks):", err);
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const enlivened: any[] = await fabric.util.enlivenObjects(scene.objects);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((applyCatalogueModel as any)._lastLoad !== loadId) return;

      // Each element of the v3 scene goes onto the canvas as its own fabric
      // object — text stays text, image stays image, rect stays rect. We
      // never flatten/rasterise the design. Iteration order = source array
      // order, so canvas.add stacks them at their original z-index.
      // Tag every object with _fromCatalogue so smart-reposition + the
      // canvas init can detect a catalogue load and skip the default
      // shoot zone creation — model's source shoots (creu_n) become the
      // ONLY shoots on the canvas, never combined with the gabarit's
      // photoZones defaults.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      enlivened.forEach((obj: any, i: number) => {
        obj._fromCatalogue = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const src: any = scene.objects[i];
        // Per-axis scale: every position lands at exactly the same fraction
        // of the studio's design area as the source object's position is of
        // the cadre — pixel-perfect match in the export. The fabric Image
        // loader replaces width/height with the natural pixel dims of the
        // loaded src; in that case we adjust scaleX/scaleY so the rendered
        // size (live.width × scaleX, live.height × scaleY) equals the
        // booth-equivalent (source.width × source.scaleX × fitScaleX,
        // source.height × source.scaleY × fitScaleY).
        const isImage = obj.type === "image" || obj.type === "Image";
        const srcW = Number(src?.width) || 0;
        const srcH = Number(src?.height) || 0;
        const srcSX = Number(src?.scaleX) || 1;
        const srcSY = Number(src?.scaleY) || 1;

        if (isImage && srcW > 0 && obj.width > 0 && obj.width !== srcW) {
          obj.scaleX = (srcW * srcSX * fitScaleX) / obj.width;
        } else {
          obj.scaleX = (obj.scaleX || 1) * fitScaleX;
        }
        if (isImage && srcH > 0 && obj.height > 0 && obj.height !== srcH) {
          obj.scaleY = (srcH * srcSY * fitScaleY) / obj.height;
        } else {
          obj.scaleY = (obj.scaleY || 1) * fitScaleY;
        }
        // Positions: scale relative to the cadre origin per axis, then
        // shift into the print area (past the bleed margin).
        obj.left = (obj.left || 0) * fitScaleX + targetBleed;
        obj.top = (obj.top || 0) * fitScaleY + targetBleed;

        // Shoot zones from the booth ship with their own solid fill (often
        // rgb(250, 250, 250) or white). The studio identifies a photo
        // placeholder by its checker-pattern fill, so apply it here. Same
        // logic in smartRepositionFromPreviousFormat for the format-switch
        // path; this branch covers the "no format switch" case where
        // smart-reposition never runs and the booth fill would otherwise
        // remain visible.
        if (obj._isShootZone) {
          // patternTransform counter-scales the checker tiles so they stay
          // square regardless of the rect's scaleX/scaleY ratio. Without
          // this, shoots authored with non-1:1 scales (e.g. a wide
          // panoramic shoot with scaleX > scaleY) render the pattern
          // stretched in the same direction.
          const pattern = new fabric.Pattern({
            source: getCheckerCanvas(),
            repeat: "repeat",
            patternTransform: [1 / (obj.scaleX || 1), 0, 0, 1 / (obj.scaleY || 1), 0, 0],
          });
          obj.set({
            fill: pattern,
            stroke: "",
            strokeWidth: 0,
            strokeDashArray: null,
            selectable: true,
            evented: true,
            lockMovementX: true,
            lockMovementY: true,
            lockScalingX: true,
            lockScalingY: true,
            lockRotation: true,
            hasControls: false,
            hoverCursor: "pointer",
            noScaleCache: true,
          });
        }
        if (obj._isSolidBg) {
          // Stretch the cadre rect to EXACTLY cover the studio's design
          // area. Source aspect ratios may not perfectly match
          // CANVAS_BASE-derived target dims (rounding by ±1px), and any
          // 1-2px gap shows up as a thin white band along the edges in
          // the export. Override the rect's geometry to fill the design
          // area edge-to-edge — the cadre is a backdrop, its source
          // width/height/scale don't need to be preserved.
          obj.set({
            left: targetBleed,
            top: targetBleed,
            width: targetDesignW,
            height: targetDesignH,
            scaleX: 1,
            scaleY: 1,
            selectable: false,
            evented: false,
            hoverCursor: "default",
          });
        }
        // Force fabric to re-measure text objects with the now-loaded font.
        // enliven runs synchronously and may cache metrics from the fallback
        // font; setting fontFamily back to itself + initDimensions clears
        // that cache so the bounding box matches what the booth rendered.
        // Also rewrite non-canonical Google Font names (e.g. "MONTSERRAT"
        // -> "Montserrat"); we loaded the canonical name via
        // loadGoogleFont so Fabric needs the same string on the object
        // to actually match the registered FontFace.
        const isText = obj.type === "i-text" || obj.type === "IText" ||
          obj.type === "textbox" || obj.type === "Textbox" ||
          obj.type === "text" || obj.type === "Text";
        if (isText && obj.fontFamily && typeof obj._set === "function") {
          const rewritten = fontRewrites.get(obj.fontFamily) || obj.fontFamily;
          try { obj._set("fontFamily", rewritten); } catch { /* ignore */ }
          try { if (typeof obj.initDimensions === "function") obj.initDimensions(); } catch { /* ignore */ }
          obj.setCoords();
        }
        // Per-character styles can also pin a fontFamily — rewrite those too.
        if (isText && obj.styles && typeof obj.styles === "object" && fontRewrites.size > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rewriteStyles = (s: any): any => {
            if (Array.isArray(s)) return s.map(rewriteStyles);
            if (s && typeof s === "object") {
              const out: Record<string, unknown> = {};
              for (const key of Object.keys(s)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const v = (s as any)[key];
                if (key === "fontFamily" && typeof v === "string") {
                  out[key] = fontRewrites.get(v) || v;
                } else if (v && typeof v === "object") {
                  out[key] = rewriteStyles(v);
                } else {
                  out[key] = v;
                }
              }
              return out;
            }
            return s;
          };
          obj.styles = rewriteStyles(obj.styles);
        }
        canvas.add(obj);
      });

      // No reordering — the source array's z-order is preserved by the
      // sequential canvas.add calls above (booth scenes already place the
      // cadre rect first and stack overlays in their authored order).

      // Multi-shoot designs get numbered "#1" / "#2" labels above each zone,
      // matching createShootZones() behaviour for a hand-built gabarit.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shoots = enlivened.filter((o: any) => o._isShootZone)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => (a._shootIndex || 0) - (b._shootIndex || 0));
      if (shoots.length > 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        shoots.forEach((shoot: any) => {
          const label = new fabric.FabricText(`#${shoot._shootIndex || 1}`, {
            left: (shoot.left || 0) + 8,
            top: (shoot.top || 0) + 6,
            originX: "left",
            originY: "top",
            fontSize: 16,
            fontFamily: "sans-serif",
            fontWeight: "bold",
            fill: "#4f46e5",
            selectable: false,
            evented: false,
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (label as any)._isShootLabel = true;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (label as any)._shootZone = shoot;
          shoot._shootLabel = label;
          canvas.add(label);
        });
      }

      canvas.requestRenderAll();

      // ── DEBUG: dump the live canvas state right after the scene is loaded.
      // Logs the full serialized JSON (same shape as what we save to DB).
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const liveJson = (canvas as any).toObject(CUSTOM_PROPS);
        console.log("[catalogue][debug] canvasState AFTER load (pre-format-switch):", liveJson);
        console.log("[catalogue][debug] canvasState AFTER load (stringified):", JSON.stringify(liveJson));
      } catch (e) { console.warn("[catalogue][debug] toObject failed:", e); }

      // After the scene is on the current canvas, ask the studio to switch
      // to the matched format. We pass prevDimsOverride = the matched
      // format's BUFFER dims so smart-reposition sees prevDims == newDims
      // and runs as a no-op — we already pre-scaled above. Without this,
      // smart-reposition would rescale by (newDims / currentCanvasDims),
      // which double-scales the design.
      if (needsFormatSwitch) {
        onSelect!(matchedFormat!, matchedGabarit!, true, {
          width: targetBufferW,
          height: targetBufferH,
        });
        // The new mount runs useCanvasInit which takes ~300-800 ms before
        // setReady fires. Clear the overlay one frame after that window —
        // the user sees the new canvas, not a flash of empty editor.
        window.setTimeout(() => setCataloguePending(null), 1200);
      } else {
        // No remount — the canvas update was synchronous. Drop the
        // overlay on the next frame so the rendered scene paints first.
        requestAnimationFrame(() => setCataloguePending(null));
        // No remount means useCanvasInit's setReady wrap-up never runs,
        // so we'd leave suppressHistoryRef stuck true and the editor would
        // silently swallow every subsequent saveHistory call. Push the
        // consolidated entry directly here, then release the gates.
        const s = useEditorStore.getState();
        const pendingLabel = s.pendingFormatTransitionLabel;
        s.setPendingFormatTransitionLabel(null);
        s.suppressHistoryRef.current = false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const saveHistoryFn = (canvas as any)._saveHistory;
        if (typeof saveHistoryFn === "function") {
          // One frame later: smartReposition's scheduled requestAnimationFrames
          // (setCoords, dirty flags) have flushed by then.
          requestAnimationFrame(() => {
            try { saveHistoryFn(pendingLabel || "Modèle catalogue chargé"); } catch { /* ignore */ }
          });
        }
      }
      window.clearTimeout(safetyTimer);
    } catch (err) {
      console.error("Failed to enliven catalogue model:", err);
      toast("Impossible de charger ce modèle.", "error");
      window.clearTimeout(safetyTimer);
      setCataloguePending(null);
      // Release the history gates so future edits can save.
      const s = useEditorStore.getState();
      s.suppressHistoryRef.current = false;
      s.setPendingFormatTransitionLabel(null);
    }
  };

  // Chargement automatique d'un modèle choisi depuis la PAGE catalogue (entrée
  // du studio). On déclenche au MONTAGE du panneau (donc à chaque re-sélection,
  // même si `ready` ne retransitionne pas) et on attend que le canvas soit prêt
  // avant d'appliquer — comme un clic normal sur un modèle du catalogue.
  useEffect(() => {
    const pending = takePendingAutoModel();
    if (!pending) return;
    let cancelled = false;
    let tries = 0;
    const tryLoad = () => {
      if (cancelled) return;
      if (canvasRef?.current && useEditorStore.getState().ready) {
        void applyCatalogueModel(pending);
      } else if (tries++ < 120) {
        setTimeout(tryLoad, 80);
      }
    };
    tryLoad();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCatalogue = catalogue.filter((item) => {
    if (!modelePermis(item.format_id, item.nbr_pose)) return false;
    if (filterPoses !== null && item.nbr_pose !== filterPoses) return false;
    if (activeTheme && activeTheme !== "null" && item.format_id !== Number(activeTheme)) return false;
    if (catalogueSearch && !item.nom.toLowerCase().includes(catalogueSearch.toLowerCase())) return false;
    return true;
  });

  const poseCounts = catalogue.reduce((acc, item) => {
    acc[item.nbr_pose] = (acc[item.nbr_pose] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  // Build the format filter buttons from the catalogue itself instead of a
  // hardcoded list. Known format_ids keep their friendly label; anything
  // unknown shows up as "Format N" with its count, so the user can see (and
  // tell us) what to label it as. Sorted by descending count so the most
  // common formats land first.
  // Canonical mapping pulled from the booth admin's `type_animation_id`
  // select. Update here if a new format is added on that side.
  const FORMAT_LABELS: Record<number, string> = {
    1: "Carte postale paysage",
    2: "Carte postale portrait",
    3: "Marque-Page",
    4: "Polaroid",
    5: "Carte postale multishoot",
    6: "Polaroid Multishoot",
    7: "Carte paysage coupon",
    8: "Mini Polaroid",
  };
  const formatFilterOptions = (() => {
    const counts = catalogue.reduce((acc, item) => {
      acc[item.format_id] = (acc[item.format_id] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    return Object.entries(counts)
      .map(([id, count]) => ({
        id: Number(id),
        label: FORMAT_LABELS[Number(id)] || `Format ${id}`,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  })();

  // ── HOME: Two big cards ──
  if (view === "home") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{currentFormat.name}</span>
        </div>

        {/* Modèles vierges card */}
        <button
          onClick={() => setView("vierges")}
          className="w-full group relative rounded-2xl border-2 border-gray-200 hover:border-[#4f46e5] p-5 text-left transition-all hover:shadow-lg bg-gradient-to-br from-white to-purple-50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#a5b4fc] flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4z" />
              </svg>
            </div>
            <span className="bg-[#4f46e5] text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
              {FORMATS.reduce((n, f) => n + f.gabarits.length, 0)}
            </span>
          </div>
          <p className="text-base font-bold text-gray-800 group-hover:text-[#4f46e5] transition-colors">Modèles vierges</p>
          <p className="text-xs text-gray-400 mt-0.5">Gabarits vides à personnaliser</p>
          <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 group-hover:text-[#4f46e5] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Catalogue Selfizee card — cadres only */}
        {isCadres && (
        <button
          onClick={openCatalogue}
          className="w-full group relative rounded-2xl border-2 border-gray-200 hover:border-[#4f46e5] p-5 text-left transition-all hover:shadow-lg bg-gradient-to-br from-white to-indigo-50"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4f46e5] to-[#ff6b9d] flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="bg-[#4f46e5] text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
              {catalogue.length > 0 ? catalogue.length : (loadingCatalogue ? "…" : "—")}
            </span>
          </div>
          <p className="text-base font-bold text-gray-800 group-hover:text-[#4f46e5] transition-colors">Catalogue Selfizee</p>
          <p className="text-xs text-gray-400 mt-0.5">Modèles professionnels prêts à l&apos;emploi</p>
          <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 group-hover:text-[#4f46e5] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        )}
      </div>
    );
  }

  // ── Gabarit confirmation popup (shared across views) ──
  const gabaritConfirmPopup = confirmAction && !confirmAction.item && (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmAction(null)}>
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[90vw] p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-[#0d1216]">Changer de gabarit</h3>
            <p className="text-xs text-gray-500 mt-0.5">{confirmAction.gabarit?.name ?? "Nouveau gabarit"}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          Choisissez comment appliquer ce gabarit. Vous pouvez repartir de zéro ou conserver vos éléments actuels.
        </p>
        <div className="space-y-2">
          <button
            onClick={() => {
              if (confirmAction.format && confirmAction.gabarit && onSelect) {
                onSelect(confirmAction.format, confirmAction.gabarit, true);
              }
              setConfirmAction(null);
            }}
            className="w-full py-2.5 rounded-xl font-semibold text-sm bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors"
          >
            Charger les éléments existants
          </button>
          <button
            onClick={() => {
              if (confirmAction.format && confirmAction.gabarit && onSelect) {
                onSelect(confirmAction.format, confirmAction.gabarit, false);
              }
              setConfirmAction(null);
            }}
            className="w-full py-2.5 rounded-xl font-semibold text-sm border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Repartir d&apos;un nouveau gabarit
          </button>
          <button
            onClick={() => setConfirmAction(null)}
            className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );

  // ── VIERGES: Format/Gabarit picker ──
  if (view === "vierges") {
    return (
      <div className="space-y-4">
        {gabaritConfirmPopup}
        <button onClick={() => setView("home")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Retour
        </button>
        <h3 className="text-gray-800 font-bold text-sm">Modèles vierges</h3>

        <div className="space-y-2">
          {FORMATS.map((fmt) => {
            const isExpanded = expandedFormat === fmt.id;
            const isCurrent = fmt.id === currentFormat.id;
            return (
              <div key={fmt.id} className="rounded-xl border border-gray-100 overflow-hidden bg-white">
                <button
                  onClick={() => setExpandedFormat(isExpanded ? null : fmt.id)}
                  className={`w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors ${isCurrent ? "bg-purple-50/50" : ""}`}
                >
                  <MiniFormatPreview format={fmt} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${isCurrent ? "text-[#4f46e5]" : "text-gray-800"}`}>{fmt.name}</p>
                    <p className="text-[11px] text-gray-400">{fmt.gabarits.length} gabarit{fmt.gabarits.length > 1 ? "s" : ""}</p>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                    {fmt.gabarits.map((gab) => {
                      const isActive = isCurrent && gab.id === currentGabarit?.id;
                      return (
                        <button
                          key={gab.id}
                          onClick={() => {
                            if (isActive || !onSelect) return;
                            setConfirmAction({ format: fmt, gabarit: gab });
                          }}
                          className={`relative flex flex-col items-center gap-1.5 p-2.5 rounded-lg border-2 transition-all ${isActive ? "border-[#4f46e5] bg-purple-50 shadow-sm" : "border-gray-100 hover:border-gray-300 hover:shadow-sm"}`}
                        >
                          {isActive && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#4f46e5] flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                          <MiniGabaritPreview gabarit={gab} aspectRatio={fmt.aspectRatio} />
                          <span className={`text-[10px] font-medium text-center leading-tight ${isActive ? "text-[#4f46e5]" : "text-gray-600"}`}>{gab.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── CATALOGUE: Selfizee templates ──
  return (
    <div className="space-y-3">
      <button onClick={() => setView("home")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Retour
      </button>

      <div className="flex items-center justify-between">
        <h3 className="text-gray-800 font-bold text-sm">Catalogue Selfizee</h3>
        {catalogue.length > 0 && <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{catalogue.length} modèles</span>}
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Rechercher un modèle..."
          value={catalogueSearch}
          onChange={(e) => setCatalogueSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5]/20 bg-gray-50"
        />
      </div>

      {/* Format filter — derived from the actual catalogue so every format_id
          present in the data is reachable, even ones we don't have a friendly
          label for yet. */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[
          { id: null, label: "Tous les formats", count: catalogue.length },
          ...formatFilterOptions,
        ].map((f) => (
          <button
            key={String(f.id)}
            onClick={() => setActiveTheme(activeTheme === String(f.id) ? null : String(f.id))}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
              activeTheme === String(f.id)
                ? "bg-[#4f46e5] text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-400"
            }`}
          >
            {f.label} <span className={`ml-0.5 text-[10px] ${activeTheme === String(f.id) ? "text-white/70" : "text-gray-400"}`}>({f.count})</span>
          </button>
        ))}
      </div>

      {/* Poses filter */}
      {catalogue.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilterPoses(null)} className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${filterPoses === null ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            Tous
          </button>
          {Object.entries(poseCounts).sort(([a], [b]) => Number(a) - Number(b)).map(([pose, count]) => (
            <button
              key={pose}
              onClick={() => setFilterPoses(filterPoses === Number(pose) ? null : Number(pose))}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${filterPoses === Number(pose) ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {Number(pose) === 0 ? "Fond" : `${pose}p`} <span className="opacity-60">({count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loadingCatalogue && (
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-3 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Grid with infinite scroll */}
      {!loadingCatalogue && catalogue.length > 0 && (
        <div
          ref={gridRef}
          className="grid grid-cols-2 gap-2 max-h-[calc(100vh-400px)] overflow-y-auto scrollbar-thin"
          onScroll={(e) => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
              setVisibleCount((prev) => Math.min(prev + 20, filteredCatalogue.length));
            }
          }}
        >
          {filteredCatalogue.slice(0, visibleCount).map((item) => {
            // Adapt aspect ratio based on format: portrait (4), marque-page (5) = tall, others = landscape
            const isPortrait = item.format_id === 4 || item.format_id === 5;
            const key = `mod-${item.id}`;
            return (
            <button
              key={item.id}
              onClick={() => modRun(key, async () => addCatalogueImage(item))}
              onMouseEnter={() => setPreviewItem(item)}
              onMouseLeave={() => setPreviewItem(null)}
              className={`group relative rounded-xl overflow-hidden border border-gray-200 hover:border-[#4f46e5] hover:shadow-lg transition-all bg-gray-50 ${isPortrait ? "aspect-[3/4]" : "aspect-[3/2]"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url_sm_thumbnail} alt={item.nom} className="w-full h-full object-contain" loading="lazy" />
              {modLoadingKey === key && <ThumbSpinner />}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:scale-100 scale-75 bg-white rounded-full p-2 shadow-xl">
                  <svg className="w-4 h-4 text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
              </div>
              {item.nbr_pose > 0 && (
                <span className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {item.nbr_pose}p
                </span>
              )}
            </button>
            );
          })}
        </div>
      )}

      {/* Loading more indicator */}
      {!loadingCatalogue && visibleCount < filteredCatalogue.length && (
        <p className="text-center text-[11px] text-gray-400 py-1">
          {visibleCount} / {filteredCatalogue.length} modèles affichés — scrollez pour plus
        </p>
      )}

      {/* Preview popup — floating over the canvas */}
      {previewItem && (
        <div className="fixed z-[100] pointer-events-none" style={{ left: 340, top: "50%", transform: "translateY(-50%)" }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-3 w-[320px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewItem.url_thumbnail || previewItem.url_sm_thumbnail} alt={previewItem.nom} className="w-full rounded-xl object-contain max-h-[280px]" loading="eager" />
            <p className="text-sm font-semibold text-gray-800 mt-2 truncate">{previewItem.nom}</p>
            <div className="flex items-center gap-2 mt-1">
              {previewItem.nbr_pose > 0 && (
                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{previewItem.nbr_pose} pose{previewItem.nbr_pose > 1 ? "s" : ""}</span>
              )}
              {previewItem.nbr_pose === 0 && (
                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Fond</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Gabarit confirmation (shared popup) ── */}
      {gabaritConfirmPopup}

      {/* ── Catalogue confirmation modal ── */}
      {confirmAction && confirmAction.item && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmAction(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[90vw] p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0d1216]">Remplacer le design actuel ?</h3>
                <p className="text-xs text-gray-500 mt-0.5">Votre cadre actuel contient du contenu</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Appliquer ce modèle remplacera votre design actuel.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  applyCatalogueModel(confirmAction.item!);
                  setConfirmAction(null);
                }}
                className="w-full py-2.5 rounded-xl font-semibold text-sm bg-[#4f46e5] text-white hover:bg-[#4338ca] transition-colors"
              >
                Remplacer le design
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniFormatPreview({ format }: { format: Format }) {
  const isLandscape = format.orientation === "landscape";
  const w = isLandscape ? 36 : 24;
  const h = isLandscape ? 24 : 36;
  const gab = format.gabarits[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <rect x={0} y={0} width={w} height={h} rx={2} fill="white" stroke="#d1d5db" strokeWidth={1} />
      {gab.photoZones.map((zone, i) => (
        <rect key={i} x={(zone.x / 100) * w} y={(zone.y / 100) * h} width={(zone.w / 100) * w} height={(zone.h / 100) * h} rx={1} fill="#9ca3af" opacity={0.4} />
      ))}
    </svg>
  );
}

function MiniGabaritPreview({ gabarit, aspectRatio }: { gabarit: Gabarit; aspectRatio: number }) {
  const maxW = 64;
  const maxH = 52;
  let w: number, h: number;
  if (aspectRatio >= 1) { w = maxW; h = maxW / aspectRatio; if (h > maxH) { h = maxH; w = maxH * aspectRatio; } }
  else { h = maxH; w = maxH * aspectRatio; if (w > maxW) { w = maxW; h = maxW / aspectRatio; } }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <rect x={0} y={0} width={w} height={h} rx={2} fill="white" stroke="#e5e7eb" strokeWidth={1} />
      {gabarit.photoZones.map((zone, i) => (
        <rect key={i} x={(zone.x / 100) * w} y={(zone.y / 100) * h} width={(zone.w / 100) * w} height={(zone.h / 100) * h} rx={1} fill="#6b7280" opacity={0.5} />
      ))}
      {gabarit.textZones.map((zone, i) => (
        <rect key={`t-${i}`} x={(zone.x / 100) * w} y={(zone.y / 100) * h} width={(zone.w / 100) * w} height={(zone.h / 100) * h} rx={1} fill="#f3f4f6" stroke="#d1d5db" strokeWidth={0.5} />
      ))}
    </svg>
  );
}

export default React.memo(PanelModeles);
