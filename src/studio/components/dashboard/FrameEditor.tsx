"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { type Format, type Gabarit, getAutoSwitchFormat } from "@/studio/lib/gabarits";
import { ToastContainer, toast } from "./Toast";
import { makeEraserCursor, CURSOR_WAND, setEditingGroupObjsRef } from "./editor";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useImageImport } from "./editor/hooks/useImageImport";
import { useDragDrop } from "./editor/hooks/useDragDrop";
import { useCanvasExport, type UseCanvasExportParams } from "./editor/hooks/useCanvasExport";
import { ShareModal } from "./editor/dialogs/ShareModal";
import { useObjectActions } from "./editor/hooks/useObjectActions";
import { useShapeFactory } from "./editor/hooks/useShapeFactory";
import { useEditorActions } from "./editor/hooks/useEditorActions";
import { useCropTool } from "./editor/hooks/useCropTool";
import { useFade } from "./editor/hooks/useFade";
import { useKeyboardShortcuts } from "./editor/hooks/useKeyboardShortcuts";
import { useSelectionTools } from "./editor/hooks/useSelectionTools";
import { TopBar } from "./editor/toolbar/TopBar";
import { Sidebar } from "./editor/layout/Sidebar";
import { useCanvasInit } from "./editor/hooks/useCanvasInit";
import { useCanvasInteraction } from "./editor/hooks/useCanvasInteraction";
import { useBackground } from "./editor/hooks/useBackground";
import { WandPopup } from "./editor/dialogs/WandPopup";
import { BgReplaceConfirm, ShootDeleteAlert, MarginCheckModal, FormatPickerModal, PdfPagePickerModal } from "./editor/dialogs/EditorDialogs";
import { AutoSaveReminder } from "./editor/dialogs/AutoSaveReminder";
import { CatalogueLoadingOverlay } from "./editor/dialogs/CatalogueLoadingOverlay";
import { CanvasArea } from "./editor/layout/CanvasArea";
import { BottomBar } from "./editor/toolbar/BottomBar";
import { ToolModeToolbars } from "./editor/toolbar/ToolModeToolbars";
import { ContextualToolbar } from "./editor/toolbar/ContextualToolbar";
import { ToolErrorBoundary } from "./editor/layout/ErrorBoundary";
import { usePenEditMode } from "./editor/hooks/usePenEditMode";
import { createInitialPenState, createFabricPath, removePoint } from "./editor/tools/PenTool";
import { useEditorStore } from "./editor/store/editorStore";
import { getCanvasDimensions } from "./editor/types";
import { usePreviewMode } from "./editor/preview/usePreviewMode";
import { PreviewPanel } from "./editor/preview/PreviewPanel";
import { presetModelesCatalogue } from "./editor/panels/PanelModeles";

interface Props {
  eventId?: string;
  catalogMode?: boolean;
  format: Format;
  gabarit: Gabarit;
  onSaved: (createdId?: string) => void;
  onClose?: () => void;
  onChangeGabarit?: (format: Format, gabarit: Gabarit, canvasState?: string, prevDimensions?: { width: number; height: number }) => void;
  onFormatAutoSwitch?: (format: Format, gabarit: Gabarit) => void;
  shareToken?: string;
  initialCanvasState?: string;
  initialFrameName?: string;
  frameId?: string;
  eventName?: string;
  previousCanvasState?: string;
  previousDimensions?: { width: number; height: number };
  /** Slug of the TypeCreation this creation belongs to (e.g. "cadres"). Controls
   *  feature gating: preview mode and the Modèles Selfizee catalog are cadres-only. */
  typeSlug?: string;
  /**
   * Éditeur ouvert depuis un lien public (aucune session). Masque les actions
   * qui reposent sur une route authentifiée — pour l'instant le partage, qui
   * crée un lien via POST /api/share.
   */
  publicMode?: boolean;
  /**
   * Remplace la sauvegarde intégrée (bibliothèques / événements). Fourni par
   * l'éditeur public, dont l'API cible reste à définir.
   */
  saveHandler?: UseCanvasExportParams["saveHandler"];
  /**
   * Cadre rattaché à un événement : le nom est figé à celui de l'événement.
   * L'input du header devient non modifiable et cette valeur sert aussi de
   * nom de fichier à l'export et au partage.
   */
  fixedFrameName?: string;
  /** Ouvre l'éditeur directement sur le catalogue Selfizee (Modèles → Catalogue).
   *  Utilisé quand on entre dans le studio via « Partir d'un modèle ». */
  openCatalogue?: boolean;
}

export default function FrameEditor({ eventId, catalogMode, format, gabarit, onSaved, onClose, onChangeGabarit, onFormatAutoSwitch, shareToken, initialCanvasState, initialFrameName, frameId, eventName, previousCanvasState, previousDimensions, typeSlug, publicMode, saveHandler, fixedFrameName, openCatalogue }: Props) {
  const effectiveTypeSlug = typeSlug || "cadres";

  // Entrée « Catalogue Selfizee » : on ouvre l'éditeur directement sur le
  // panneau Modèles → Catalogue (la mécanique de chargement d'un modèle vit
  // déjà dans PanelModeles ; le clic sur un modèle bascule au bon format).
  useEffect(() => {
    if (!openCatalogue) return;
    presetModelesCatalogue();
    useEditorStore.getState().setActiveTab("modeles");
  }, [openCatalogue]);
  const isCadres = effectiveTypeSlug === "cadres";
  // ── Initialize store with canvas dimensions from format ──
  // useLayoutEffect keeps it synchronous (runs before paint) while avoiding
  // the "setState during render of another component" React warning.
  const dims = getCanvasDimensions(format);

  useLayoutEffect(() => {
    const state = useEditorStore.getState();
    if (state.canvasWidth !== dims.canvasWidth || state.canvasHeight !== dims.canvasHeight) {
      useEditorStore.getState().setCanvasDimensions(dims);
    }
    if (state.eventId !== (eventId ?? null)) {
      useEditorStore.getState().setEventId(eventId ?? null);
    }
  }, [dims, eventId]);

  // ── Read store values needed by hooks (refs are stable) ──
  const store = useEditorStore.getState();
  const {
    canvasElRef, canvasWrapperRef, fabricRef, containerRef,
    frameNameRef, bgColorRef,
    floatingRef, floatingPosRef,
    wandPopupRef, wandToleranceRef,
    eraserBrushSizeRef, eraserOpacityRef, eraserTargetRef,
    freedrawActiveRef, lassoActiveRef,
    lassoTargetRef, lassoPointsRef, lassoAnchorsRef, lassoEdgeMapRef, lassoPreviewRef,
    clipFeatherRef, clipDialogDragRef,
    selectAreaActiveRef, selectAreaTargetRef, selectAreaStartRef, selectAreaPointsRef, selectAreaPreviewRef,
    filtersBtnRef, maskBtnRef, shapeFillBtnRef, shapeFillInputRef,
    shadowBtnRef, shootStrokeBtnRef,
    editingGroupObjsRef, editingGroupPropsRef, enterGroupEditingRef, enterPenEditModeRef,
    penModeRef, penEditModeRef, penStateRef, penPreviewRef, penOverlayRef, penOverlayHitMapRef, penMousePosRef,
    cropTargetRef, historyRef, historyIndexRef, isRestoringRef, historyImageCacheRef, saveHistoryTimerRef,
    snapGuidesRef, displayScaleRef, autoScaleRef, userZoomRef, applyScaleRef,
  } = store;
  // Register the ref so shared utils can update group editing state
  setEditingGroupObjsRef(editingGroupObjsRef);

  // ── Reactive store selectors ──
  const ready = useEditorStore(s => s.ready);
  const setReady = useEditorStore(s => s.setReady);
  const saving = useEditorStore(s => s.saving);
  const setSaving = useEditorStore(s => s.setSaving);
  const frameName = useEditorStore(s => s.frameName);
  const setFrameName = useEditorStore(s => s.setFrameName);
  // Nom retenu partout en aval (export PNG/JPEG, partage) : le nom figé de
  // l'événement l'emporte sur celui saisi dans le store.
  const effectiveFrameName = fixedFrameName || frameName;
  const setBgColor = useEditorStore(s => s.setBgColor);
  const selectedObj = useEditorStore(s => s.selectedObj);
  const setSelectedObj = useEditorStore(s => s.setSelectedObj);
  const setFloatingPos = useEditorStore(s => s.setFloatingPos);
  const cropping = useEditorStore(s => s.cropping);
  const setCropping = useEditorStore(s => s.setCropping);
  const wandActive = useEditorStore(s => s.wandActive);
  const setWandActive = useEditorStore(s => s.setWandActive);
  const wandPopup = useEditorStore(s => s.wandPopup);
  const setWandPopup = useEditorStore(s => s.setWandPopup);
  const eraserActive = useEditorStore(s => s.eraserActive);
  const setEraserActive = useEditorStore(s => s.setEraserActive);
  const freedrawColor = useEditorStore(s => s.freedrawColor);
  const freedrawWidth = useEditorStore(s => s.freedrawWidth);
  const setFreedrawActive = useEditorStore(s => s.setFreedrawActive);
  const lassoActive = useEditorStore(s => s.lassoActive);
  const setLassoActive = useEditorStore(s => s.setLassoActive);
  const selectAreaActive = useEditorStore(s => s.selectAreaActive);
  const selectAreaMode = useEditorStore(s => s.selectAreaMode);
  const setSelectAreaActive = useEditorStore(s => s.setSelectAreaActive);
  const setSelectAreaMode = useEditorStore(s => s.setSelectAreaMode);
  const setFiltersOpen = useEditorStore(s => s.setFiltersOpen);
  const setFilterBrightness = useEditorStore(s => s.setFilterBrightness);
  const setFilterContrast = useEditorStore(s => s.setFilterContrast);
  const setFilterSaturation = useEditorStore(s => s.setFilterSaturation);
  const setFilterBlur = useEditorStore(s => s.setFilterBlur);
  const showFormatPicker = useEditorStore(s => s.showFormatPicker);
  const setShowFormatPicker = useEditorStore(s => s.setShowFormatPicker);
  const editingGroup = useEditorStore(s => s.editingGroup);
  const setEditingGroup = useEditorStore(s => s.setEditingGroup);
  const penMode = useEditorStore(s => s.penMode);
  const penEditMode = useEditorStore(s => s.penEditMode);
  const setPenMode = useEditorStore(s => s.setPenMode);
  const setPenEditMode = useEditorStore(s => s.setPenEditMode);
  const setPenPointCount = useEditorStore(s => s.setPenPointCount);
  const setHistoryVersion = useEditorStore(s => s.setHistoryVersion);
  const setShowShootStrokePanel = useEditorStore(s => s.setShowShootStrokePanel);
  const setShowTextEffects = useEditorStore(s => s.setShowTextEffects);
  const setShowPrintMargins = useEditorStore(s => s.setShowPrintMargins);
  const setZoomPercent = useEditorStore(s => s.setZoomPercent);
  const setRulerOffset = useEditorStore(s => s.setRulerOffset);
  const setContainerSize = useEditorStore(s => s.setContainerSize);
  const forceRender = useEditorStore(s => s.forceRender);
  const activeTab = useEditorStore(s => s.activeTab);
  const canvasWidth = useEditorStore(s => s.canvasWidth);
  const canvasHeight = useEditorStore(s => s.canvasHeight);
  const BLEED_PX = useEditorStore(s => s.BLEED_PX);
  const bufferWidth = useEditorStore(s => s.bufferWidth);
  const bufferHeight = useEditorStore(s => s.bufferHeight);
  const SNAP_THRESHOLD = useEditorStore(s => s.SNAP_THRESHOLD);
  const PRINT_MARGIN = useEditorStore(s => s.PRINT_MARGIN);
  const showVersions = useEditorStore(s => s.canUndo); // just to have a reactive dep

  const { cleanupTools, undo, redo, updateObj, enterGroupEditing, exitGroupEditing } = useEditorActions({
    fabricRef, canvasWidth, canvasHeight, bufferWidth, bufferHeight, BLEED_PX,
    displayScaleRef, isRestoringRef, historyRef, historyIndexRef, historyImageCacheRef,
    selectedObj, setSelectedObj, setCropping, cropTargetRef, setHistoryVersion,
    setEraserActive, setFreedrawActive, eraserTargetRef, setWandActive,
    penMode, penEditMode, setPenMode, setPenEditMode, setPenPointCount,
    penStateRef, penPreviewRef, penOverlayRef, penOverlayHitMapRef,
    editingGroup, setEditingGroup, editingGroupObjsRef, editingGroupPropsRef,
    lassoActiveRef, lassoPreviewRef, lassoPointsRef, lassoAnchorsRef,
    lassoEdgeMapRef, lassoTargetRef, setLassoActive,
    setShowShootStrokePanel, setShowTextEffects, forceRender,
    // Format context + cross-format restore plumbing for undo/redo.
    // When an undo/redo target was saved under a different format/gabarit,
    // useEditorActions defers the restore to the parent (onChangeGabarit),
    // which remounts FrameEditor with previousCanvasState = target JSON.
    format, gabarit, onCrossFormatRestore: onChangeGabarit,
  });

  const { enterPenEditMode } = usePenEditMode({
    fabricRef, displayScaleRef, penStateRef, penPreviewRef, penOverlayRef,
    penOverlayHitMapRef, setPenEditMode, setPenPointCount, cleanupTools,
  });

  const { updateBgColor, removeBackground, removingBg } = useBackground({
    fabricRef, canvasWidth, canvasHeight, BLEED_PX, setBgColor, setSelectedObj,
  });

  const { startSelectArea, showSelectionPopup } = useSelectionTools({
    fabricRef, canvasWidth, canvasHeight, BLEED_PX, displayScaleRef,
    canvasWrapperRef, selectedObj, setSelectedObj, isRestoringRef,
    selectAreaActiveRef, setSelectAreaActive, selectAreaTargetRef,
    selectAreaStartRef, selectAreaPointsRef, selectAreaPreviewRef,
    selectAreaMode, setSelectAreaMode, setWandPopup, cleanupTools,
  });

  const { addText, addShape, applyGradientBg, addShootZone, addCurvedText, addTextCombo } = useShapeFactory({
    fabricRef, canvasWidth, canvasHeight, BLEED_PX, displayScaleRef,
    cleanupTools, setFreedrawActive, freedrawColor, freedrawWidth,
    setPenMode, setPenPointCount, penStateRef, penPreviewRef, penOverlayRef, penMousePosRef,
    setBgColor,
  });

  const {
    addImageToCanvas, handleImageUpload,
    uploadHistory, saveUploadHistory,
    pdfPages, setPdfPages,
    showPdfPicker, setShowPdfPicker,
    pdfFileName, setPdfFileName,
    showBgReplaceConfirm, confirmBgReplace, cancelBgReplace,
    loadingBg,
  } = useImageImport({ fabricRef, canvasWidth, canvasHeight, BLEED_PX });

  const {
    handleDrop, handleDragOver, handleDragEnter, handleDragLeave,
    isDragging, isUploading, setIsUploading,
  } = useDragDrop({
    fabricRef, canvasWidth, canvasHeight, BLEED_PX,
    addImageToCanvas, saveUploadHistory,
    setPdfPages, setPdfFileName, setShowPdfPicker,
  });

  enterGroupEditingRef.current = enterGroupEditing;
  enterPenEditModeRef.current = enterPenEditMode;

  const {
    deleteSelected, duplicateSelected, bringForward, sendBackward, bringToFront, sendToBack,
    toggleLock, copySelected, pasteClipboard, alignObjects,
    copyStyle, pasteStyle,
    clipboardRef, showShootDeleteAlert, setShowShootDeleteAlert,
  } = useObjectActions({
    fabricRef, canvasWidth, canvasHeight, BLEED_PX,
    selectedObj, setSelectedObj, cleanupTools,
  });

  const { startCrop, applyCrop, cancelCrop } = useCropTool({
    fabricRef, selectedObj, setSelectedObj, cropTargetRef, setCropping, isRestoringRef, BLEED_PX,
    canvasWidth, canvasHeight, bufferWidth, bufferHeight,
  });

  const {
    shareUrl, setShareUrl, showShareModal, setShowShareModal,
    shareAccess, setShareAccess, shareCopied, setShareCopied,
    shareEmailTo, setShareEmailTo, shareEmailMsg, setShareEmailMsg,
    shareEmailSending, setShareEmailSending, shareEmailSent, setShareEmailSent,
    marginWarnings, setMarginWarnings, marginCheckPreview, setMarginCheckPreview,
    pendingSaveAfterCheck, setPendingSaveAfterCheck,
    showMarginCheck, setShowMarginCheck,
    lastSavedAt, setLastSavedAt, saveStatus, setSaveStatus,
    showVersions: showVersionsState, setShowVersions, versionHistory, setVersionHistory,
    handleShare, copyShareLink, cropToDesignArea,
    handleDownloadPNG, renderDesignArea, checkPrintMargins, generateMarginPreview, handleSave,
  } = useCanvasExport({
    fabricRef, canvasWidth, canvasHeight, BLEED_PX,
    eventId, catalogMode, frameId, format, gabarit, shareToken,
    frameName: effectiveFrameName, saving, setSaving, onSaved,
    typeSlug: effectiveTypeSlug,
    saveHandler,
  });

  // ── Live margin monitoring ───────────────────────────────────────
  // Keep marginWarnings in sync with canvas edits so the toolbar badge
  // reflects the current state, and fire a one-shot toast the moment
  // the user crosses from "clean" to "out of bounds".
  const marginToastedRef = useRef(false);
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    let firstRun = true;
    const update = () => {
      const warnings = checkPrintMargins();
      setMarginWarnings(warnings);
      if (firstRun) {
        firstRun = false;
        marginToastedRef.current = warnings.length > 0;
        return;
      }
      if (warnings.length > 0 && !marginToastedRef.current) {
        toast(
          `⚠ ${warnings.length} élément${warnings.length > 1 ? "s" : ""} dépasse${warnings.length > 1 ? "nt" : ""} la marge d'impression`,
          "warning",
        );
        marginToastedRef.current = true;
      } else if (warnings.length === 0) {
        marginToastedRef.current = false;
      }
    };
    update();
    canvas.on("object:modified", update);
    canvas.on("object:added", update);
    canvas.on("object:removed", update);
    return () => {
      canvas.off("object:modified", update);
      canvas.off("object:added", update);
      canvas.off("object:removed", update);
    };
  }, [fabricRef, ready, checkPrintMargins, setMarginWarnings]);

  // ── Preview mode ──────────────────────────────────────────────
  const preview = usePreviewMode({ fabricRef, ready });

  const downloadPreviewJPEG = useCallback(async () => {
    const canvas = fabricRef.current;
    // Preview layers carry excludeFromExport:true so PNG/save stay pristine.
    // Flip it off just for the JPEG render so the composed aperçu shows up.
    const previewLayers: { obj: any; wasExcluded: boolean }[] = [];
    if (canvas) {
      canvas.getObjects().forEach((o: any) => {
        if (o._isPreviewLayer) {
          previewLayers.push({ obj: o, wasExcluded: o.excludeFromExport });
          o.excludeFromExport = false;
        }
      });
    }
    try {
      const pngDataUrl = await renderDesignArea();
      if (!pngDataUrl) return;
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("preview render failed"));
        img.src = pngDataUrl;
      });
      const off = document.createElement("canvas");
      off.width = img.width; off.height = img.height;
      const ctx = off.getContext("2d")!;
      // Flatten onto white so JPEG (no alpha) stays clean where the PNG was transparent.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, off.width, off.height);
      ctx.drawImage(img, 0, 0);
      const jpegUrl = off.toDataURL("image/jpeg", 0.92);
      off.width = 1; off.height = 1;
      const link = document.createElement("a");
      link.href = jpegUrl;
      link.download = `${(effectiveFrameName || `${format.name}-${gabarit.name}`).replace(/[\\/:*?"<>|]/g, "_")}-apercu.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      previewLayers.forEach(({ obj, wasExcluded }) => { obj.excludeFromExport = wasExcluded; });
    }
  }, [fabricRef, renderDesignArea, effectiveFrameName, format.name, gabarit.name]);

  const reviewMargins = useCallback(async () => {
    const warnings = checkPrintMargins();
    setMarginWarnings(warnings);
    if (warnings.length === 0) {
      toast("Aucun élément ne dépasse la marge.", "success");
      return;
    }
    const preview = await generateMarginPreview();
    setMarginCheckPreview(preview);
    setPendingSaveAfterCheck(false);
    setShowMarginCheck(true);
  }, [checkPrintMargins, generateMarginPreview, setMarginWarnings, setMarginCheckPreview, setPendingSaveAfterCheck, setShowMarginCheck]);

  const { isPanning, panOffsetRef, panDragRef } = useCanvasInteraction({
    containerRef, fabricRef, userZoomRef, autoScaleRef, applyScaleRef,
    setZoomPercent, cleanupTools, activeTab, selectedObj, cropping,
    penMode, penEditMode, editingGroup, lassoActive,
    showVersions: showVersionsState, setShowVersions,
  });

  useCanvasInit({
    canvasElRef, canvasWrapperRef, fabricRef, containerRef,
    displayScaleRef, autoScaleRef, userZoomRef, applyScaleRef,
    floatingRef, floatingPosRef, snapGuidesRef,
    historyRef, historyIndexRef, historyImageCacheRef, isRestoringRef,
    frameNameRef, bgColorRef, eraserTargetRef,
    lassoActiveRef, lassoPreviewRef, lassoPointsRef, lassoAnchorsRef,
    lassoEdgeMapRef, lassoTargetRef,
    penModeRef, penEditModeRef, penStateRef, penPreviewRef,
    penOverlayRef, penOverlayHitMapRef,
    freedrawActiveRef, selectAreaActiveRef, enterGroupEditingRef, enterPenEditModeRef, editingGroupObjsRef, saveHistoryTimerRef,
    exitGroupEditingFn: exitGroupEditing,
    setReady, setSelectedObj, setFloatingPos,
    setEraserActive, setWandActive, setFiltersOpen,
    setFilterBrightness, setFilterContrast, setFilterSaturation, setFilterBlur,
    setLassoActive, setPenMode, setPenEditMode, setPenPointCount,
    setShowShootStrokePanel, setFrameName, setBgColor,
    setHistoryVersion, setSaveStatus, setLastSavedAt,
    setZoomPercent, setRulerOffset, setContainerSize,
    canvasWidth, canvasHeight, BLEED_PX, bufferWidth, bufferHeight,
    SNAP_THRESHOLD,
    gabarit, eventId, format,
    initialCanvasState, initialFrameName, frameId,
    previousCanvasState, previousDimensions,
    typeSlug: effectiveTypeSlug,
    CURSOR_WAND,
  });

  useKeyboardShortcuts({
    fabricRef, deleteSelected, duplicateSelected, copySelected, pasteClipboard,
    undo, redo, cleanupTools, handleSave, bringForward, sendBackward, bringToFront, sendToBack,
    copyStyle, pasteStyle,
    lassoActiveRef, penModeRef, selectedObj, setSelectedObj,
    userZoomRef, applyScaleRef, addImageToCanvas,
    exitGroupEditing, editingGroupObjsRef, freedrawActiveRef,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const fadeOrigImgRef = useRef<HTMLImageElement | null>(null);
  const fadeOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const fadeMaskRef = useRef<HTMLCanvasElement | null>(null);
  const [effectsPos, setEffectsPos] = useState({ top: 0, left: 0 });

  const { applyFade } = useFade({ fabricRef, selectedObj, fadeOrigImgRef, fadeOffscreenRef, fadeMaskRef, forceRender, isRestoringRef });

  // Escape key dismisses the wand selection popup (migrated from useEditorState)
  useEffect(() => {
    if (!wandPopup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        const wp = useEditorStore.getState().wandPopupRef.current;
        if (wp?.origSrc && wp?.targetImg) {
          wp.targetImg._restoringOriginal = true;
          wp.targetImg.setSrc(wp.origSrc).then(() => {
            wp.targetImg.dirty = true;
            wp.targetImg._restoringOriginal = false;
            fabricRef.current?.requestRenderAll();
          });
        }
        setWandActive(false);
        isRestoringRef.current = false;
        const c = fabricRef.current;
        if (c) {
          c.defaultCursor = "default";
          c.hoverCursor = "move";
          if ((c as any)._wandMouseDown) {
            c.off("mouse:down", (c as any)._wandMouseDown);
            delete (c as any)._wandMouseDown;
          }
          c.getObjects().forEach((o: any) => {
            if (o._origCursor !== undefined) { o.hoverCursor = o._origCursor; delete o._origCursor; }
            else if (o.hoverCursor === CURSOR_WAND) { o.hoverCursor = "move"; }
          });
          c.requestRenderAll();
        }
        setWandPopup(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [wandPopup, setWandActive, setWandPopup, fabricRef, isRestoringRef]);

  // ── Auto-switch format single ↔ multishoot based on shoot count ──
  const formatIdRef = useRef(format.id);
  formatIdRef.current = format.id;
  const onFormatAutoSwitchRef = useRef(onFormatAutoSwitch);
  onFormatAutoSwitchRef.current = onFormatAutoSwitch;

  useEffect(() => {
    if (!ready) return;
    const canvas = fabricRef.current;
    if (!canvas || !onFormatAutoSwitchRef.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const checkShootCount = () => {
      // Debounce: addShootZone adds both rect + label, which fires 2 events.
      // Wait for the dust to settle before counting.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const count = canvas.getObjects().filter((o: any) => o._isShootZone).length;
        console.log("[AUTO-SWITCH] shoots:", count, "currentFormat:", formatIdRef.current);
        const newFormat = getAutoSwitchFormat(formatIdRef.current, count);
        if (newFormat && onFormatAutoSwitchRef.current) {
          console.log("[AUTO-SWITCH] switching to:", newFormat.id);
          const matchingGab = newFormat.gabarits.find((g) => g.photoZones.length === count) || newFormat.gabarits[0];
          onFormatAutoSwitchRef.current(newFormat, matchingGab);
        }
      }, 150);
    };
    canvas.on("object:added", checkShootCount);
    canvas.on("object:removed", checkShootCount);
    return () => {
      if (timer) clearTimeout(timer);
      canvas.off("object:added", checkShootCount);
      canvas.off("object:removed", checkShootCount);
    };
  }, [ready, fabricRef]);

  return (
    <>
    <ToastContainer />
    <CatalogueLoadingOverlay />
    {!ready && (
      <div className="fixed inset-0 z-[60] flex flex-col bg-[#f0f0f0]">
        <div className="h-[52px] bg-gradient-to-r from-[#4f46e5] to-[#6366f1] animate-pulse" />
        <div className="flex flex-1">
          <div className="w-[72px] bg-white border-r border-gray-200">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="w-10 h-10 mx-auto mt-3 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="w-[60%] aspect-[4/3] bg-white rounded-xl shadow-lg animate-pulse" />
          </div>
        </div>
        <div className="h-[36px] bg-white border-t border-gray-200 animate-pulse" />
      </div>
    )}
    <style>{`
      @keyframes fadeSlideIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes marchingAnts {
        from { stroke-dashoffset: 0; }
        to { stroke-dashoffset: -16; }
      }
    `}</style>
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#f0f0f0]"
      style={{ touchAction: "manipulation", overscrollBehavior: "none" }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {isDragging && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-[#4f46e5]/10 backdrop-blur-[2px]" />
          <div className="absolute inset-4 border-2 border-dashed border-[#4f46e5] rounded-2xl" />
          <div className="relative flex flex-col items-center gap-3 animate-pulse">
            <div className="w-16 h-16 rounded-2xl bg-[#4f46e5] flex items-center justify-center shadow-xl">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-[#4f46e5] font-bold text-lg">Deposez votre fichier ici</p>
              <p className="text-[#4f46e5]/60 text-sm">PNG, JPG, SVG, WebP, PDF, AI, EPS, PSD, TIFF, HEIC</p>
            </div>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm" />
          <div className="relative flex flex-col items-center gap-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
              <div className="absolute inset-0 rounded-full border-4 border-t-[#4f46e5] animate-spin" />
              <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
                <svg className="w-6 h-6 text-[#4f46e5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                </svg>
              </div>
            </div>
            <div className="text-center">
              <p className="text-gray-800 font-semibold text-sm">Import en cours...</p>
              <p className="text-gray-400 text-xs mt-0.5">Ajout sur le canvas</p>
            </div>
          </div>
        </div>
      )}

      {/* ── TopBar: only action callbacks as props, reads store for state ── */}
      <TopBar
        shareToken={shareToken} onClose={onClose} onSaved={onSaved} eventName={eventName}
        format={format} gabarit={gabarit}
        undo={undo} redo={redo}
        saveStatus={saveStatus} lastSavedAt={lastSavedAt}
        showVersions={showVersionsState} setShowVersions={setShowVersions}
        versionHistory={versionHistory} setVersionHistory={setVersionHistory}
        eventId={eventId} handleShare={handleShare} handleDownloadPNG={handleDownloadPNG}
        handleSave={handleSave}
        onChangeGabarit={onChangeGabarit}
        addShootZone={addShootZone}
        marginWarningsCount={marginWarnings.length}
        onReviewMargins={reviewMargins}
        previewMode={preview.previewMode}
        onTogglePreview={isCadres ? () => preview.setPreviewMode(!preview.previewMode) : undefined}
        typeSlug={effectiveTypeSlug}
        hideShare={publicMode}
        hideDownload={publicMode}
        fixedFrameName={fixedFrameName}
      />

      {/* ── ContextualToolbar: only action callbacks, reads store directly ── */}
      <ToolErrorBoundary name="Toolbar">
      <ContextualToolbar
        updateObj={updateObj}
        applyGradientBg={applyGradientBg}
        addText={addText}
        startCrop={startCrop} removingBg={removingBg} removeBackground={removeBackground}
        startSelectArea={startSelectArea} showSelectionPopup={showSelectionPopup}
        applyFade={applyFade}
        alignObjects={alignObjects}
        addShootZone={addShootZone}
        enterGroupEditing={enterGroupEditing}
        fadeOrigImgRef={fadeOrigImgRef}
        fadeOffscreenRef={fadeOffscreenRef}
        fadeMaskRef={fadeMaskRef}
        effectsPos={effectsPos}
        setEffectsPos={setEffectsPos}
        cleanupTools={cleanupTools}
        clipFeatherValue={useEditorStore.getState().clipFeatherValue}
        setClipFeatherValue={useEditorStore.getState().setClipFeatherValue}
        clipFeatherRef={clipFeatherRef}
        addCurvedText={addCurvedText}
      />
      </ToolErrorBoundary>

      {/* ── ToolModeToolbars: only action callbacks ── */}
      <ToolErrorBoundary name="ToolMode">
      <ToolModeToolbars
        cancelCrop={cancelCrop} applyCrop={applyCrop}
        exitGroupEditing={exitGroupEditing}
        createFabricPath={createFabricPath} createInitialPenState={createInitialPenState}
        removePoint={removePoint} cleanupTools={cleanupTools}
        makeEraserCursor={makeEraserCursor}
      />
      </ToolErrorBoundary>

      <WandPopup
        wandPopup={wandPopup}
        setWandPopup={setWandPopup}
        canvasWrapperRef={canvasWrapperRef}
        displayScaleRef={displayScaleRef}
        fabricRef={fabricRef}
        setWandActive={setWandActive}
        isRestoringRef={isRestoringRef}
        setSelectedObj={setSelectedObj}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar: only action callbacks, reads store for state ── */}
        <Sidebar
          addImageToCanvas={addImageToCanvas} addText={addText} addShape={addShape} addCurvedText={addCurvedText} addTextCombo={addTextCombo}
          handleImageUpload={handleImageUpload} updateBgColor={updateBgColor} applyGradientBg={applyGradientBg}
          uploadHistory={uploadHistory} saveUploadHistory={saveUploadHistory}
          updateObj={updateObj} format={format} gabarit={gabarit}
          onChangeGabarit={onChangeGabarit}
          onBgImageClick={() => bgInputRef.current?.click()} fileInputRef={fileInputRef}
          typeSlug={effectiveTypeSlug}
        />
        {/* ── CanvasArea: only action callbacks, reads store for refs/state ── */}
        <ToolErrorBoundary name="Canvas">
        <CanvasArea
          removingBg={removingBg}
          duplicateSelected={duplicateSelected} bringForward={bringForward} sendBackward={sendBackward}
          bringToFront={bringToFront} sendToBack={sendToBack}
          toggleLock={toggleLock} deleteSelected={deleteSelected}
          typeSlug={effectiveTypeSlug}
          formatWidth={format.widthPx}
          formatHeight={format.heightPx}
        />
        </ToolErrorBoundary>
        {preview.previewMode && (
          <PreviewPanel
            shootCount={preview.shootCount}
            linkAll={preview.linkAll}
            setLinkAll={preview.setLinkAll}
            settings={preview.settings}
            activeShootIndex={preview.activeShootIndex}
            setActiveShootIndex={preview.setActiveShootIndex}
            updateSetting={preview.updateSetting}
            resetPreview={preview.resetPreview}
            onExit={() => preview.setPreviewMode(false)}
            onDownload={downloadPreviewJPEG}
          />
        )}
      </div>

      {/* ── BottomBar: minimal props ── */}
      <BottomBar
        updateObj={updateObj}
        panOffsetRef={panOffsetRef}
      />

      <input ref={bgInputRef} type="file" accept="image/*,.pdf,.ai,.eps,.psd,.tiff,.tif,.heic,.heif" className="hidden" onChange={(e) => handleImageUpload(e, true)} />
      <input ref={fileInputRef} type="file" accept="image/*,.pdf,.ai,.eps,.psd,.tiff,.tif,.heic,.heif" className="hidden" onChange={(e) => handleImageUpload(e, false)} />

      <AutoSaveReminder lastSavedAt={lastSavedAt} handleSave={handleSave} />

      <BgReplaceConfirm show={showBgReplaceConfirm} onConfirm={confirmBgReplace} onCancel={cancelBgReplace} />
      {loadingBg && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
          <div className="bg-white rounded-xl px-6 py-4 shadow-lg flex items-center gap-3">
            <svg className="w-5 h-5 animate-spin text-[#4f46e5]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-gray-700 font-medium">Chargement de l&apos;image...</span>
          </div>
        </div>
      )}

      <ShootDeleteAlert
        showShootDeleteAlert={showShootDeleteAlert}
        setShowShootDeleteAlert={setShowShootDeleteAlert}
      />

      <MarginCheckModal
        showMarginCheck={showMarginCheck}
        setShowMarginCheck={setShowMarginCheck}
        setPendingSaveAfterCheck={setPendingSaveAfterCheck}
        marginWarnings={marginWarnings}
        PRINT_MARGIN={PRINT_MARGIN}
        marginCheckPreview={marginCheckPreview}
        pendingSaveAfterCheck={pendingSaveAfterCheck}
        handleSave={handleSave}
        setShowPrintMargins={setShowPrintMargins}
      />

      <FormatPickerModal
        showFormatPicker={showFormatPicker}
        setShowFormatPicker={setShowFormatPicker}
        onChangeGabarit={onChangeGabarit}
        format={format}
        gabarit={gabarit}
        fabricRef={fabricRef}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        typeSlug={effectiveTypeSlug}
      />

      <PdfPagePickerModal
        showPdfPicker={showPdfPicker}
        setShowPdfPicker={setShowPdfPicker}
        pdfPages={pdfPages}
        pdfFileName={pdfFileName}
        addImageToCanvas={addImageToCanvas}
        uploadHistory={uploadHistory}
        saveUploadHistory={saveUploadHistory}
      />

      {showShareModal && (
        <ShareModal
          shareUrl={shareUrl} shareAccess={shareAccess} setShareAccess={setShareAccess}
          shareCopied={shareCopied} copyShareLink={copyShareLink}
          shareEmailTo={shareEmailTo} setShareEmailTo={setShareEmailTo}
          shareEmailMsg={shareEmailMsg} setShareEmailMsg={setShareEmailMsg}
          shareEmailSending={shareEmailSending} setShareEmailSending={setShareEmailSending}
          shareEmailSent={shareEmailSent} setShareEmailSent={setShareEmailSent}
          frameName={effectiveFrameName} onClose={() => setShowShareModal(false)}
          onDownloadPNG={handleDownloadPNG}
        />
      )}

    </div>
    </>
  );
}
