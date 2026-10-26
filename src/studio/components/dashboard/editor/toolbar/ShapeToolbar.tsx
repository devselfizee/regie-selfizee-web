"use client";
import React from "react";
import { GRADIENT_PRESETS } from "../panels/PanelFonds";
import { toast } from "../../Toast";
import { useEditorStore } from "../store/editorStore";

/* Shape contextual toolbar — extracted from FrameEditor */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ShapeToolbarComponent({ updateObj }: { updateObj: (props: Record<string, any>) => void }) {
  const selectedObj = useEditorStore(s => s.selectedObj);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const forceRender = useEditorStore(s => s.forceRender);
  const showShapeFillPanel = useEditorStore(s => s.showShapeFillPanel);
  const setShowShapeFillPanel = useEditorStore(s => s.setShowShapeFillPanel);
  const shapeFillPanelPos = useEditorStore(s => s.shapeFillPanelPos);
  const setShapeFillPanelPos = useEditorStore(s => s.setShapeFillPanelPos);
  const shapeFillBtnRef = useEditorStore(s => s.shapeFillBtnRef);
  const shapeFillInputRef = useEditorStore(s => s.shapeFillInputRef);
  const showShadowPanel = useEditorStore(s => s.showShadowPanel);
  const setShowShadowPanel = useEditorStore(s => s.setShowShadowPanel);
  const shadowPanelPos = useEditorStore(s => s.shadowPanelPos);
  const setShadowPanelPos = useEditorStore(s => s.setShadowPanelPos);
  const shadowBtnRef = useEditorStore(s => s.shadowBtnRef);
  const showCornerPanel = useEditorStore(s => s.showCornerPanel);
  const setShowCornerPanel = useEditorStore(s => s.setShowCornerPanel);
  const cornerPanelPos = useEditorStore(s => s.cornerPanelPos);
  const setCornerPanelPos = useEditorStore(s => s.setCornerPanelPos);
  const _forceRenderCount = useEditorStore(s => s._forceRenderCount);
  const showShootStrokePanel = useEditorStore(s => s.showShootStrokePanel);
  const setShowShootStrokePanel = useEditorStore(s => s.setShowShootStrokePanel);
  const shootStrokePanelPos = useEditorStore(s => s.shootStrokePanelPos);
  const setShootStrokePanelPos = useEditorStore(s => s.setShootStrokePanelPos);
  const shootStrokeBtnRef = useEditorStore(s => s.shootStrokeBtnRef);
  const showCustomGrad = useEditorStore(s => s.showCustomGrad);
  const setShowCustomGrad = useEditorStore(s => s.setShowCustomGrad);
  const shootGradColor1 = useEditorStore(s => s.shootGradColor1);
  const setShootGradColor1 = useEditorStore(s => s.setShootGradColor1);
  const shootGradColor2 = useEditorStore(s => s.shootGradColor2);
  const setShootGradColor2 = useEditorStore(s => s.setShootGradColor2);
  const shootGradType = useEditorStore(s => s.shootGradType);
  const setShootGradType = useEditorStore(s => s.setShootGradType);
  const shootGradAngle = useEditorStore(s => s.shootGradAngle);
  const setShootGradAngle = useEditorStore(s => s.setShootGradAngle);
  return (
    <>
            <>
              {/* ── FOND (couleur / dégradé / image) ── */}
              <div className="relative">
                <button
                  ref={shapeFillBtnRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!showShapeFillPanel && shapeFillBtnRef.current) {
                      const rect = shapeFillBtnRef.current.getBoundingClientRect();
                      setShapeFillPanelPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 290) });
                    }
                    setShowShapeFillPanel(!showShapeFillPanel);
                  }}
                  className={`flex items-center gap-1.5 h-9 px-2 rounded-lg transition-colors ${showShapeFillPanel ? "bg-purple-100 text-[#4f46e5]" : "hover:bg-gray-100 text-gray-600"}`}
                  title="Remplissage de la forme"
                >
                  <div className="w-6 h-6 rounded-md border border-gray-300 shadow-inner overflow-hidden" style={{
                    background: typeof selectedObj.fill === "string" && selectedObj.fill !== "transparent"
                      ? selectedObj.fill
                      : selectedObj.fill?.colorStops
                        ? `linear-gradient(to right, ${selectedObj.fill.colorStops.map((s: {color: string}) => s.color).join(", ")})`
                        : "#eee"
                  }}>
                    {selectedObj.fill === "transparent" && <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24"><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="2"/></svg>}
                    {selectedObj.fill?.source && (() => {
                      try {
                        const src = selectedObj.fill.source;
                        const url = src instanceof HTMLCanvasElement ? src.toDataURL() : src instanceof HTMLImageElement ? src.src : null;
                        if (url) return <img src={url} alt="" className="w-full h-full object-cover" />;
                      } catch { /* skip */ }
                      return <svg className="w-4 h-4 text-gray-400 m-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
                    })()}
                  </div>
                  <span className="text-xs">Fond</span>
                  <svg className={`w-3 h-3 text-gray-400 transition-transform ${showShapeFillPanel ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showShapeFillPanel && (
                  <>
                    <div className="fixed inset-0 z-[9998]" onMouseDown={() => setShowShapeFillPanel(false)} />
                    <div className="fixed bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-[9999] w-[280px] space-y-3 overflow-y-auto" style={{ top: shapeFillPanelPos.top, left: shapeFillPanelPos.left, maxHeight: `calc(100vh - ${shapeFillPanelPos.top}px - 16px)` }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                      {/* Solid color */}
                      <div>
                        <h4 className="text-gray-700 text-xs font-semibold mb-1.5">Couleur unie</h4>
                        <div className="flex items-center gap-2">
                          <label className="relative w-8 h-8 rounded-lg border border-gray-200 overflow-hidden cursor-pointer flex-shrink-0">
                            <input type="color" value={typeof selectedObj.fill === "string" && selectedObj.fill !== "transparent" ? selectedObj.fill : "#3b82f6"} onChange={(e) => updateObj({ fill: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
                            <div className="w-full h-full" style={{ backgroundColor: typeof selectedObj.fill === "string" ? selectedObj.fill : "#3b82f6" }} />
                          </label>
                          {"EyeDropper" in window && (
                            <button
                              onClick={async () => {
                                try {
                                  const dropper = new (window as any).EyeDropper();
                                  const { sRGBHex } = await dropper.open();
                                  if (sRGBHex) updateObj({ fill: sRGBHex });
                                } catch { /* cancelled */ }
                              }}
                              className="w-7 h-7 rounded border border-gray-200 hover:border-[#4f46e5] text-gray-400 hover:text-[#4f46e5] flex items-center justify-center transition-colors flex-shrink-0"
                              title="Pipette — choisir une couleur à l'écran"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 22l1-1h3l9-9" /><path d="M3 21v-3l9-9" /><path d="M15 6l3-3 3 3-3 3" /><path d="M12 9l3 3" />
                              </svg>
                            </button>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {["#fe0154", "#7c3aed", "#3b82f6", "#059669", "#f59e0b", "#ef4444", "#1a1a2e", "#ffffff"].map((c) => (
                              <button key={c} onClick={() => updateObj({ fill: c })} className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${typeof selectedObj.fill === "string" && selectedObj.fill === c ? "border-gray-800 scale-110" : "border-gray-200"}`} style={{ backgroundColor: c }} />
                            ))}
                          </div>
                        </div>
                        <button onClick={() => updateObj({ fill: "transparent" })} className="mt-1.5 text-[10px] text-gray-500 hover:text-red-500 transition-colors">Transparent (sans fond)</button>
                      </div>
                      {/* Gradient */}
                      <div className="border-t border-gray-100 pt-2">
                        <h4 className="text-gray-700 text-xs font-semibold mb-1.5">Dégradé</h4>
                        <div className="grid grid-cols-6 gap-1.5">
                          {GRADIENT_PRESETS.map((g, i) => (
                            <button key={i} onClick={async () => {
                              const fabric = await import("fabric");
                              const w = selectedObj.width || 100;
                              const h = selectedObj.height || 100;
                              const coords = g.dir === "horizontal" ? { x1: 0, y1: 0, x2: w, y2: 0 } : g.dir === "vertical" ? { x1: 0, y1: 0, x2: 0, y2: h } : { x1: 0, y1: 0, x2: w, y2: h };
                              const grad = new fabric.Gradient({ type: "linear", coords, colorStops: [{ offset: 0, color: g.colors[0] }, { offset: 1, color: g.colors[1] }] });
                              selectedObj.set({ fill: grad });
                              fabricRef.current?.requestRenderAll();
                              fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Dégradé appliqué" });
                              forceRender((n: number) => n + 1);
                            }}
                              className="w-full aspect-square rounded-full border-2 border-gray-100 hover:border-gray-400 hover:scale-110 transition-all"
                              style={{ background: `linear-gradient(${g.dir === "horizontal" ? "to right" : g.dir === "vertical" ? "to bottom" : "to bottom right"}, ${g.colors[0]}, ${g.colors[1]})` }}
                            />
                          ))}
                        </div>
                        {/* Custom gradient — collapsible */}
                        <button onClick={() => setShowCustomGrad(!showCustomGrad)} className="mt-1 flex items-center gap-1 text-[10px] text-[#4f46e5] font-medium hover:underline">
                          <svg className={`w-3 h-3 transition-transform ${showCustomGrad ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          Dégradé sur mesure
                        </button>
                        {showCustomGrad && (
                          <div className="space-y-2 bg-gray-50 rounded-lg p-2">
                          <div className="flex items-center gap-2">
                            <label className="relative w-7 h-7 rounded-lg border border-gray-200 overflow-hidden cursor-pointer flex-shrink-0">
                              <input type="color" value={shootGradColor1} onChange={(e) => setShootGradColor1(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                              <div className="w-full h-full" style={{ backgroundColor: shootGradColor1 }} />
                            </label>
                            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            <label className="relative w-7 h-7 rounded-lg border border-gray-200 overflow-hidden cursor-pointer flex-shrink-0">
                              <input type="color" value={shootGradColor2} onChange={(e) => setShootGradColor2(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                              <div className="w-full h-full" style={{ backgroundColor: shootGradColor2 }} />
                            </label>
                          </div>
                          <div className="flex items-center gap-1">
                            {([["linear", "Linéaire"], ["radial", "Radial"]] as const).map(([t, label]) => (
                              <button key={t} onClick={() => setShootGradType(t)} className={`flex-1 h-6 rounded text-[10px] font-medium transition-colors ${shootGradType === t ? "bg-[#4f46e5] text-white" : "bg-white text-gray-500 hover:bg-gray-200"}`}>{label}</button>
                            ))}
                          </div>
                          {shootGradType === "linear" && (
                            <div className="flex items-center gap-1">
                              {[
                                { angle: 0, label: "→" }, { angle: 90, label: "↓" }, { angle: 135, label: "↘" },
                                { angle: 180, label: "←" }, { angle: 270, label: "↑" }, { angle: 315, label: "↗" },
                              ].map((d) => (
                                <button key={d.angle} onClick={() => setShootGradAngle(d.angle)} className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${shootGradAngle === d.angle ? "bg-[#4f46e5] text-white" : "bg-white text-gray-500 hover:bg-gray-200"}`}>{d.label}</button>
                              ))}
                            </div>
                          )}
                          {/* Preview */}
                          <div className="w-full h-6 rounded border border-gray-200" style={{
                            background: shootGradType === "radial"
                              ? `radial-gradient(circle, ${shootGradColor1}, ${shootGradColor2})`
                              : `linear-gradient(${shootGradAngle + 90}deg, ${shootGradColor1}, ${shootGradColor2})`,
                          }} />
                          <button
                            onClick={async () => {
                              const fabric = await import("fabric");
                              const w = selectedObj.width || 100;
                              const h = selectedObj.height || 100;
                              let grad;
                              if (shootGradType === "radial") {
                                grad = new fabric.Gradient({
                                  type: "radial",
                                  coords: { x1: w / 2, y1: h / 2, r1: 0, x2: w / 2, y2: h / 2, r2: Math.max(w, h) / 2 },
                                  colorStops: [{ offset: 0, color: shootGradColor1 }, { offset: 1, color: shootGradColor2 }],
                                });
                              } else {
                                const rad = (shootGradAngle * Math.PI) / 180;
                                const cx = w / 2, cy = h / 2;
                                const len = Math.max(w, h);
                                grad = new fabric.Gradient({
                                  type: "linear",
                                  coords: {
                                    x1: cx - (Math.cos(rad) * len) / 2, y1: cy - (Math.sin(rad) * len) / 2,
                                    x2: cx + (Math.cos(rad) * len) / 2, y2: cy + (Math.sin(rad) * len) / 2,
                                  },
                                  colorStops: [{ offset: 0, color: shootGradColor1 }, { offset: 1, color: shootGradColor2 }],
                                });
                              }
                              selectedObj.set({ fill: grad });
                              fabricRef.current?.requestRenderAll();
                              fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Dégradé appliqué" });
                              forceRender((n: number) => n + 1);
                            }}
                            className="w-full py-1.5 rounded-lg bg-[#4f46e5] text-white text-[10px] font-semibold hover:bg-[#4338ca] transition-colors"
                          >
                            Appliquer le dégradé
                          </button>
                        </div>
                        )}
                      </div>
                      {/* Image fill */}
                      <div className="border-t border-gray-100 pt-2">
                        <h4 className="text-gray-700 text-xs font-semibold mb-1.5">Image dans la forme</h4>
                        <input ref={shapeFillInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !selectedObj) return;
                          const reader = new FileReader();
                          reader.onload = async (ev) => {
                            const dataUrl = ev.target?.result as string;
                            const fabric = await import("fabric");
                            const imgEl = new Image();
                            imgEl.onerror = () => { toast("Erreur chargement image", "error"); };
                            imgEl.onload = () => {
                              const shapeW = selectedObj.width || 100;
                              const shapeH = selectedObj.height || 100;
                              const imgW = imgEl.naturalWidth || imgEl.width;
                              const imgH = imgEl.naturalHeight || imgEl.height;
                              const coverScale = Math.max(shapeW / imgW, shapeH / imgH);
                              const scaledW = imgW * coverScale;
                              const scaledH = imgH * coverScale;
                              const offsetX = (shapeW - scaledW) / 2;
                              const offsetY = (shapeH - scaledH) / 2;
                              const pattern = new fabric.Pattern({
                                source: imgEl,
                                repeat: "no-repeat",
                                patternTransform: [coverScale, 0, 0, coverScale, offsetX, offsetY],
                              });
                              selectedObj.set({ fill: pattern });
                              // Store pattern params for later adjustment
                              (selectedObj as any)._patternImgEl = imgEl;
                              (selectedObj as any)._patternScale = coverScale;
                              (selectedObj as any)._patternBaseScale = coverScale;
                              (selectedObj as any)._patternOffsetX = offsetX;
                              (selectedObj as any)._patternOffsetY = offsetY;
                              selectedObj.dirty = true;
                              fabricRef.current?.requestRenderAll();
                              fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Motif appliqué" });
                              forceRender((n: number) => n + 1);
                            };
                            imgEl.src = dataUrl;
                          };
                          reader.readAsDataURL(file);
                          e.target.value = "";
                        }} />
                        <button onClick={() => shapeFillInputRef.current?.click()} className="w-full py-2 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#4f46e5] text-xs text-gray-500 hover:text-[#4f46e5] transition-colors flex items-center justify-center gap-1.5">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          Importer une image
                        </button>
                        <p className="text-[9px] text-gray-400 text-center">💡 Ajoutez d&apos;abord une photo via le panel <strong>Photos</strong>, puis elle apparaîtra ci-dessous</p>
                        {/* Use image from canvas */}
                        {(() => {
                          const canvas = fabricRef.current;
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const canvasImages = canvas ? canvas.getObjects().filter((o: any) => o.type === "image" && o !== selectedObj) : [];
                          if (canvasImages.length === 0) return null;
                          return (
                            <div className="mt-1.5">
                              <p className="text-[10px] text-gray-400 mb-1">Utiliser une image du cadre :</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {canvasImages.map((img: any, i: number) => {
                                  let thumbSrc = "";
                                  try {
                                    const el = img.getElement?.();
                                    if (el?.src) thumbSrc = el.src;
                                  } catch { /* skip */ }
                                  if (!thumbSrc) return null;
                                  return (
                                    <button key={i} onClick={async () => {
                                      const fabric = await import("fabric");
                                      const el = img.getElement();
                                      const shapeW = selectedObj.width || 100;
                                      const shapeH = selectedObj.height || 100;
                                      const imgW = el.naturalWidth || el.width;
                                      const imgH = el.naturalHeight || el.height;
                                      const coverScale = Math.max(shapeW / imgW, shapeH / imgH);
                                      const scaledW = imgW * coverScale;
                                      const scaledH = imgH * coverScale;
                                      const oX = (shapeW - scaledW) / 2;
                                      const oY = (shapeH - scaledH) / 2;
                                      const pattern = new fabric.Pattern({
                                        source: el,
                                        repeat: "no-repeat",
                                        patternTransform: [coverScale, 0, 0, coverScale, oX, oY],
                                      });
                                      selectedObj.set({ fill: pattern });
                                      (selectedObj as any)._patternImgEl = el;
                                      (selectedObj as any)._patternScale = coverScale;
                                      (selectedObj as any)._patternBaseScale = coverScale;
                                      (selectedObj as any)._patternOffsetX = oX;
                                      (selectedObj as any)._patternOffsetY = oY;
                                      selectedObj.dirty = true;
                                      fabricRef.current?.requestRenderAll();
                                      fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Motif appliqué" });
                                      forceRender((n: number) => n + 1);
                                    }}
                                      className="w-12 h-12 rounded-lg border-2 border-gray-200 hover:border-[#4f46e5] overflow-hidden transition-colors"
                                      title="Utiliser cette image"
                                    >
                                      <img src={thumbSrc} className="w-full h-full object-cover" alt="" />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      {/* Pattern position/zoom controls */}
                      {(selectedObj as any)?._patternImgEl && (
                        <div className="border-t border-gray-100 pt-2 space-y-2">
                          <h4 className="text-gray-700 text-xs font-semibold">Position de l&apos;image</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 w-10">Zoom</span>
                            <input type="range" min={50} max={300} value={Math.round(((selectedObj as any)._patternScale / (selectedObj as any)._patternBaseScale) * 100)}
                              onChange={(e) => {
                                const pct = parseInt(e.target.value) / 100;
                                const baseScale = (selectedObj as any)._patternBaseScale;
                                const newScale = baseScale * pct;
                                (selectedObj as any)._patternScale = newScale;
                                const imgEl = (selectedObj as any)._patternImgEl;
                                const oX = (selectedObj as any)._patternOffsetX;
                                const oY = (selectedObj as any)._patternOffsetY;
                                import("fabric").then((fabric) => {
                                  const pattern = new fabric.Pattern({
                                    source: imgEl, repeat: "no-repeat",
                                    patternTransform: [newScale, 0, 0, newScale, oX, oY],
                                  });
                                  selectedObj.set({ fill: pattern });
                                  selectedObj.dirty = true;
                                  fabricRef.current?.requestRenderAll();
                                  fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Motif ajusté", _continuous: true });
                                  forceRender((n: number) => n + 1);
                                });
                              }}
                              className="flex-1 accent-[#4f46e5] cursor-pointer" />
                            <span className="text-[10px] text-gray-500 w-8 tabular-nums">{Math.round(((selectedObj as any)._patternScale / (selectedObj as any)._patternBaseScale) * 100)}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 w-10">Pos. X</span>
                            <input type="range" min={-200} max={200} value={Math.round((selectedObj as any)._patternOffsetX || 0)}
                              onChange={(e) => {
                                const oX = parseInt(e.target.value);
                                (selectedObj as any)._patternOffsetX = oX;
                                const imgEl = (selectedObj as any)._patternImgEl;
                                const s = (selectedObj as any)._patternScale;
                                const oY = (selectedObj as any)._patternOffsetY;
                                import("fabric").then((fabric) => {
                                  const pattern = new fabric.Pattern({
                                    source: imgEl, repeat: "no-repeat",
                                    patternTransform: [s, 0, 0, s, oX, oY],
                                  });
                                  selectedObj.set({ fill: pattern });
                                  selectedObj.dirty = true;
                                  fabricRef.current?.requestRenderAll();
                                  fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Motif ajusté", _continuous: true });
                                  forceRender((n: number) => n + 1);
                                });
                              }}
                              className="flex-1 accent-[#4f46e5] cursor-pointer" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-500 w-10">Pos. Y</span>
                            <input type="range" min={-200} max={200} value={Math.round((selectedObj as any)._patternOffsetY || 0)}
                              onChange={(e) => {
                                const oY = parseInt(e.target.value);
                                (selectedObj as any)._patternOffsetY = oY;
                                const imgEl = (selectedObj as any)._patternImgEl;
                                const s = (selectedObj as any)._patternScale;
                                const oX = (selectedObj as any)._patternOffsetX;
                                import("fabric").then((fabric) => {
                                  const pattern = new fabric.Pattern({
                                    source: imgEl, repeat: "no-repeat",
                                    patternTransform: [s, 0, 0, s, oX, oY],
                                  });
                                  selectedObj.set({ fill: pattern });
                                  selectedObj.dirty = true;
                                  fabricRef.current?.requestRenderAll();
                                  fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Motif ajusté", _continuous: true });
                                  forceRender((n: number) => n + 1);
                                });
                              }}
                              className="flex-1 accent-[#4f46e5] cursor-pointer" />
                          </div>
                        </div>
                      )}
                    </div>
                  </>

                )}
              </div>

              {/* ── BORDER RADIUS (rect shapes only) ── */}
              {(selectedObj.type === "rect") && (
                <>
                <div className="w-px h-7 bg-gray-200 mx-1" />
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16V8a4 4 0 014-4h8" />
                  </svg>
                  <input
                    type="range"
                    min={0}
                    max={Math.round(Math.min(selectedObj.width || 100, selectedObj.height || 100) / 2)}
                    value={Math.round(selectedObj.rx || 0)}
                    onChange={(e) => {
                      const r = parseInt(e.target.value);
                      if (selectedObj._individualCorners) {
                        selectedObj._individualCorners = false;
                        selectedObj.set({ clipPath: undefined });
                      }
                      updateObj({ rx: r, ry: r });
                      selectedObj._radiusTL = r; selectedObj._radiusTR = r;
                      selectedObj._radiusBR = r; selectedObj._radiusBL = r;
                    }}
                    className="w-16 accent-[#4f46e5] cursor-pointer"
                  />
                  <span className="text-[10px] text-gray-500 w-6 tabular-nums">{Math.round(selectedObj.rx || 0)}</span>
                  {/* Individual corners toggle — uses shared fixed panel */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (showCornerPanel) {
                        setShowCornerPanel(false);
                      } else {
                        if (!selectedObj._individualCorners) {
                          selectedObj._individualCorners = true;
                          const r = selectedObj.rx || 0;
                          selectedObj._radiusTL = r; selectedObj._radiusTR = r;
                          selectedObj._radiusBR = r; selectedObj._radiusBL = r;
                        }
                        const rect = (e.target as HTMLElement).closest("button")!.getBoundingClientRect();
                        setCornerPanelPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 200) });
                        setShowCornerPanel(true);
                      }
                      forceRender((n: number) => n + 1);
                    }}
                    title="Coins individuels"
                    className={`p-1.5 rounded-md transition-colors ${selectedObj._individualCorners ? "text-[#4f46e5] bg-purple-50 border border-purple-200" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-transparent"}`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M1 7V5a4 4 0 014-4h2" /><path d="M13 1h2a4 4 0 014 4v2" />
                      <path d="M19 13v2a4 4 0 01-4 4h-2" /><path d="M7 19H5a4 4 0 01-4-4v-2" />
                    </svg>
                  </button>
                </div>
                {/* Quick radius presets: carré, moyen, fort */}
                <div className="flex items-center gap-1">
                  {[0, 16, 30].map((r) => (
                    <button
                      key={r}
                      onClick={() => { updateObj({ rx: r, ry: r }); selectedObj._shootBorderRadius = r; if (selectedObj._individualCorners) { selectedObj._individualCorners = false; selectedObj.set({ clipPath: undefined }); } selectedObj._radiusTL = r; selectedObj._radiusTR = r; selectedObj._radiusBR = r; selectedObj._radiusBL = r; fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Coins arrondis" }); }}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
                        (selectedObj.rx || 0) === r ? "border-[#4f46e5] bg-indigo-50 text-[#4f46e5]" : "border-gray-200 text-gray-400 hover:border-gray-400"
                      }`}
                      title={r === 0 ? "Angles droits" : `Arrondi ${r}px`}
                    >
                      <div className="w-3.5 h-3.5 border-2 border-current" style={{ borderRadius: `${r === 0 ? 0 : r <= 16 ? 3 : 7}px` }} />
                    </button>
                  ))}
                </div>
                </>
              )}

              <div className="w-px h-7 bg-gray-200 mx-1" />

              {/* ── CONTOUR toggle + options ── */}
              <button
                onClick={() => {
                  const hasStroke = (selectedObj.strokeWidth || 0) > 0;
                  if (hasStroke) {
                    updateObj({ strokeWidth: 0, stroke: "" });
                  } else {
                    updateObj({ strokeWidth: 2, stroke: "#000000", strokeUniform: true });
                  }
                }}
                className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                  (selectedObj.strokeWidth || 0) > 0
                    ? "bg-[#4f46e5]/10 text-[#4f46e5] border border-[#4f46e5]/30"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
                title={(selectedObj.strokeWidth || 0) > 0 ? "Désactiver le contour" : "Activer le contour"}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} strokeDasharray={(selectedObj.strokeWidth || 0) > 0 ? "none" : "4 2"} />
                </svg>
                Contour
              </button>
              {(selectedObj.strokeWidth || 0) > 0 && (
                <>
                  {/* Stroke color/gradient panel — reuse shoot stroke panel */}
                  <div className="relative">
                    <button
                      ref={shootStrokeBtnRef}
                      onClick={() => {
                        if (!showShootStrokePanel && shootStrokeBtnRef.current) {
                          const rect = shootStrokeBtnRef.current.getBoundingClientRect();
                          setShootStrokePanelPos({ top: rect.bottom + 4, left: rect.left });
                        }
                        setShowShootStrokePanel(!showShootStrokePanel);
                      }}
                      className="flex items-center gap-1 h-8 px-2 rounded-lg hover:bg-gray-100 transition-colors"
                      title="Couleur / dégradé du contour"
                    >
                      <div className="w-5 h-5 rounded border border-gray-300" style={{
                        background: typeof selectedObj.stroke === "string" ? selectedObj.stroke
                          : selectedObj.stroke?.colorStops ? `linear-gradient(to right, ${selectedObj.stroke.colorStops.map((s: {color: string}) => s.color).join(", ")})` : "#000",
                      }} />
                      <svg className={`w-3 h-3 text-gray-400 transition-transform ${showShootStrokePanel ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>
                  <input type="range" min={1} max={20} value={Math.round(selectedObj.strokeWidth || 2)} onChange={(e) => {
                    const sw = parseInt(e.target.value);
                    const dashStyle = selectedObj._dashStyle || "solid";
                    const dashArray = dashStyle === "solid" ? [] : dashStyle === "dashed" ? [sw * 2, sw] : dashStyle === "dotted" ? [1, sw * 1.5] : dashStyle === "mixed" ? [sw * 3, sw, 1, sw] : [];
                    updateObj({ strokeWidth: sw, strokeDashArray: dashArray, strokeUniform: true });
                  }} className="w-14 accent-[#4f46e5] cursor-pointer" title="Épaisseur du contour" />
                  <span className="text-[10px] text-gray-500 w-4 text-center">{Math.round(selectedObj.strokeWidth || 2)}</span>
                  <div className="flex items-center gap-0.5">
                    {([
                      { label: "Plein", id: "solid", dash: null as number[] | null },
                      { label: "Tirets", id: "dashed", dash: [2, 1] },
                      { label: "Pointillés", id: "dotted", dash: [0.1, 1.5] },
                      { label: "Mixte", id: "mixed", dash: [3, 1, 0.1, 1] },
                    ] as const).map((style) => {
                      const isActive = (selectedObj._dashStyle || "solid") === style.id;
                      const sw = selectedObj.strokeWidth || 2;
                      return (
                        <button key={style.label} onClick={() => {
                          const dashArray = style.dash ? style.dash.map(v => v * sw) : [];
                          const canvas = fabricRef.current;
                          const obj = canvas?.getActiveObject();
                          if (obj) obj._dashStyle = style.id;
                          updateObj({ strokeDashArray: dashArray, strokeUniform: true });
                        }}
                          className={`h-7 w-9 rounded border flex items-center justify-center transition-colors ${isActive ? "border-[#4f46e5] bg-purple-50" : "border-gray-200 hover:border-gray-400"}`} title={style.label}>
                          <svg width="24" height="4" viewBox="0 0 24 4"><line x1="0" y1="2" x2="24" y2="2" stroke={isActive ? "#7c3aed" : "#999"} strokeWidth="2" strokeDasharray={style.dash ? style.dash.map(v => v * 4).join(",") : "none"} strokeLinecap={style.id === "dotted" ? "round" : "butt"} /></svg>
                        </button>
                      );
                    })}
                  </div>
                  {/* Round / Square linecap */}
                  <button
                    onClick={() => {
                      const isRound = selectedObj.strokeLineCap === "round";
                      updateObj({ strokeLineCap: isRound ? "butt" : "round", strokeLineJoin: isRound ? "miter" : "round" });
                    }}
                    className={`h-7 w-9 rounded border flex items-center justify-center transition-colors ${selectedObj.strokeLineCap === "round" ? "border-[#4f46e5] bg-purple-50" : "border-gray-200 hover:border-gray-400"}`}
                    title={selectedObj.strokeLineCap === "round" ? "Extrémités rondes (actif)" : "Extrémités rondes"}
                  >
                    <svg width="20" height="8" viewBox="0 0 20 8">
                      <line x1="4" y1="4" x2="16" y2="4" stroke={selectedObj.strokeLineCap === "round" ? "#7c3aed" : "#999"} strokeWidth="6" strokeLinecap="round" />
                    </svg>
                  </button>
                </>
              )}

              <div className="w-px h-7 bg-gray-200 mx-1" />

              {/* ── OMBRE ── */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.target as HTMLElement).closest("button")!.getBoundingClientRect();
                  setShadowPanelPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 260) });
                  setShowShadowPanel(!showShadowPanel);
                }}
                className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedObj.shadow
                    ? "bg-[#4f46e5]/10 text-[#4f46e5] border border-[#4f46e5]/30"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
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
    </>
  );
}
export { ShapeToolbarComponent as ShapeToolbar };
