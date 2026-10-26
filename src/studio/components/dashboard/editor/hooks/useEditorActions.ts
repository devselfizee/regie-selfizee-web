"use client";

import { useCallback } from "react";
import LZString from "lz-string";
import { toast } from "../../Toast";
import { CUSTOM_PROPS } from "../types";
import { useEditorStore } from "../store/editorStore";
import {
  CURSOR_WAND,
} from "../../editor";
import {
  createInitialPenState,
} from "../tools/PenTool";
import { resolveHistoryEntry } from "../canvas/canvasHistory";

// Module-level cached fabric import to prevent races in async handlers
let _fabricModPromise: Promise<any> | null = null;
function getFabric() {
  if (!_fabricModPromise) _fabricModPromise = import("fabric");
  return _fabricModPromise;
}

export function useEditorActions(params: any) {
  const {
    fabricRef,
    canvasWidth,
    canvasHeight,
    bufferWidth,
    bufferHeight,
    BLEED_PX,
    displayScaleRef,
    isRestoringRef,
    historyRef,
    historyIndexRef,
    historyImageCacheRef,
    // ── Cross-format undo/redo plumbing ──
    // Stamped onto every history entry by canvasHistory.saveHistory: when
    // the target entry's formatId/gabaritId differs from current we don't
    // do an in-place loadFromJSON (canvas dims wouldn't match the JSON),
    // we route through the parent so it can remount with the right format.
    format,
    gabarit,
    onCrossFormatRestore,
    selectedObj,
    setSelectedObj,
    setCropping,
    cropTargetRef,
    setHistoryVersion,
    setEraserActive,
    setFreedrawActive,
    eraserTargetRef,
    setWandActive,
    penMode,
    penEditMode,
    setPenMode,
    setPenEditMode,
    setPenPointCount,
    penStateRef,
    penPreviewRef,
    penOverlayRef,
    penOverlayHitMapRef,
    editingGroup,
    setEditingGroup,
    editingGroupObjsRef,
    editingGroupPropsRef,
    lassoActiveRef,
    lassoPreviewRef,
    lassoPointsRef,
    lassoAnchorsRef,
    lassoEdgeMapRef,
    lassoTargetRef,
    setLassoActive,
    setShowShootStrokePanel,
    setShowTextEffects,
    forceRender,
  } = params;

  // Restore zoom/scale after canvas reload (undo/redo/rollback)
  const restoreZoom = useCallback(() => {
    const { displayScaleRef, userZoomRef, applyScaleRef } = useEditorStore.getState();
    const scale = userZoomRef.current ?? displayScaleRef.current;
    if (scale && applyScaleRef.current) {
      applyScaleRef.current(scale);
    }
  }, []);

  const cleanupTools = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Reset eraser + freedraw
    setEraserActive(false);
    // Group freedraw paths before deactivating
    const { freedrawPathsRef } = useEditorStore.getState();
    // Snapshot paths and clear ref SYNCHRONOUSLY so re-activation doesn't lose paths
    const paths = freedrawPathsRef.current.slice();
    freedrawPathsRef.current = [];
    if (paths.length > 1) {
      getFabric().then((fabric) => {
        paths.forEach((p: any) => canvas.remove(p));
        const group = new fabric.Group(paths, { originX: "center", originY: "center" });
        canvas.add(group);
        canvas.requestRenderAll();
        canvas.fire("object:modified", { target: group, _historyLabel: "Dessin main levée" });
      });
    }
    setFreedrawActive(false);
    eraserTargetRef.current = null;
    canvas.isDrawingMode = false;
    if ((canvas as any)._freedrawPathHandler) {
      canvas.off("path:created", (canvas as any)._freedrawPathHandler);
      delete (canvas as any)._freedrawPathHandler;
    }
    // Reset wand
    setWandActive(false);
    if ((canvas as any)._wandMouseDown) {
      canvas.off("mouse:down", (canvas as any)._wandMouseDown);
      delete (canvas as any)._wandMouseDown;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canvas.getObjects().forEach((o: any) => {
      if (o._origCursor !== undefined) { o.hoverCursor = o._origCursor; delete o._origCursor; }
      else if (o.hoverCursor === CURSOR_WAND) { o.hoverCursor = "move"; }
    });
    // Reset pen mode
    if (penMode || penEditMode) {
      if ((canvas as any)._penDblClick) {
        canvas.off("mouse:dblclick", (canvas as any)._penDblClick);
        delete (canvas as any)._penDblClick;
      }
      if ((canvas as any)._penMouseMove) {
        canvas.off("mouse:move", (canvas as any)._penMouseMove);
        delete (canvas as any)._penMouseMove;
      }
      penStateRef.current = createInitialPenState();
      setPenMode(false);
      setPenEditMode(false);
      setPenPointCount(0);
      penOverlayRef.current.forEach((o: any) => canvas.remove(o));
      penOverlayRef.current = [];
      penOverlayHitMapRef.current = null;
      if (penPreviewRef.current) { canvas.remove(penPreviewRef.current); penPreviewRef.current = null; }
    }
    // Clean up any stray native event listeners from pen/lasso tools
    if ((canvas as any)._penNativeDragMove) { document.removeEventListener("mousemove", (canvas as any)._penNativeDragMove); (canvas as any)._penNativeDragMove = null; }
    if ((canvas as any)._penNativeDragEnd) { document.removeEventListener("mouseup", (canvas as any)._penNativeDragEnd); (canvas as any)._penNativeDragEnd = null; }
    // Reset group editing mode if active
    // Always clear refs even if editingGroup state is false (can be stale after undo)
    editingGroupObjsRef.current = [];
    editingGroupPropsRef.current = null;
    if (editingGroup) {
      // Restore dimmed objects
      canvas.getObjects().forEach((o: any) => {
        if (o._groupEditSavedEvented !== undefined) { o.evented = o._groupEditSavedEvented; delete o._groupEditSavedEvented; }
        if (o._groupEditSavedSelectable !== undefined) { o.selectable = o._groupEditSavedSelectable; delete o._groupEditSavedSelectable; }
        if (o._groupEditSavedOpacity !== undefined) { o.opacity = o._groupEditSavedOpacity; delete o._groupEditSavedOpacity; }
      });
      setEditingGroup(false);
    }
    // CRITICAL: always reset isRestoringRef — eraser/lasso set it to true and
    // if cleanup happens without their own reset, history stops working entirely
    isRestoringRef.current = false;
    // Reset cursors and interaction modes
    canvas.defaultCursor = "default";
    canvas.hoverCursor = "move";
    canvas.skipTargetFind = false;
    // Reset lasso if active
    if (lassoActiveRef.current) {
      // Force lasso cleanup: remove listeners, preview objects, restore objects
      if ((canvas as any)._lassoCanvasMove) { canvas.off("mouse:move", (canvas as any)._lassoCanvasMove); (canvas as any)._lassoCanvasMove = null; delete (canvas as any)._lassoCanvasMove; }
      const uc = canvas.upperCanvasEl as HTMLCanvasElement;
      if ((canvas as any)._lassoNativeClick) uc.removeEventListener("mousedown", (canvas as any)._lassoNativeClick, true);
      if ((canvas as any)._lassoKeyHandler) document.removeEventListener("keydown", (canvas as any)._lassoKeyHandler);
      lassoPreviewRef.current.forEach((o: any) => canvas.remove(o));
      lassoPreviewRef.current = [];
      lassoPointsRef.current = [];
      lassoAnchorsRef.current = [];
      lassoEdgeMapRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.getObjects().forEach((o: any) => {
        if (o._lassoSavedEvented !== undefined) { o.evented = o._lassoSavedEvented; delete o._lassoSavedEvented; }
        if (o._lassoSavedSelectable !== undefined) { o.selectable = o._lassoSavedSelectable; delete o._lassoSavedSelectable; }
      });
      lassoTargetRef.current = null;
      setLassoActive(false);
      isRestoringRef.current = false;
      canvas.selection = true;
    }
    // Reset panels & modes
    setShowShootStrokePanel(false);
    setShowTextEffects(false);
  }, [penMode, penEditMode, editingGroup]);

  const undo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || historyIndexRef.current <= 0) return;
    if (isRestoringRef.current) return; // Prevent overlapping async undo/redo
    const targetIdx = historyIndexRef.current - 1;
    // Capture label before restore for toast feedback
    const undoLabel = (historyRef.current[historyIndexRef.current] as any)?.label;

    // ── Cross-format undo: route through the parent ──
    // Same pattern as HistoryModal.applyRollback: do the format detection
    // FIRST, BEFORE flipping isRestoringRef, so the early-return path stays
    // clean and the standard in-place restore can wrap itself in its own
    // try/finally just like before. If the target entry was saved under a
    // different format/gabarit, an in-place loadFromJSON would dump an
    // OLD-format JSON into a NEW-format canvas — instead, hand the target
    // state to StudioContent via onCrossFormatRestore so it can remount
    // FrameEditor with the right format + previousCanvasState.
    const targetEntry = historyRef.current[targetIdx];
    const tFmtId = (targetEntry as any)?.formatId;
    const tGabId = (targetEntry as any)?.gabaritId;
    const tFormat = (targetEntry as any)?.format;
    const tGabarit = (targetEntry as any)?.gabarit;
    const tDims = (targetEntry as any)?.bufferDims;
    const tBleed = (targetEntry as any)?.bleed ?? 0;
    const formatsMismatch = tFmtId && (tFmtId !== format?.id || tGabId !== gabarit?.id);
    if (formatsMismatch && tFormat && tGabarit && tDims && typeof onCrossFormatRestore === "function") {
      const targetParsed = resolveHistoryEntry(historyRef.current, targetIdx);
      if (targetParsed?.objects) {
        const restoreImg = (obj: any) => {
          if (obj?.type === "image" && obj.src?.startsWith("__img_")) {
            const data = historyImageCacheRef.current.get(obj.src);
            if (data) obj.src = data;
          }
          if (obj?.objects) obj.objects.forEach(restoreImg);
        };
        targetParsed.objects.forEach(restoreImg);
        // saveHistory stripped BLEED_PX from positions; smartReposition
        // expects buffer-space. Add the entry's saved bleed back.
        if (tBleed) {
          for (const o of targetParsed.objects) {
            if (typeof o.left === "number") o.left = o.left + tBleed;
            if (typeof o.top === "number") o.top = o.top + tBleed;
          }
        }
      }
      // Pass DESIGN dims (= buffer − 2*bleed). Sidebar.onSelect uses the
      // same convention; with buffer dims, smartReposition's
      // scaleX = newDesign / prevBuffer ≠ 1 even for same format.
      const tDesignDims = {
        width: tDims.width - 2 * tBleed,
        height: tDims.height - 2 * tBleed,
      };
      // Block any further undo/redo on this (about-to-be-disposed) canvas
      // until the new mount's setReady wrap-up clears the flag. Without
      // this guard, rapid double-clicks land a second undo on the old
      // canvas before React has committed the remount, corrupting state.
      isRestoringRef.current = true;
      // Move the index NOW so the new mount sees the right slot.
      historyIndexRef.current = targetIdx;
      const s = useEditorStore.getState();
      s.suppressHistoryRef.current = true;
      s.setPendingFormatTransitionLabel(null);
      // Cancel any wrap-up setTimeout from a previous format change that
      // hasn't fired yet. Without this, an Undo during its 320 ms window
      // lets the timer fire at the now-moved historyIndex and slice()
      // truncates the future entries the user just navigated past.
      if (s.pendingTransitionSaveTimerRef.current) {
        clearTimeout(s.pendingTransitionSaveTimerRef.current);
        s.pendingTransitionSaveTimerRef.current = null;
      }
      setHistoryVersion((v: number) => v + 1);
      onCrossFormatRestore(tFormat, tGabarit, JSON.stringify(targetParsed), tDesignDims);
      if (undoLabel) toast(`↩ ${undoLabel}`, "info");
      // Safety net: if the remount never fires, clear the gates so future
      // undo/redo aren't permanently locked out.
      setTimeout(() => {
        if (isRestoringRef.current) isRestoringRef.current = false;
        if (useEditorStore.getState().suppressHistoryRef.current) {
          useEditorStore.getState().suppressHistoryRef.current = false;
        }
      }, 5000);
      return;
    }

    // ── Same-format in-place restore ──
    isRestoringRef.current = true;
    cleanupTools();
    const { saveHistoryTimerRef } = useEditorStore.getState();
    if (saveHistoryTimerRef.current) { clearTimeout(saveHistoryTimerRef.current); saveHistoryTimerRef.current = null; }

    try {
      const entry = historyRef.current[targetIdx];
      let parsed: any;
      if (typeof entry === "string") {
        const json = LZString.decompressFromUTF16(entry) || entry;
        parsed = JSON.parse(json);
      } else {
        parsed = resolveHistoryEntry(historyRef.current, targetIdx);
      }
      if (parsed.objects) {
        const restoreImg = (obj: any) => {
          if (obj?.type === "image" && obj.src?.startsWith("__img_")) {
            const data = historyImageCacheRef.current.get(obj.src);
            if (data) obj.src = data;
          }
          if (obj?.objects) obj.objects.forEach(restoreImg);
        };
        parsed.objects.forEach(restoreImg);
      }
      // Suppress Fabric events during loadFromJSON — its internal clear()/add()
      // fires object:removed/added which can trigger saveHistory via debounced timers
      const _origFire = canvas.fire.bind(canvas);
      canvas.fire = (() => canvas) as any;
      try { await canvas.loadFromJSON(parsed); } finally { canvas.fire = _origFire; }
      canvas.setDimensions({ width: bufferWidth, height: bufferHeight });
      canvas.backgroundColor = "transparent";
      // Reapply custom props FIRST (before any add/remove that shifts indices)
      (canvas as any)._reapplyCustomProps?.(parsed);
      { const { Rect: FRect } = await import("fabric");
        canvas.clipPath = new FRect({
          left: BLEED_PX, top: BLEED_PX, width: canvasWidth, height: canvasHeight,
          originX: "left", originY: "top", absolutePositioned: true,
        });
      }
      // Remove UI-only objects, capture solidBg fill before removing
      const solidBgObjs = canvas.getObjects().filter((o: any) => o._isSolidBg);
      const customSolidFill = solidBgObjs.length > 0 ? solidBgObjs[0].fill : null;
      // Also migrate legacy _isGradientBg into solidBg fill
      const legacyGrad = canvas.getObjects().find((o: any) => o._isGradientBg);
      const gradFill = legacyGrad?.fill || null;
      const bgToRemove = canvas.getObjects().filter((o: any) => o._isDesignAreaBg || o._isSolidBg || o._isGradientBg);
      bgToRemove.forEach((o: any) => { canvas.fire = (() => canvas) as any; canvas.remove(o); canvas.fire = _origFire; });
      canvas.getObjects().forEach((o: any) => {
        o.set({ left: (o.left || 0) + BLEED_PX, top: (o.top || 0) + BLEED_PX });
        o.setCoords();
      });
      // Restore solidBg: use saved fill (color/gradient), or legacy gradient, or white
      const isCustomFill = customSolidFill && customSolidFill !== "#ffffff" && customSolidFill !== "white" && customSolidFill !== "transparent";
      const bgFill = isCustomFill ? customSolidFill : (gradFill || "#ffffff");
      { const { Rect: FRect } = await import("fabric");
        const dBg = new FRect({ left: BLEED_PX, top: BLEED_PX, width: canvasWidth, height: canvasHeight, fill: bgFill, originX: "left", originY: "top", selectable: false, evented: false, hoverCursor: "default" });
        (dBg as any)._isSolidBg = true;
        canvas.add(dBg); canvas.sendObjectToBack(dBg);
      }
      canvas.requestRenderAll();
      historyIndexRef.current = targetIdx;
      setSelectedObj(null);
      setCropping(false);
      cropTargetRef.current = null;
      setHistoryVersion((v: number) => v + 1);
      restoreZoom();
      // Reset diff state so next save produces a full snapshot (not a delta against stale base)
      (canvas as any)._resetHistoryDiffState?.();
      // Block spurious saves for 300ms after undo (React effects, deferred Fabric events)
      (canvas as any)._blockSaveUntil = Date.now() + 350;
      if (undoLabel) toast(`↩ ${undoLabel}`, "info");
    } catch (err) {
      console.error("Undo failed:", err);
    } finally {
      isRestoringRef.current = false;
      const t = useEditorStore.getState().saveHistoryTimerRef;
      if (t.current) { clearTimeout(t.current); t.current = null; }
    }
  // Include the dim/format props in deps so the closure re-captures fresh
  // values when the editor remounts with a new format. Without these, the
  // memoized undo still references the previous mount's bufferWidth /
  // canvasWidth / BLEED_PX from its closure — and a same-format in-place
  // restore right after a cross-format transition was setting the new
  // canvas to the OLD mount's dimensions ("le width et le height du créa
  // ont été modifié" — the bug the user described).
  }, [cleanupTools, restoreZoom, canvasWidth, canvasHeight, bufferWidth, bufferHeight, BLEED_PX, format, gabarit, onCrossFormatRestore]);

  const redo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas || historyIndexRef.current >= historyRef.current.length - 1) return;
    if (isRestoringRef.current) return; // Prevent overlapping async undo/redo
    const targetIdx = historyIndexRef.current + 1;
    // Capture label before restore for toast feedback
    const redoLabel = (historyRef.current[targetIdx] as any)?.label;

    // ── Cross-format redo: route through the parent ──
    // Mirror of the undo branch — see that block for the rationale.
    // Detection FIRST, BEFORE flipping isRestoringRef, so the standard
    // in-place restore below stays wrapped in its own try/finally cleanly.
    const targetEntry = historyRef.current[targetIdx];
    const tFmtId = (targetEntry as any)?.formatId;
    const tGabId = (targetEntry as any)?.gabaritId;
    const tFormat = (targetEntry as any)?.format;
    const tGabarit = (targetEntry as any)?.gabarit;
    const tDims = (targetEntry as any)?.bufferDims;
    const tBleed = (targetEntry as any)?.bleed ?? 0;
    const formatsMismatch = tFmtId && (tFmtId !== format?.id || tGabId !== gabarit?.id);
    if (formatsMismatch && tFormat && tGabarit && tDims && typeof onCrossFormatRestore === "function") {
      const targetParsed = resolveHistoryEntry(historyRef.current, targetIdx);
      if (targetParsed?.objects) {
        const restoreImg = (obj: any) => {
          if (obj?.type === "image" && obj.src?.startsWith("__img_")) {
            const data = historyImageCacheRef.current.get(obj.src);
            if (data) obj.src = data;
          }
          if (obj?.objects) obj.objects.forEach(restoreImg);
        };
        targetParsed.objects.forEach(restoreImg);
        if (tBleed) {
          for (const o of targetParsed.objects) {
            if (typeof o.left === "number") o.left = o.left + tBleed;
            if (typeof o.top === "number") o.top = o.top + tBleed;
          }
        }
      }
      const tDesignDims = {
        width: tDims.width - 2 * tBleed,
        height: tDims.height - 2 * tBleed,
      };
      // Block any further undo/redo on this (about-to-be-disposed) canvas
      // until the new mount's setReady wrap-up clears the flag.
      isRestoringRef.current = true;
      historyIndexRef.current = targetIdx;
      const s = useEditorStore.getState();
      s.suppressHistoryRef.current = true;
      s.setPendingFormatTransitionLabel(null);
      // Cancel any pending wrap-up saveHistory (see comment in the undo
      // branch above) so it doesn't fire at the moved-back/forward
      // historyIndex and truncate future entries.
      if (s.pendingTransitionSaveTimerRef.current) {
        clearTimeout(s.pendingTransitionSaveTimerRef.current);
        s.pendingTransitionSaveTimerRef.current = null;
      }
      setHistoryVersion((v: number) => v + 1);
      onCrossFormatRestore(tFormat, tGabarit, JSON.stringify(targetParsed), tDesignDims);
      if (redoLabel) toast(`↪ ${redoLabel}`, "info");
      setTimeout(() => {
        if (isRestoringRef.current) isRestoringRef.current = false;
        if (useEditorStore.getState().suppressHistoryRef.current) {
          useEditorStore.getState().suppressHistoryRef.current = false;
        }
      }, 5000);
      return;
    }

    // ── Same-format in-place restore ──
    isRestoringRef.current = true;
    const { saveHistoryTimerRef: timerRef } = useEditorStore.getState();
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    cleanupTools();

    try {
      const entry = historyRef.current[targetIdx];
      let parsed: any;
      if (typeof entry === "string") {
        const json = LZString.decompressFromUTF16(entry) || entry;
        parsed = JSON.parse(json);
      } else {
        parsed = resolveHistoryEntry(historyRef.current, targetIdx);
      }
      if (parsed.objects) {
        const restoreImg = (obj: any) => {
          if (obj?.type === "image" && obj.src?.startsWith("__img_")) {
            const data = historyImageCacheRef.current.get(obj.src);
            if (data) obj.src = data;
          }
          if (obj?.objects) obj.objects.forEach(restoreImg);
        };
        parsed.objects.forEach(restoreImg);
      }
      // Suppress Fabric events during loadFromJSON — its internal clear()/add()
      // fires object:removed/added which can trigger saveHistory via debounced timers
      const _origFireR = canvas.fire.bind(canvas);
      canvas.fire = (() => canvas) as any;
      try { await canvas.loadFromJSON(parsed); } finally { canvas.fire = _origFireR; }
      canvas.setDimensions({ width: bufferWidth, height: bufferHeight });
      canvas.backgroundColor = "transparent";
      // Reapply custom props FIRST (before any add/remove that shifts indices)
      (canvas as any)._reapplyCustomProps?.(parsed);
      { const { Rect: FRect } = await import("fabric");
        canvas.clipPath = new FRect({
          left: BLEED_PX, top: BLEED_PX, width: canvasWidth, height: canvasHeight,
          originX: "left", originY: "top", absolutePositioned: true,
        });
      }
      // Capture solidBg fill and migrate legacy gradient
      const solidBgObjsR = canvas.getObjects().filter((o: any) => o._isSolidBg);
      const customSolidFillR = solidBgObjsR.length > 0 ? solidBgObjsR[0].fill : null;
      const legacyGradR = canvas.getObjects().find((o: any) => o._isGradientBg);
      const gradFillR = legacyGradR?.fill || null;
      const bgToRemove = canvas.getObjects().filter((o: any) => o._isDesignAreaBg || o._isSolidBg || o._isGradientBg);
      bgToRemove.forEach((o: any) => { canvas.fire = (() => canvas) as any; canvas.remove(o); canvas.fire = _origFireR; });
      canvas.getObjects().forEach((o: any) => {
        o.set({ left: (o.left || 0) + BLEED_PX, top: (o.top || 0) + BLEED_PX });
        o.setCoords();
      });
      const isCustomFillR = customSolidFillR && customSolidFillR !== "#ffffff" && customSolidFillR !== "white" && customSolidFillR !== "transparent";
      const bgFillR = isCustomFillR ? customSolidFillR : (gradFillR || "#ffffff");
      { const { Rect: FRect } = await import("fabric");
        const dBg = new FRect({ left: BLEED_PX, top: BLEED_PX, width: canvasWidth, height: canvasHeight, fill: bgFillR, originX: "left", originY: "top", selectable: false, evented: false, hoverCursor: "default" });
        (dBg as any)._isSolidBg = true;
        canvas.add(dBg); canvas.sendObjectToBack(dBg);
      }
      canvas.requestRenderAll();
      historyIndexRef.current = targetIdx;
      setSelectedObj(null);
      setCropping(false);
      cropTargetRef.current = null;
      setHistoryVersion((v: number) => v + 1);
      restoreZoom();
      // Reset diff state so next save produces a full snapshot (not a delta against stale base)
      (canvas as any)._resetHistoryDiffState?.();
      // Block spurious saves for 300ms after redo (React effects, deferred Fabric events)
      (canvas as any)._blockSaveUntil = Date.now() + 350;
      if (redoLabel) toast(`↪ ${redoLabel}`, "info");
    } catch (err) {
      console.error("Redo failed:", err);
    } finally {
      isRestoringRef.current = false;
      const t = useEditorStore.getState().saveHistoryTimerRef;
      if (t.current) { clearTimeout(t.current); t.current = null; }
    }
  // Same reasoning as the undo callback above — include dim/format props
  // so the memoized callback re-captures them on remount instead of
  // setting the new canvas to the previous mount's dimensions.
  }, [cleanupTools, restoreZoom, canvasWidth, canvasHeight, bufferWidth, bufferHeight, BLEED_PX, format, gabarit, onCrossFormatRestore]);

  const updateObj = useCallback(async (props: Record<string, any>) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Always use the real Fabric object (selectedObj from store may be a spread copy)
    const obj = canvas.getActiveObject();
    if (!obj) return;

    // Rich text: if textbox is in editing mode with selection, apply to selection only
    const isEditing = obj.isEditing && (obj.selectionStart !== obj.selectionEnd);
    const inlineStyleProps = ["fill", "fontWeight", "fontStyle", "underline", "linethrough", "fontSize", "fontFamily"];
    const inlineProps: Record<string, any> = {};
    const objProps: Record<string, any> = {};
    let shadowApplied = false;

    for (const [key, val] of Object.entries(props)) {
      if (isEditing && inlineStyleProps.includes(key)) {
        inlineProps[key] = val;
      } else if (key === "shadow" && typeof val === "string") {
        // Parse CSS shadow string into Fabric Shadow object — await the cached
        // import so later updateObj calls can't overwrite a stale object
        const fabric = await getFabric();
        // Re-check the active object in case selection changed during await
        const stillActive = canvas.getActiveObject();
        if (stillActive !== obj) return;
        const m = val.match(/([-\d.]+)(?:px)?\s+([-\d.]+)(?:px)?\s+([-\d.]+)(?:px)?\s+(.+)/);
        if (m) {
          obj.set({ shadow: new fabric.Shadow({ offsetX: parseFloat(m[1]), offsetY: parseFloat(m[2]), blur: parseFloat(m[3]), color: m[4].trim() }) });
        } else {
          try { obj.set({ shadow: new fabric.Shadow(val) }); } catch { obj.set({ shadow: val }); }
        }
        shadowApplied = true;
        continue; // skip adding to objProps since we handle it here
      } else {
        objProps[key] = val;
      }
    }

    // Apply inline styles to selection
    if (Object.keys(inlineProps).length > 0 && isEditing) {
      const start = obj.selectionStart;
      const end = obj.selectionEnd;
      obj.setSelectionStyles(inlineProps, start, end);
      obj.dirty = true;
      obj.initDimensions();
    }
    // Apply object-level styles
    if (Object.keys(objProps).length > 0) {
      obj.set(objProps);
      if (obj.initDimensions && (objProps.fontSize || objProps.fontFamily || objProps.fontWeight || objProps.fontStyle)) {
        obj.dirty = true;
        obj.initDimensions();
        obj.setCoords();
      }
    }

    // Only fire object:modified if we actually applied something —
    // avoid creating a no-op history entry
    if (Object.keys(objProps).length === 0 && Object.keys(inlineProps).length === 0 && !shadowApplied) {
      return;
    }

    canvas.requestRenderAll();
    const keys = Object.keys(props);
    let detail = "";
    if (keys.includes("fill") || keys.includes("backgroundColor")) detail = " — couleur";
    else if (keys.includes("fontSize")) detail = " — taille police";
    else if (keys.includes("fontFamily")) detail = " — police";
    else if (keys.includes("fontWeight") || keys.includes("fontStyle")) detail = " — style";
    else if (keys.includes("underline")) detail = " — souligné";
    else if (keys.includes("linethrough")) detail = " — barré";
    else if (keys.includes("opacity")) detail = " — opacité";
    else if (keys.includes("flipX") || keys.includes("flipY")) detail = " — retourné";
    else if (keys.includes("left") || keys.includes("top")) detail = " — position";
    else if (keys.includes("scaleX") || keys.includes("scaleY") || keys.includes("width") || keys.includes("height")) detail = " — taille";
    else if (keys.includes("angle")) detail = " — rotation";
    else if (keys.includes("stroke") || keys.includes("strokeWidth")) detail = " — contour";
    else if (keys.includes("rx") || keys.includes("ry")) detail = " — coins arrondis";
    else if (keys.includes("shadow")) detail = " — ombre";
    else if (keys.includes("textAlign")) detail = " — alignement";
    else if (keys.includes("lineHeight") || keys.includes("charSpacing")) detail = " — espacement";
    const isFem = obj.type === "image" || obj.type === "ellipse" || obj.type === "line" || obj._isShootZone;
    const typeName = (obj.type === "textbox" || obj.type === "i-text") ? "Texte" : obj.type === "image" ? "Image" : obj._isShootZone ? "Zone photo" : obj.type === "rect" ? "Rectangle" : obj.type === "circle" ? "Cercle" : "Élément";
    canvas.fire("object:modified", { target: obj, _continuous: true, _historyLabel: `${typeName} modifié${isFem ? "e" : ""}${detail}` });
    forceRender((n: number) => n + 1);
  }, []);

  const enterGroupEditing = useCallback(async (group: any) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (!group || group.type !== "group") { console.warn("[enterGroupEditing] target is not a group:", group?.type); return; }
    const fabric = await import("fabric");
    // Save z-index so we can restore the group's layer position on exit
    const groupZIndex = canvas.getObjects().indexOf(group);
    editingGroupPropsRef.current = { left: group.left || 0, top: group.top || 0, angle: group.angle || 0, scaleX: group.scaleX || 1, scaleY: group.scaleY || 1, zIndex: groupZIndex };
    // Serialize then re-create objects for clean absolute positions
    const groupJSON = group.toObject(CUSTOM_PROPS);
    const groupLeft = group.left || 0;
    const groupTop = group.top || 0;
    const groupAngle = group.angle || 0;
    const groupScaleX = group.scaleX || 1;
    const groupScaleY = group.scaleY || 1;
    // Save history snapshot BEFORE decomposing the group, so undo can restore it intact
    const { saveHistoryTimerRef: _shtr } = useEditorStore.getState();
    if (_shtr.current) { clearTimeout(_shtr.current); _shtr.current = null; }
    if ((canvas as any)._saveHistory) (canvas as any)._saveHistory("Avant édition du groupe");
    // Block history saves during setup: removing the group + adding children must not
    // create history entries with children as individual objects (breaks layer order).
    isRestoringRef.current = true;
    canvas.remove(group);
    const childJSONs = groupJSON.objects || [];
    const newObjects: any[] = [];
    // Enliven the entire array in one call instead of serially
    const enlivened = await fabric.util.enlivenObjects(childJSONs);
    for (const obj of enlivened) {
      if (!obj) continue;
      const relX = (obj as any).left || 0;
      const relY = (obj as any).top || 0;
      const rad = (groupAngle * Math.PI) / 180;
      const scaledX = relX * groupScaleX;
      const scaledY = relY * groupScaleY;
      (obj as any).set({
        left: groupLeft + scaledX * Math.cos(rad) - scaledY * Math.sin(rad),
        top: groupTop + scaledX * Math.sin(rad) + scaledY * Math.cos(rad),
        angle: ((obj as any).angle || 0) + groupAngle,
        scaleX: ((obj as any).scaleX || 1) * groupScaleX,
        scaleY: ((obj as any).scaleY || 1) * groupScaleY,
        selectable: true,
        evented: true,
      });
      (obj as any).setCoords();
      canvas.add(obj);
      newObjects.push(obj);
    }
    editingGroupObjsRef.current = newObjects;
    isRestoringRef.current = false;
    // Disable all non-group objects so user can only interact with group contents
    canvas.getObjects().forEach((o: any) => {
      if (!newObjects.includes(o)) {
        o._groupEditSavedEvented = o.evented;
        o._groupEditSavedSelectable = o.selectable;
        o._groupEditSavedOpacity = o.opacity;
        o.set({ evented: false, selectable: false, opacity: (o.opacity || 1) * 0.3 });
      }
    });
    canvas.requestRenderAll();
    setEditingGroup(true);
    setSelectedObj(null);
  }, []);

  const exitGroupEditing = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    try {
      const objects = editingGroupObjsRef.current.filter((o: any) => canvas.getObjects().includes(o));
      // Restore non-group objects
      canvas.getObjects().forEach((o: any) => {
        if (o._groupEditSavedEvented !== undefined) { o.evented = o._groupEditSavedEvented; delete o._groupEditSavedEvented; }
        if (o._groupEditSavedSelectable !== undefined) { o.selectable = o._groupEditSavedSelectable; delete o._groupEditSavedSelectable; }
        if (o._groupEditSavedOpacity !== undefined) { o.opacity = o._groupEditSavedOpacity; delete o._groupEditSavedOpacity; }
      });
      // If all children were deleted, just clean up — no group to recreate
      if (objects.length === 0) {
        setEditingGroup(false);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        setSelectedObj(null);
        return;
      }
      const fabric = await getFabric();
      const savedProps = editingGroupPropsRef.current as any;
      const savedZIndex = savedProps?.zIndex;
      const savedAngle = savedProps?.angle ?? 0;
      const savedScaleX = savedProps?.scaleX ?? 1;
      const savedScaleY = savedProps?.scaleY ?? 1;
      // Block saves during teardown: removing children must not create history entries
      isRestoringRef.current = true;
      objects.forEach((o: any) => canvas.remove(o));
      // Re-create group — fabric.Group constructor computes relative positions from absolute
      const group = new fabric.Group(objects);
      // Re-apply original rotation/scale: fabric.Group recomputes the bounding box
      // freshly from absolute coords and drops the group's transform.
      if (savedAngle || savedScaleX !== 1 || savedScaleY !== 1) {
        group.set({ angle: savedAngle, scaleX: savedScaleX, scaleY: savedScaleY });
        group.setCoords();
      }
      setEditingGroup(false);
      canvas.add(group);
      // Restore the group's original z-index in the layer stack
      if (savedZIndex !== undefined && savedZIndex >= 0) {
        const maxIdx = canvas.getObjects().length - 1;
        canvas.moveObjectTo(group, Math.min(savedZIndex, maxIdx));
      }
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
      setSelectedObj(group);
      // Trigger a single labeled history save for the entire group edit session
      canvas.fire("object:modified", { target: group, _historyLabel: "Groupe — modifié" });
    } finally {
      // Always reset these — otherwise an async failure leaves the editor stuck
      editingGroupObjsRef.current = [];
      editingGroupPropsRef.current = null;
      isRestoringRef.current = false;
    }
  }, []);

  return { cleanupTools, undo, redo, updateObj, enterGroupEditing, exitGroupEditing };
}
