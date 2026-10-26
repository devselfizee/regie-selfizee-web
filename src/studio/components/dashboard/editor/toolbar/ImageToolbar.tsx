"use client";
import React, { useState, useRef, useCallback, Suspense, useEffect } from "react";
import { stabilizeBlobSrc, throttledRender, retryImport } from "../canvas/canvasUtils";
import { useEditorStore } from "../store/editorStore";

const EraserToolActivation = React.lazy(() => retryImport(() => import("../tools/EraserToolActivation")).then(m => ({ default: m.EraserToolActivation })));
const WandToolActivation = React.lazy(() => retryImport(() => import("../tools/WandToolActivation")).then(m => ({ default: m.WandToolActivation })));
const LassoToolActivation = React.lazy(() => retryImport(() => import("../tools/LassoToolActivation")).then(m => ({ default: m.LassoToolActivation })));

/* Image contextual toolbar — extracted from FrameEditor */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ImageToolbarComponent({ startCrop, removingBg, removeBackground, startSelectArea, showSelectionPopup, applyFade }: {
  startCrop: () => void;
  removingBg: boolean;
  removeBackground: () => void;
  startSelectArea: (...args: any[]) => void;
  showSelectionPopup: (...args: any[]) => void;
  applyFade: (...args: any[]) => void;
}) {
  const _filterRafRef = useRef(0);
  const _filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Local state to force re-render when fade direction changes on the mutable fabric object
  const [fadeVersion, setFadeVersion] = useState(0);

  const debouncedApplyFilters = useCallback((
    selectedObj: any, fabricRef: any,
    br: number, co: number, sa: number, bl: number,
  ) => {
    if (_filterTimerRef.current) clearTimeout(_filterTimerRef.current);
    _filterTimerRef.current = setTimeout(async () => {
      const canvas = fabricRef.current;
      if (!canvas || !selectedObj || selectedObj.type !== "image") return;
      const fabric = await import("fabric");
      const filters: any[] = [];
      if (br !== 0) filters.push(new fabric.filters.Brightness({ brightness: br / 100 }));
      if (co !== 0) filters.push(new fabric.filters.Contrast({ contrast: co / 100 }));
      if (sa !== 0) filters.push(new fabric.filters.Saturation({ saturation: sa / 100 }));
      if (bl !== 0) filters.push(new fabric.filters.Blur({ blur: bl / 20 }));
      selectedObj.filters = filters;
      if (_filterRafRef.current) cancelAnimationFrame(_filterRafRef.current);
      _filterRafRef.current = requestAnimationFrame(() => {
        selectedObj.applyFilters();
        throttledRender(canvas);
        canvas.fire("object:modified", { target: selectedObj, _historyLabel: "Filtres modifiés", _continuous: true });
        _filterRafRef.current = 0;
      });
    }, 150);
  }, []);

  const selectedObj = useEditorStore(s => s.selectedObj);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const canvasWidth = useEditorStore(s => s.canvasWidth);
  const canvasHeight = useEditorStore(s => s.canvasHeight);
  const BLEED_PX = useEditorStore(s => s.BLEED_PX);
  const displayScaleRef = useEditorStore(s => s.displayScaleRef);
  const isRestoringRef = useEditorStore(s => s.isRestoringRef);
  const forceRender = useEditorStore(s => s.forceRender);
  const _forceRenderCount = useEditorStore(s => s._forceRenderCount);
  const wandActive = useEditorStore(s => s.wandActive);
  const setWandActive = useEditorStore(s => s.setWandActive);
  const wandTolerance = useEditorStore(s => s.wandTolerance);
  const setWandTolerance = useEditorStore(s => s.setWandTolerance);
  const wandToleranceRef = useEditorStore(s => s.wandToleranceRef);
  const eraserActive = useEditorStore(s => s.eraserActive);
  const setEraserActive = useEditorStore(s => s.setEraserActive);
  const showShadowPanel = useEditorStore(s => s.showShadowPanel);
  const setShowShadowPanel = useEditorStore(s => s.setShowShadowPanel);
  const setShadowPanelPos = useEditorStore(s => s.setShadowPanelPos);
  const eraserBrushSize = useEditorStore(s => s.eraserBrushSize);
  const eraserBrushSizeRef = useEditorStore(s => s.eraserBrushSizeRef);
  const eraserOpacity = useEditorStore(s => s.eraserOpacity);
  const eraserOpacityRef = useEditorStore(s => s.eraserOpacityRef);
  const eraserTargetRef = useEditorStore(s => s.eraserTargetRef);
  const lassoActive = useEditorStore(s => s.lassoActive);
  const setLassoActive = useEditorStore(s => s.setLassoActive);
  const lassoMode = useEditorStore(s => s.lassoMode);
  const lassoSearchRadius = useEditorStore(s => s.lassoSearchRadius);
  const setLassoSearchRadius = useEditorStore(s => s.setLassoSearchRadius);
  const selectAreaActive = useEditorStore(s => s.selectAreaActive);
  const setSelectAreaMode = useEditorStore(s => s.setSelectAreaMode);
  const filtersOpen = useEditorStore(s => s.filtersOpen);
  const setFiltersOpen = useEditorStore(s => s.setFiltersOpen);
  const filtersPanelPos = useEditorStore(s => s.filtersPanelPos);
  const setFiltersPanelPos = useEditorStore(s => s.setFiltersPanelPos);
  const filtersBtnRef = useEditorStore(s => s.filtersBtnRef);
  const filterBrightness = useEditorStore(s => s.filterBrightness);
  const setFilterBrightness = useEditorStore(s => s.setFilterBrightness);
  const filterContrast = useEditorStore(s => s.filterContrast);
  const setFilterContrast = useEditorStore(s => s.setFilterContrast);
  const filterSaturation = useEditorStore(s => s.filterSaturation);
  const setFilterSaturation = useEditorStore(s => s.setFilterSaturation);
  const filterBlur = useEditorStore(s => s.filterBlur);
  const setFilterBlur = useEditorStore(s => s.setFilterBlur);
  const showMaskPanel = useEditorStore(s => s.showMaskPanel);
  const setShowMaskPanel = useEditorStore(s => s.setShowMaskPanel);
  const maskPanelPos = useEditorStore(s => s.maskPanelPos);
  const setMaskPanelPos = useEditorStore(s => s.setMaskPanelPos);
  const maskBtnRef = useEditorStore(s => s.maskBtnRef);
  const setSelectedObj = useEditorStore(s => s.setSelectedObj);
  const setBgColor = useEditorStore(s => s.setBgColor);
  const setWandPopup = useEditorStore(s => s.setWandPopup);

  // Sync the filter sliders to the currently selected image's actual
  // filter values. Without this, sliders show stale values from the
  // previous image and re-applying with stale values would overwrite
  // the new image's filters with the old one's.
  useEffect(() => {
    if (!selectedObj || selectedObj.type !== "image") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentFilters: any[] = selectedObj.filters || [];
    let br = 0, co = 0, sa = 0, bl = 0;
    for (const f of currentFilters) {
      // Fabric filters have a `type` string identifying the filter class
      const t = (f?.type || "").toLowerCase();
      if (t === "brightness") br = Math.round((f.brightness || 0) * 100);
      else if (t === "contrast") co = Math.round((f.contrast || 0) * 100);
      else if (t === "saturation") sa = Math.round((f.saturation || 0) * 100);
      else if (t === "blur") bl = Math.round((f.blur || 0) * 20);
    }
    setFilterBrightness(br);
    setFilterContrast(co);
    setFilterSaturation(sa);
    setFilterBlur(bl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObj]);

  // Clean up pending filter apply timer on unmount
  useEffect(() => {
    return () => {
      if (_filterTimerRef.current) clearTimeout(_filterTimerRef.current);
      if (_filterRafRef.current) cancelAnimationFrame(_filterRafRef.current);
    };
  }, []);

  return (
    <>
            <>
              {/* Hide non-tool buttons when a tool mode is active */}
              {!eraserActive && !wandActive && !lassoActive && (<>
              <button
                onClick={removeBackground}
                disabled={removingBg}
                className="relative overflow-hidden flex items-center gap-1.5 px-3 h-8 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-500 text-white text-xs font-semibold hover:from-purple-500 hover:to-indigo-400 transition-all disabled:opacity-70"
              >
                {removingBg && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                {removingBg ? "..." : "Détourage IA"}
              </button>
              <div className="w-px h-7 bg-gray-200 mx-1" />
              <button onClick={startCrop} className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 1v4M1 7h4m14 0h4m-4 10v6M7 21h10a4 4 0 004-4V7H11a4 4 0 00-4 4v10z" />
                </svg>
                Recadrage
              </button>
              <div className="w-px h-7 bg-gray-200 mx-1" />
              {/* Masque & Fondu */}
              <div className="relative">
                <button
                  ref={maskBtnRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!showMaskPanel && maskBtnRef.current) {
                      const rect = maskBtnRef.current.getBoundingClientRect();
                      setMaskPanelPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 290) });
                    }
                    setShowMaskPanel(!showMaskPanel);
                  }}
                  className={`flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium transition-colors ${
                    showMaskPanel || selectedObj?.clipPath || (selectedObj as any)?._fadeDir ? "bg-purple-100 text-[#4f46e5]" : "text-gray-600 hover:bg-gray-100"
                  }`}
                  title="Masque et fondu"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16v16H4z" />
                    <circle cx="12" cy="12" r="5" strokeWidth={2} />
                  </svg>
                  Masque
                </button>
                {showMaskPanel && (
                  <>
                    <div className="fixed inset-0 z-[9998]" onMouseDown={() => setShowMaskPanel(false)} />
                    <div className="fixed bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-[9999] w-[280px] space-y-3 overflow-y-auto" style={{ top: maskPanelPos.top, left: maskPanelPos.left, maxHeight: `calc(100vh - ${maskPanelPos.top}px - 16px)` }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                      <div>
                        <h4 className="text-gray-700 text-xs font-semibold mb-2">Forme du masque</h4>
                        <div className="flex items-center gap-1.5">
                          {[
                            { label: "Cercle", shape: "circle" },
                            { label: "Losange", shape: "diamond" },
                            { label: "Étoile", shape: "star" },
                            { label: "Arrondi", shape: "rounded" },
                          ].map((mask) => (
                            <button
                              key={mask.shape}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const fabric = await import("fabric");
                                const img = selectedObj;
                                if (!img) return;
                                const w = img.width || 100;
                                const h = img.height || 100;
                                const r = Math.min(w, h) / 2;
                                let clip;
                                switch (mask.shape) {
                                  case "circle": clip = new fabric.Circle({ radius: r, left: 0, top: 0, originX: "center", originY: "center" }); break;
                                  case "diamond": {
                                    const dd = `M 0 ${-h/2} L ${w/2} 0 L 0 ${h/2} L ${-w/2} 0 Z`;
                                    clip = new fabric.Path(dd, { left: 0, top: 0, originX: "center", originY: "center" });
                                    break;
                                  }
                                  case "star": {
                                    let sd = "";
                                    for (let i = 0; i < 10; i++) {
                                      const rad = (i * Math.PI) / 5 - Math.PI / 2;
                                      const cr = i % 2 === 0 ? r : r * 0.4;
                                      const sx = cr * Math.cos(rad);
                                      const sy = cr * Math.sin(rad);
                                      sd += i === 0 ? `M ${sx} ${sy}` : ` L ${sx} ${sy}`;
                                    }
                                    sd += " Z";
                                    clip = new fabric.Path(sd, { left: 0, top: 0, originX: "center", originY: "center" });
                                    break;
                                  }
                                  case "rounded": clip = new fabric.Rect({ width: w, height: h, rx: Math.min(w, h) * 0.15, ry: Math.min(w, h) * 0.15, left: 0, top: 0, originX: "center", originY: "center" }); break;
                                }
                                if (clip) { img.set({ clipPath: clip }); img.dirty = true; fabricRef.current?.requestRenderAll(); forceRender((n: number) => n + 1); }
                              }}
                              className="w-9 h-9 rounded-lg border border-gray-200 hover:border-[#4f46e5] flex items-center justify-center text-gray-400 hover:text-[#4f46e5] transition-colors"
                              title={mask.label}
                            >
                              {mask.shape === "circle" && <div className="w-5 h-5 rounded-full border-2 border-current" />}
                              {mask.shape === "diamond" && <div className="w-4 h-4 border-2 border-current rotate-45" />}
                              {mask.shape === "star" && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
                              {mask.shape === "rounded" && <div className="w-5 h-3.5 rounded-md border-2 border-current" />}
                            </button>
                          ))}
                          {selectedObj?.clipPath && (
                            <button onClick={() => { selectedObj.set({ clipPath: undefined }); selectedObj.dirty = true; fabricRef.current?.requestRenderAll(); fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Masque supprimé" }); forceRender((n: number) => n + 1); }}
                              className="w-9 h-9 rounded-lg border border-gray-200 hover:border-red-400 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors" title="Supprimer le masque">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="border-t border-gray-100 pt-3">
                        <h4 className="text-gray-700 text-xs font-semibold mb-2">Fondu (dégradé transparence)</h4>
                        <div className="flex items-center gap-1.5">
                          {[
                            { label: "Haut", dir: "top" },
                            { label: "Bas", dir: "bottom" },
                            { label: "Gauche", dir: "left" },
                            { label: "Droite", dir: "right" },
                            { label: "↘", dir: "top-left" },
                            { label: "↙", dir: "top-right" },
                            { label: "↗", dir: "bottom-left" },
                            { label: "↖", dir: "bottom-right" },
                            { label: "Radial", dir: "radial" },
                          ].map((fade) => {
                            const isActive = (selectedObj as any)?._fadeDir === fade.dir;
                            return (
                              <button key={fade.dir} onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (!selectedObj || selectedObj.type !== "image") return;
                                if (!(selectedObj as any)._fadeOriginalSrc) {
                                  stabilizeBlobSrc(selectedObj);
                                  const el = selectedObj.getElement();
                                  const tmp = document.createElement("canvas");
                                  tmp.width = el.naturalWidth || el.width; tmp.height = el.naturalHeight || el.height;
                                  tmp.getContext("2d")!.drawImage(el, 0, 0);
                                  (selectedObj as any)._fadeOriginalSrc = tmp.toDataURL("image/png");
                                }
                                (selectedObj as any)._fadeDir = isActive ? null : fade.dir;
                                applyFade(selectedObj, (selectedObj as any)._fadeDir, (selectedObj as any)._fadeSize || 40, (selectedObj as any)._fadeOpacity ?? 0, (selectedObj as any)._fadeOffset ?? 0);
                                setFadeVersion(v => v + 1);
                                forceRender((n: number) => n + 1);
                              }}
                                className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${isActive ? "border-[#4f46e5] bg-purple-50 text-[#4f46e5]" : "border-gray-200 hover:border-[#4f46e5] text-gray-400 hover:text-[#4f46e5]"}`}
                                title={isActive ? `Désactiver fondu ${fade.label.toLowerCase()}` : `Fondu ${fade.label.toLowerCase()}`}
                              >
                                {fade.dir === "top" && <svg className="w-5 h-5" viewBox="0 0 16 16"><defs><linearGradient id="ft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0"/><stop offset="1" stopColor="currentColor" stopOpacity="1"/></linearGradient></defs><rect x="2" y="2" width="12" height="12" rx="1" fill="url(#ft)"/></svg>}
                                {fade.dir === "bottom" && <svg className="w-5 h-5" viewBox="0 0 16 16"><defs><linearGradient id="fb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="1"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs><rect x="2" y="2" width="12" height="12" rx="1" fill="url(#fb)"/></svg>}
                                {fade.dir === "left" && <svg className="w-5 h-5" viewBox="0 0 16 16"><defs><linearGradient id="fl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="currentColor" stopOpacity="0"/><stop offset="1" stopColor="currentColor" stopOpacity="1"/></linearGradient></defs><rect x="2" y="2" width="12" height="12" rx="1" fill="url(#fl)"/></svg>}
                                {fade.dir === "right" && <svg className="w-5 h-5" viewBox="0 0 16 16"><defs><linearGradient id="fr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="currentColor" stopOpacity="1"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs><rect x="2" y="2" width="12" height="12" rx="1" fill="url(#fr)"/></svg>}
                                {fade.dir === "top-left" && <svg className="w-5 h-5" viewBox="0 0 16 16"><defs><linearGradient id="ftl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0"/><stop offset="1" stopColor="currentColor" stopOpacity="1"/></linearGradient></defs><rect x="2" y="2" width="12" height="12" rx="1" fill="url(#ftl)"/></svg>}
                                {fade.dir === "top-right" && <svg className="w-5 h-5" viewBox="0 0 16 16"><defs><linearGradient id="ftr" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity="0"/><stop offset="1" stopColor="currentColor" stopOpacity="1"/></linearGradient></defs><rect x="2" y="2" width="12" height="12" rx="1" fill="url(#ftr)"/></svg>}
                                {fade.dir === "bottom-left" && <svg className="w-5 h-5" viewBox="0 0 16 16"><defs><linearGradient id="fbl" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="currentColor" stopOpacity="0"/><stop offset="1" stopColor="currentColor" stopOpacity="1"/></linearGradient></defs><rect x="2" y="2" width="12" height="12" rx="1" fill="url(#fbl)"/></svg>}
                                {fade.dir === "bottom-right" && <svg className="w-5 h-5" viewBox="0 0 16 16"><defs><linearGradient id="fbr" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stopColor="currentColor" stopOpacity="0"/><stop offset="1" stopColor="currentColor" stopOpacity="1"/></linearGradient></defs><rect x="2" y="2" width="12" height="12" rx="1" fill="url(#fbr)"/></svg>}
                                {fade.dir === "radial" && <svg className="w-5 h-5" viewBox="0 0 16 16"><defs><radialGradient id="frd"><stop offset="0" stopColor="currentColor" stopOpacity="1"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></radialGradient></defs><circle cx="8" cy="8" r="6" fill="url(#frd)"/></svg>}
                              </button>
                            );
                          })}
                        </div>
                        {(selectedObj as any)?._fadeDir && (
                          <div className="space-y-2 mt-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 w-14">Début</span>
                              <input type="range" min={0} max={90} value={(selectedObj as any)?._fadeOffset ?? 0}
                                onChange={(e) => { const v = parseInt(e.target.value); (selectedObj as any)._fadeOffset = v; setFadeVersion(n => n + 1); applyFade(selectedObj, (selectedObj as any)._fadeDir, (selectedObj as any)._fadeSize || 40, (selectedObj as any)._fadeOpacity ?? 0, v, true); }}
                                onPointerUp={() => { applyFade(selectedObj, (selectedObj as any)._fadeDir, (selectedObj as any)._fadeSize || 40, (selectedObj as any)._fadeOpacity ?? 0, (selectedObj as any)._fadeOffset ?? 0); }}
                                className="flex-1 accent-[#4f46e5] cursor-pointer" />
                              <span className="text-[10px] text-gray-500 w-7 tabular-nums">{(selectedObj as any)?._fadeOffset ?? 0}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 w-14">Distance</span>
                              <input type="range" min={5} max={100} value={(selectedObj as any)?._fadeSize || 40}
                                onChange={(e) => { const v = parseInt(e.target.value); (selectedObj as any)._fadeSize = v; setFadeVersion(n => n + 1); applyFade(selectedObj, (selectedObj as any)._fadeDir, v, (selectedObj as any)._fadeOpacity ?? 0, (selectedObj as any)._fadeOffset ?? 0, true); }}
                                onPointerUp={() => { applyFade(selectedObj, (selectedObj as any)._fadeDir, (selectedObj as any)._fadeSize || 40, (selectedObj as any)._fadeOpacity ?? 0, (selectedObj as any)._fadeOffset ?? 0); }}
                                className="flex-1 accent-[#4f46e5] cursor-pointer" />
                              <span className="text-[10px] text-gray-500 w-7 tabular-nums">{(selectedObj as any)?._fadeSize || 40}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 w-14">Opacité fin</span>
                              <input type="range" min={0} max={100} value={(selectedObj as any)?._fadeOpacity ?? 0}
                                onChange={(e) => { const v = parseInt(e.target.value); (selectedObj as any)._fadeOpacity = v; setFadeVersion(n => n + 1); applyFade(selectedObj, (selectedObj as any)._fadeDir, (selectedObj as any)._fadeSize || 40, v, (selectedObj as any)._fadeOffset ?? 0, true); }}
                                onPointerUp={() => { applyFade(selectedObj, (selectedObj as any)._fadeDir, (selectedObj as any)._fadeSize || 40, (selectedObj as any)._fadeOpacity ?? 0, (selectedObj as any)._fadeOffset ?? 0); }}
                                className="flex-1 accent-[#4f46e5] cursor-pointer" />
                              <span className="text-[10px] text-gray-500 w-7 tabular-nums">{(selectedObj as any)?._fadeOpacity ?? 0}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              </>)}
              {/* Tools always visible even during active mode */}
              <div className="w-px h-7 bg-gray-200 mx-1" />

              {/* Eraser */}
              <Suspense fallback={null}>
              <EraserToolActivation
                selectedObj={selectedObj} fabricRef={fabricRef} isRestoringRef={isRestoringRef}
                eraserActive={eraserActive} setEraserActive={setEraserActive}
                eraserBrushSize={eraserBrushSize} eraserBrushSizeRef={eraserBrushSizeRef}
                eraserOpacity={eraserOpacity} eraserOpacityRef={eraserOpacityRef}
                eraserTargetRef={eraserTargetRef}
                setWandActive={setWandActive} setSelectedObj={setSelectedObj}
              />
              </Suspense>

              <div className="w-px h-7 bg-gray-200 mx-0.5" />

              {/* Unified selection dropdown: Wand + Lasso + Zone */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    const el = (e.target as HTMLElement).closest("button")!;
                    const existing = el.parentElement?.querySelector("[data-sel-menu]");
                    if (existing) { existing.remove(); return; }
                    document.querySelectorAll("[data-sel-menu]").forEach(d => d.remove());
                    const rect = el.getBoundingClientRect();
                    const drop = document.createElement("div");
                    drop.setAttribute("data-sel-menu", "1");
                    drop.className = "fixed z-[9999] bg-white rounded-xl shadow-xl border border-gray-200 py-1 w-[200px]";
                    drop.style.top = `${rect.bottom + 4}px`;
                    drop.style.left = `${rect.left}px`;

                    const items = [
                      { id: "wand", icon: "\u2728", label: "Baguette magique", desc: "Sélection par couleur" },
                      { id: "lasso", icon: "\u25CC", label: "Lasso magnétique", desc: "Détection automatique des contours" },
                      { id: "rect", icon: "\u25AD", label: "Sélection rectangle", desc: "Cliquez-glissez un rectangle" },
                      { id: "free", icon: "\u270E", label: "Sélection libre", desc: "Dessinez à main levée" },
                    ];
                    items.forEach(({ id, icon, label, desc }) => {
                      const btn = document.createElement("button");
                      btn.className = "w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-center gap-2";
                      btn.innerHTML = `<span class="text-base w-5 text-center">${icon}</span><div><div class="text-xs font-medium text-gray-700">${label}</div><div class="text-[10px] text-gray-400">${desc}</div></div>`;
                      btn.onclick = () => {
                        drop.remove(); backdrop.remove();
                        const toolBtn = document.querySelector(`[data-sel-tool="${id}"]`) as HTMLButtonElement;
                        if (toolBtn) toolBtn.click();
                      };
                      drop.appendChild(btn);
                    });
                    const backdrop = document.createElement("div");
                    backdrop.className = "fixed inset-0 z-[9998]";
                    backdrop.onclick = () => { drop.remove(); backdrop.remove(); };
                    document.body.appendChild(backdrop);
                    document.body.appendChild(drop);
                  }}
                  className={`flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium transition-colors ${
                    wandActive || lassoActive || selectAreaActive ? "bg-purple-100 text-purple-700" : "text-gray-600 hover:bg-gray-100"
                  }`}
                  title="Outils de sélection"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Sélection
                </button>
              </div>

              {/* Hidden trigger buttons for selection tools */}
              <div className="hidden">
                <Suspense fallback={null}>
                <WandToolActivation
                  selectedObj={selectedObj} fabricRef={fabricRef} isRestoringRef={isRestoringRef}
                  wandActive={wandActive} setWandActive={setWandActive}
                  wandTolerance={wandTolerance} setWandTolerance={setWandTolerance}
                  wandToleranceRef={wandToleranceRef}
                  setEraserActive={setEraserActive} eraserTargetRef={eraserTargetRef}
                  setWandPopup={setWandPopup}
                />
                </Suspense>

                <div className="w-px h-7 bg-gray-200 mx-0.5" />

                <Suspense fallback={null}>
                <LassoToolActivation
                  selectedObj={selectedObj} fabricRef={fabricRef} isRestoringRef={isRestoringRef}
                  displayScaleRef={displayScaleRef}
                  lassoActive={lassoActive} setLassoActive={setLassoActive}
                  lassoMode={lassoMode} lassoSearchRadius={lassoSearchRadius}
                  setLassoSearchRadius={setLassoSearchRadius}
                  setEraserActive={setEraserActive} setWandActive={setWandActive}
                  showSelectionPopup={showSelectionPopup}
                />
                </Suspense>

                <button data-sel-tool="rect" className="hidden" onClick={() => { setSelectAreaMode("rect"); setTimeout(() => startSelectArea("rect"), 50); }} />
                <button data-sel-tool="free" className="hidden" onClick={() => { setSelectAreaMode("free"); setTimeout(() => startSelectArea("free"), 50); }} />
              </div>

              {/* Wand tolerance slider */}
              {wandActive && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500 font-medium">Tolérance :</span>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    value={wandTolerance}
                    onChange={(e) => { const v = parseInt(e.target.value); setWandTolerance(v); wandToleranceRef.current = v; }}
                   
                    className="w-16 accent-[#f59e0b] cursor-pointer"
                    title={`Tolérance: ${wandTolerance}`}
                   
                  />
                  <span className="text-[10px] text-gray-500 w-5 tabular-nums">{wandTolerance}</span>
                </div>
              )}
              {/* Lasso radius slider */}
              {lassoActive && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-400">Rayon :</span>
                  <input
                    type="range"
                    min={4}
                    max={25}
                    value={lassoSearchRadius}
                    onChange={(e) => setLassoSearchRadius(parseInt(e.target.value))}
                   
                    className="w-14 accent-[#22c55e] cursor-pointer"
                    title={`Rayon de recherche: ${lassoSearchRadius}px`}
                   
                  />
                  <span className="text-[10px] text-gray-500 w-5 tabular-nums">{lassoSearchRadius}</span>
                </div>
              )}

              <div className="w-px h-7 bg-gray-200 mx-0.5" />

              {/* Image filters toggle */}
              <div className="relative">
                <button
                  ref={filtersBtnRef}
                  onClick={() => {
                    if (!filtersOpen && filtersBtnRef.current) {
                      const rect = filtersBtnRef.current.getBoundingClientRect();
                      setFiltersPanelPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 270) });
                    }
                    setFiltersOpen(!filtersOpen);
                  }}
                  className={`flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium transition-colors ${
                    filtersOpen ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-100"
                  }`}
                  title="Ajuster luminosité, contraste, saturation, flou"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Filtres
                </button>
                {filtersOpen && (
                  <>
                    <div className="fixed inset-0 z-[9998]" onMouseDown={() => setFiltersOpen(false)} />
                    <div className="fixed bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-[9999] w-[260px] space-y-2.5 overflow-y-auto" style={{ top: filtersPanelPos.top, left: filtersPanelPos.left, maxHeight: `calc(100vh - ${filtersPanelPos.top}px - 16px)` }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                      <h4 className="text-gray-700 text-xs font-semibold">Filtres d&apos;image</h4>
                      {([
                        { label: "Luminosité", value: filterBrightness, setter: setFilterBrightness, min: -100, max: 100 },
                        { label: "Contraste", value: filterContrast, setter: setFilterContrast, min: -100, max: 100 },
                        { label: "Saturation", value: filterSaturation, setter: setFilterSaturation, min: -100, max: 100 },
                        { label: "Flou", value: filterBlur, setter: setFilterBlur, min: 0, max: 20 },
                      ] as const).map(({ label, value, setter, min, max }) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 w-16">{label}</span>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            value={value}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              setter(v);
                              const br = label === "Luminosité" ? v : filterBrightness;
                              const co = label === "Contraste" ? v : filterContrast;
                              const sa = label === "Saturation" ? v : filterSaturation;
                              const bl = label === "Flou" ? v : filterBlur;
                              debouncedApplyFilters(selectedObj, fabricRef, br, co, sa, bl);
                            }}
                           
                            className="flex-1 accent-[#4f46e5] cursor-pointer"
                           
                          />
                          <span className="text-[10px] text-gray-500 w-6 tabular-nums text-right">{value}</span>
                        </div>
                      ))}
                      <button
                        onClick={async () => {
                          setFilterBrightness(0); setFilterContrast(0); setFilterSaturation(0); setFilterBlur(0);
                          if (selectedObj && selectedObj.type === "image") {
                            selectedObj.filters = [];
                            selectedObj.applyFilters();
                            fabricRef.current?.requestRenderAll();
                            fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Filtres réinitialisés" });
                          }
                        }}
                        className="w-full py-1.5 rounded-lg text-[11px] font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                      >
                        Réinitialiser
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
      {/* ── Shadow button for images ── */}
      <div className="w-px h-7 bg-gray-200 mx-0.5" />
      <button
        onClick={(e) => {
          e.stopPropagation();
          const rect = (e.target as HTMLElement).closest("button")!.getBoundingClientRect();
          setShadowPanelPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 260) });
          setShowShadowPanel(!showShadowPanel);
        }}
        className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors ${
          selectedObj?.shadow && (selectedObj.shadow.blur || selectedObj.shadow.offsetX || selectedObj.shadow.offsetY)
            ? "bg-[#4f46e5]/10 text-[#4f46e5] border border-[#4f46e5]/30"
            : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Ombre portée"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="14" height="14" rx="2" strokeWidth={2} />
          <rect x="7" y="7" width="14" height="14" rx="2" strokeWidth={1.5} opacity="0.3" fill="currentColor" stroke="none" />
        </svg>
        Ombre
      </button>
    </>
  );
}
export { ImageToolbarComponent as ImageToolbar };
