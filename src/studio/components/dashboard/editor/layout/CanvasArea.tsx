"use client";

import React, { useState, useEffect } from "react";
import { Ruler } from "./Ruler";
import { CtxBtn } from "..";
import { PostSelectionPopup } from "../dialogs/PostSelectionPopup";
import { useEditorStore } from "../store/editorStore";
import { RULER_SIZE as RULER_SIZE_CONST, EXPORT_TARGET_LONG_EDGE } from "../types";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CanvasAreaProps {
  removingBg: boolean;
  duplicateSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  toggleLock: () => void;
  deleteSelected: () => void;
  /** Current type — drives whether the ruler reads EXPORT_TARGET_LONG_EDGE
   *  (cadres: mm → 1844px long edge) or the format's native pixel dimensions. */
  typeSlug?: string;
  formatWidth?: number;
  formatHeight?: number;
}

function CanvasAreaComponent(props: CanvasAreaProps) {
  const {
    removingBg,
    duplicateSelected, bringForward, sendBackward, bringToFront, sendToBack, toggleLock, deleteSelected,
    typeSlug, formatWidth, formatHeight,
  } = props;

  const containerRef = useEditorStore(s => s.containerRef);
  const canvasWrapperRef = useEditorStore(s => s.canvasWrapperRef);
  const canvasElRef = useEditorStore(s => s.canvasElRef);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const floatingRef = useEditorStore(s => s.floatingRef);
  const displayScaleRef = useEditorStore(s => s.displayScaleRef);
  const canvasWidth = useEditorStore(s => s.canvasWidth);
  const canvasHeight = useEditorStore(s => s.canvasHeight);
  const bufferWidth = useEditorStore(s => s.bufferWidth);
  const bufferHeight = useEditorStore(s => s.bufferHeight);
  const BLEED_PX = useEditorStore(s => s.BLEED_PX);
  const PRINT_MARGIN = useEditorStore(s => s.PRINT_MARGIN);
  const ready = useEditorStore(s => s.ready);
  const selectedObj = useEditorStore(s => s.selectedObj);
  const floatingPos = useEditorStore(s => s.floatingPos);
  const cropping = useEditorStore(s => s.cropping);
  const penMode = useEditorStore(s => s.penMode);
  const penEditMode = useEditorStore(s => s.penEditMode);
  const eraserActive = useEditorStore(s => s.eraserActive);
  const lassoActive = useEditorStore(s => s.lassoActive);
  const freedrawActive = useEditorStore(s => s.freedrawActive);
  const wandActive = useEditorStore(s => s.wandActive);
  const selectAreaActive = useEditorStore(s => s.selectAreaActive);
  const cursorType = useEditorStore(s => s.cursorType);
  const cursorPos = useEditorStore(s => s.cursorPos);
  const showRulers = useEditorStore(s => s.showRulers);
  const setShowRulers = useEditorStore(s => s.setShowRulers);
  const showPrintMargins = useEditorStore(s => s.showPrintMargins);
  const showPrintMarginsAuto = useEditorStore(s => s.showPrintMarginsAuto);
  const rulerOffset = useEditorStore(s => s.rulerOffset);
  const containerSize = useEditorStore(s => s.containerSize);
  const customGuides = useEditorStore(s => s.customGuides);
  const setCustomGuides = useEditorStore(s => s.setCustomGuides);
  const activeTab = useEditorStore(s => s.activeTab);
  const setActiveTab = useEditorStore(s => s.setActiveTab);
  const setSelectedObj = useEditorStore(s => s.setSelectedObj);
  const clipDialogPos = useEditorStore(s => s.clipDialogPos);
  const setClipDialogPos = useEditorStore(s => s.setClipDialogPos);
  const clipFeatherValue = useEditorStore(s => s.clipFeatherValue);
  const setClipFeatherValue = useEditorStore(s => s.setClipFeatherValue);
  const clipFeatherRef = useEditorStore(s => s.clipFeatherRef);
  const clipDialogDragRef = useEditorStore(s => s.clipDialogDragRef);
  const forceRender = useEditorStore(s => s.forceRender);
  const RULER_SIZE = RULER_SIZE_CONST;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Listen for right-click events from Fabric canvas
  useEffect(() => {
    if (!ready) return;
    const canvas = fabricRef.current;
    if (!canvas?.upperCanvasEl) return;
    const el = canvas.upperCanvasEl;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setContextMenu({ x: detail.x, y: detail.y });
    };
    el.addEventListener("fabric:contextmenu", handler);
    return () => el.removeEventListener("fabric:contextmenu", handler);
  }, [ready]);

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 flex items-center justify-center overflow-hidden`}
      style={{ background: "#f0f0f0" }}
      onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
      onMouseDown={(e: React.MouseEvent) => { if (e.button === 2) setContextMenu(null); }}
      onClick={(e: any) => {
        setContextMenu(null);
        // Close sidebar panel and deselect canvas objects when clicking on the grey background
        if (e.target === e.currentTarget) {
          setActiveTab(null);
          const canvas = fabricRef.current;
          if (canvas) { canvas.discardActiveObject(); canvas.requestRenderAll(); }
        }
      }}
    >
      {/* ── Quick-select background image chip ── */}
      {!selectedObj && !cropping && !penMode && !eraserActive && !lassoActive && !wandActive && !selectAreaActive && (() => {
        const c = fabricRef.current;
        const bgImg = c?.getObjects().find((o: any) => o._isBgImage);
        if (!bgImg) return null;
        return (
          <button
            onClick={() => {
              if (c && bgImg) { c.setActiveObject(bgImg); c.requestRenderAll(); }
            }}
            className="absolute z-40 bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow-md border border-gray-200 text-xs font-medium text-gray-600 hover:bg-white hover:text-gray-900 hover:shadow-lg transition-all pointer-events-auto"
            title="Sélectionner l'image de fond"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 15l4-4 3 3 4-4 5 5" />
            </svg>
            Fond
          </button>
        );
      })()}

      {/* ── Floating toolbar (Canva-style, above selection) ── */}
      {selectedObj && floatingPos && !cropping && !penMode && !penEditMode && !eraserActive && !lassoActive && !freedrawActive && (
        <div
          ref={floatingRef}
          className="absolute z-50 flex items-center gap-0.5 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-1.5 pointer-events-auto"
          style={{
            left: Math.max(120, Math.min(floatingPos.x, (containerRef.current?.clientWidth || 800) - 120)),
            top: floatingPos.y,
            transform: floatingPos.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
          }}
        >
          <CtxBtn title="Dupliquer (⌘D)" onClick={duplicateSelected}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </CtxBtn>
          {!selectedObj?.lockMovementX && (<>
          <CtxBtn title="Avancer d&apos;un niveau (⌘↑)" onClick={bringForward}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </CtxBtn>
          <CtxBtn title="Reculer d&apos;un niveau (⌘↓)" onClick={sendBackward}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </CtxBtn>
          <CtxBtn title="Mettre au premier plan (⌘⇧↑)" onClick={bringToFront}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" />
          </CtxBtn>
          <CtxBtn title="Mettre à l&apos;arrière-plan (⌘⇧↓)" onClick={sendToBack}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7M19 5l-7 7-7-7" />
          </CtxBtn>
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <button
            onClick={toggleLock}
            title="Verrouiller"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-500 hover:text-amber-700 hover:bg-amber-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
          </button>
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          </>)}
          {selectedObj?.lockMovementX && (<>
          <button
            onClick={toggleLock}
            title="Déverrouiller"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </button>
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          </>)}
          {/* Arrière-plan — only for images */}
          {selectedObj?.type === "image" && !selectedObj._isBgImage && (
            <button
              onClick={() => {
                const canvas = fabricRef.current;
                if (!canvas || !selectedObj) return;
                const isRestoringRef = useEditorStore.getState().isRestoringRef;
                isRestoringRef.current = true;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                canvas.getObjects().filter((o: any) => o !== selectedObj && (o._isSolidBg || o._isBgImage)).forEach((o: any) => canvas.remove(o));
                const sx = canvasWidth / (selectedObj.width || 1), sy = canvasHeight / (selectedObj.height || 1);
                selectedObj.set({ scaleX: Math.max(sx, sy), scaleY: Math.max(sx, sy), left: BLEED_PX + canvasWidth / 2, top: BLEED_PX + canvasHeight / 2, originX: "center", originY: "center", clipPath: undefined });
                selectedObj._isBgImage = true;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const dBg = canvas.getObjects().find((o: any) => o._isDesignAreaBg);
                if (dBg) dBg.set("fill", "transparent");
                canvas.sendObjectToBack(selectedObj);
                if (dBg) canvas.sendObjectToBack(dBg);
                canvas.discardActiveObject();
                canvas.requestRenderAll();
                isRestoringRef.current = false;
                canvas.fire("object:modified", { target: selectedObj, _historyLabel: "Image mise en fond" });
                useEditorStore.getState().setBgColor("");
              }}
              title="Utiliser cette image comme fond du cadre"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-gray-500 hover:text-[#4f46e5] hover:bg-purple-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 15l4-4 3 3 4-4 5 5" /></svg>
              Définir comme fond
            </button>
          )}
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <CtxBtn title="Supprimer (⌫)" onClick={deleteSelected} danger>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </CtxBtn>
        </div>
      )}

      {/* ═══ Right-click context menu ═══ */}
      {contextMenu && selectedObj && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div className="fixed z-[9999] bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 w-[180px] animate-[fadeScale_0.1s_ease-out]" style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={() => setContextMenu(null)}>
            <style>{`@keyframes fadeScale { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
            <button onClick={duplicateSelected} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              Dupliquer
            </button>
            <button onClick={bringForward} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
              Avancer d&apos;un niveau
            </button>
            <button onClick={sendBackward} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              Reculer d&apos;un niveau
            </button>
            <button onClick={bringToFront} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" /></svg>
              Mettre au premier plan
            </button>
            <button onClick={sendToBack} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7M19 5l-7 7-7-7" /></svg>
              Mettre à l&apos;arrière-plan
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button onClick={toggleLock} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
              {selectedObj.lockMovementX ? "Déverrouiller" : "Verrouiller"}
            </button>
            {selectedObj.type === "image" && !selectedObj._isBgImage && (
              <button onClick={() => {
                const canvas = fabricRef.current;
                if (!canvas) return;
                const ir = useEditorStore.getState().isRestoringRef;
                ir.current = true;
                canvas.getObjects().filter((o: any) => o !== selectedObj && (o._isSolidBg || o._isBgImage)).forEach((o: any) => canvas.remove(o));
                const sx = canvasWidth / (selectedObj.width || 1), sy = canvasHeight / (selectedObj.height || 1);
                selectedObj.set({ scaleX: Math.max(sx, sy), scaleY: Math.max(sx, sy), left: BLEED_PX + canvasWidth / 2, top: BLEED_PX + canvasHeight / 2, originX: "center", originY: "center", clipPath: undefined });
                selectedObj._isBgImage = true;
                const dBg = canvas.getObjects().find((o: any) => o._isDesignAreaBg);
                if (dBg) dBg.set("fill", "transparent");
                canvas.sendObjectToBack(selectedObj); if (dBg) canvas.sendObjectToBack(dBg);
                canvas.discardActiveObject(); canvas.requestRenderAll();
                ir.current = false;
                canvas.fire("object:modified", { target: selectedObj, _historyLabel: "Image mise en fond" });
                useEditorStore.getState().setBgColor("");
              }} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 15l4-4 3 3 4-4 5 5" /></svg>
                Définir comme fond
              </button>
            )}
            <div className="border-t border-gray-100 my-1" />
            <button onClick={deleteSelected} className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Supprimer
            </button>
          </div>
        </>
      )}

      {/* ═══ POST-SELECTION: ask the user what they want to do ═══ */}
      <PostSelectionPopup
        selectedObj={selectedObj} setSelectedObj={setSelectedObj} cropping={cropping}
        clipDialogPos={clipDialogPos} setClipDialogPos={setClipDialogPos}
        clipFeatherValue={clipFeatherValue} setClipFeatherValue={setClipFeatherValue}
        clipFeatherRef={clipFeatherRef} clipDialogDragRef={clipDialogDragRef}
        containerRef={containerRef} fabricRef={fabricRef} forceRender={forceRender}
      />

      {!ready && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#4f46e5] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Chargement de l&apos;éditeur...</p>
        </div>
      )}
      {/* Rulers — fixed to container edges, graduation 0 aligned to canvas */}
      {showRulers && ready && (
        <>
          {/* Top ruler */}
          <div className="absolute top-0 z-10 pointer-events-auto" style={{ left: RULER_SIZE, right: 0, height: RULER_SIZE }}>
            <Ruler
              axis="x" canvasLength={canvasWidth} scale={displayScaleRef.current}
              offset={rulerOffset.x} guideOffset={rulerOffset.y} totalSize={containerSize.w - RULER_SIZE}
              valueScale={
                (typeSlug || "cadres") === "cadres"
                  ? EXPORT_TARGET_LONG_EDGE / Math.max(canvasWidth, canvasHeight)
                  : formatWidth ? formatWidth / canvasWidth : 1
              }
              // Vertical guides (axis "x" in store) intersect the top ruler at
              // their X position — show their px value here in red.
              guidePositions={customGuides.filter((g: any) => g.axis === "x").map((g: any) => g.pos)}
              onAddGuide={(pos: number, setIndex: any) => setCustomGuides((g: any) => { const next = [...g, { axis: "y" as const, pos }]; setIndex?.(next.length - 1); return next; })}
              onUpdateGuide={(idx: number, pos: number) => setCustomGuides((g: any) => g.map((gg: any, j: number) => j === idx ? { ...gg, pos } : gg))}
              onRemoveGuide={(idx: number) => setCustomGuides((g: any) => g.filter((_: any, j: number) => j !== idx))}
            />
          </div>
          {/* Left ruler */}
          <div className="absolute left-0 z-10 pointer-events-auto" style={{ top: RULER_SIZE, bottom: 0, width: RULER_SIZE }}>
            <Ruler
              axis="y" canvasLength={canvasHeight} scale={displayScaleRef.current}
              offset={rulerOffset.y} guideOffset={rulerOffset.x} totalSize={containerSize.h - RULER_SIZE}
              valueScale={
                (typeSlug || "cadres") === "cadres"
                  ? EXPORT_TARGET_LONG_EDGE / Math.max(canvasWidth, canvasHeight)
                  : formatWidth ? formatWidth / canvasWidth : 1
              }
              // Horizontal guides (axis "y" in store) intersect the left
              // ruler at their Y position — show their px value here in red.
              guidePositions={customGuides.filter((g: any) => g.axis === "y").map((g: any) => g.pos)}
              onAddGuide={(pos: number, setIndex: any) => setCustomGuides((g: any) => { const next = [...g, { axis: "x" as const, pos }]; setIndex?.(next.length - 1); return next; })}
              onUpdateGuide={(idx: number, pos: number) => setCustomGuides((g: any) => g.map((gg: any, j: number) => j === idx ? { ...gg, pos } : gg))}
              onRemoveGuide={(idx: number) => setCustomGuides((g: any) => g.filter((_: any, j: number) => j !== idx))}
            />
          </div>
          {/* Corner square */}
          <div
            className="absolute top-0 left-0 z-20 bg-[#f0f0f0] flex items-center justify-center cursor-pointer select-none border-r border-b border-gray-300"
            style={{ width: RULER_SIZE, height: RULER_SIZE }}
            title="Masquer les règles"
            onClick={() => setShowRulers(false)}
          >
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </div>
        </>
      )}
      <div data-canvas-pan className="relative" style={{ display: ready ? "inline-block" : "none" }}>
        {removingBg && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
            <div className="relative bg-white/95 backdrop-blur-sm px-5 py-3 rounded-xl flex items-center gap-3 shadow-2xl border border-gray-200">
              <svg className="w-5 h-5 text-[#4f46e5] animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <div>
                <p className="text-gray-800 text-sm font-semibold">Effacement en cours...</p>
                <p className="text-gray-400 text-xs">L&apos;IA supprime l&apos;arrière-plan</p>
              </div>
            </div>
          </div>
        )}
        <div style={{ minWidth: "100%", minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <div
            ref={canvasWrapperRef}
            style={{
              width: bufferWidth,
              height: bufferHeight,
              overflow: "visible",
              position: "relative",
              // Disable browser's built-in touch gestures (double-tap zoom,
              // pinch-to-zoom of the page, pull-to-refresh) over the canvas
              // so our own pinch-zoom/pan handlers own the gesture.
              touchAction: "none",
            }}
          >
            <canvas ref={canvasElRef} />
            {/* Design area boundary removed — was causing visible shadow artifacts over canvas content */}
            {/* Custom cursor overlay — reliable on all browsers including Safari */}
            {cursorType !== "none" && cursorPos && (
              <div
                className="pointer-events-none absolute z-50"
                style={{
                  left: cursorPos.x,
                  top: cursorPos.y,
                  transform: cursorType === "pen-alt" ? "translate(-5px, -2px)" : "translate(-3px, -22px)",
                }}
              >
                {(cursorType === "pen" || cursorType === "pen-close" || cursorType === "pen-alt") && (
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    {cursorType === "pen-alt" ? (
                      // Arrow pointer for Alt/handle adjust
                      <path d="M5 2L5 19l3.5-3.5 4 7 2.5-1.5-4-7H16z" fill="white" stroke="#333" strokeWidth="1.3" strokeLinejoin="round"/>
                    ) : (
                      // Pen nib
                      <g transform="translate(3,0)">
                        <path d="M12 0L15 3 5 22 2 25 0 24 2 22Z" fill="white" stroke="#333" strokeWidth="1.2" strokeLinejoin="round"/>
                        <path d="M12 0L15 3 13 6 10 3Z" fill="#555" stroke="#333" strokeWidth="0.8"/>
                        <path d="M3 21L5 22 2 25 0 24Z" fill="#222"/>
                      </g>
                    )}
                    {cursorType === "pen-close" && (
                      <circle cx="20" cy="20" r="4.5" fill="white" stroke="#333" strokeWidth="1.2"/>
                    )}
                  </svg>
                )}
                {cursorType === "lasso" && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="8" stroke="#333" strokeWidth="1.5" strokeDasharray="4 2"/>
                    <line x1="12" y1="4" x2="12" y2="2" stroke="#333" strokeWidth="1"/>
                    <line x1="12" y1="22" x2="12" y2="20" stroke="#333" strokeWidth="1"/>
                    <line x1="4" y1="12" x2="2" y2="12" stroke="#333" strokeWidth="1"/>
                    <line x1="22" y1="12" x2="20" y2="12" stroke="#333" strokeWidth="1"/>
                  </svg>
                )}
                {cursorType === "lasso-close" && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="8" stroke="#333" strokeWidth="1.5" strokeDasharray="4 2"/>
                    <circle cx="12" cy="12" r="3" fill="#22c55e" stroke="white" strokeWidth="1"/>
                  </svg>
                )}
              </div>
            )}
          </div>
          {/* Print margin overlay — positioned within design area (offset by bleed) */}
          {(showPrintMargins || showPrintMarginsAuto) && (() => {
            const s = displayScaleRef.current;
            const bOff = BLEED_PX * s; // bleed offset in CSS pixels
            const dW = canvasWidth * s; // design area CSS width
            const dH = canvasHeight * s; // design area CSS height
            const mPx = PRINT_MARGIN * s; // margin in CSS pixels
            return (
              <div className="absolute pointer-events-none transition-opacity duration-300" style={{ zIndex: 10, left: bOff, top: bOff, width: dW, height: dH, opacity: showPrintMarginsAuto && !showPrintMargins ? 0.85 : 1 }}>
                {/* Red tinted margin bands (top, bottom, left, right) */}
                <div className="absolute" style={{ top: 0, left: 0, right: 0, height: mPx, background: "rgba(239, 68, 68, 0.06)" }} />
                <div className="absolute" style={{ bottom: 0, left: 0, right: 0, height: mPx, background: "rgba(239, 68, 68, 0.06)" }} />
                <div className="absolute" style={{ top: mPx, bottom: mPx, left: 0, width: mPx, background: "rgba(239, 68, 68, 0.06)" }} />
                <div className="absolute" style={{ top: mPx, bottom: mPx, right: 0, width: mPx, background: "rgba(239, 68, 68, 0.06)" }} />
                {/* Dashed inner border */}
                <div className="absolute" style={{ top: mPx, left: mPx, right: mPx, bottom: mPx, border: "1.5px dashed rgba(239, 68, 68, 0.5)" }} />
              </div>
            );
          })()}
          {/* Custom guide lines overlay — the px label lives on the
              ruler graduation (see Ruler.tsx guidePositions); the canvas
              overlay just draws the red line + drag handle. */}
          {customGuides.map((guide: any, i: number) => (
            <div
              key={`guide-${i}`}
              className="absolute pointer-events-auto"
              style={guide.axis === "x" ? {
                left: (guide.pos + BLEED_PX) * displayScaleRef.current, top: -9999, width: 0, height: 99999, zIndex: 30,
              } : {
                top: (guide.pos + BLEED_PX) * displayScaleRef.current, left: -9999, height: 0, width: 99999, zIndex: 30,
              }}
            >
              <div className="absolute" style={guide.axis === "x" ? { left: -0.5, top: 0, width: 1, height: "100%", background: "#ef4444" } : { top: -0.5, left: 0, height: 1, width: "100%", background: "#ef4444" }} />
              <div
                className={`absolute ${guide.axis === "x" ? "cursor-ew-resize" : "cursor-ns-resize"}`}
                style={guide.axis === "x" ? { left: -4, top: 0, width: 9, height: "100%" } : { top: -4, left: 0, height: 9, width: "100%" }}
                onMouseDown={(e: any) => {
                  e.preventDefault();
                  const startPos = guide.axis === "x" ? e.clientX : e.clientY;
                  const startGuidePos = guide.pos;
                  const scale = displayScaleRef.current;
                  const onMouseMove = (ev: MouseEvent) => {
                    const delta = guide.axis === "x" ? ev.clientX - startPos : ev.clientY - startPos;
                    setCustomGuides((g: any) => g.map((gg: any, j: number) => j === i ? { ...gg, pos: Math.round(startGuidePos + delta / scale) } : gg));
                  };
                  const onMouseUp = () => {
                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                  };
                  document.addEventListener("mousemove", onMouseMove);
                  document.addEventListener("mouseup", onMouseUp);
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export { CanvasAreaComponent as CanvasArea };
