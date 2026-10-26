"use client";

import React from "react";
import { toast } from "../../Toast";
import { useEditorStore } from "../store/editorStore";

/* eslint-disable @typescript-eslint/no-explicit-any */

function BottomBarComponent({ updateObj, panOffsetRef }: {
  updateObj: (props: Record<string, any>) => void;
  panOffsetRef: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const showRulers = useEditorStore(s => s.showRulers);
  const setShowRulers = useEditorStore(s => s.setShowRulers);
  const showPrintMargins = useEditorStore(s => s.showPrintMargins);
  const setShowPrintMargins = useEditorStore(s => s.setShowPrintMargins);
  const snapToGrid = useEditorStore(s => s.snapToGrid);
  const setSnapToGrid = useEditorStore(s => s.setSnapToGrid);
  const gridSize = useEditorStore(s => s.gridSize);
  const setGridSize = useEditorStore(s => s.setGridSize);
  const customGuides = useEditorStore(s => s.customGuides);
  const setCustomGuides = useEditorStore(s => s.setCustomGuides);
  const selectedObj = useEditorStore(s => s.selectedObj);
  const BLEED_PX = useEditorStore(s => s.BLEED_PX);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const forceRender = useEditorStore(s => s.forceRender);
  const _forceRenderCount = useEditorStore(s => s._forceRenderCount);
  const zoomPercent = useEditorStore(s => s.zoomPercent);
  const userZoomRef = useEditorStore(s => s.userZoomRef);
  const autoScaleRef = useEditorStore(s => s.autoScaleRef);
  const applyScaleRef = useEditorStore(s => s.applyScaleRef);
  const containerRef = useEditorStore(s => s.containerRef);
  const canvasWidth = useEditorStore(s => s.canvasWidth);
  const canvasHeight = useEditorStore(s => s.canvasHeight);

  return (
    <div className="flex items-center px-4 h-[40px] bg-white border-t border-gray-200 flex-shrink-0 gap-3">
      {/* Ruler toggle */}
      <button
        onClick={() => setShowRulers(!showRulers)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${showRulers ? "bg-purple-100 text-purple-700" : "text-gray-500 hover:bg-gray-100"}`}
        title={showRulers ? "Masquer les règles" : "Afficher les règles"}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 2v4M10 2v2M14 2v2M18 2v4M2 6h20M6 22v-4M10 22v-2M14 22v-2M18 22v-4M2 18h20M2 6v12M22 6v12" />
        </svg>
        Règles
      </button>
      {/* Print margins toggle */}
      <button
        onClick={() => setShowPrintMargins(!showPrintMargins)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${showPrintMargins ? "bg-red-100 text-red-600" : "text-gray-500 hover:bg-gray-100"}`}
        title={showPrintMargins ? "Masquer les marges" : "Afficher les marges d'impression (20px)"}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4V4zm3 3h10v10H7V7z" />
        </svg>
        Marges d&apos;impression
      </button>
      {/* Snap-to-grid toggle — disabled for now, may re-enable later
      <button
        onClick={() => setSnapToGrid(!snapToGrid)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${snapToGrid ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}
        title={snapToGrid ? `Désactiver la grille magnétique (${gridSize}px)` : "Activer la grille magnétique"}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h4v4H3zM10 3h4v4h-4zM17 3h4v4h-4zM3 10h4v4H3zM10 10h4v4h-4zM17 10h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4z" />
        </svg>
        {snapToGrid ? (
          <span className="flex items-center gap-1">
            Grille
            <select
              value={gridSize}
              onClick={e => e.stopPropagation()}
              onChange={e => setGridSize(Number(e.target.value))}
              className="h-4 text-[10px] bg-blue-50 border border-blue-300 rounded px-0.5 cursor-pointer"
            >
              {[5, 10, 20, 25, 50].map(s => (
                <option key={s} value={s}>{s}px</option>
              ))}
            </select>
          </span>
        ) : "Grille"}
      </button>
      */}
      {/* DEBUG: Clear localStorage — disabled for production
      <button
        onClick={() => {
          const keys = Object.keys(localStorage).filter(k => k.includes("selfizee_canvas"));
          keys.forEach(k => localStorage.removeItem(k));
          toast(`Cache vidé (${keys.length} entrées)`, "info");
        }}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-orange-500 hover:bg-orange-50 transition-colors"
        title="Vider le cache canvas (debug)"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Vider cache
      </button>
      */}
      {/* Clear guides */}
      {customGuides.length > 0 && (
        <button
          onClick={() => setCustomGuides([])}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-50 transition-colors"
          title="Supprimer tous les repères"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          {customGuides.length} repère{customGuides.length > 1 ? "s" : ""}
        </button>
      )}
      <div className="flex-1" />
      {/* ── Selected object info ── */}
      {selectedObj && !selectedObj._isDesignAreaBg && (
        <div className="flex items-center gap-3 text-[10px] text-gray-500 tabular-nums">
          <div className="flex items-center gap-1" title="Position X, Y">
            {(() => {
              const br = selectedObj.getBoundingRect?.() || { left: selectedObj.left || 0, top: selectedObj.top || 0 };
              const displayX = Math.round(br.left - BLEED_PX);
              const displayY = Math.round(br.top - BLEED_PX);
              const offX = (selectedObj.left || 0) - br.left;
              const offY = (selectedObj.top || 0) - br.top;
              const commitX = (e: any) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateObj({ left: v + BLEED_PX + offX }); };
              const commitY = (e: any) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateObj({ top: v + BLEED_PX + offY }); };
              const onKey = (commit: (e: any) => void) => (e: any) => { if (e.key === "Enter") { commit(e); e.target.blur(); } };
              return (<>
                <span className="text-gray-400">X</span>
                <input type="number" key={`x-${displayX}`} defaultValue={displayX} onBlur={commitX} onKeyDown={onKey(commitX)} className="w-14 h-5 text-center bg-gray-50 border border-gray-200 rounded text-[10px]" />
                <span className="text-gray-400">Y</span>
                <input type="number" key={`y-${displayY}`} defaultValue={displayY} onBlur={commitY} onKeyDown={onKey(commitY)} className="w-14 h-5 text-center bg-gray-50 border border-gray-200 rounded text-[10px]" />
              </>);
            })()}
          </div>
          <div className="w-px h-4 bg-gray-200" />
          <div className="flex items-center gap-0.5" title="Largeur × Hauteur (Shift+glisser pour déformer)">
            <span className="text-gray-400">W</span>
            <input type="number"
              key={`w-${Math.round((selectedObj.width || 0) * (selectedObj.scaleX || 1))}`}
              defaultValue={Math.round((selectedObj.width || 0) * (selectedObj.scaleX || 1))}
              onBlur={(e) => {
                const newW = parseInt(e.target.value); if (isNaN(newW) || newW < 1) return;
                const oldW = (selectedObj.width || 1) * (selectedObj.scaleX || 1);
                const ratio = newW / oldW;
                if (selectedObj._ratioLocked !== false) updateObj({ scaleX: (selectedObj.scaleX || 1) * ratio, scaleY: (selectedObj.scaleY || 1) * ratio });
                else updateObj({ scaleX: (selectedObj.scaleX || 1) * ratio });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
              className="w-14 h-5 text-center bg-gray-50 border border-gray-200 rounded text-[10px] font-medium" />
            <button
              onClick={() => {
                const nowLocked = selectedObj._ratioLocked === false;
                selectedObj._ratioLocked = nowLocked ? undefined : false;
                // Immediately update handle visibility (show/hide side handles)
                const isFree = !nowLocked;
                const isText = selectedObj.type === "textbox" || selectedObj.type === "i-text" || selectedObj.type === "text";
                selectedObj.setControlsVisibility({
                  ml: isText || isFree, mr: isText || isFree,
                  mt: !isText && isFree, mb: !isText && isFree,
                });
                fabricRef.current?.requestRenderAll();
                forceRender((n: number) => n + 1);
              }}
              title={selectedObj._ratioLocked !== false ? "🔗 Proportions liées — clic pour libérer" : "📐 Proportions libres — clic pour verrouiller"}
              className={`mx-1 px-2 py-1 rounded-md text-[10px] font-bold transition-all ${selectedObj._ratioLocked !== false
                ? "bg-[#4f46e5] text-white shadow-sm hover:bg-[#4338ca]"
                : "bg-gray-200 text-gray-500 hover:bg-gray-300"
              }`}
            >
              {selectedObj._ratioLocked !== false ? "🔗" : "📐"}
            </button>
            <span className="text-gray-400">H</span>
            <input type="number"
              key={`h-${Math.round((selectedObj.height || 0) * (selectedObj.scaleY || 1))}`}
              defaultValue={Math.round((selectedObj.height || 0) * (selectedObj.scaleY || 1))}
              onBlur={(e) => {
                const newH = parseInt(e.target.value); if (isNaN(newH) || newH < 1) return;
                const oldH = (selectedObj.height || 1) * (selectedObj.scaleY || 1);
                const ratio = newH / oldH;
                if (selectedObj._ratioLocked !== false) updateObj({ scaleX: (selectedObj.scaleX || 1) * ratio, scaleY: (selectedObj.scaleY || 1) * ratio });
                else updateObj({ scaleY: (selectedObj.scaleY || 1) * ratio });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
              className="w-14 h-5 text-center bg-gray-50 border border-gray-200 rounded text-[10px] font-medium" />
          </div>
          <>
            <div className="w-px h-4 bg-gray-200" />
            <div className="flex items-center gap-0.5" title="Rotation">
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              <input type="number"
                key={`a-${Math.round(selectedObj.angle || 0)}`}
                defaultValue={Math.round(selectedObj.angle || 0)}
                onBlur={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) updateObj({ angle: v }); }}
                onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
                className="w-12 h-5 text-center bg-gray-50 border border-gray-200 rounded text-[10px]" />
              <span className="text-gray-400">°</span>
            </div>
          </>
        </div>
      )}
      <div className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2 py-1 border border-gray-200">
        {/* Zoom out */}
        <button
          onClick={() => {
            const newScale = Math.max(0.1, (userZoomRef.current ?? autoScaleRef.current) - 0.1);
            userZoomRef.current = newScale;
            applyScaleRef.current?.(newScale);
          }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
          title="Zoom arrière"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
          </svg>
        </button>

        {/* Slider */}
        <input
          type="range"
          min={10}
          max={300}
          value={zoomPercent}
          onChange={(e) => {
            const newScale = parseInt(e.target.value) / 100;
            userZoomRef.current = newScale;
            applyScaleRef.current?.(newScale);
          }}
         
          className="w-24 accent-[#4f46e5] cursor-pointer"
          title={`Zoom: ${zoomPercent}%`}
         
        />

        {/* Zoom in */}
        <button
          onClick={() => {
            const newScale = Math.min(3, (userZoomRef.current ?? autoScaleRef.current) + 0.1);
            userZoomRef.current = newScale;
            applyScaleRef.current?.(newScale);
          }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors"
          title="Zoom avant"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* Percentage display / reset */}
        <button
          onClick={() => {
            userZoomRef.current = null;
        // Reset pan offset on auto-fit
        panOffsetRef.current = { x: 0, y: 0 };
        const panEl2 = containerRef.current?.querySelector("[data-canvas-pan]") as HTMLElement | null;
        if (panEl2) panEl2.style.transform = "";
            // Re-calc auto fit
            if (containerRef.current) {
              const availW = containerRef.current.clientWidth - 48;
              const availH = containerRef.current.clientHeight - 48;
              const fitScale = Math.min(availW / canvasWidth, availH / canvasHeight, 1.15);
              autoScaleRef.current = fitScale;
              applyScaleRef.current?.(fitScale);
            }
          }}
          className="min-w-[48px] h-7 px-2 rounded-full text-xs font-semibold text-gray-600 hover:bg-gray-200 hover:text-gray-800 transition-colors tabular-nums"
          title="Réinitialiser le zoom"
        >
          {zoomPercent}%
        </button>
      </div>
    </div>
  );
}
export const BottomBar = BottomBarComponent;
