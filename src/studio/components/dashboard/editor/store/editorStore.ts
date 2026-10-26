/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from "zustand";
import type { SidebarTab } from "../types";
import {
  type PenToolState,
  type EditOverlay,
  createInitialPenState,
} from "../tools/PenTool";
import type { HistoryEntry } from "../canvas/canvasHistory";

/* ═══════════════════════════════════════════════════════════════
   Zustand store – replaces useEditorState hook entirely.
   Components import `useEditorStore` and subscribe to only
   the slices they need, eliminating props drilling.
   ═══════════════════════════════════════════════════════════════ */

// ── Position helpers ──
type Pos = { top: number; left: number };
type XY = { x: number; y: number };

export interface EditorStore {
  // ══════════════ Canvas refs (non-reactive) ══════════════
  fabricRef: { current: any };
  canvasElRef: { current: HTMLCanvasElement | null };
  canvasWrapperRef: { current: HTMLDivElement | null };
  containerRef: { current: HTMLDivElement | null };

  // ══════════════ Event context ══════════════
  eventId: string | null;
  setEventId: (v: string | null) => void;

  // ══════════════ General state ══════════════
  ready: boolean;
  setReady: (v: boolean) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  frameName: string;
  setFrameName: (v: string) => void;
  /** Raw setter — does NOT sync ref (used internally) */
  _setFrameName: (v: string) => void;
  frameNameRef: { current: string };
  bgColor: string;
  setBgColor: (v: string) => void;
  _setBgColor: (v: string) => void;
  bgColorRef: { current: string };

  // ══════════════ Sidebar ══════════════
  activeTab: SidebarTab | null;
  setActiveTab: (v: SidebarTab | null) => void;

  // ══════════════ Selection ══════════════
  selectedObj: any;
  setSelectedObj: (v: any) => void;

  // ══════════════ Floating toolbar ══════════════
  floatingPos: { x: number; y: number; below?: boolean } | null;
  setFloatingPos: (v: { x: number; y: number; below?: boolean } | null) => void;
  floatingRef: { current: HTMLDivElement | null };
  floatingPosRef: { current: { x: number; y: number; below?: boolean } | null };

  // ══════════════ Cropping ══════════════
  cropping: boolean;
  setCropping: (v: boolean) => void;
  cropTargetRef: { current: any };

  // ══════════════ Wand tool ══════════════
  wandActive: boolean;
  setWandActive: (v: boolean) => void;
  wandTolerance: number;
  setWandTolerance: (v: number) => void;
  wandToleranceRef: { current: number };
  wandPopupRef: { current: {
    targetImg: any;
    savedProps: any;
    modifiedDataUrl: string;
    extractedDataUrl: string;
    origSrc?: string;
    clickX: number;
    clickY: number;
  } | null };
  wandPopup: {
    targetImg: any;
    savedProps: any;
    modifiedDataUrl: string;
    extractedDataUrl: string;
    origSrc?: string;
    clickX: number;
    clickY: number;
  } | null;
  setWandPopupState: (v: EditorStore["wandPopup"]) => void;
  setWandPopup: (v: EditorStore["wandPopup"]) => void;

  // ══════════════ Eraser tool ══════════════
  eraserActive: boolean;
  setEraserActive: (v: boolean) => void;
  eraserBrushSize: number;
  setEraserBrushSize: (v: number) => void;
  eraserBrushSizeRef: { current: number };
  eraserOpacity: number;
  setEraserOpacity: (v: number) => void;
  eraserOpacityRef: { current: number };
  eraserTargetRef: { current: any };

  // ══════════════ Freedraw ══════════════
  freedrawActive: boolean;
  setFreedrawActive: (v: boolean) => void;
  setFreedrawActiveState: (v: boolean) => void;
  freedrawActiveRef: { current: boolean };
  freedrawColor: string;
  setFreedrawColor: (v: string) => void;
  freedrawWidth: number;
  setFreedrawWidth: (v: number) => void;
  freedrawBrushType: string;
  setFreedrawBrushType: (v: string) => void;
  freedrawPathsRef: { current: any[] };

  // ══════════════ Lasso tool ══════════════
  lassoActive: boolean;
  setLassoActive: (v: boolean) => void;
  setLassoActiveState: (v: boolean) => void;
  lassoActiveRef: { current: boolean };
  lassoTargetRef: { current: any };
  lassoPointsRef: { current: XY[] };
  lassoAnchorsRef: { current: XY[] };
  lassoEdgeMapRef: { current: any };
  lassoPreviewRef: { current: any[] };
  lassoSearchRadius: number;
  setLassoSearchRadius: (v: number) => void;
  lassoMode: "add" | "subtract";
  setLassoMode: (v: "add" | "subtract") => void;

  // ══════════════ Clip feather ══════════════
  clipFeatherRef: { current: number };
  clipFeatherValue: number;
  setClipFeatherValue: (v: number) => void;
  clipDialogPos: XY | null;
  setClipDialogPos: (v: XY | null) => void;
  clipDialogDragRef: { current: { startX: number; startY: number; origX: number; origY: number } | null };

  // ══════════════ Select area tool ══════════════
  selectAreaActive: boolean;
  setSelectAreaActive: (v: boolean) => void;
  setSelectAreaActiveState: (v: boolean) => void;
  selectAreaActiveRef: { current: boolean };
  selectAreaMode: "rect" | "free";
  setSelectAreaMode: (v: "rect" | "free") => void;
  selectAreaTargetRef: { current: any };
  selectAreaStartRef: { current: XY | null };
  selectAreaPointsRef: { current: XY[] };
  selectAreaPreviewRef: { current: any[] };

  // ══════════════ Custom cursor ══════════════
  cursorType: "none" | "pen" | "pen-close" | "pen-alt" | "lasso" | "lasso-close";
  setCursorType: (v: "none" | "pen" | "pen-close" | "pen-alt" | "lasso" | "lasso-close") => void;
  cursorPos: XY | null;
  setCursorPos: (v: XY | null) => void;

  // ══════════════ Filters ══════════════
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;
  filtersPanelPos: Pos;
  setFiltersPanelPos: (v: Pos) => void;
  filtersBtnRef: { current: HTMLButtonElement | null };
  filterBrightness: number;
  setFilterBrightness: (v: number) => void;
  filterContrast: number;
  setFilterContrast: (v: number) => void;
  filterSaturation: number;
  setFilterSaturation: (v: number) => void;
  filterBlur: number;
  setFilterBlur: (v: number) => void;

  // ══════════════ Panel toggles ══════════════
  showMaskPanel: boolean;
  setShowMaskPanel: (v: boolean) => void;
  maskPanelPos: Pos;
  setMaskPanelPos: (v: Pos) => void;
  maskBtnRef: { current: HTMLButtonElement | null };

  showShapeFillPanel: boolean;
  setShowShapeFillPanel: (v: boolean) => void;
  shapeFillPanelPos: Pos;
  setShapeFillPanelPos: (v: Pos) => void;
  shapeFillBtnRef: { current: HTMLButtonElement | null };
  shapeFillInputRef: { current: HTMLInputElement | null };

  showTextFillPanel: boolean;
  setShowTextFillPanel: (v: boolean) => void;
  textFillPanelPos: Pos;
  setTextFillPanelPos: (v: Pos) => void;

  showFormatPicker: boolean;
  setShowFormatPicker: (v: boolean) => void;

  showShootStrokePanel: boolean;
  setShowShootStrokePanel: (v: boolean) => void;
  shootStrokePanelPos: Pos;
  setShootStrokePanelPos: (v: Pos) => void;
  shootStrokeBtnRef: { current: HTMLButtonElement | null };

  showShadowPanel: boolean;
  setShowShadowPanel: (v: boolean) => void;
  shadowPanelPos: Pos;
  setShadowPanelPos: (v: Pos) => void;
  shadowBtnRef: { current: HTMLButtonElement | null };

  showCornerPanel: boolean;
  setShowCornerPanel: (v: boolean) => void;
  cornerPanelPos: Pos;
  setCornerPanelPos: (v: Pos) => void;

  showCustomGrad: boolean;
  setShowCustomGrad: (v: boolean) => void;

  showTextEffects: boolean;
  setShowTextEffects: (v: boolean) => void;

  showRulers: boolean;
  setShowRulers: (v: boolean) => void;

  showPrintMargins: boolean;
  showPrintMarginsAuto: boolean;
  setShowPrintMarginsAuto: (v: boolean) => void;
  setShowPrintMargins: (v: boolean) => void;

  filtersOpenState: boolean;

  // ══════════════ Gradient controls ══════════════
  shootGradColor1: string;
  setShootGradColor1: (v: string) => void;
  shootGradColor2: string;
  setShootGradColor2: (v: string) => void;
  shootGradType: "linear" | "radial";
  setShootGradType: (v: "linear" | "radial") => void;
  shootGradAngle: number;
  setShootGradAngle: (v: number) => void;

  // ══════════════ Group editing ══════════════
  editingGroup: boolean;
  setEditingGroup: (v: boolean) => void;
  editingGroupObjsRef: { current: any[] };
  editingGroupPropsRef: { current: { left: number; top: number; angle: number } | null };
  enterGroupEditingRef: { current: ((group: any) => void) | null };
  enterPenEditModeRef: { current: ((pathObj: any) => void) | null };

  // ══════════════ Pen tool ══════════════
  penMode: boolean;
  setPenMode: (v: boolean) => void;
  setPenModeState: (v: boolean) => void;
  penModeRef: { current: boolean };
  penStateRef: { current: PenToolState };
  penPreviewRef: { current: any };
  penOverlayRef: { current: any[] };
  penOverlayHitMapRef: { current: EditOverlay | null };
  penMousePosRef: { current: XY | null };
  penEditMode: boolean;
  setPenEditMode: (v: boolean) => void;
  setPenEditModeState: (v: boolean) => void;
  penEditModeRef: { current: boolean };
  penPointCount: number;
  setPenPointCount: (v: number | ((p: number) => number)) => void;

  // ══════════════ History / Undo-Redo ══════════════
  historyRef: { current: HistoryEntry[] };
  historyIndexRef: { current: number };
  isRestoringRef: { current: boolean };
  /** Stronger gate than isRestoringRef: when set, every saveHistory call
   *  bails out — used to swallow the per-object event storm a catalogue
   *  load or format switch produces. Cleared by useCanvasInit after the
   *  new mount stabilises (and one consolidated entry has been pushed if
   *  pendingFormatTransitionLabel was set alongside). Survives remounts
   *  because it lives in the store. */
  suppressHistoryRef: { current: boolean };
  /** Set by a caller that's about to trigger a format/gabarit change. When
   *  the new mount finishes restoring, useCanvasInit pushes ONE history
   *  entry stamped with the new format using this label, then clears the
   *  field. Undo across that entry routes back to the previous format via
   *  the parent's onChangeGabarit handler. */
  pendingFormatTransitionLabel: string | null;
  setPendingFormatTransitionLabel: (v: string | null) => void;
  /** Handle to the wrap-up setTimeout scheduled by useCanvasInit to push
   *  the consolidated entry 320ms after a format change. Stored in the
   *  store so cross-format undo/redo can cancel a pending push when the
   *  user navigates the history mid-transition — otherwise the timer
   *  fires with the moved historyIndex and slice() drops entries past it. */
  pendingTransitionSaveTimerRef: { current: ReturnType<typeof setTimeout> | null };
  /** Timer ref for debounced history save — can be cancelled by undo/redo */
  saveHistoryTimerRef: { current: ReturnType<typeof setTimeout> | null };
  historyVersion: number;
  setHistoryVersion: (v: number | ((n: number) => number)) => void;
  historyImageCacheRef: { current: Map<string, string> };

  // ══════════════ Rulers & guides ══════════════
  rulerOffset: XY;
  setRulerOffset: (v: XY) => void;
  containerSize: { w: number; h: number };
  setContainerSize: (v: { w: number; h: number }) => void;
  customGuides: { axis: "x" | "y"; pos: number }[];
  setCustomGuides: (v: { axis: "x" | "y"; pos: number }[] | ((prev: { axis: "x" | "y"; pos: number }[]) => { axis: "x" | "y"; pos: number }[])) => void;
  draggingGuide: { axis: "x" | "y"; pos: number } | null;
  setDraggingGuide: (v: { axis: "x" | "y"; pos: number } | null) => void;
  snapGuidesRef: { current: any[] };

  // ══════════════ Canvas dimensions (set once from format) ══════════════
  canvasWidth: number;
  canvasHeight: number;
  BLEED_PX: number;
  bufferWidth: number;
  bufferHeight: number;
  setCanvasDimensions: (dims: { canvasWidth: number; canvasHeight: number; BLEED_PX: number; bufferWidth: number; bufferHeight: number }) => void;

  // ══════════════ Display / zoom ══════════════
  displayScaleRef: { current: number };
  zoomPercent: number;
  setZoomPercent: (v: number) => void;
  autoScaleRef: { current: number };
  userZoomRef: { current: number | null };
  applyScaleRef: { current: (scale: number) => void };

  // ══════════════ Derived / computed ══════════════
  canUndo: boolean;
  canRedo: boolean;

  // ══════════════ Force re-render trigger ══════════════
  _forceRenderCount: number;
  forceRender: (updater?: (n: number) => number) => void;

  // ══════════════ Catalogue load overlay ══════════════
  // Set to a label string while a Selfizee catalogue model is being
  // applied. The string ("Chargement du modèle…") is rendered inside
  // the overlay so callers can customise the message per phase. Mounted
  // at FrameEditor level so it survives the format-switch remount.
  cataloguePending: string | null;
  setCataloguePending: (msg: string | null) => void;

  // ══════════════ Snap / grid ══════════════
  snapToGrid: boolean;
  setSnapToGrid: (v: boolean) => void;
  gridSize: number;
  setGridSize: (v: number) => void;

  // ══════════════ Constants ══════════════
  PRINT_MARGIN: number;
  SNAP_THRESHOLD: number;
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  // ── Canvas refs ──
  fabricRef: { current: null },
  canvasElRef: { current: null },
  canvasWrapperRef: { current: null },
  containerRef: { current: null },

  // ── Event context ──
  eventId: null,
  setEventId: (v) => set({ eventId: v }),

  // ── General state ──
  ready: false,
  setReady: (v) => set({ ready: v }),
  saving: false,
  setSaving: (v) => set({ saving: v }),
  frameName: "",
  frameNameRef: { current: "" },
  setFrameName: (v) => {
    get().frameNameRef.current = v;
    set({ frameName: v });
  },
  _setFrameName: (v) => set({ frameName: v }),
  bgColor: "#ffffff",
  bgColorRef: { current: "#ffffff" },
  setBgColor: (v) => {
    get().bgColorRef.current = v;
    set({ bgColor: v });
  },
  _setBgColor: (v) => set({ bgColor: v }),

  // ── Sidebar ──
  activeTab: "fonds",
  setActiveTab: (v) => set({ activeTab: v }),

  // ── Selection ──
  selectedObj: null,
  setSelectedObj: (v) => set({ selectedObj: v }),

  // ── Floating toolbar ──
  floatingPos: null,
  setFloatingPos: (v) => set({ floatingPos: v }),
  floatingRef: { current: null },
  floatingPosRef: { current: null },

  // ── Cropping ──
  cropping: false,
  setCropping: (v) => set({ cropping: v }),
  cropTargetRef: { current: null },

  // ── Wand tool ──
  wandActive: false,
  setWandActive: (v) => set({ wandActive: v }),
  wandTolerance: 30,
  setWandTolerance: (v) => {
    get().wandToleranceRef.current = v;
    set({ wandTolerance: v });
  },
  wandToleranceRef: { current: 30 },
  wandPopupRef: { current: null },
  wandPopup: null,
  setWandPopupState: (v) => set({ wandPopup: v }),
  setWandPopup: (v) => {
    get().wandPopupRef.current = v;
    set({ wandPopup: v });
  },

  // ── Eraser tool ──
  eraserActive: false,
  setEraserActive: (v) => set({ eraserActive: v }),
  eraserBrushSize: 20,
  setEraserBrushSize: (v) => {
    get().eraserBrushSizeRef.current = v;
    set({ eraserBrushSize: v });
  },
  eraserBrushSizeRef: { current: 20 },
  eraserOpacity: 100,
  setEraserOpacity: (v) => {
    get().eraserOpacityRef.current = v;
    set({ eraserOpacity: v });
  },
  eraserOpacityRef: { current: 100 },
  eraserTargetRef: { current: null },

  // ── Freedraw ──
  freedrawActive: false,
  freedrawActiveRef: { current: false },
  setFreedrawActive: (v) => {
    get().freedrawActiveRef.current = v;
    set({ freedrawActive: v });
  },
  setFreedrawActiveState: (v) => set({ freedrawActive: v }),
  freedrawColor: "#1a1a2e",
  setFreedrawColor: (v) => set({ freedrawColor: v }),
  freedrawWidth: 3,
  setFreedrawWidth: (v) => set({ freedrawWidth: v }),
  freedrawBrushType: "pencil",
  setFreedrawBrushType: (v) => set({ freedrawBrushType: v }),
  freedrawPathsRef: { current: [] },

  // ── Lasso tool ──
  lassoActive: false,
  lassoActiveRef: { current: false },
  setLassoActive: (v) => {
    get().lassoActiveRef.current = v;
    set({ lassoActive: v });
  },
  setLassoActiveState: (v) => set({ lassoActive: v }),
  lassoTargetRef: { current: null },
  lassoPointsRef: { current: [] },
  lassoAnchorsRef: { current: [] },
  lassoEdgeMapRef: { current: null },
  lassoPreviewRef: { current: [] },
  lassoSearchRadius: 10,
  setLassoSearchRadius: (v) => set({ lassoSearchRadius: v }),
  lassoMode: "add",
  setLassoMode: (v) => set({ lassoMode: v }),

  // ── Clip feather ──
  clipFeatherRef: { current: 0 },
  clipFeatherValue: 0,
  setClipFeatherValue: (v) => {
    get().clipFeatherRef.current = v;
    set({ clipFeatherValue: v });
  },
  clipDialogPos: null,
  setClipDialogPos: (v) => set({ clipDialogPos: v }),
  clipDialogDragRef: { current: null },

  // ── Select area tool ──
  selectAreaActive: false,
  selectAreaActiveRef: { current: false },
  setSelectAreaActive: (v) => {
    get().selectAreaActiveRef.current = v;
    set({ selectAreaActive: v });
  },
  setSelectAreaActiveState: (v) => set({ selectAreaActive: v }),
  selectAreaMode: "rect",
  setSelectAreaMode: (v) => set({ selectAreaMode: v }),
  selectAreaTargetRef: { current: null },
  selectAreaStartRef: { current: null },
  selectAreaPointsRef: { current: [] },
  selectAreaPreviewRef: { current: [] },

  // ── Custom cursor ──
  cursorType: "none",
  setCursorType: (v) => set({ cursorType: v }),
  cursorPos: null,
  setCursorPos: (v) => set({ cursorPos: v }),

  // ── Filters ──
  filtersOpen: false,
  setFiltersOpen: (v) => set({ filtersOpen: v }),
  filtersPanelPos: { top: 0, left: 0 },
  setFiltersPanelPos: (v) => set({ filtersPanelPos: v }),
  filtersBtnRef: { current: null },
  filterBrightness: 0,
  setFilterBrightness: (v) => set({ filterBrightness: v }),
  filterContrast: 0,
  setFilterContrast: (v) => set({ filterContrast: v }),
  filterSaturation: 0,
  setFilterSaturation: (v) => set({ filterSaturation: v }),
  filterBlur: 0,
  setFilterBlur: (v) => set({ filterBlur: v }),

  // ── Panel toggles ──
  showMaskPanel: false,
  setShowMaskPanel: (v) => set({ showMaskPanel: v }),
  maskPanelPos: { top: 0, left: 0 },
  setMaskPanelPos: (v) => set({ maskPanelPos: v }),
  maskBtnRef: { current: null },

  showShapeFillPanel: false,
  setShowShapeFillPanel: (v) => set({ showShapeFillPanel: v }),
  shapeFillPanelPos: { top: 0, left: 0 },
  setShapeFillPanelPos: (v) => set({ shapeFillPanelPos: v }),
  shapeFillBtnRef: { current: null },
  shapeFillInputRef: { current: null },

  showTextFillPanel: false,
  setShowTextFillPanel: (v) => set({ showTextFillPanel: v }),
  textFillPanelPos: { top: 0, left: 0 },
  setTextFillPanelPos: (v) => set({ textFillPanelPos: v }),

  showFormatPicker: false,
  setShowFormatPicker: (v) => set({ showFormatPicker: v }),

  showShootStrokePanel: false,
  setShowShootStrokePanel: (v) => set({ showShootStrokePanel: v }),
  shootStrokePanelPos: { top: 0, left: 0 },
  setShootStrokePanelPos: (v) => set({ shootStrokePanelPos: v }),
  shootStrokeBtnRef: { current: null },

  showShadowPanel: false,
  setShowShadowPanel: (v) => set({ showShadowPanel: v }),
  shadowPanelPos: { top: 0, left: 0 },
  setShadowPanelPos: (v) => set({ shadowPanelPos: v }),
  shadowBtnRef: { current: null },

  showCornerPanel: false,
  setShowCornerPanel: (v) => set({ showCornerPanel: v }),
  cornerPanelPos: { top: 0, left: 0 },
  setCornerPanelPos: (v) => set({ cornerPanelPos: v }),

  showCustomGrad: false,
  setShowCustomGrad: (v) => set({ showCustomGrad: v }),

  showTextEffects: false,
  setShowTextEffects: (v) => set({ showTextEffects: v }),

  showRulers: true,
  setShowRulers: (v) => set({ showRulers: v }),

  showPrintMargins: false,
  setShowPrintMargins: (v) => set({ showPrintMargins: v }),
  showPrintMarginsAuto: false,
  setShowPrintMarginsAuto: (v) => set({ showPrintMarginsAuto: v }),

  filtersOpenState: false,

  // ── Gradient controls ──
  shootGradColor1: "#4f46e5",
  setShootGradColor1: (v) => set({ shootGradColor1: v }),
  shootGradColor2: "#ff6a00",
  setShootGradColor2: (v) => set({ shootGradColor2: v }),
  shootGradType: "linear",
  setShootGradType: (v) => set({ shootGradType: v }),
  shootGradAngle: 135,
  setShootGradAngle: (v) => set({ shootGradAngle: v }),

  // ── Group editing ──
  editingGroup: false,
  setEditingGroup: (v) => set({ editingGroup: v }),
  editingGroupObjsRef: { current: [] },
  editingGroupPropsRef: { current: null },
  enterGroupEditingRef: { current: null },
  enterPenEditModeRef: { current: null },

  // ── Pen tool ──
  penMode: false,
  penModeRef: { current: false },
  setPenMode: (v) => {
    get().penModeRef.current = v;
    if (!v) set({ penMode: v, penPointCount: 0 });
    else set({ penMode: v });
  },
  setPenModeState: (v) => set({ penMode: v }),
  penStateRef: { current: createInitialPenState() },
  penPreviewRef: { current: null },
  penOverlayRef: { current: [] },
  penOverlayHitMapRef: { current: null },
  penMousePosRef: { current: null },
  penEditMode: false,
  penEditModeRef: { current: false },
  setPenEditMode: (v) => {
    get().penEditModeRef.current = v;
    set({ penEditMode: v });
  },
  setPenEditModeState: (v) => set({ penEditMode: v }),
  penPointCount: 0,
  setPenPointCount: (v) => {
    if (typeof v === "function") {
      set((state) => ({ penPointCount: v(state.penPointCount) }));
    } else {
      set({ penPointCount: v });
    }
  },

  // ── History / Undo-Redo ──
  historyRef: { current: [] },
  historyIndexRef: { current: -1 },
  isRestoringRef: { current: false },
  suppressHistoryRef: { current: false },
  pendingFormatTransitionLabel: null,
  setPendingFormatTransitionLabel: (v) => set({ pendingFormatTransitionLabel: v }),
  pendingTransitionSaveTimerRef: { current: null },
  saveHistoryTimerRef: { current: null },
  historyVersion: 0,
  setHistoryVersion: (v) => {
    const s = get();
    const nextV = typeof v === "function" ? v(s.historyVersion) : v;
    set({
      historyVersion: nextV,
      canUndo: s.historyIndexRef.current > 0,
      canRedo: s.historyIndexRef.current < s.historyRef.current.length - 1,
    });
  },
  historyImageCacheRef: { current: new Map() },

  // ── Rulers & guides ──
  rulerOffset: { x: 0, y: 0 },
  setRulerOffset: (v) => set({ rulerOffset: v }),
  containerSize: { w: 800, h: 600 },
  setContainerSize: (v) => set({ containerSize: v }),
  customGuides: [],
  setCustomGuides: (v) => {
    if (typeof v === "function") {
      set((s) => ({ customGuides: v(s.customGuides) }));
    } else {
      set({ customGuides: v });
    }
  },
  draggingGuide: null,
  setDraggingGuide: (v) => set({ draggingGuide: v }),
  snapGuidesRef: { current: [] },

  // ── Canvas dimensions (initialised via setCanvasDimensions) ──
  canvasWidth: 800,
  canvasHeight: 600,
  BLEED_PX: 200,
  bufferWidth: 1200,
  bufferHeight: 1000,
  setCanvasDimensions: (dims) => set(dims),

  // ── Display / zoom ──
  displayScaleRef: { current: 1 },
  zoomPercent: 100,
  setZoomPercent: (v) => set({ zoomPercent: v }),
  autoScaleRef: { current: 1 },
  userZoomRef: { current: null },
  applyScaleRef: { current: (() => {}) as (scale: number) => void },

  // ── Derived ──
  canUndo: false,
  canRedo: false,

  // ── Catalogue load overlay ──
  cataloguePending: null,
  setCataloguePending: (msg) => set({ cataloguePending: msg }),

  // ── Force re-render ──
  _forceRenderCount: 0,
  forceRender: (updater) => {
    if (typeof updater === "function") {
      set((s) => ({ _forceRenderCount: updater(s._forceRenderCount) }));
    } else {
      set((s) => ({ _forceRenderCount: s._forceRenderCount + 1 }));
    }
  },

  // ── Snap / grid ──
  snapToGrid: false,
  setSnapToGrid: (v) => set({ snapToGrid: v }),
  gridSize: 10,
  setGridSize: (v) => set({ gridSize: v }),

  // ── Constants ──
  PRINT_MARGIN: 20,
  SNAP_THRESHOLD: 8,
}));

/** Non-React access (event handlers, hooks) */
export const editorStore = useEditorStore;
