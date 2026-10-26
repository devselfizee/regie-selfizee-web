"use client";
import React, { useState } from "react";
import { toast } from "../../Toast";
import { FontPickerInline } from "../panels/FontPickerInline";
import { loadGoogleFont, getCustomFonts, loadCustomFontFace } from "../panels/fonts";
import { GRADIENT_PRESETS } from "../panels/PanelFonds";
import { useEditorStore } from "../store/editorStore";

/* Text contextual toolbar — extracted from FrameEditor */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TextToolbarComponent({ updateObj, applyGradientBg, addText, effectsPos, setEffectsPos }: {
  updateObj: (props: Record<string, any>) => void;
  applyGradientBg: (...args: any[]) => void;
  addText: (...args: any[]) => void;
  effectsPos: { top: number; left: number };
  setEffectsPos: (v: { top: number; left: number }) => void;
}) {
  const selectedObj = useEditorStore(s => s.selectedObj);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const canvasWidth = useEditorStore(s => s.canvasWidth);
  const BLEED_PX = useEditorStore(s => s.BLEED_PX);
  const showTextEffects = useEditorStore(s => s.showTextEffects);
  const setShowTextEffects = useEditorStore(s => s.setShowTextEffects);
  const showTextFillPanel = useEditorStore(s => s.showTextFillPanel);
  const setShowTextFillPanel = useEditorStore(s => s.setShowTextFillPanel);
  const textFillPanelPos = useEditorStore(s => s.textFillPanelPos);
  const setTextFillPanelPos = useEditorStore(s => s.setTextFillPanelPos);
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
  const shapeFillInputRef = useEditorStore(s => s.shapeFillInputRef);
  const forceRender = useEditorStore(s => s.forceRender);
  const _forceRenderCount = useEditorStore(s => s._forceRenderCount);
  return (
    <>
            <>
              {/* Font family */}
              <FontPickerInline
                value={selectedObj.fontFamily || "sans-serif"}
                onChange={async (font: string) => {
                  // If it's a user-imported font, load its @font-face rule;
                  // otherwise treat it as a Google font.
                  const custom = getCustomFonts().find(f => f.displayName === font);
                  if (custom) {
                    loadCustomFontFace(custom);
                  } else {
                    // Await the CSS load. The previous fire-and-forget pattern
                    // resolved document.fonts.ready BEFORE the <link> was in the
                    // DOM, so updateObj fired with the fallback font still in
                    // place — Fabric measured the textbox with stale metrics
                    // and never re-measured. Awaiting + force-loading specific
                    // weights below guarantees the WOFF is actually fetched
                    // (Google Fonts uses font-display:swap so the file isn't
                    // pulled until something tries to use it).
                    await loadGoogleFont(font);
                  }
                  try {
                    if ((document as any).fonts?.load) {
                      await Promise.all([
                        (document as any).fonts.load(`400 16px "${font}"`),
                        (document as any).fonts.load(`700 16px "${font}"`),
                        (document as any).fonts.load(`italic 16px "${font}"`),
                      ]);
                    }
                  } catch { /* ignore — fall back to default if load fails */ }
                  updateObj({ fontFamily: font });
                }}
              />

              <div className="w-px h-7 bg-gray-200 mx-2" />

              {/* Font size */}
              <button onClick={() => updateObj({ fontSize: Math.max(8, (selectedObj.fontSize || 32) - 2) })} className="w-9 h-9 rounded-lg hover:bg-gray-100 text-gray-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
              </button>
              <input
                type="number"
                value={Math.round(selectedObj.fontSize || 32)}
                onChange={(e) => updateObj({ fontSize: parseInt(e.target.value) || 16 })}
                className="w-14 h-9 px-2 text-center rounded-lg border border-gray-200 text-[15px] text-gray-800 font-medium focus:outline-none focus:border-[#4f46e5]"
                min={8} max={200}
              />
              <button onClick={() => updateObj({ fontSize: Math.min(200, (selectedObj.fontSize || 32) + 2) })} className="w-9 h-9 rounded-lg hover:bg-gray-100 text-gray-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>

              <div className="w-px h-7 bg-gray-200 mx-2" />

              {/* Text color / gradient */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.target as HTMLElement).closest("button")!.getBoundingClientRect();
                    setTextFillPanelPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 290) });
                    setShowTextFillPanel(!showTextFillPanel);
                  }}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${showTextFillPanel ? "bg-purple-100" : "hover:bg-gray-100"}`}
                  title="Couleur / dégradé du texte"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                    {/* 1px gray outline keeps the icon visible when the text
                        fill is white or any near-white color (otherwise the
                        "A" + swatch would disappear against the white button
                        background). Stroke is dark-gray so it's a discreet
                        border on dark fills too. */}
                    <text x="5" y="16" fontSize="16" fontWeight="bold" fill={typeof selectedObj.fill === "string" ? selectedObj.fill : "#000"} stroke="#9ca3af" strokeWidth={0.5} paintOrder="stroke">A</text>
                    <rect x="4" y="20" width="16" height="3" rx="1" fill={typeof selectedObj.fill === "string" ? selectedObj.fill : selectedObj.fill?.colorStops ? "url(#tg)" : "#000"} stroke="#9ca3af" strokeWidth={0.5}>
                    </rect>
                    {selectedObj.fill?.colorStops && (
                      <defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="0">
                        {selectedObj.fill.colorStops.map((s: {offset: number; color: string}, i: number) => (
                          <stop key={i} offset={s.offset} stopColor={s.color} />
                        ))}
                      </linearGradient></defs>
                    )}
                  </svg>
                </button>
                {showTextFillPanel && (
                  <>
                    <div className="fixed inset-0 z-[9998]" onMouseDown={() => setShowTextFillPanel(false)} />
                    <div className="fixed bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-[9999] w-[280px] space-y-3 overflow-y-auto" style={{ top: textFillPanelPos.top, left: textFillPanelPos.left, maxHeight: `calc(100vh - ${textFillPanelPos.top}px - 16px)` }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                      <div>
                        <h4 className="text-gray-700 text-xs font-semibold mb-1.5">Couleur unie</h4>
                        <div className="flex items-center gap-2">
                          <label className="relative w-8 h-8 rounded-lg border border-gray-200 overflow-hidden cursor-pointer flex-shrink-0">
                            <input type="color" value={typeof selectedObj.fill === "string" ? selectedObj.fill : "#000000"} onChange={(e) => updateObj({ fill: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
                            <div className="w-full h-full" style={{ backgroundColor: typeof selectedObj.fill === "string" ? selectedObj.fill : "#000" }} />
                          </label>
                          {"EyeDropper" in window && (
                            <button
                              onClick={async () => {
                                try {
                                  // @ts-ignore
                                  const dropper = new (window as any).EyeDropper();
                                  const { sRGBHex } = await dropper.open();
                                  if (sRGBHex) updateObj({ fill: sRGBHex });
                                } catch { /* cancelled */ }
                              }}
                              className="w-7 h-7 rounded border border-gray-200 hover:border-[#4f46e5] text-gray-400 hover:text-[#4f46e5] flex items-center justify-center transition-colors"
                              title="Pipette — choisir une couleur à l'écran"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 22l1-1h3l9-9" /><path d="M3 21v-3l9-9" /><path d="M15 6l3-3 3 3-3 3" /><path d="M12 9l3 3" />
                              </svg>
                            </button>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {["#000000", "#ffffff", "#fe0154", "#7c3aed", "#3b82f6", "#059669", "#f59e0b", "#ef4444"].map((c) => (
                              <button key={c} onClick={() => updateObj({ fill: c })} className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${typeof selectedObj.fill === "string" && selectedObj.fill === c ? "border-gray-800 scale-110" : "border-gray-200"}`} style={{ backgroundColor: c }} />
                            ))}
                          </div>
                        </div>
                      </div>
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
                              fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Dégradé texte" });
                              forceRender((n: number) => n + 1);
                            }}
                              className="w-full aspect-square rounded-full border-2 border-gray-100 hover:border-gray-400 hover:scale-110 transition-all"
                              style={{ background: `linear-gradient(${g.dir === "horizontal" ? "to right" : g.dir === "vertical" ? "to bottom" : "to bottom right"}, ${g.colors[0]}, ${g.colors[1]})` }}
                            />
                          ))}
                        </div>
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
                              {[{ angle: 0, label: "→" }, { angle: 90, label: "↓" }, { angle: 135, label: "↘" }, { angle: 180, label: "←" }, { angle: 270, label: "↑" }, { angle: 315, label: "↗" }].map((d) => (
                                <button key={d.angle} onClick={() => setShootGradAngle(d.angle)} className={`w-6 h-6 rounded text-[10px] font-bold transition-colors ${shootGradAngle === d.angle ? "bg-[#4f46e5] text-white" : "bg-white text-gray-500 hover:bg-gray-200"}`}>{d.label}</button>
                              ))}
                            </div>
                          )}
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
                                grad = new fabric.Gradient({ type: "radial", coords: { x1: w / 2, y1: h / 2, r1: 0, x2: w / 2, y2: h / 2, r2: Math.max(w, h) / 2 }, colorStops: [{ offset: 0, color: shootGradColor1 }, { offset: 1, color: shootGradColor2 }] });
                              } else {
                                const rad = (shootGradAngle * Math.PI) / 180;
                                const cx = w / 2, cy = h / 2, len = Math.max(w, h);
                                grad = new fabric.Gradient({ type: "linear", coords: { x1: cx - (Math.cos(rad) * len) / 2, y1: cy - (Math.sin(rad) * len) / 2, x2: cx + (Math.cos(rad) * len) / 2, y2: cy + (Math.sin(rad) * len) / 2 }, colorStops: [{ offset: 0, color: shootGradColor1 }, { offset: 1, color: shootGradColor2 }] });
                              }
                              selectedObj.set({ fill: grad });
                              fabricRef.current?.requestRenderAll();
                              fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Dégradé texte" });
                              forceRender((n: number) => n + 1);
                            }}
                            className="w-full py-1.5 rounded-lg bg-[#4f46e5] text-white text-[10px] font-semibold hover:bg-[#4338ca] transition-colors"
                          >
                            Appliquer le dégradé
                          </button>
                        </div>
                        )}
                      </div>
                      {/* Image fill for text */}
                      <div className="border-t border-gray-100 pt-2">
                        <h4 className="text-gray-700 text-xs font-semibold mb-1.5">Image dans le texte</h4>
                        <input type="file" accept="image/*" className="hidden" ref={shapeFillInputRef} onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !selectedObj) return;
                          const reader = new FileReader();
                          reader.onload = async (ev) => {
                            const dataUrl = ev.target?.result as string;
                            const fabric = await import("fabric");
                            const imgEl = new Image();
                            imgEl.onerror = () => { toast("Erreur chargement image", "error"); };
                            imgEl.onload = () => {
                              // Use large dimensions to ensure full coverage
                              const w = Math.max(selectedObj.width || 100, 2000);
                              const h = Math.max((selectedObj.height || 50) * (selectedObj.scaleY || 1) / (selectedObj.scaleX || 1), 2000);
                              const cs = Math.max(w / imgEl.width, h / imgEl.height);
                              const oX = (w - imgEl.width * cs) / 2;
                              const oY = (h - imgEl.height * cs) / 2;
                              const pattern = new fabric.Pattern({
                                source: imgEl, repeat: "no-repeat",
                                patternTransform: [cs, 0, 0, cs, oX, oY],
                              });
                              selectedObj.set({ fill: pattern });
                              (selectedObj as any)._patternImgEl = imgEl;
                              (selectedObj as any)._patternScale = cs;
                              (selectedObj as any)._patternBaseScale = cs;
                              (selectedObj as any)._patternOffsetX = oX;
                              (selectedObj as any)._patternOffsetY = oY;
                              selectedObj.dirty = true;
                              fabricRef.current?.requestRenderAll();
                              fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Motif texte" });
                              forceRender((n: number) => n + 1);
                            };
                            imgEl.src = dataUrl;
                          };
                          reader.readAsDataURL(file);
                          e.target.value = "";
                        }} />
                        <button onClick={() => shapeFillInputRef.current?.click()} className="w-full py-1.5 rounded-lg border-2 border-dashed border-gray-300 hover:border-[#4f46e5] text-[10px] text-gray-500 hover:text-[#4f46e5] transition-colors flex items-center justify-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          Image dans le texte
                        </button>
                        {(() => {
                          const canv = fabricRef.current;
                          const imgs = canv ? canv.getObjects().filter((o: any) => o.type === "image") : [];
                          if (imgs.length === 0) return null;
                          return (
                            <div className="mt-1.5">
                              <p className="text-[10px] text-gray-400 mb-1">Depuis le cadre :</p>
                              <div className="flex gap-1.5 flex-wrap">
                                {imgs.map((img: any, i: number) => {
                                  let src = "";
                                  try { src = img.getElement?.()?.src || ""; } catch { /* */ }
                                  if (!src) return null;
                                  return (
                                    <button key={i} onClick={async () => {
                                      const fabric = await import("fabric");
                                      const el = img.getElement();
                                      const w = Math.max(selectedObj.width || 100, 2000);
                                      const h = Math.max((selectedObj.height || 50) * (selectedObj.scaleY || 1) / (selectedObj.scaleX || 1), 2000);
                                      const cs = Math.max(w / el.width, h / el.height);
                                      const oX = (w - el.width * cs) / 2;
                                      const oY = (h - el.height * cs) / 2;
                                      const pattern = new fabric.Pattern({
                                        source: el, repeat: "no-repeat",
                                        patternTransform: [cs, 0, 0, cs, oX, oY],
                                      });
                                      selectedObj.set({ fill: pattern });
                                      (selectedObj as any)._patternImgEl = el;
                                      (selectedObj as any)._patternScale = cs;
                                      (selectedObj as any)._patternBaseScale = cs;
                                      (selectedObj as any)._patternOffsetX = oX;
                                      (selectedObj as any)._patternOffsetY = oY;
                                      selectedObj.dirty = true;
                                      fabricRef.current?.requestRenderAll();
                                      fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Motif texte" });
                                      forceRender((n: number) => n + 1);
                                    }} className="w-10 h-10 rounded border-2 border-gray-200 hover:border-[#4f46e5] overflow-hidden transition-colors">
                                      <img src={src} className="w-full h-full object-cover" alt="" />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                        {/* Pattern position/zoom controls for text */}
                        {(selectedObj as any)?._patternImgEl && (
                          <div className="mt-2 space-y-1.5">
                            <p className="text-[10px] text-gray-500 font-medium">Position de l&apos;image</p>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 w-10">Zoom</span>
                              <input type="range" min={50} max={400} value={Math.round(((selectedObj as any)._patternScale / (selectedObj as any)._patternBaseScale) * 100)}
                                onChange={(e) => {
                                  const pct = parseInt(e.target.value) / 100;
                                  const base = (selectedObj as any)._patternBaseScale;
                                  const ns = base * pct;
                                  (selectedObj as any)._patternScale = ns;
                                  const el = (selectedObj as any)._patternImgEl;
                                  const oX = (selectedObj as any)._patternOffsetX || 0;
                                  const oY = (selectedObj as any)._patternOffsetY || 0;
                                  import("fabric").then((fabric) => {
                                    selectedObj.set({ fill: new fabric.Pattern({ source: el, repeat: "no-repeat", patternTransform: [ns, 0, 0, ns, oX, oY] }) });
                                    selectedObj.dirty = true;
                                    fabricRef.current?.requestRenderAll();
                                    fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Motif texte", _continuous: true });
                                    forceRender((n: number) => n + 1);
                                  });
                                }} className="flex-1 accent-[#4f46e5] cursor-pointer" />
                              <span className="text-[10px] text-gray-500 w-8 tabular-nums">{Math.round(((selectedObj as any)._patternScale / ((selectedObj as any)._patternBaseScale || 1)) * 100)}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 w-10">Pos. X</span>
                              <input type="range" min={-500} max={500} value={Math.round((selectedObj as any)._patternOffsetX || 0)}
                                onChange={(e) => {
                                  const oX = parseInt(e.target.value);
                                  (selectedObj as any)._patternOffsetX = oX;
                                  const el = (selectedObj as any)._patternImgEl;
                                  const s = (selectedObj as any)._patternScale;
                                  const oY = (selectedObj as any)._patternOffsetY || 0;
                                  import("fabric").then((fabric) => {
                                    selectedObj.set({ fill: new fabric.Pattern({ source: el, repeat: "no-repeat", patternTransform: [s, 0, 0, s, oX, oY] }) });
                                    selectedObj.dirty = true;
                                    fabricRef.current?.requestRenderAll();
                                    fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Motif texte", _continuous: true });
                                    forceRender((n: number) => n + 1);
                                  });
                                }} className="flex-1 accent-[#4f46e5] cursor-pointer" />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 w-10">Pos. Y</span>
                              <input type="range" min={-500} max={500} value={Math.round((selectedObj as any)._patternOffsetY || 0)}
                                onChange={(e) => {
                                  const oY = parseInt(e.target.value);
                                  (selectedObj as any)._patternOffsetY = oY;
                                  const el = (selectedObj as any)._patternImgEl;
                                  const s = (selectedObj as any)._patternScale;
                                  const oX = (selectedObj as any)._patternOffsetX || 0;
                                  import("fabric").then((fabric) => {
                                    selectedObj.set({ fill: new fabric.Pattern({ source: el, repeat: "no-repeat", patternTransform: [s, 0, 0, s, oX, oY] }) });
                                    selectedObj.dirty = true;
                                    fabricRef.current?.requestRenderAll();
                                    fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Motif texte", _continuous: true });
                                    forceRender((n: number) => n + 1);
                                  });
                                }} className="flex-1 accent-[#4f46e5] cursor-pointer" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="w-px h-7 bg-gray-200 mx-2" />

              {/* Bold / Italic / Underline / Strikethrough */}
              {[
                { prop: "fontWeight", on: "bold", off: "normal", check: selectedObj.fontWeight === "bold" || selectedObj.fontWeight >= 700, icon: "B", cls: "font-bold" },
                { prop: "fontStyle", on: "italic", off: "normal", check: selectedObj.fontStyle === "italic", icon: "I", cls: "italic" },
                { prop: "underline", on: true, off: false, check: !!selectedObj.underline, icon: "U", cls: "underline" },
                { prop: "linethrough", on: true, off: false, check: !!selectedObj.linethrough, icon: "S", cls: "line-through" },
              ].map((s) => (
                <button
                  key={s.prop}
                  onClick={() => updateObj({ [s.prop]: s.check ? s.off : s.on })}
                  className={`w-9 h-9 rounded-lg text-[15px] flex items-center justify-center transition-colors ${s.cls} ${
                    s.check ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {s.icon}
                </button>
              ))}

              <div className="w-px h-7 bg-gray-200 mx-2" />

              {/* Text alignment */}
              {(["left", "center", "right"] as const).map((align) => (
                <button
                  key={align}
                  onClick={() => updateObj({ textAlign: align })}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    selectedObj.textAlign === align ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:bg-gray-100"
                  }`}
                  title={align === "left" ? "Aligner à gauche" : align === "center" ? "Centrer" : "Aligner à droite"}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {align === "left" && <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h14" />}
                    {align === "center" && <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M7 12h10M5 18h14" />}
                    {align === "right" && <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M10 12h10M6 18h14" />}
                  </svg>
                </button>
              ))}

              <div className="w-px h-7 bg-gray-200 mx-2" />

              {/* Line height */}
              <div className="flex items-center gap-1" title="Interligne">
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  <path strokeLinecap="round" strokeWidth={1.5} d="M21 3v18M21 3l-2 2M21 3l2 2M21 21l-2-2M21 21l2-2" />
                </svg>
                <input
                  type="number"
                  value={Math.round((selectedObj.lineHeight || 1.16) * 100) / 100}
                  onChange={(e) => updateObj({ lineHeight: parseFloat(e.target.value) || 1.16 })}
                  className="w-12 h-8 px-1 text-center rounded border border-gray-200 text-xs text-gray-800 focus:outline-none focus:border-[#4f46e5]"
                  min={0.5} max={3} step={0.1}
                />
              </div>

              {/* Letter spacing */}
              <div className="flex items-center gap-1" title="Espacement des lettres">
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeWidth={2} d="M3 12h18M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
                </svg>
                <input
                  type="number"
                  value={Math.round(selectedObj.charSpacing || 0)}
                  onChange={(e) => updateObj({ charSpacing: parseInt(e.target.value) || 0 })}
                  className="w-12 h-8 px-1 text-center rounded border border-gray-200 text-xs text-gray-800 focus:outline-none focus:border-[#4f46e5]"
                  min={-200} max={1000} step={10}
                />
              </div>

              {/* Capitalize (Aa) */}
              <button
                onClick={() => {
                  const canvas = fabricRef.current;
                  if (!canvas || !selectedObj) return;
                  const text = selectedObj.text || "";
                  const capitalized = text.replace(/\b\w/g, (c: string) => c.toUpperCase());
                  selectedObj.set({ text: capitalized });
                  canvas.requestRenderAll();
                  canvas.fire("object:modified", { target: selectedObj, _historyLabel: "Texte modifié — casse" });
                }}
                className="w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-colors text-gray-500 hover:bg-gray-100"
                title="Capitaliser (Première lettre)"
              >
                Aa
              </button>

              {/* Uppercase toggle */}
              <button
                onClick={() => {
                  const canvas = fabricRef.current;
                  if (!canvas || !selectedObj) return;
                  const text = selectedObj.text || "";
                  const isUpper = text === text.toUpperCase() && text !== text.toLowerCase();
                  selectedObj.set({ text: isUpper ? text.toLowerCase() : text.toUpperCase() });
                  canvas.requestRenderAll();
                  canvas.fire("object:modified", { target: selectedObj, _historyLabel: "Texte modifié — casse" });
                }}
                className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-colors ${
                  (selectedObj.text || "") === (selectedObj.text || "").toUpperCase() && (selectedObj.text || "") !== (selectedObj.text || "").toLowerCase()
                    ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:bg-gray-100"
                }`}
                title="Majuscules / Minuscules"
              >
                AA
              </button>

              <div className="w-px h-7 bg-gray-200 mx-2" />

              {/* Text effects button */}
              <div className="relative" ref={(el) => { if (el) el.dataset.effectsBtn = "1"; }}>
                <button
                  onClick={(e) => {
                    setShowTextEffects(!showTextEffects);
                    // Store button position for fixed popover
                    const rect = (e.target as HTMLElement).closest("[data-effects-btn]")?.getBoundingClientRect();
                    if (rect) setEffectsPos({ top: rect.bottom + 8, left: Math.min(rect.left, window.innerWidth - 300) });
                  }}
                  className={`h-9 px-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                    showTextEffects ? "bg-[#4f46e5] text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  Effets
                </button>

                {showTextEffects && (
                  <div className="fixed w-[280px] bg-white rounded-xl shadow-2xl border border-gray-200 z-[9999] p-4 space-y-4 overflow-y-auto" style={{ top: effectsPos.top, left: effectsPos.left, maxHeight: `calc(100vh - ${effectsPos.top}px - 16px)` }} onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-gray-800">Effets de texte</h4>
                      <button onClick={() => setShowTextEffects(false)} className="text-gray-400 hover:text-gray-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* ── Text stroke (outline) ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500 font-medium">Contour du texte</p>
                        <button
                          onClick={() => {
                            if (selectedObj.strokeWidth && selectedObj.strokeWidth > 0) {
                              updateObj({ stroke: "", strokeWidth: 0 });
                            } else {
                              updateObj({ stroke: "#000000", strokeWidth: 2, paintFirst: "stroke" });
                            }
                          }}
                          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${selectedObj.strokeWidth && selectedObj.strokeWidth > 0 ? "bg-[#4f46e5]" : "bg-gray-300"}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${selectedObj.strokeWidth && selectedObj.strokeWidth > 0 ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                      {!!(selectedObj.strokeWidth && selectedObj.strokeWidth > 0) && (
                        <div className="space-y-2 bg-gray-50 rounded-lg p-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-500 w-14">Couleur</span>
                            <label className="relative w-6 h-6 rounded-md border border-gray-200 overflow-hidden cursor-pointer flex-shrink-0">
                              <input type="color"
                                value={typeof selectedObj.stroke === "string" && selectedObj.stroke.startsWith("#") ? selectedObj.stroke : "#000000"}
                                onChange={(e) => updateObj({ stroke: e.target.value, paintFirst: "stroke" })}
                                className="absolute inset-0 opacity-0 cursor-pointer" />
                              <div className="w-full h-full" style={{ backgroundColor: typeof selectedObj.stroke === "string" ? selectedObj.stroke : "#000000" }} />
                            </label>
                            <div className="flex gap-1">
                              {["#000000", "#ffffff", "#fe0154", "#7c3aed", "#3b82f6", "#f59e0b"].map((c) => (
                                <button key={c} onClick={() => updateObj({ stroke: c, paintFirst: "stroke" })} className="w-4 h-4 rounded-full border border-gray-200 hover:scale-110 transition-transform flex-shrink-0" style={{ backgroundColor: c }} />
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-500 w-14">Épaisseur</span>
                            <input type="range" min={1} max={20} value={selectedObj.strokeWidth || 2}
                              onChange={(e) => updateObj({ strokeWidth: parseInt(e.target.value), paintFirst: "stroke" })}
                              className="flex-1 accent-[#4f46e5] cursor-pointer" />
                            <span className="text-[11px] text-gray-500 w-4 text-right tabular-nums">{selectedObj.strokeWidth || 2}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Style presets */}
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-2">Style</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Aucun", action: () => updateObj({ shadow: null, stroke: "", strokeWidth: 0, paintFirst: "fill", fill: "#1a1a2e" }) },
                          { label: "Ombres", action: () => updateObj({ shadow: "2px 2px 4px rgba(0,0,0,0.4)" }) },
                          { label: "Élévation", action: () => updateObj({ shadow: "0px 4px 8px rgba(0,0,0,0.3)" }) },
                        ].map((preset) => (
                          <button key={preset.label} onClick={preset.action}
                            className="py-2 px-2 rounded-lg border border-gray-200 hover:border-[#4f46e5] text-center transition-colors">
                            <span className="text-lg font-bold text-gray-800">Ag</span>
                            <p className="text-[9px] text-gray-400 mt-0.5">{preset.label}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Shadow controls */}
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 font-medium">Ombre portée</p>
                      {[
                        { label: "Distance", prop: "offsetX", min: 0, max: 50, val: selectedObj?.shadow?.offsetX || 0 },
                        { label: "Flou", prop: "blur", min: 0, max: 30, val: selectedObj?.shadow?.blur || 0 },
                      ].map((ctrl) => (
                        <div key={ctrl.label} className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500 w-14">{ctrl.label}</span>
                          <input type="range" min={ctrl.min} max={ctrl.max} value={ctrl.val}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              const shadow = selectedObj?.shadow || { offsetX: 2, offsetY: 2, blur: 4, color: "rgba(0,0,0,0.4)" };
                              const newShadow = { ...shadow, [ctrl.prop]: v };
                              if (ctrl.prop === "offsetX") newShadow.offsetY = v;
                              updateObj({ shadow: `${newShadow.offsetX}px ${newShadow.offsetY}px ${newShadow.blur}px ${newShadow.color || "rgba(0,0,0,0.4)"}` });
                            }}
                            className="flex-1 accent-[#4f46e5] cursor-pointer" />
                          <span className="text-[11px] text-gray-500 w-6 text-right">{ctrl.val}</span>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 w-14">Couleur</span>
                        <label className="relative w-6 h-6 rounded-md border border-gray-200 overflow-hidden cursor-pointer">
                          <input type="color"
                            value={selectedObj?.shadow?.color?.replace(/rgba?\([^)]+\)/, "#000000") || "#000000"}
                            onChange={(e) => {
                              const shadow = selectedObj?.shadow || { offsetX: 2, offsetY: 2, blur: 4 };
                              updateObj({ shadow: `${shadow.offsetX || 2}px ${shadow.offsetY || 2}px ${shadow.blur || 4}px ${e.target.value}` });
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer" />
                          <div className="w-full h-full" style={{ backgroundColor: "#000" }} />
                        </label>
                      </div>
                    </div>

                    {/* Effect presets */}
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-2">Effets spéciaux</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { label: "Contour", style: { WebkitTextStroke: "1px #666" } as React.CSSProperties, action: () => updateObj({ stroke: selectedObj?.fill === "#ffffff" ? "#000" : "#fff", strokeWidth: 2, paintFirst: "stroke" }) },
                          { label: "Néon", style: { color: "#a78bfa", textShadow: "0 0 8px #7c3aed" } as React.CSSProperties, action: () => updateObj({ fill: "#c084fc", stroke: "#7c3aed", strokeWidth: 1, paintFirst: "stroke", shadow: "0 0 15px #7c3aed" }) },
                          { label: "Rétro", style: { color: "#92400e", textShadow: "2px 2px 0 #fbbf24" } as React.CSSProperties, action: () => updateObj({ stroke: "#92400e", strokeWidth: 3, paintFirst: "stroke", shadow: "4px 4px 0px #92400e" }) },
                          { label: "Pop", style: { color: "#fbbf24", WebkitTextStroke: "1.5px #1a1a2e", textShadow: "2px 2px 0 #ef4444" } as React.CSSProperties, action: () => updateObj({ fill: "#fbbf24", stroke: "#1a1a2e", strokeWidth: 4, paintFirst: "stroke", shadow: "3px 3px 0px #ef4444" }) },
                          { label: "Feu", style: { color: "#f97316", textShadow: "0 0 8px #ef4444" } as React.CSSProperties, action: () => updateObj({ fill: "#ef4444", stroke: "#7f1d1d", strokeWidth: 2, paintFirst: "stroke", shadow: "0 0 15px #f97316" }) },
                          { label: "Givré", style: { color: "#93c5fd", textShadow: "0 0 8px #3b82f6" } as React.CSSProperties, action: () => updateObj({ fill: "#bfdbfe", stroke: "#1e40af", strokeWidth: 1, paintFirst: "stroke", shadow: "0 0 12px #3b82f6" }) },
                          { label: "Or", style: { color: "#d4a574", textShadow: "1px 1px 4px #92400e80" } as React.CSSProperties, action: () => updateObj({ fill: "#d4a574", stroke: "#92400e", strokeWidth: 1, paintFirst: "stroke", shadow: "2px 2px 8px rgba(146,64,14,0.3)" }) },
                          { label: "Ombre 3D", style: { textShadow: "3px 3px 0 #7c3aed" } as React.CSSProperties, action: () => updateObj({ shadow: "5px 5px 0px #7c3aed" }) },
                          { label: "Glitch", style: { color: "#fff", textShadow: "2px 0 #ff00ff, -2px 0 #00ffff" } as React.CSSProperties, action: () => updateObj({ fill: "#ffffff", shadow: "3px 0px 0px #00ffff" }) },
                          { label: "Long", style: { color: "#fff", textShadow: "1px 1px 0 #5b21b6, 2px 2px 0 #5b21b6, 3px 3px 0 #5b21b6" } as React.CSSProperties, action: () => updateObj({ fill: "#ffffff", shadow: "1px 1px 0 #7c3aed" }) },
                          { label: "Relief", style: { color: "#d1d5db", textShadow: "-1px -1px 0 #fff, 1px 1px 2px #9ca3af" } as React.CSSProperties, action: () => updateObj({ fill: "#d1d5db", shadow: "-1px -1px 0px #ffffff" }) },
                          { label: "Craie", style: { color: "#fff", fontFamily: "'Amatic SC', sans-serif", fontSize: "18px" } as React.CSSProperties, action: () => updateObj({ fill: "#ffffff", shadow: "0 0 3px rgba(255,255,255,0.5)" }) },
                          { label: "Pastel", style: { color: "#c084fc", textShadow: "0 2px 6px #c084fc30" } as React.CSSProperties, action: () => updateObj({ fill: "#c084fc", shadow: "0 2px 8px rgba(192,132,252,0.3)" }) },
                          { label: "Disco", style: { color: "#f0abfc", textShadow: "0 0 10px #d946ef" } as React.CSSProperties, action: () => updateObj({ fill: "#f0abfc", stroke: "#7e22ce", strokeWidth: 2, paintFirst: "stroke", shadow: "0 0 20px #d946ef" }) },
                          { label: "Tampon", style: { color: "transparent", WebkitTextStroke: "2px #dc2626" } as React.CSSProperties, action: () => updateObj({ fill: "transparent", stroke: "#dc2626", strokeWidth: 4, paintFirst: "stroke" }) },
                          { label: "Graffiti", style: { color: "#fbbf24", WebkitTextStroke: "2px #000", textShadow: "2px 2px 0 #ef4444" } as React.CSSProperties, action: () => updateObj({ fill: "#fbbf24", stroke: "#000000", strokeWidth: 5, paintFirst: "stroke", shadow: "3px 3px 0px #ef4444" }) },
                        ].map(fx => (
                          <button key={fx.label} onClick={fx.action}
                            className="py-2 px-1 rounded-lg border border-gray-200 hover:border-[#4f46e5] text-center transition-colors">
                            <span className="text-base font-bold text-gray-800" style={fx.style}>Ag</span>
                            <p className="text-[8px] text-gray-400 mt-0.5 leading-tight">{fx.label}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Stroke width for outline effect */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500 w-14">Contour</span>
                      <input type="range" min={0} max={10}
                        value={selectedObj?.strokeWidth || 0}
                        onChange={(e) => updateObj({ strokeWidth: Number(e.target.value), stroke: selectedObj?.stroke || "#000", paintFirst: "stroke", strokeUniform: true })}
                        className="flex-1 accent-[#4f46e5] cursor-pointer" />
                      <span className="text-[11px] text-gray-500 w-6 text-right">{selectedObj?.strokeWidth || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500 w-14">Coul.</span>
                      <label className="relative w-6 h-6 rounded-md border border-gray-200 overflow-hidden cursor-pointer">
                        <input type="color"
                          value={typeof selectedObj?.stroke === "string" && selectedObj.stroke ? selectedObj.stroke : "#000000"}
                          onChange={(e) => updateObj({ stroke: e.target.value, paintFirst: "stroke" })}
                          className="absolute inset-0 opacity-0 cursor-pointer" />
                        <div className="w-full h-full" style={{ backgroundColor: typeof selectedObj?.stroke === "string" ? selectedObj.stroke : "#000" }} />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </>
    </>
  );
}
export { TextToolbarComponent as TextToolbar };
