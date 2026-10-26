"use client";

import React from "react";
import { useEditorStore } from "../store/editorStore";
import { makeFreedrawCursor } from "../canvas/canvasUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

function ToolModeToolbarsComponent({
  cancelCrop, applyCrop, exitGroupEditing,
  createFabricPath, createInitialPenState,
  removePoint, cleanupTools, makeEraserCursor,
}: {
  cancelCrop: () => void;
  applyCrop: () => void;
  exitGroupEditing: () => void;
  createFabricPath: (...args: any[]) => any;
  createInitialPenState: () => any;
  removePoint: (...args: any[]) => any;
  cleanupTools: () => void;
  makeEraserCursor: (size: number) => string;
}) {
  const cropping = useEditorStore(s => s.cropping);
  const editingGroup = useEditorStore(s => s.editingGroup);
  const penMode = useEditorStore(s => s.penMode);
  const penEditMode = useEditorStore(s => s.penEditMode);
  const penPointCount = useEditorStore(s => s.penPointCount);
  const setPenMode = useEditorStore(s => s.setPenMode);
  const setPenPointCount = useEditorStore(s => s.setPenPointCount);
  const penStateRef = useEditorStore(s => s.penStateRef);
  const penPreviewRef = useEditorStore(s => s.penPreviewRef);
  const penOverlayRef = useEditorStore(s => s.penOverlayRef);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const eraserActive = useEditorStore(s => s.eraserActive);
  const eraserBrushSize = useEditorStore(s => s.eraserBrushSize);
  const setEraserBrushSize = useEditorStore(s => s.setEraserBrushSize);
  const eraserBrushSizeRef = useEditorStore(s => s.eraserBrushSizeRef);
  const eraserOpacity = useEditorStore(s => s.eraserOpacity);
  const setEraserOpacity = useEditorStore(s => s.setEraserOpacity);
  const eraserOpacityRef = useEditorStore(s => s.eraserOpacityRef);
  const setEraserActive = useEditorStore(s => s.setEraserActive);
  const eraserTargetRef = useEditorStore(s => s.eraserTargetRef);
  const selectedObj = useEditorStore(s => s.selectedObj);
  const freedrawActive = useEditorStore(s => s.freedrawActive);
  const freedrawColor = useEditorStore(s => s.freedrawColor);
  const freedrawWidth = useEditorStore(s => s.freedrawWidth);
  const setFreedrawColor = useEditorStore(s => s.setFreedrawColor);
  const setFreedrawWidth = useEditorStore(s => s.setFreedrawWidth);
  const setFreedrawActive = useEditorStore(s => s.setFreedrawActive);
  const freedrawBrushType = useEditorStore(s => s.freedrawBrushType);
  const setFreedrawBrushType = useEditorStore(s => s.setFreedrawBrushType);
  const freedrawPathsRef = useEditorStore(s => s.freedrawPathsRef);
  const lassoActive = useEditorStore(s => s.lassoActive);
  const lassoSearchRadius = useEditorStore(s => s.lassoSearchRadius);
  const setLassoSearchRadius = useEditorStore(s => s.setLassoSearchRadius);
  const lassoPreviewRef = useEditorStore(s => s.lassoPreviewRef);
  const lassoPointsRef = useEditorStore(s => s.lassoPointsRef);
  const lassoAnchorsRef = useEditorStore(s => s.lassoAnchorsRef);
  const lassoEdgeMapRef = useEditorStore(s => s.lassoEdgeMapRef);
  const lassoTargetRef = useEditorStore(s => s.lassoTargetRef);
  const setLassoActive = useEditorStore(s => s.setLassoActive);
  const isRestoringRef = useEditorStore(s => s.isRestoringRef);
  const selectAreaActive = useEditorStore(s => s.selectAreaActive);
  const selectAreaMode = useEditorStore(s => s.selectAreaMode);

  return (
    <>
      {/* ═══ CROP TOOLBAR ═══ */}
      {cropping && (
        <div className="flex items-center gap-3 px-4 h-[44px] bg-white border-b border-gray-200 flex-shrink-0">
          <span className="text-sm text-gray-500">Ajustez la zone de rognage</span>
          <div className="flex-1" />
          <button
            onClick={cancelCrop}
            className="px-4 py-1.5 rounded-lg text-gray-600 text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={applyCrop}
            className="px-4 py-1.5 rounded-lg bg-[#4f46e5] text-white text-sm font-semibold hover:bg-[#4338ca] transition-colors"
          >
            Appliquer le rognage
          </button>
        </div>
      )}

      {/* ═══ GROUP EDITING TOOLBAR ═══ */}
      {editingGroup && (
        <div className="flex items-center gap-3 px-4 h-[44px] bg-blue-50 border-b border-blue-200 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm text-blue-700 font-medium">Mode édition de groupe — Modifiez les éléments individuellement</span>
          <div className="flex-1" />
          <button
            onClick={exitGroupEditing}
            className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Terminer
          </button>
        </div>
      )}

      {/* ═══ PEN MODE TOOLBAR (Creation) ═══ */}
      {penMode && !penEditMode && (
        <div className="flex items-center gap-3 px-4 h-[44px] bg-purple-50 border-b border-purple-200 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-[#4f46e5] animate-pulse" />
          <span className="text-sm text-[#4f46e5] font-medium">Plume — Cliquez-glissez pour courber · ⌫ = annuler point · Alt/⌥ = casser l&apos;angle</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-400 tabular-nums">{penPointCount} point{penPointCount > 1 ? "s" : ""}</span>
          <button
            onClick={() => {
              // Finish open path — save points BEFORE resetting state
              const cvs = fabricRef.current;
              const savedPoints = [...penStateRef.current.points];
              if (cvs) {
                cvs.off("mouse:down");
                cvs.off("mouse:move");
                cvs.off("mouse:up");
                cvs.off("mouse:dblclick");
                if ((cvs as any)._penKeyHandler) { document.removeEventListener("keydown", (cvs as any)._penKeyHandler); delete (cvs as any)._penKeyHandler; }
                if ((cvs as any)._penMouseMove) delete (cvs as any)._penMouseMove;
                if (penPreviewRef.current) { cvs.remove(penPreviewRef.current); penPreviewRef.current = null; }
                penOverlayRef.current.forEach((o: any) => cvs.remove(o));
                penOverlayRef.current = [];
                if (savedPoints.length >= 2) {
                  import("fabric").then((fabric) => {
                    const path = createFabricPath(fabric, savedPoints, false);
                    if (path) { cvs.add(path); cvs.setActiveObject(path); }
                    cvs.requestRenderAll();
                  });
                }
                cvs.defaultCursor = "default";
                cvs.hoverCursor = "move";
                cvs.selection = true;
                cvs.skipTargetFind = false;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                cvs.getObjects().forEach((o: any) => {
                  if (o._penSavedEvented !== undefined) { o.evented = o._penSavedEvented; delete o._penSavedEvented; }
                  if (o._penSavedSelectable !== undefined) { o.selectable = o._penSavedSelectable; delete o._penSavedSelectable; }
                });
              }
              penStateRef.current = createInitialPenState();
              setPenMode(false);
              setPenPointCount(0);
            }}
            className="px-3 py-1.5 rounded-lg bg-[#4f46e5] text-white text-sm font-semibold hover:bg-[#4338ca] transition-colors"
          >
            Terminer (ouvert)
          </button>
          <button
            onClick={() => {
              const canvas = fabricRef.current;
              if (canvas) {
                // Delegate to the pen tool's own cleanup which removes
                // its specific handlers and restores object state.
                // Previously the toolbar wiped ALL mouse event listeners
                // which also killed Fabric's internal selection handlers.
                if (typeof (canvas as any)._penCancel === "function") {
                  (canvas as any)._penCancel();
                } else {
                  // Fallback: minimal cleanup for pen preview state
                  if (penPreviewRef.current) { canvas.remove(penPreviewRef.current); penPreviewRef.current = null; }
                  penOverlayRef.current.forEach((o: any) => canvas.remove(o));
                  penOverlayRef.current = [];
                  canvas.defaultCursor = "default";
                  canvas.hoverCursor = "move";
                  canvas.selection = true;
                  canvas.skipTargetFind = false;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  canvas.getObjects().forEach((o: any) => {
                    if (o._penSavedEvented !== undefined) { o.evented = o._penSavedEvented; delete o._penSavedEvented; }
                    if (o._penSavedSelectable !== undefined) { o.selectable = o._penSavedSelectable; delete o._penSavedSelectable; }
                  });
                  canvas.requestRenderAll();
                }
              }
              penStateRef.current = createInitialPenState();
              setPenMode(false);
              setPenPointCount(0);
            }}
            className="px-4 py-1.5 rounded-lg text-gray-600 text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Annuler
          </button>
        </div>
      )}

      {/* ═══ PEN EDIT MODE TOOLBAR ═══ */}
      {penEditMode && (
        <div className="flex items-center gap-3 px-4 h-[44px] bg-purple-50 border-b border-purple-200 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-[#4f46e5] animate-pulse" />
          <span className="text-sm text-[#4f46e5] font-medium">Édition de tracé — Déplacez les points et poignées. Alt/⌥ = poignée indépendante.</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-400 tabular-nums">{penPointCount} point{penPointCount > 1 ? "s" : ""}</span>
          {penStateRef.current.selectedPointIndex >= 0 && (
            <>
              <button
                onClick={() => (penStateRef.current as any)._togglePoint?.()}
                className="px-3 py-1.5 rounded-lg bg-white border border-purple-200 text-[#4f46e5] text-xs font-medium hover:bg-purple-50 transition-colors"
              >
                Courbe ↔ Angle
              </button>
              <button
                onClick={() => {
                  const st = penStateRef.current;
                  if (st.selectedPointIndex >= 0 && st.points.length > 2) {
                    st.points = removePoint(st.points, st.selectedPointIndex);
                    st.selectedPointIndex = Math.min(st.selectedPointIndex, st.points.length - 1);
                    setPenPointCount(st.points.length);
                    // Re-trigger overlay redraw via finishEdit-like approach
                    // We re-enter edit mode by re-calling enterPenEditMode
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50 transition-colors"
              >
                Suppr. point
              </button>
            </>
          )}
          <button
            onClick={() => (penStateRef.current as any)._finishEdit?.()}
            className="px-4 py-1.5 rounded-lg bg-[#4f46e5] text-white text-sm font-semibold hover:bg-[#4338ca] transition-colors"
          >
            Terminer
          </button>
          <button
            onClick={() => cleanupTools()}
            className="px-4 py-1.5 rounded-lg text-gray-600 text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Annuler
          </button>
        </div>
      )}

      {/* ═══ ERASER MODE TOOLBAR ═══ */}
      {eraserActive && (
        <div className="flex items-center gap-4 px-4 h-[44px] bg-red-50 border-b border-red-200 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span className="text-sm text-red-600 font-medium">Gomme — Dessinez sur l&apos;image pour effacer</span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-medium">Taille</span>
            <input type="range" min={5} max={80} value={eraserBrushSize} onChange={(e) => {
              const size = parseInt(e.target.value);
              setEraserBrushSize(size);
              eraserBrushSizeRef.current = size;
              const canvas = fabricRef.current;
              if (canvas?.freeDrawingBrush) {
                canvas.freeDrawingBrush.width = size;
                canvas.freeDrawingCursor = makeEraserCursor(size);
              }
            }} className="w-20 accent-red-400 cursor-pointer" />
            <span className="text-[10px] text-gray-500 w-6 tabular-nums">{eraserBrushSize}px</span>
          </div>
          <div className="w-px h-6 bg-red-200" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-medium">Opacité</span>
            <input type="range" min={10} max={100} value={eraserOpacity} onChange={(e) => { const v = parseInt(e.target.value); setEraserOpacity(v); eraserOpacityRef.current = v; }} className="w-16 accent-red-400 cursor-pointer" />
            <span className="text-[10px] text-gray-400 w-7 tabular-nums">{eraserOpacity}%</span>
          </div>
          <div className="w-px h-6 bg-red-200" />
          <button
            onClick={() => {
              const canvas = fabricRef.current;
              if (canvas) {
                canvas.isDrawingMode = false;
                // Remove only the specific eraser handler (registered by
                // EraserToolActivation) instead of wiping all path:created
                // listeners.
                if ((canvas as any)._eraserPathHandler) {
                  canvas.off("path:created", (canvas as any)._eraserPathHandler);
                  delete (canvas as any)._eraserPathHandler;
                }
                canvas.defaultCursor = "default";
                canvas.hoverCursor = "move";
                setEraserActive(false);
                eraserTargetRef.current = null;
                if (selectedObj) canvas.setActiveObject(selectedObj);
                canvas.requestRenderAll();
              }
            }}
            className="px-4 py-1.5 rounded-lg text-gray-600 text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Terminer
          </button>
        </div>
      )}

      {/* ═══ FREEDRAW MODE TOOLBAR ═══ */}
      {freedrawActive && (
        <div className="flex items-center gap-3 px-4 h-[44px] bg-indigo-50 border-b border-indigo-200 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse flex-shrink-0" />
          <span className="text-sm text-indigo-700 font-medium flex-shrink-0">Main levée</span>
          <div className="w-px h-6 bg-indigo-200 flex-shrink-0" />
          {/* Brush type selector */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {([
              { id: "pencil", label: "Crayon", icon: "✏️" },
              { id: "marker", label: "Marqueur", icon: "🖍️" },
              { id: "spray", label: "Spray", icon: "💨" },
              { id: "circle", label: "Cercles", icon: "◉" },
              { id: "calligraphy", label: "Calligraphie", icon: "🖊️" },
            ] as const).map((b) => (
              <button
                key={b.id}
                onClick={async () => {
                  setFreedrawBrushType(b.id);
                  const canvas = fabricRef.current;
                  if (!canvas) return;
                  const fabric = await import("fabric");
                  let brush: any;
                  const isMarker = b.id === "marker";
                  const isSpray = b.id === "spray";
                  switch (b.id) {
                    case "circle":
                      brush = new fabric.CircleBrush(canvas);
                      brush.color = freedrawColor;
                      brush.width = freedrawWidth;
                      break;
                    case "spray":
                      brush = new fabric.SprayBrush(canvas);
                      brush.color = freedrawColor;
                      brush.width = freedrawWidth * 3;
                      brush.density = 15;
                      break;
                    case "marker": {
                      brush = new fabric.PencilBrush(canvas);
                      const hex = freedrawColor;
                      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), bl = parseInt(hex.slice(5, 7), 16);
                      brush.color = `rgba(${r},${g},${bl},0.4)`;
                      brush.width = freedrawWidth * 3;
                      brush.strokeLineCap = "round";
                      brush.strokeLineJoin = "round";
                      break;
                    }
                    case "calligraphy":
                      brush = new fabric.PencilBrush(canvas);
                      brush.color = freedrawColor;
                      brush.width = freedrawWidth;
                      brush.strokeLineCap = "butt";
                      brush.strokeLineJoin = "bevel";
                      break;
                    default:
                      brush = new fabric.PencilBrush(canvas);
                      brush.color = freedrawColor;
                      brush.width = freedrawWidth;
                      break;
                  }
                  canvas.freeDrawingBrush = brush;
                  const effectiveWidth = freedrawWidth * (isMarker || isSpray ? 3 : 1);
                  const cursor = makeFreedrawCursor(effectiveWidth, freedrawColor);
                  canvas.freeDrawingCursor = cursor;
                  canvas.defaultCursor = cursor;
                }}
                className={`h-7 px-2 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                  freedrawBrushType === b.id
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "bg-white text-gray-600 hover:bg-indigo-100 border border-gray-200"
                }`}
                title={b.label}
              >
                <span className="text-sm leading-none">{b.icon}</span>
                <span className="hidden xl:inline">{b.label}</span>
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-indigo-200 flex-shrink-0" />
          {/* Color */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <label className="relative w-6 h-6 rounded-full border border-gray-300 overflow-hidden cursor-pointer" style={{ backgroundColor: freedrawColor }}>
              <input type="color" value={freedrawColor} onChange={(e) => {
                setFreedrawColor(e.target.value);
                const canvas = fabricRef.current;
                if (!canvas?.freeDrawingBrush) return;
                const isMarker = freedrawBrushType === "marker";
                if (isMarker) {
                  const hex = e.target.value;
                  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
                  canvas.freeDrawingBrush.color = `rgba(${r},${g},${b},0.4)`;
                } else {
                  canvas.freeDrawingBrush.color = e.target.value;
                }
                const effectiveWidth = freedrawWidth * (isMarker || freedrawBrushType === "spray" ? 3 : 1);
                const cursor = makeFreedrawCursor(effectiveWidth, e.target.value);
                canvas.freeDrawingCursor = cursor;
                canvas.defaultCursor = cursor;
              }} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
            {/* Quick colors */}
            {["#1a1a2e", "#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ffffff"].map((c) => (
              <button key={c} onClick={() => {
                setFreedrawColor(c);
                const canvas = fabricRef.current;
                if (!canvas?.freeDrawingBrush) return;
                if (freedrawBrushType === "marker") {
                  const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
                  canvas.freeDrawingBrush.color = `rgba(${r},${g},${b},0.4)`;
                } else {
                  canvas.freeDrawingBrush.color = c;
                }
                const effectiveWidth = freedrawWidth * (freedrawBrushType === "marker" || freedrawBrushType === "spray" ? 3 : 1);
                const cursor = makeFreedrawCursor(effectiveWidth, c);
                canvas.freeDrawingCursor = cursor;
                canvas.defaultCursor = cursor;
              }} className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${freedrawColor === c ? "border-indigo-500 scale-110" : "border-gray-200"}`} style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="w-px h-6 bg-indigo-200 flex-shrink-0" />
          {/* Size */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <input type="range" min={1} max={50} value={freedrawWidth} onChange={(e) => {
              const w = parseInt(e.target.value);
              setFreedrawWidth(w);
              const canvas = fabricRef.current;
              if (!canvas?.freeDrawingBrush) return;
              const isWide = freedrawBrushType === "marker" || freedrawBrushType === "spray";
              canvas.freeDrawingBrush.width = w * (isWide ? 3 : 1);
              const cursor = makeFreedrawCursor(w * (isWide ? 3 : 1), freedrawColor);
              canvas.freeDrawingCursor = cursor;
              canvas.defaultCursor = cursor;
            }} className="w-20 accent-indigo-500 cursor-pointer" />
            <span className="text-[10px] text-gray-500 w-5 tabular-nums">{freedrawWidth}</span>
          </div>
          <div className="flex-1" />
          <button
            onClick={async () => {
              const canvas = fabricRef.current;
              if (canvas) {
                canvas.isDrawingMode = false;
                canvas.off("path:created", (canvas as any)._freedrawPathHandler);
                delete (canvas as any)._freedrawPathHandler;
                canvas.selection = true;
                canvas.defaultCursor = "default";
                canvas.hoverCursor = "move";
                // Group all freedraw paths into a single object
                const paths = freedrawPathsRef.current;
                if (paths.length > 1) {
                  const fabric = await import("fabric");
                  // Remove individual paths from canvas
                  paths.forEach((p: any) => canvas.remove(p));
                  // Create a group
                  const group = new fabric.Group(paths, {
                    originX: "center",
                    originY: "center",
                  });
                  canvas.add(group);
                  canvas.setActiveObject(group);
                  canvas.fire("object:modified", { target: group, _historyLabel: "Dessin main levée" });
                } else if (paths.length === 1) {
                  canvas.setActiveObject(paths[0]);
                  canvas.fire("object:modified", { target: paths[0], _historyLabel: "Dessin main levée" });
                }
                freedrawPathsRef.current = [];
                canvas.requestRenderAll();
              }
              setFreedrawActive(false);
            }}
            className="px-4 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-medium hover:bg-indigo-600 transition-colors flex-shrink-0"
          >
            Terminer
          </button>
        </div>
      )}

      {/* ═══ LASSO MODE TOOLBAR ═══ */}
      {lassoActive && (
        <div className="flex items-center gap-3 px-4 h-[44px] bg-green-50 border-b border-green-200 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-sm text-green-700 font-medium">Lasso — Cliquez pour poser des ancres · Maintenez = tracé libre · ⌫ = annuler point</span>
          <div className="flex-1" />
          <span className="text-xs text-gray-400 mr-2">Rayon</span>
          <input
            type="range" min={4} max={25} value={lassoSearchRadius}
            onChange={(e) => setLassoSearchRadius(parseInt(e.target.value))}
           
            className="w-16 accent-[#22c55e] cursor-pointer"
           
          />
          <span className="text-xs text-gray-500 w-4 tabular-nums">{lassoSearchRadius}</span>
          <button
            onClick={() => {
              const canvas = fabricRef.current;
              if (canvas) {
                // Remove native click handler
                const uc = canvas.upperCanvasEl as HTMLCanvasElement;
                if ((canvas as any)._lassoNativeClick) { uc.removeEventListener("mousedown", (canvas as any)._lassoNativeClick); delete (canvas as any)._lassoNativeClick; }
                if ((canvas as any)._lassoCanvasMove) { canvas.off("mouse:move", (canvas as any)._lassoCanvasMove); delete (canvas as any)._lassoCanvasMove; }
                // No fallback wild-off: if the ref isn't set, there's no
                // lasso mouse:move handler to remove. The previous code
                // wiped ALL mouse:move listeners (including Fabric's own
                // internal ones and snapping/hover handlers).
                if ((canvas as any)._lassoKeyHandler) {
                  document.removeEventListener("keydown", (canvas as any)._lassoKeyHandler);
                }
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
                if (lassoTargetRef.current) canvas.setActiveObject(lassoTargetRef.current);
                lassoTargetRef.current = null;
                setLassoActive(false);
                isRestoringRef.current = false;
                canvas.selection = true;
                canvas.defaultCursor = "default";
                canvas.hoverCursor = "move";
                canvas.requestRenderAll();
              }
            }}
            className="px-4 py-1.5 rounded-lg text-gray-600 text-sm font-medium hover:bg-gray-100 transition-colors"
          >
            Annuler
          </button>
        </div>
      )}

      {/* ═══ SELECT AREA MODE TOOLBAR ═══ */}
      {selectAreaActive && (
        <div className="flex items-center gap-3 px-4 h-[44px] bg-purple-50 border-b border-purple-200 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-[#4f46e5] animate-pulse" />
          <span className="text-sm text-purple-700 font-medium">
            {selectAreaMode === "rect" ? "Sélection rectangulaire" : "Sélection libre"} — Cliquez-glissez sur l&apos;image pour sélectionner
          </span>
          <div className="flex-1" />
          <button
            onClick={() => {
              const canvas = fabricRef.current;
              if (canvas && (canvas as any)._selAreaCleanup) {
                (canvas as any)._selAreaCleanup();
                canvas.requestRenderAll();
              }
            }}
            className="px-3 py-1.5 text-xs font-medium text-purple-600 bg-white border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
          >
            Annuler
          </button>
        </div>
      )}
    </>
  );
}
export { ToolModeToolbarsComponent as ToolModeToolbars };
