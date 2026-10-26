import type { Format, Gabarit } from "@/studio/lib/gabarits";
import {
  type PenPoint,
  type PenToolState,
  type EditOverlay,
  PEN_CUSTOM_PROPS,
} from "./tools/PenTool";

/* ═══════════════════════════════════════════════════════════════
   Shared types and constants for the editor module.
   ═══════════════════════════════════════════════════════════════ */

export type SidebarTab = "modeles" | "fonds" | "textes" | "formes" | "photos" | "upload" | "ia" | "calques";

export interface EditorProps {
  eventId: string;
  format: Format;
  gabarit: Gabarit;
  onSaved: () => void;
  onClose?: () => void;
  onChangeGabarit?: (format: Format, gabarit: Gabarit, canvasState?: string, prevDimensions?: { width: number; height: number }) => void;
  shareToken?: string;
  initialCanvasState?: string;
  initialFrameName?: string;
  frameId?: string;
  eventName?: string;
  previousCanvasState?: string;
  previousDimensions?: { width: number; height: number };
}

export const CANVAS_BASE = 800;
export const BLEED_PX_MIN = 150;
/**
 * Resolution multiplier for PNG exports. Fabric's toDataURL renders at
 * `bufferPx * EXPORT_MULTIPLIER` pixels — bumping this from 1 to 2 gives
 * retina-quality exports suitable for photo-frame printing without
 * changing the edit-time buffer size. Multiplier × bufferSize must stay
 * under the browser canvas limit (~16384) so don't push past 3 without
 * also lowering CANVAS_BASE.
 */
// Integer multiplier for clean pixel-grid rendering during Fabric export.
// The final output is resized to the target print resolution (1844×1240 etc.)
// in a single downscale step — keeping this an integer eliminates subpixel
// drift that a fractional multiplier would bake into Fabric's toDataURL output.
export const EXPORT_MULTIPLIER = 3;
// Target long-edge resolution for the final PNG (1844 px ≈ 156mm at 300 DPI).
export const EXPORT_TARGET_LONG_EDGE = 1844;
// Absolute cap on the bleed margin. The ratio-based bleed (25% of
// max(w,h)) grows fast for large formats and combined with the buffer
// (canvas + 2*bleed) can blow past Safari's 4096 canvas limit. Cap at
// 400px so a 4000px format gets bleed=400 → buffer=4800, still under
// the browser limits handled by canvasSetup's MAX_CANVAS_DIM clamp.
export const BLEED_PX_MAX = 400;
export const RULER_SIZE = 24;
export const SNAP_THRESHOLD = 8;
export const PRINT_MARGIN = 20;
export const MAX_HISTORY = 50;

/**
 * Custom Fabric props persisted through toJSON/loadFromJSON.
 *
 * NOTE — Legacy flags in this list that are NEVER assigned by current
 * code but are still referenced as filter sentinels throughout the
 * editor (so old saved canvasState files continue to round-trip
 * correctly):
 *   - `_isDesignAreaBg` — was an intermediate bg layer, replaced by
 *     `_isSolidBg`. Keep it in CUSTOM_PROPS so old saves preserve the
 *     flag, but don't try to create new objects with it.
 *   - `_isGradientBg` — legacy gradient bg object, migrated into
 *     `_isSolidBg.fill` at restore time (see canvasSetup.ts).
 *
 * If you clean up old saves in the DB, these two entries can be
 * safely removed from the list and from all filter sites.
 */
export const CUSTOM_PROPS = [
  "_isShootZone", "_shootLocked", "_shootBorderRadius", "_shootIndex",
  "_isShootLabel", "_isTextGuide", "_isGradientBg", "_isSolidBg",
  "_isBgImage", "_isDesignAreaBg", "_locked", "_customName", "_dashStyle", "_borderStyle", "_fadeDir", "_fadeSize",
  "_fadeOpacity", "_fadeOffset", "_individualCorners", "_radiusTL",
  "_radiusTR", "_radiusBR", "_radiusBL", "_ratioLocked",
  "_isCurvedText", "_curveAngle", "_curveText", "_curveFontSize", "_curveFontFamily", "_curveFill",
  // _fromCatalogue: marker that this object came from a catalogue (Selfizee
  // booth) load. Used by smart-reposition + useCanvasInit to bypass the
  // default-shoot creation and verbatim-transfer the loaded scene instead.
  "_fromCatalogue",
  ...PEN_CUSTOM_PROPS,
];

export const SIDEBAR_ITEMS: { id: SidebarTab; label: string; panelTitle?: string; icon: string; badge?: string }[] = [
  { id: "modeles", label: "Modèles", icon: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" },
  { id: "fonds", label: "Fonds", icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" },
  { id: "photos", label: "Images", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "formes", label: "Formes", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { id: "textes", label: "Textes", icon: "M4 6h16M4 12h8m-8 6h16" },
  { id: "upload", label: "Télécharg.", panelTitle: "Téléchargements", icon: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" },
  { id: "ia", label: "IA", panelTitle: "Génération IA", icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z", badge: "Nouveau" },
  { id: "calques", label: "Calques", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
];

/** Compute canvas dimensions from format.
 *
 * Aspect ratio is derived from widthPx/heightPx (the source of truth for
 * format dimensions) and falls back to the legacy `aspectRatio` field
 * when pixel dims are missing. Without this fallback chain a format
 * created in the admin with new widthPx/heightPx but a stale aspectRatio
 * (defaulted to 1) would render as a square regardless of its real
 * dimensions — which is what happened to user-created formats like
 * mini-polaroid (918×1266).
 */
export function getCanvasDimensions(format: Format) {
  const aspectRatio = format.widthPx > 0 && format.heightPx > 0
    ? format.widthPx / format.heightPx
    : format.aspectRatio;
  const canvasWidth = aspectRatio >= 1 ? CANVAS_BASE : Math.round(CANVAS_BASE * aspectRatio);
  const canvasHeight = aspectRatio >= 1 ? Math.round(CANVAS_BASE / aspectRatio) : CANVAS_BASE;
  const BLEED_PX = Math.min(
    BLEED_PX_MAX,
    Math.max(BLEED_PX_MIN, Math.round(Math.max(canvasWidth, canvasHeight) * 0.25)),
  );
  const bufferWidth = canvasWidth + 2 * BLEED_PX;
  const bufferHeight = canvasHeight + 2 * BLEED_PX;
  return { canvasWidth, canvasHeight, BLEED_PX, bufferWidth, bufferHeight };
}

// Re-export PenTool types for convenience
export type { PenPoint, PenToolState, EditOverlay };
