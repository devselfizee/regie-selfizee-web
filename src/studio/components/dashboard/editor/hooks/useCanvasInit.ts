// @ts-nocheck — extracted from FrameEditor, implicit any types throughout
"use client";

import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";
import { createInitialPenState } from "../tools/PenTool";
import {
  createCanvas,
  createShootZones,
  createTextGuides,
  reapplyCustomProps,
  restoreCanvasState,
} from "../canvas/canvasSetup";
import { getCanvasDimensions } from "../types";
import {
  createSaveHistory,
  smartRepositionFromPreviousFormat,
} from "../canvas/canvasHistory";
import {
  setupAlignmentSnapping,
} from "../canvas/canvasSnapping";
import { stabilizeBlobSrc } from "../canvas/canvasUtils";
import { observeResize } from "@/studio/lib/observeResize";

const RULER_SIZE = 24;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function useCanvasInit(params: any) {
  const {
    // Refs
    canvasElRef,
    canvasWrapperRef,
    fabricRef,
    containerRef,
    displayScaleRef,
    autoScaleRef,
    userZoomRef,
    applyScaleRef,
    floatingRef,
    floatingPosRef,
    historyRef,
    historyIndexRef,
    historyImageCacheRef,
    isRestoringRef,
    frameNameRef,
    bgColorRef,
    eraserTargetRef,
    lassoActiveRef,
    lassoPreviewRef,
    lassoPointsRef,
    lassoAnchorsRef,
    lassoEdgeMapRef,
    lassoTargetRef,
    penModeRef,
    penEditModeRef,
    penStateRef,
    penPreviewRef,
    penOverlayRef,
    penOverlayHitMapRef,
    freedrawActiveRef,
    selectAreaActiveRef,
    enterGroupEditingRef,
    enterPenEditModeRef,
    editingGroupObjsRef,
    // State setters
    setReady,
    setSelectedObj,
    setFloatingPos,
    setEraserActive,
    setWandActive,
    setFiltersOpen,
    setFilterBrightness,
    setFilterContrast,
    setFilterSaturation,
    setFilterBlur,
    setLassoActive,
    setPenMode,
    setPenEditMode,
    setPenPointCount,
    setShowShootStrokePanel,
    setFrameName,
    setBgColor,
    setHistoryVersion,
    setSaveStatus,
    setLastSavedAt,
    setZoomPercent,
    setRulerOffset,
    setContainerSize,
    // Canvas dimensions
    canvasWidth,
    canvasHeight,
    BLEED_PX,
    bufferWidth,
    bufferHeight,
    // Props
    gabarit,
    eventId,
    format,
    initialCanvasState,
    initialFrameName,
    frameId,
    previousCanvasState,
    previousDimensions,
    typeSlug,
    // External constants
    CURSOR_WAND,
  } = params;

  useEffect(() => {
    // Editor remounts on format/gabarit change keep the zustand store —
    // so `ready` stays true across remounts, and consumers (e.g. TopBar's
    // shoot counter) never re-run after the new canvas is built. Reset it
    // here and the final setReady(true) below retriggers them.
    setReady(false);
    // Reset the persisted frame name whenever this mount carries no saved
    // content to restore. Two cases both need it:
    //  - "Charger les éléments existants" → previousCanvasState is set
    //  - "Repartir d'un nouveau gabarit" → neither previousCanvasState nor
    //    initialCanvasState is set (StudioContent drops loadedCanvasState
    //    in its onChangeGabarit handler when the user chose to discard)
    // Without this the TopBar input keeps showing the prior format's name
    // (e.g. "Carte Postale Portrait") while the new gabarit (Mini Polaroid)
    // is already loaded below. When initialCanvasState IS set, the user is
    // editing a saved frame and restoreCanvasState below re-applies the
    // stored name via initialFrameName — no override needed here.
    if (previousCanvasState || !initialCanvasState) {
      setFrameName("");
    }

    let mounted = true;
    let unobserveResize: (() => void) | null = null;
    let scrollHandler: (() => void) | null = null;
    // Memory leak fix: hoisted so cleanup can clear the pending timer
    let saveHistoryTimer: ReturnType<typeof setTimeout> | null = null;
    // Hoisted so cleanup can remove it (created inside initFabric)
    let dimTooltipEl: HTMLDivElement | null = null;

    // Suppress fabric.js "aborted" unhandled rejection from dispose() in Strict Mode
    const suppressAborted = (e: PromiseRejectionEvent) => {
      if (e.reason === "aborted" || e.reason?.message === "aborted") {
        e.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", suppressAborted);

    async function initFabric() {
      if (!canvasElRef.current) return;
      performance.mark('editor:init:start');

      // Compute dimensions directly from format to avoid stale closure
      // (the store values captured by useEffect([]) may still hold the
      // previous format's dimensions when a useLayoutEffect update hasn't
      // been reflected in the effect callback yet).
      const dims = getCanvasDimensions(format);
      const canvasWidth = dims.canvasWidth;
      const canvasHeight = dims.canvasHeight;
      const BLEED_PX = dims.BLEED_PX;
      const bufferWidth = dims.bufferWidth;
      const bufferHeight = dims.bufferHeight;

      // ── Create canvas + fabric defaults ──
      const { canvas, fabric } = await createCanvas(
        canvasElRef.current, bufferWidth, bufferHeight, canvasWidth, canvasHeight, BLEED_PX,
      );
      if (!mounted) { canvas.dispose(); return; }
      fabricRef.current = canvas;
      performance.mark('editor:canvas:created');

      // ── Shoot zones + text guides ──
      // Detect a previous state that came from a catalogue (Selfizee booth)
      // load — its objects carry _fromCatalogue tags. smart-reposition
      // decides per-call whether to keep its shoots ("Remplacer le design"
      // pre-scaled path) or drop them in favour of the new gabarit's
      // ("Changer de format" path, user's explicit ask).
      let isCataloguePrev = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let prevDimsW = 0; let prevDimsH = 0;
      if (previousCanvasState) {
        try {
          const prev = JSON.parse(previousCanvasState);
          isCataloguePrev = Array.isArray(prev?.objects) && prev.objects.some((o: any) => o?._fromCatalogue);
        } catch { /* ignore — fall back to default behaviour */ }
      }
      if (previousDimensions) {
        prevDimsW = previousDimensions.width;
        prevDimsH = previousDimensions.height;
      }
      // Pre-scaled = "Remplacer le design" path: applyCatalogueModel scales
      // every object to the new BUFFER and passes those BUFFER dims as
      // previousDimensions. In any other path (format change, gabarit
      // change, fresh load), prevDims differs and we want the new
      // gabarit's shoots regardless.
      const newBufferW = canvasWidth + 2 * BLEED_PX;
      const newBufferH = canvasHeight + 2 * BLEED_PX;
      const isCataloguePreScaled = isCataloguePrev && prevDimsW === newBufferW && prevDimsH === newBufferH;
      // Skip default-shoot creation only on the pre-scaled "Remplacer le
      // design" path — the catalogue brings its own creu_<n> rects there.
      // All other paths (including cross-format from a catalogue creation)
      // get the new gabarit's shoots and smartReposition will keep them.
      if (!isCataloguePreScaled) {
        createShootZones(canvas, fabric, gabarit, canvasWidth, canvasHeight, BLEED_PX);
      }
      createTextGuides(canvas, fabric, gabarit, canvasWidth, canvasHeight, BLEED_PX);

      // Per-type default background colour for fresh creations. restoreCanvasState
      // below takes over when loading an existing state (initialCanvasState or
      // previousCanvasState), so this only affects blank new designs.
      const freshCreation = !initialCanvasState && !previousCanvasState;
      if (freshCreation) {
        const defaultBgByType: Record<string, string> = {
          "fonds-verts": "#66DD66",
          "ecrans": "#000000",
        };
        const defaultBg = defaultBgByType[typeSlug || ""];
        if (defaultBg) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const solidBg = canvas.getObjects().find((o: any) => o._isSolidBg);
          if (solidBg) solidBg.set("fill", defaultBg);
          setBgColor(defaultBg);
          canvas.requestRenderAll();
        }
      }

      // ── Live dimension tooltip (W×H / X,Y / angle°) ──
      const dimTooltip = document.createElement("div");
      dimTooltipEl = dimTooltip;
      dimTooltip.style.cssText = [
        "position:absolute",
        "background:rgba(20,20,20,0.82)",
        "color:#fff",
        "font-size:11px",
        "padding:3px 8px",
        "border-radius:5px",
        "pointer-events:none",
        "z-index:10000",
        "white-space:nowrap",
        "font-family:ui-monospace,monospace",
        "transform:translateX(-50%)",
        "display:none",
        "box-shadow:0 1px 4px rgba(0,0,0,.3)",
      ].join(";");
      canvasWrapperRef.current?.appendChild(dimTooltip);

      function showDimTooltip(text: string, target: any) {
        if (!canvasWrapperRef.current || !target) { dimTooltip.style.display = "none"; return; }
        const s = displayScaleRef.current;
        const br = target.getBoundingRect();
        const x = (br.left + br.width / 2) * s;
        const y = Math.max(4, (br.top - 30) * s);
        dimTooltip.style.left = `${x}px`;
        dimTooltip.style.top = `${y}px`;
        dimTooltip.textContent = text;
        dimTooltip.style.display = "block";
      }
      function hideDimTooltip() { dimTooltip.style.display = "none"; }

      // ── Alt+drag: clone original at start position after drag ──
      let altDragTarget: any = null;
      let altDragStartLeft = 0;
      let altDragStartTop = 0;

      canvas.on("mouse:down", (e: any) => {
        if (!e.e?.altKey) { altDragTarget = null; return; }
        const t = e.target;
        if (!t || !t.selectable || t._isGuideline || t._isSolidBg || t._isDesignAreaBg || t._isShootZone) {
          altDragTarget = null; return;
        }
        altDragTarget = t;
        altDragStartLeft = t.left ?? 0;
        altDragStartTop  = t.top  ?? 0;
      });

      // ── Selection tracking + floating toolbar position ──
      function updateFloatingPos(skipState?: any) {
        const active = canvas.getActiveObject();
        if (!canvasWrapperRef.current) { floatingPosRef.current = null; if (!skipState) setFloatingPos(null); return; }
        if (!active) { floatingPosRef.current = null; if (!skipState) setFloatingPos(null); return; }
        const br = active.getBoundingRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        const wrapperRect = canvasWrapperRef.current.getBoundingClientRect();
        if (!containerRect) return;
        const s = displayScaleRef.current;
        const bottomY = wrapperRect.top - containerRect.top + (br.top + br.height) * s + 12;
        const containerH = containerRef.current?.clientHeight || 600;
        // Default: below the object. If too low (near bottom), flip above.
        const below = bottomY + 50 < containerH;
        const pos = {
          x: wrapperRect.left - containerRect.left + br.left * s + (br.width * s) / 2,
          y: below
            ? bottomY
            : wrapperRect.top - containerRect.top + br.top * s - 52,
          below,
        };
        floatingPosRef.current = pos;
        const el = floatingRef.current;
        if (el && skipState) {
          const maxX = (containerRef.current?.clientWidth || 800) - 120;
          el.style.left = `${Math.max(120, Math.min(pos.x, maxX))}px`;
          el.style.top = `${pos.y}px`;
          el.style.transform = pos.below ? "translate(-50%, 0)" : "translate(-50%, -100%)";
        } else {
          setFloatingPos(pos);
        }
      }

      // ── Deactivate tools on selection change ──
      const deactivateTools = () => {
        if (isRestoringRef.current) return;
        if (penModeRef.current || penEditModeRef.current || lassoActiveRef.current || freedrawActiveRef.current) return;
        if (selectAreaActiveRef.current) return;
        const anyToolActive = eraserTargetRef.current || (canvas as any)._wandMouseDown ||
          lassoPreviewRef.current.length > 0 || lassoTargetRef.current ||
          penOverlayRef.current.length > 0 || penPreviewRef.current ||
          canvas.isDrawingMode;
        if (!anyToolActive) {
          setShowShootStrokePanel(false);
          setFiltersOpen(false);
          return;
        }
        setShowShootStrokePanel(false);
        setEraserActive(false);
        setWandActive(false);
        setFiltersOpen(false);
        setFilterBrightness(0);
        setFilterContrast(0);
        setFilterSaturation(0);
        setFilterBlur(0);
        eraserTargetRef.current = null;
        if ((canvas as any)._wandMouseDown) {
          canvas.off("mouse:down", (canvas as any)._wandMouseDown);
          delete (canvas as any)._wandMouseDown;
        }
        canvas.getObjects().forEach((o: any) => {
          if (o._origCursor !== undefined) { o.hoverCursor = o._origCursor; delete o._origCursor; }
        });
        setLassoActive(false);
        lassoPreviewRef.current.forEach((o: any) => canvas.remove(o));
        lassoPreviewRef.current = [];
        lassoPointsRef.current = [];
        lassoAnchorsRef.current = [];
        lassoEdgeMapRef.current = null;
        lassoTargetRef.current = null;
        canvas.getObjects().forEach((o: any) => {
          if (o._lassoSavedEvented !== undefined) { o.evented = o._lassoSavedEvented; delete o._lassoSavedEvented; }
          if (o._lassoSavedSelectable !== undefined) { o.selectable = o._lassoSavedSelectable; delete o._lassoSavedSelectable; }
        });
        if ((canvas as any)._lassoKeyHandler) {
          document.removeEventListener("keydown", (canvas as any)._lassoKeyHandler);
          delete (canvas as any)._lassoKeyHandler;
        }
        canvas.isDrawingMode = false;
        // Remove only the specific freedraw/eraser path:created handlers
        // if they're registered — don't wipe unrelated listeners.
        if ((canvas as any)._freedrawPathHandler) {
          canvas.off("path:created", (canvas as any)._freedrawPathHandler);
          delete (canvas as any)._freedrawPathHandler;
        }
        if ((canvas as any)._eraserPathHandler) {
          canvas.off("path:created", (canvas as any)._eraserPathHandler);
          delete (canvas as any)._eraserPathHandler;
        }
        canvas.defaultCursor = "default";
        canvas.hoverCursor = "move";
        // Cancel any in-progress pen tool via its exposed handle instead
        // of wiping all mouse:dblclick/mouse:move listeners.
        if (typeof (canvas as any)._penCancel === "function") {
          try { (canvas as any)._penCancel(); } catch { /* ignore */ }
        }
        setPenMode(false);
        setPenEditMode(false);
        if ((canvas as any)._penMouseMove) {
          canvas.off("mouse:move", (canvas as any)._penMouseMove);
          delete (canvas as any)._penMouseMove;
        }
        penStateRef.current = createInitialPenState();
        setPenPointCount(0);
        penOverlayRef.current.forEach((o: any) => canvas.remove(o));
        penOverlayRef.current = [];
        penOverlayHitMapRef.current = null;
        if (penPreviewRef.current) { canvas.remove(penPreviewRef.current); penPreviewRef.current = null; }
        if ((canvas as any)._penKeyHandler) {
          document.removeEventListener("keydown", (canvas as any)._penKeyHandler);
          delete (canvas as any)._penKeyHandler;
        }
        canvas.getObjects().forEach((o: any) => {
          if (o._penSavedEvented !== undefined) { o.evented = o._penSavedEvented; delete o._penSavedEvented; }
          if (o._penSavedSelectable !== undefined) { o.selectable = o._penSavedSelectable; delete o._penSavedSelectable; }
        });
        canvas.selection = true;
      };

      // ── Wire selection events ──
      // Helper: hide side handles on objects that must keep aspect ratio
      const updateControlsForSelection = () => {
        const obj = canvas.getActiveObject();
        if (!obj) return;
        const isText = obj.type === "textbox" || obj.type === "i-text" || obj.type === "text";
        const isFreeScale = obj._isShootZone || obj._isPenPath || obj._ratioLocked === false;
        // Textboxes always show ml/mr (width handles) but not mt/mb
        // Other objects show side handles only if free-scale is enabled
        obj.setControlsVisibility({
          ml: isText || isFreeScale,
          mr: isText || isFreeScale,
          mt: !isText && isFreeScale,
          mb: !isText && isFreeScale,
        });
      };

      canvas.on("selection:created", () => { deactivateTools(); setSelectedObj(canvas.getActiveObject()); updateFloatingPos(); updateControlsForSelection(); });
      canvas.on("selection:updated", () => { deactivateTools(); setSelectedObj(canvas.getActiveObject()); updateFloatingPos(); updateControlsForSelection(); });
      canvas.on("selection:cleared", () => { if (!isRestoringRef.current) { deactivateTools(); setSelectedObj(null); setFloatingPos(null); } });

      // ── Print margin proximity detection + live dimension tooltip ──
      canvas.on("object:moving", (e: any) => {
        updateFloatingPos(true);
        const t = e.target;
        if (!t) return;
        // Auto-show print margins only when object actually overlaps the margin zone
        const pm = useEditorStore.getState().PRINT_MARGIN;
        const bound = t.getBoundingRect();
        const objLeft = bound.left - BLEED_PX;
        const objTop = bound.top - BLEED_PX;
        const objRight = objLeft + bound.width;
        const objBottom = objTop + bound.height;
        const nearEdge = objLeft < pm || objTop < pm || objRight > canvasWidth - pm || objBottom > canvasHeight - pm;
        const { showPrintMarginsAuto, setShowPrintMarginsAuto } = useEditorStore.getState();
        if (nearEdge && !showPrintMarginsAuto) setShowPrintMarginsAuto(true);
        else if (!nearEdge && showPrintMarginsAuto) setShowPrintMarginsAuto(false);
        // Live position tooltip — use bounding rect for consistent top-left regardless of origin
        const br = t.getBoundingRect();
        const x = Math.round(br.left - BLEED_PX);
        const y = Math.round(br.top  - BLEED_PX);
        showDimTooltip(`X ${x}  Y ${y}`, t);
      });
      canvas.on("mouse:up", async () => {
        hideDimTooltip();
        // Alt+drag: if object was moved with Alt held, leave a clone at the start position
        if (altDragTarget) {
          const t = altDragTarget;
          altDragTarget = null;
          const movedX = (t.left || 0) - altDragStartLeft;
          const movedY = (t.top  || 0) - altDragStartTop;
          // Only if moved significantly (real drag, not click)
          if (movedX * movedX + movedY * movedY > 36) {
            stabilizeBlobSrc(t);
            const cloned = await t.clone();
            cloned.set({ left: altDragStartLeft, top: altDragStartTop });
            for (const k of Object.keys(t)) {
              if (k.startsWith("_") && k !== "_shootLabel" && k !== "_objects") cloned[k] = (t as any)[k];
            }
            cloned._shootLabel = null;
            // Do NOT suppress history here — we want the clone captured so
            // undo/redo restores it correctly. The added object:added event
            // will fire a debounced save together with the drag's
            // object:modified, producing a single history entry for the
            // alt-drag clone operation.
            canvas.add(cloned);
            canvas.setActiveObject(t);
            canvas.requestRenderAll();
            // Explicit history save with a clear label so the alt-drag
            // operation is distinguishable in the history panel.
            canvas.fire("object:modified", { target: t, _historyLabel: "Objet dupliqué (Alt+glisser)" } as any);
          }
        }
        // Hide auto margins after a short delay
        setTimeout(() => useEditorStore.getState().setShowPrintMarginsAuto(false), 800);
        canvas.requestRenderAll();
      });

      // ── Ratio lock: shoots and pen paths scale freely, everything else keeps ratio ──
      canvas.on("before:transform", (e: any) => {
        const target = e.transform?.target;
        if (!target) return;
        // Shoot zones and pen/bezier paths can scale freely
        const isFreeScale = target._isShootZone || target._isPenPath || target._ratioLocked === false;
        canvas.uniformScaling = !isFreeScale;
      });

      // ── Object scaling/rotating/modified handlers ──
      canvas.on("object:scaling", (e: any) => {
        updateFloatingPos(true);
        const target = e.target;
        if (target?._isShootZone && target.fill?.source) {
          target.fill.patternTransform = [1 / (target.scaleX || 1), 0, 0, 1 / (target.scaleY || 1), 0, 0];
          target.dirty = true;
        }
        // Live size tooltip
        if (target) {
          const w = Math.round((target.width || 0) * (target.scaleX || 1));
          const h = Math.round((target.height || 0) * (target.scaleY || 1));
          showDimTooltip(`${w} × ${h}`, target);
        }
      });
      canvas.on("object:rotating", (e: any) => {
        updateFloatingPos(true);
        const target = e.target;
        if (target) showDimTooltip(`${Math.round(target.angle || 0)}°`, target);
      });
      canvas.on("object:modified", (e: any) => {
        // Restore ratio lock after transform ends
        canvas.uniformScaling = true;
        updateFloatingPos();
        const target = e.target;

        // ── Text: convert scale into real fontSize so font size stays meaningful ──
        if (target && (target.type === "textbox" || target.type === "i-text" || target.type === "text")) {
          const sx = target.scaleX || 1;
          const sy = target.scaleY || 1;
          if (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01) {
            const oldSize = target.fontSize || 32;
            const newSize = Math.max(6, Math.round(oldSize * sy));
            const newWidth = Math.max(20, Math.round((target.width || 100) * sx));
            target.set({ fontSize: newSize, width: newWidth, scaleX: 1, scaleY: 1 });
            target.dirty = true;
            target.initDimensions();
            target.setCoords();
            canvas.requestRenderAll();
            // Update store so toolbar reflects the new fontSize
            setSelectedObj(target);
            useEditorStore.getState().forceRender((n: number) => n + 1);
          }
        }

        if (!target?._isShootZone) return;
        if (target.scaleX !== 1 || target.scaleY !== 1) {
          const w = Math.max(10, (target.width || 1) * (target.scaleX || 1));
          const h = Math.max(10, (target.height || 1) * (target.scaleY || 1));
          target.set({ width: w, height: h, scaleX: 1, scaleY: 1 });
          if (target.fill?.patternTransform) target.fill.patternTransform = [1, 0, 0, 1, 0, 0];
          target.dirty = true;
          target.setCoords();
        }
        if (target._shootLabel) {
          target._shootLabel.set({ left: (target.left || 0) + 8, top: (target.top || 0) + 6 });
          target._shootLabel.setCoords();
        }
        canvas.requestRenderAll();
      });

      // ── Right-click: handled natively via DOM event on canvas element ──
      const upperEl = canvas.upperCanvasEl;
      if (upperEl) {
        upperEl.addEventListener("contextmenu", (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          let target = canvas.findTarget(e);
          // Skip non-selectable objects (bg, guides, etc.)
          if (target && (!target.selectable || target._isSolidBg || target._isDesignAreaBg || target._isGuideline)) {
            target = null;
          }
          const obj = target || canvas.getActiveObject();
          if (obj && obj.selectable !== false) {
            try { canvas.setActiveObject(obj); } catch { /* skip */ }
            setSelectedObj(obj);
            canvas.requestRenderAll();
            upperEl.dispatchEvent(new CustomEvent("fabric:contextmenu", { detail: { x: e.clientX, y: e.clientY } }));
          }
        });
      }

      // ── Double-click: group editing, pen path editing, text inline editing ──
      canvas.on("mouse:dblclick", (e: any) => {
        let target = e.target;
        const active = canvas.getActiveObject();

        // Double-click on empty area in group editing mode → exit group editing
        if (!target && editingGroupObjsRef.current?.length > 0) {
          // exitGroupEditing is passed via params.exitGroupEditingFn or we use the ref
          if (typeof params.exitGroupEditingFn === "function") params.exitGroupEditingFn();
          return;
        }

        // Double-click on empty area → select background image (if any)
        if (!target && !active) {
          const bgImg = canvas.getObjects().find((o: any) => o._isBgImage);
          if (bgImg) {
            canvas.setActiveObject(bgImg);
            canvas.requestRenderAll();
          }
          return;
        }

        if (target?.group?.type === "group") target = target.group;
        if (target?.parent?.type === "group") target = target.parent;
        if (!target || target.type !== "group") target = active;
        if (target?.type === "group" && !target._isShootZone) {
          enterGroupEditingRef.current?.(target);
          return;
        }
        // Also check if the active object is a group (user already selected it)
        if (active?.type === "group" && !(active as any)._isShootZone && (!target || target === active)) {
          enterGroupEditingRef.current?.(active);
          return;
        }
        if (target?._isPenPath && !penStateRef.current.active) {
          enterPenEditModeRef.current?.(target);
        }
        if (target?.type === "textbox" || target?.type === "i-text") {
          target.enterEditing();
          target.selectAll();
          canvas.requestRenderAll();
        }
      });

      // ── Hover outline (Canva-style) ──
      const removeHoverHighlight = () => {
        canvasWrapperRef.current?.querySelector("[data-hover-highlight]")?.remove();
      };
      canvas.on("mouse:over", (e: any) => {
        const target = e.target;
        const active = canvas.getActiveObject();
        if (!target || target === active) return;
        if (target._isGuideline || target._isTextGuide || target._isSolidBg || target._isShootLabel || target._isHoverHighlight || target._isPenOverlay || target._isPenPreview || target._isDesignAreaBg) return;
        const wrap = canvasWrapperRef.current;
        if (!wrap) return;
        const bound = target.getBoundingRect();
        const scale = displayScaleRef.current;
        removeHoverHighlight();
        const div = document.createElement("div");
        div.setAttribute("data-hover-highlight", "1");
        div.style.cssText = `position:absolute;left:${bound.left * scale}px;top:${bound.top * scale}px;width:${bound.width * scale}px;height:${bound.height * scale}px;border:1.5px dashed #4f46e5;pointer-events:none;z-index:5;border-radius:2px;`;
        wrap.appendChild(div);
      });
      canvas.on("mouse:out", removeHoverHighlight);
      canvas.on("mouse:down", removeHoverHighlight);
      canvas.on("object:moving", removeHoverHighlight);

      // ── Alignment snapping ──
      setupAlignmentSnapping(canvas, BLEED_PX, canvasWidth, canvasHeight, fabric, displayScaleRef);

      // ── Auto-save key ──
      const autoSaveKey = `selfizee_canvas_${eventId}_${format.id}_${gabarit.id}`;

      // ── History system ──
      const { suppressHistoryRef } = useEditorStore.getState();
      const saveHistory = createSaveHistory(
        canvas, BLEED_PX, canvasWidth, canvasHeight, bufferWidth, bufferHeight,
        isRestoringRef, suppressHistoryRef, historyRef, historyIndexRef, historyImageCacheRef,
        frameNameRef, bgColorRef, autoSaveKey,
        format, gabarit,
        setHistoryVersion, setSaveStatus, setLastSavedAt,
      );
      (canvas as any)._reapplyCustomProps = (jsonObj?: any) => reapplyCustomProps(canvas, jsonObj);
      (canvas as any)._saveHistory = saveHistory;

      // ── Restore state ──
      // When the user switches gabarit via "Charger les éléments existants",
      // previousCanvasState carries the in-progress work to be re-imported by
      // smartRepositionFromPreviousFormat below. Restoring initialCanvasState
      // here would re-add the old gabarit's layout (shoots + user elements),
      // producing duplicates once the smart import runs.
      const stateToRestore = previousCanvasState
        ? null
        : initialCanvasState || (frameId ? (() => { try { return localStorage.getItem(autoSaveKey) || null; } catch { return null; } })() : null);
      await restoreCanvasState(
        canvas, fabric, stateToRestore,
        bufferWidth, bufferHeight, canvasWidth, canvasHeight, BLEED_PX,
        isRestoringRef, autoSaveKey, initialFrameName, frameId,
        setFrameName, setBgColor, saveHistory,
      );

      // Helper: get type name + gender for history labels
      const getTypeName = (t: any): { name: string; fem: boolean; icon: string } => {
        if (t.type === "textbox" || t.type === "i-text") return { name: "Texte", fem: false, icon: "T" };
        if (t.type === "image") return { name: "Image", fem: true, icon: "img" };
        if (t._isShootZone) return { name: "Zone photo", fem: true, icon: "shoot" };
        if (t.type === "group") return { name: "Groupe", fem: false, icon: "grp" };
        if (t.type === "rect") return { name: "Rectangle", fem: false, icon: "rect" };
        if (t.type === "circle") return { name: "Cercle", fem: false, icon: "circ" };
        if (t.type === "triangle") return { name: "Triangle", fem: false, icon: "tri" };
        if (t.type === "polygon") return { name: "Polygone", fem: false, icon: "poly" };
        if (t.type === "ellipse") return { name: "Ellipse", fem: true, icon: "elli" };
        if (t.type === "line") return { name: "Ligne", fem: true, icon: "line" };
        if (t.type === "path" && t._isPenPath) return { name: "Tracé plume", fem: false, icon: "path" };
        if (t.type === "path") return { name: "Forme", fem: true, icon: "path" };
        return { name: "Élément", fem: false, icon: "obj" };
      };

      // ── Debounced history save with labels ──
      // Two debounce levels:
      // - Fast (300ms) for discrete actions: add/remove objects
      // - Slow (1.5s) for continuous actions: move, resize, color, typing
      let pendingLabel: string | undefined;
      const { saveHistoryTimerRef } = params;
      const debouncedSaveHistory = (label?: string, fast?: boolean) => {
        // If a DIFFERENT action arrives while a timer is pending, flush the old one first
        if (label && pendingLabel && label !== pendingLabel && saveHistoryTimer) {
          clearTimeout(saveHistoryTimer);
          if (saveHistoryTimerRef?.current) { clearTimeout(saveHistoryTimerRef.current); saveHistoryTimerRef.current = null; }
          saveHistory(pendingLabel);
          pendingLabel = undefined;
          saveHistoryTimer = null;
        }
        if (label) pendingLabel = label;
        if (saveHistoryTimerRef?.current) clearTimeout(saveHistoryTimerRef.current);
        if (saveHistoryTimer) clearTimeout(saveHistoryTimer);
        const timer = setTimeout(() => {
          saveHistory(pendingLabel);
          pendingLabel = undefined;
          saveHistoryTimerRef.current = null;
        }, fast ? 300 : 1500);
        saveHistoryTimer = timer;
        if (saveHistoryTimerRef) saveHistoryTimerRef.current = timer;
      };

      // Detect action labels from canvas events
      canvas.on("object:modified", (e: any) => {
        if (isRestoringRef.current) return; // Don't save history during undo/redo restore
        // Don't save while in group editing mode — individual child edits produce a broken
        // canvas state (children as individual objects). A single save is fired on exit.
        if (editingGroupObjsRef.current.length > 0) return;
        const isContinuous = !!e?._continuous;
        if (e?._historyLabel) {
          let label = e._historyLabel;
          // Auto-prefix with type if the label doesn't follow "Type — action" format
          const t = e?.target;
          if (t && !label.startsWith("Fond") && !label.startsWith("Dégradé") && !label.startsWith("Alignement")) {
            const { name: tName, fem } = getTypeName(t);
            // If label is already "Type modifié..." don't double-prefix
            if (!label.startsWith(tName)) {
              label = `${tName} — ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
            }
          }
          return debouncedSaveHistory(label, !isContinuous);
        }
        const t = e?.target;
        if (!t) return debouncedSaveHistory();
        if (t._isShootLabel || t._isGuideline || t._isPenOverlay || t._isPenPreview ||
            t._isSolidBg || t._isDesignAreaBg) return;

        const action = e?.action || e?.transform?.action || "";
        const { name: typeName, fem } = getTypeName(t);

        let detail = "";
        if (action === "drag") detail = " — déplacement";
        else if (action === "scale" || action === "scaleX" || action === "scaleY") detail = " — redimensionnement";
        else if (action === "rotate") detail = " — rotation";
        else if (action === "resizing") detail = " — redimensionnement";

        debouncedSaveHistory(`${typeName} modifié${fem ? "e" : ""}${detail}`, true);
      });
      canvas.on("object:added", (e: any) => {
        if (isRestoringRef.current) return; // Don't save history during undo/redo restore
        if (editingGroupObjsRef.current.length > 0) return; // skip during group editing
        const t = e?.target;
        if (!t) return;
        if (t._isShootLabel || t._isGuideline || t._isPenOverlay || t._isPenPreview ||
            t._isFeatherPreview || t._isCropRect || t._isCropOverlay || t._isCropPreview ||
            t._isSolidBg || t._isDesignAreaBg || t._isTextGuide) return;
        const { name, fem } = getTypeName(t);
        debouncedSaveHistory(`${name} — ajout${fem ? "ée" : "é"}`, true);
      });
      canvas.on("object:removed", (e: any) => {
        if (isRestoringRef.current) return; // Don't save history during undo/redo restore
        const t = e?.target;
        // During group editing, track child removal and auto-exit if all children deleted
        if (editingGroupObjsRef.current.length > 0) {
          editingGroupObjsRef.current = editingGroupObjsRef.current.filter((o: any) => o !== t);
          if (editingGroupObjsRef.current.length === 0 && typeof params.exitGroupEditingFn === "function") {
            params.exitGroupEditingFn();
          }
          return;
        }
        if (!t) return;
        if (t._isShootLabel || t._isGuideline || t._isPenOverlay || t._isPenPreview ||
            t._isFeatherPreview || t._isCropRect || t._isCropOverlay || t._isCropPreview ||
            t._isSolidBg || t._isDesignAreaBg || t._isTextGuide) return;
        const { name } = getTypeName(t);
        debouncedSaveHistory(`${name} — suppression`, true);
      });

      // ── Responsive sizing with ResizeObserver ──
      function applyScale(scale: number) {
        displayScaleRef.current = scale;
        const cssW = `${Math.round(bufferWidth * scale)}px`;
        const cssH = `${Math.round(bufferHeight * scale)}px`;
        const wrapper = canvasWrapperRef.current;
        if (wrapper) { wrapper.style.width = cssW; wrapper.style.height = cssH; }
        const lower = canvas.lowerCanvasEl;
        const upper = canvas.upperCanvasEl;
        if (lower) { lower.style.width = cssW; lower.style.height = cssH; }
        if (upper) { upper.style.width = cssW; upper.style.height = cssH; }
        const fabricWrapper = canvas.wrapperEl;
        if (fabricWrapper) { fabricWrapper.style.width = cssW; fabricWrapper.style.height = cssH; fabricWrapper.style.overflow = "visible"; fabricWrapper.style.background = "transparent"; }
        canvas.calcOffset();
        setZoomPercent(Math.round(scale * 100));
        // Wait for the browser to finish layout after the CSS changes
        // above. A single rAF fires before layout on some devices —
        // double-rAF guarantees we read post-layout bounding rects.
        // Previously a 20ms setTimeout was used, which was unreliable
        // on slow devices (rulers would drift after resize).
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const cont = containerRef.current;
            const wrap = canvasWrapperRef.current;
            if (cont && wrap) {
              const contRect = cont.getBoundingClientRect();
              const wrapRect = wrap.getBoundingClientRect();
              const bleedCssOffset = BLEED_PX * displayScaleRef.current;
              setRulerOffset({ x: wrapRect.left - contRect.left - RULER_SIZE + bleedCssOffset, y: wrapRect.top - contRect.top - RULER_SIZE + bleedCssOffset });
              setContainerSize({ w: cont.clientWidth, h: cont.clientHeight });
            }
          });
        });
      }
      applyScaleRef.current = applyScale;

      let lastContainerW = 0, lastContainerH = 0;
      let isFirstSize = true;
      function updateCanvasSize() {
        if (!containerRef.current) return;
        const cont = containerRef.current;
        const availW = cont.clientWidth;
        const availH = cont.clientHeight;
        // Guard against 0-width/0-height layout transitions (sidebar
        // opening/closing, orientation change mid-animation). Without
        // this, fitScale = 0 would collapse the canvas CSS to 0×0 and
        // subsequent renders would show a blank editor.
        if (availW < 10 || availH < 10) return;
        lastContainerW = availW;
        lastContainerH = availH;
        const scaleW = availW / (canvasWidth * 1.15);
        const scaleH = availH / (canvasHeight * 1.15);
        const fitScale = Math.min(scaleW, scaleH);
        autoScaleRef.current = fitScale;
        if (isFirstSize) {
          isFirstSize = false;
          applyScale(fitScale);
        } else if (userZoomRef.current !== null) {
          applyScale(userZoomRef.current);
        } else {
          applyScale(fitScale);
        }
      }

      function updateRulerOffset() {
        const cont = containerRef.current;
        const wrap = canvasWrapperRef.current;
        if (!cont || !wrap) return;
        const contRect = cont.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        const bleedCssOffset = BLEED_PX * displayScaleRef.current;
        setRulerOffset({
          x: wrapRect.left - contRect.left - RULER_SIZE + bleedCssOffset,
          y: wrapRect.top - contRect.top - RULER_SIZE + bleedCssOffset,
        });
        setContainerSize({ w: cont.clientWidth, h: cont.clientHeight });
      }

      (canvas as any)._updateCanvasSize = updateCanvasSize;

      if (containerRef.current) {
        unobserveResize = observeResize(containerRef.current, () => {
          if (!mounted || !(canvas as any).lowerCanvasEl) return;
          updateCanvasSize();
          // Double-rAF so the ruler offset is read after layout settles.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!mounted || !(canvas as any).lowerCanvasEl) return;
              updateCanvasSize();
              updateRulerOffset();
              try { canvas.calcOffset(); } catch { /* canvas disposed */ }
            });
          });
        });
        scrollHandler = updateRulerOffset;
        containerRef.current.addEventListener("scroll", scrollHandler);
      }
      updateCanvasSize();

      // Initial ruler offset — use double-rAF for reliable post-layout
      // read. Previously requestIdleCallback with 100-250ms fallback
      // produced a visible canvas-size snap on slow laptops.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateRulerOffset();
        });
      });

      // ── Smart repositioning from previous format ──
      if (previousCanvasState && previousDimensions) {
        await smartRepositionFromPreviousFormat(
          canvas, fabric, previousCanvasState, previousDimensions,
          canvasWidth, canvasHeight, BLEED_PX, gabarit,
        );
      }

      canvas.requestRenderAll();
      setReady(true);

      // ── History wrap-up for format/gabarit transitions ──
      // PanelModeles.applyCatalogueModel and the "Charger les éléments
      // existants" paths set suppressHistoryRef before triggering the
      // remount, swallowing the per-object event storm smartReposition
      // produces above. Now that the new canvas is settled, either:
      //  - push ONE consolidated entry stamped with the new format
      //    (label carried over via pendingFormatTransitionLabel), so
      //    undo from this entry can detect the format mismatch and
      //    bounce back to the previous format via the parent.
      //  - OR (cross-format undo/redo) skip the entry — historyIndexRef
      //    was already moved to the right slot by useEditorActions, no
      //    new entry is wanted.
      // Either way we clear the suppression flag so subsequent edits
      // save normally.
      const transitionLabel = useEditorStore.getState().pendingFormatTransitionLabel;
      // restoreCanvasState above queues an unlabelled saveHistory() at +200ms
      // (the "initial history save" safety net). If we clear suppressHistoryRef
      // before that fires, it'll grab the slot first with no label and the
      // saveHistory we want to fire below would be deduped into a no-op.
      // Wait 320ms (past the 200ms timer) before clearing, then push our
      // labelled consolidated entry. The unlabelled 200ms save is harmless
      // because suppressHistoryRef is still true when it runs.
      // Both branches share the same pending-timer slot in the store so
      // a rapid second transition (e.g. user fires cross-format undos
      // back-to-back) can cancel the previous wrap-up's timer before it
      // fires. Without the shared cancel, the OLD timer would clear
      // suppressHistoryRef while the NEW restore still relies on it,
      // letting smartReposition's event storm trigger a saveHistory that
      // truncates the history past the moved historyIndex — exactly the
      // "the last 2 model-change entries vanished on a 2nd undo+redo
      // cycle" symptom the user reported.
      const tStore0 = useEditorStore.getState();
      if (tStore0.pendingTransitionSaveTimerRef.current) {
        clearTimeout(tStore0.pendingTransitionSaveTimerRef.current);
        tStore0.pendingTransitionSaveTimerRef.current = null;
      }
      if (transitionLabel) {
        useEditorStore.getState().setPendingFormatTransitionLabel(null);
        // Cross-format undo/redo sets isRestoringRef=true on the OLD canvas
        // and never gets a chance to clear it (the canvas is unmounted).
        // Reset the flag here on the NEW canvas so future undo/redo works.
        isRestoringRef.current = false;
        useEditorStore.getState().pendingTransitionSaveTimerRef.current = setTimeout(() => {
          useEditorStore.getState().pendingTransitionSaveTimerRef.current = null;
          useEditorStore.getState().suppressHistoryRef.current = false;
          try { saveHistory(transitionLabel); } catch { /* ignore */ }
        }, 320);
      } else if (useEditorStore.getState().suppressHistoryRef.current) {
        isRestoringRef.current = false;
        useEditorStore.getState().pendingTransitionSaveTimerRef.current = setTimeout(() => {
          useEditorStore.getState().pendingTransitionSaveTimerRef.current = null;
          useEditorStore.getState().suppressHistoryRef.current = false;
        }, 320);
      }

      // Performance instrumentation (Figma-style)
      performance.mark('editor:init:complete');
      performance.measure('editor:total-init', 'editor:init:start', 'editor:init:complete');
      performance.measure('editor:canvas-create', 'editor:init:start', 'editor:canvas:created');
      // Init timing is available via the Performance API (DevTools
      // → Performance → User Timings) without a console leak.
    }

    initFabric();

    return () => {
      mounted = false;
      // Memory leak fix: clear pending debounced history save timer
      if (saveHistoryTimer) clearTimeout(saveHistoryTimer);
      if (unobserveResize) unobserveResize();
      if (containerRef.current && scrollHandler) {
        containerRef.current.removeEventListener("scroll", scrollHandler);
      }
      // Memory leak fix: remove any lingering hover highlight DOM elements
      canvasWrapperRef.current?.querySelector("[data-hover-highlight]")?.remove();
      dimTooltipEl?.remove();
      // Sweep document-level listeners that tools may have registered
      // via canvas._*Handler refs. Without this, changing format while
      // a tool is active (lasso/pen/etc.) leaks keydown handlers on
      // document that reference a disposed canvas.
      const c = fabricRef.current as any;
      if (c) {
        const docListenerKeys = ["_lassoKeyHandler", "_penKeyHandler"] as const;
        for (const key of docListenerKeys) {
          if (c[key]) {
            try { document.removeEventListener("keydown", c[key]); } catch { /* ignore */ }
            delete c[key];
          }
        }
        const docMouseKeys = [
          "_lassoNativeMove", "_lassoNativeUp",
          "_penNativeDragMove", "_penNativeDragEnd",
        ] as const;
        for (const key of docMouseKeys) {
          if (c[key]) {
            const evtType = key.endsWith("Move") ? "mousemove" : "mouseup";
            try { document.removeEventListener(evtType, c[key]); } catch { /* ignore */ }
            delete c[key];
          }
        }
      }
      if (fabricRef.current) {
        // fabric.js v7 dispose() uses __cleanupTask.kill("aborted") which
        // throws an unhandled "aborted" error. Catch it synchronously and
        // suppress the async rejection from the internal cleanup promise.
        try {
          const c = fabricRef.current;
          fabricRef.current = null;
          // Suppress the "aborted" rejection from fabric's internal cleanup task
          if (c.__cleanupTask?.kill) {
            const origKill = c.__cleanupTask.kill;
            c.__cleanupTask.kill = (...args: any[]) => { try { origKill.call(c.__cleanupTask, ...args); } catch { /* suppress */ } };
          }
          c.dispose().catch(() => { /* suppress async "aborted" error from fabric cleanup */ });
        } catch { /* suppress sync errors */ }
      }
      // Remove the global handler after a delay (fabric's rejection is async)
      setTimeout(() => window.removeEventListener("unhandledrejection", suppressAborted), 1000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
