"use client";
import React from "react";
import { GRADIENT_PRESETS } from "../panels/PanelFonds";
import { useEditorStore } from "../store/editorStore";

/* Shoot zone contextual toolbar — extracted from FrameEditor */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ShootToolbarComponent({ updateObj, addShootZone }: { updateObj: (props: Record<string, any>) => void; addShootZone: () => void }) {
  const selectedObj = useEditorStore(s => s.selectedObj);
  const fabricRef = useEditorStore(s => s.fabricRef);
  const forceRender = useEditorStore(s => s.forceRender);
  const _forceRenderCount = useEditorStore(s => s._forceRenderCount);
  const showShootStrokePanel = useEditorStore(s => s.showShootStrokePanel);
  const setShowShootStrokePanel = useEditorStore(s => s.setShowShootStrokePanel);
  const shootStrokePanelPos = useEditorStore(s => s.shootStrokePanelPos);
  const setShootStrokePanelPos = useEditorStore(s => s.setShootStrokePanelPos);
  const shootStrokeBtnRef = useEditorStore(s => s.shootStrokeBtnRef);
  const showCornerPanel = useEditorStore(s => s.showCornerPanel);
  const setShowCornerPanel = useEditorStore(s => s.setShowCornerPanel);
  const cornerPanelPos = useEditorStore(s => s.cornerPanelPos);
  const setCornerPanelPos = useEditorStore(s => s.setCornerPanelPos);
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
              {/* Lock/unlock is handled by the yellow banner in ContextualToolbar */}
              {/* ── Editing controls (only when unlocked) ── */}
              {!selectedObj._shootLocked && (
                <>
                <div className="w-px h-7 bg-gray-200 mx-1" />

                {/* Border radius */}
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16V8a4 4 0 014-4h8" />
                  </svg>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(selectedObj.rx || 0)}
                    onChange={(e) => {
                      const r = parseInt(e.target.value);
                      if (selectedObj._individualCorners) {
                        selectedObj._individualCorners = false;
                        selectedObj.set({ clipPath: undefined });
                      }
                      updateObj({ rx: r, ry: r });
                      selectedObj._shootBorderRadius = r;
                      selectedObj._radiusTL = r; selectedObj._radiusTR = r;
                      selectedObj._radiusBR = r; selectedObj._radiusBL = r;
                    }}
                   
                    className="w-20 accent-[#4f46e5] cursor-pointer"
                   
                  />
                  <span className="text-xs text-gray-500 w-8 tabular-nums">{Math.round(selectedObj.rx || 0)}px</span>
                  {/* Individual corners toggle */}
                  <div className="relative">
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
                </div>

              {/* Quick radius presets */}
              <div className="flex items-center gap-1">
                {[0, 16, 30].map((r) => (
                  <button
                    key={r}
                    onClick={() => { updateObj({ rx: r, ry: r }); if (selectedObj._individualCorners) { selectedObj._individualCorners = false; selectedObj.set({ clipPath: undefined }); } selectedObj._radiusTL = r; selectedObj._radiusTR = r; selectedObj._radiusBR = r; selectedObj._radiusBL = r; fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Rayon zone photo" }); }}
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
                      (selectedObj.rx || 0) === r ? "border-[#4f46e5] bg-purple-50 text-[#4f46e5]" : "border-gray-200 text-gray-400 hover:border-gray-400"
                    }`}
                    title={r === 0 ? "Angles droits" : `Arrondi ${r}px`}
                  >
                    <div className="w-3.5 h-3.5 border-2 border-current" style={{ borderRadius: `${r === 0 ? 0 : r <= 16 ? 3 : 7}px` }} />
                  </button>
                ))}
              </div>

                <div className="w-px h-7 bg-gray-200 mx-1" />

                {/* Contour toggle + options */}
                <button
                  onClick={() => {
                    const hasStroke = (selectedObj.strokeWidth || 0) > 0;
                    if (hasStroke) {
                      updateObj({ strokeWidth: 0, stroke: "" });
                      setShowShootStrokePanel(false);
                    } else {
                      updateObj({ strokeWidth: 3, stroke: "#fe0154", strokeUniform: true, paintFirst: "stroke" });
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

                {/* Contour options — only when enabled */}
                {(selectedObj.strokeWidth || 0) > 0 && (
                  <>
                    {/* Stroke color / gradient */}
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
                        title="Couleur / dégradé de bordure"
                      >
                        <div className="w-5 h-5 rounded border border-gray-300" style={{
                          background: typeof selectedObj.stroke === "string"
                            ? selectedObj.stroke
                            : selectedObj.stroke?.colorStops
                              ? `linear-gradient(to right, ${selectedObj.stroke.colorStops.map((s: {color: string}) => s.color).join(", ")})`
                              : "#fe0154",
                        }} />
                        <svg className={`w-3 h-3 text-gray-400 transition-transform ${showShootStrokePanel ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {showShootStrokePanel && (
                        <div>
                        <div className="fixed inset-0 z-[9998]" onMouseDown={() => setShowShootStrokePanel(false)} />
                        <div className="fixed bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-[9999] w-[280px] space-y-3 overflow-y-auto" style={{ top: shootStrokePanelPos.top, left: shootStrokePanelPos.left, maxHeight: `calc(100vh - ${shootStrokePanelPos.top}px - 16px)` }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                          {/* Solid color */}
                          <div>
                            <h4 className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Couleur unie</h4>
                            <div className="flex items-center gap-2">
                              <label className="relative w-8 h-8 rounded-lg border border-gray-200 overflow-hidden cursor-pointer flex-shrink-0">
                                <input type="color" value={typeof selectedObj.stroke === "string" ? selectedObj.stroke : "#fe0154"} onChange={(e) => { updateObj({ stroke: e.target.value, strokeWidth: Math.max(2, selectedObj.strokeWidth || 2), strokeUniform: true, paintFirst: "stroke" }); }} className="absolute inset-0 opacity-0 cursor-pointer" />
                                <div className="w-full h-full" style={{ backgroundColor: typeof selectedObj.stroke === "string" ? selectedObj.stroke : "#fe0154" }} />
                              </label>
                              <div className="flex flex-wrap gap-1">
                                {["#fe0154", "#000000", "#ffffff", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"].map((c) => (
                                  <button key={c} onClick={() => updateObj({ stroke: c, strokeWidth: Math.max(2, selectedObj.strokeWidth || 2), strokeUniform: true, paintFirst: "stroke" })} className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${typeof selectedObj.stroke === "string" && selectedObj.stroke === c ? "border-gray-800 scale-110" : "border-gray-200"}`} style={{ backgroundColor: c }} />
                                ))}
                              </div>
                            </div>
                          </div>
                          {/* Gradient presets */}
                          <div>
                            <h4 className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1.5">Dégradé</h4>
                            <div className="grid grid-cols-6 gap-1.5">
                              {GRADIENT_PRESETS.map((g, i) => (
                                <button
                                  key={i}
                                  onClick={async () => {
                                    const fabric = await import("fabric");
                                    const w = selectedObj.width || 100;
                                    const h = selectedObj.height || 100;
                                    const coords = g.dir === "horizontal" ? { x1: 0, y1: 0, x2: w, y2: 0 } : g.dir === "vertical" ? { x1: 0, y1: 0, x2: 0, y2: h } : { x1: 0, y1: 0, x2: w, y2: h };
                                    const grad = new fabric.Gradient({ type: "linear", coords, colorStops: [{ offset: 0, color: g.colors[0] }, { offset: 1, color: g.colors[1] }] });
                                    selectedObj.set({ stroke: grad, strokeWidth: Math.max(3, selectedObj.strokeWidth || 3), strokeUniform: true, paintFirst: "stroke" });
                                    setShootGradColor1(g.colors[0]);
                                    setShootGradColor2(g.colors[1]);
                                    fabricRef.current?.requestRenderAll();
                                    fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Contour zone photo" });
                                    forceRender((n: number) => n + 1);
                                  }}
                                  className="w-full aspect-square rounded-full border-2 border-gray-100 hover:border-gray-400 hover:scale-110 transition-all"
                                  style={{ background: `linear-gradient(${g.dir === "horizontal" ? "to right" : g.dir === "vertical" ? "to bottom" : "to bottom right"}, ${g.colors[0]}, ${g.colors[1]})` }}
                                />
                              ))}
                            </div>
                          </div>
                          {/* Custom gradient with type & direction */}
                          <div className="border-t border-gray-100 pt-2">
                            <button onClick={() => setShowCustomGrad(!showCustomGrad)} className="flex items-center gap-1 text-[10px] text-[#4f46e5] font-medium hover:underline mb-1">
                              <svg className={`w-3 h-3 transition-transform ${showCustomGrad ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              Dégradé sur mesure
                            </button>
                            {showCustomGrad && (
                          <div className="space-y-2.5">
                            {/* Preview */}
                            <div className="w-full h-10 rounded-lg border border-gray-200" style={{
                              background: shootGradType === "radial"
                                ? `radial-gradient(circle, ${shootGradColor1}, ${shootGradColor2})`
                                : `linear-gradient(${shootGradAngle + 90}deg, ${shootGradColor1}, ${shootGradColor2})`,
                            }} />
                            {/* Color pickers */}
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
                            {/* Gradient type */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-400 w-8">Type</span>
                              <div className="flex gap-1 flex-1">
                                {([["linear", "Linéaire"], ["radial", "Radial"]] as const).map(([t, label]) => (
                                  <button key={t} onClick={() => setShootGradType(t)} className={`flex-1 h-7 rounded-md text-[10px] font-medium transition-colors ${shootGradType === t ? "bg-[#4f46e5] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{label}</button>
                                ))}
                              </div>
                            </div>
                            {/* Direction (linear only) */}
                            {shootGradType === "linear" && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-gray-400 w-8">Sens</span>
                                <div className="flex gap-1">
                                  {[
                                    { angle: 0, label: "→", title: "Gauche à droite" },
                                    { angle: 90, label: "↓", title: "Haut en bas" },
                                    { angle: 135, label: "↘", title: "Diagonale" },
                                    { angle: 180, label: "←", title: "Droite à gauche" },
                                    { angle: 270, label: "↑", title: "Bas en haut" },
                                    { angle: 315, label: "↗", title: "Diagonale inversée" },
                                  ].map((d) => (
                                    <button key={d.angle} onClick={() => setShootGradAngle(d.angle)} className={`w-7 h-7 rounded-md text-xs font-bold transition-colors ${shootGradAngle === d.angle ? "bg-[#4f46e5] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`} title={d.title}>{d.label}</button>
                                  ))}
                                </div>
                                <input type="number" min={0} max={360} value={shootGradAngle} onChange={(e) => setShootGradAngle(parseInt(e.target.value) || 0)} className="w-12 h-7 rounded-md border border-gray-200 text-[10px] text-center text-gray-600 focus:outline-none focus:border-[#4f46e5]" title="Angle en degrés" />
                              </div>
                            )}
                            {/* Apply */}
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
                                      x1: cx - (Math.cos(rad) * len) / 2,
                                      y1: cy - (Math.sin(rad) * len) / 2,
                                      x2: cx + (Math.cos(rad) * len) / 2,
                                      y2: cy + (Math.sin(rad) * len) / 2,
                                    },
                                    colorStops: [{ offset: 0, color: shootGradColor1 }, { offset: 1, color: shootGradColor2 }],
                                  });
                                }
                                selectedObj.set({ stroke: grad, strokeWidth: Math.max(3, selectedObj.strokeWidth || 3), strokeUniform: true, paintFirst: "stroke" });
                                fabricRef.current?.requestRenderAll();
                                fabricRef.current?.fire("object:modified", { target: selectedObj, _historyLabel: "Contour zone photo" });
                                forceRender((n: number) => n + 1);
                              }}
                              className="w-full py-1.5 rounded-lg bg-[#4f46e5] text-white text-[11px] font-semibold hover:bg-[#e0014a] transition-colors"
                            >
                              Appliquer le dégradé
                            </button>
                          </div>
                        )}
                        </div>
                        </div>
                        </div>
                      )}
                    </div>

                    {/* Stroke width */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="range"
                        min={1}
                        max={20}
                        value={Math.round(selectedObj.strokeWidth || 3)}
                        onChange={(e) => {
                          const sw = parseInt(e.target.value);
                          const dashStyle = selectedObj._dashStyle || "solid";
                          const dashArray = dashStyle === "solid" ? [] : dashStyle === "dashed" ? [sw * 2, sw] : dashStyle === "dotted" ? [1, sw * 1.5] : dashStyle === "mixed" ? [sw * 3, sw, 1, sw] : [];
                          updateObj({ strokeWidth: sw, strokeDashArray: dashArray, strokeUniform: true });
                        }}
                        className="w-16 accent-[#4f46e5] cursor-pointer"
                      />
                      <span className="text-xs text-gray-500 w-4 tabular-nums">{Math.round(selectedObj.strokeWidth || 3)}</span>
                    </div>

                    {/* Dash styles */}
                    <div className="flex items-center gap-0.5">
                      {([
                        { label: "Plein", id: "solid", dash: null as number[] | null },
                        { label: "Tirets", id: "dashed", dash: [2, 1] },
                        { label: "Pointillés", id: "dotted", dash: [0.1, 1.5] },
                        { label: "Mixte", id: "mixed", dash: [3, 1, 0.1, 1] },
                      ] as const).map((style) => {
                        const isActive = (selectedObj._dashStyle || "solid") === style.id;
                        const sw = selectedObj.strokeWidth || 3;
                        return (
                          <button key={style.label} onClick={() => {
                            const dashArray = style.dash ? style.dash.map(v => v * sw) : [];
                            const canvas = fabricRef.current;
                            const obj = canvas?.getActiveObject();
                            if (obj) obj._dashStyle = style.id;
                            updateObj({ strokeDashArray: dashArray, strokeUniform: true });
                          }}
                            className={`h-7 w-9 rounded border flex items-center justify-center transition-colors ${isActive ? "border-[#4f46e5] bg-indigo-50" : "border-gray-200 hover:border-gray-400"}`} title={style.label}>
                            <svg width="24" height="4" viewBox="0 0 24 4"><line x1="0" y1="2" x2="24" y2="2" stroke={isActive ? "#fe0154" : "#999"} strokeWidth="2" strokeDasharray={style.dash ? style.dash.map(v => v * 4).join(",") : "none"} strokeLinecap={style.id === "dotted" ? "round" : "butt"} /></svg>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="w-px h-7 bg-gray-200 mx-1" />

                {/* ── Bordures décoratives ── */}
                <div className="flex items-center gap-1">
                  {([
                    { id: "none", label: "Aucune", stroke: "", strokeWidth: 0, shadow: null, bg: "#f3f4f6", border: "#d1d5db", preview: { stroke: "#d1d5db", sw: 1, dash: "4 2" } },
                    { id: "gold", label: "Doré", stroke: "#d4a574", strokeWidth: 4, shadow: "0px 0px 8px rgba(212,165,116,0.5)", bg: "linear-gradient(135deg, #d4a574, #f5deb3)", border: "#d4a574", preview: { stroke: "#d4a574", sw: 3, dash: "" } },
                    { id: "silver", label: "Argent", stroke: "#c0c0c0", strokeWidth: 4, shadow: "0px 0px 8px rgba(192,192,192,0.5)", bg: "linear-gradient(135deg, #e8e8e8, #c0c0c0)", border: "#a8a8a8", preview: { stroke: "#c0c0c0", sw: 3, dash: "" } },
                    { id: "neon-pink", label: "Néon rose", stroke: "#fe0154", strokeWidth: 3, shadow: "0px 0px 12px #fe0154", bg: "#1a1a2e", border: "#fe0154", preview: { stroke: "#fe0154", sw: 2, dash: "" } },
                    { id: "neon-blue", label: "Néon bleu", stroke: "#3b82f6", strokeWidth: 3, shadow: "0px 0px 12px #3b82f6", bg: "#0f172a", border: "#3b82f6", preview: { stroke: "#3b82f6", sw: 2, dash: "" } },
                    { id: "polaroid", label: "Polaroid", stroke: "#ffffff", strokeWidth: 8, shadow: "2px 3px 8px rgba(0,0,0,0.2)", bg: "#ffffff", border: "#e5e7eb", preview: { stroke: "#fff", sw: 5, dash: "" } },
                    { id: "vintage", label: "Vintage", stroke: "#92400e", strokeWidth: 5, shadow: "3px 3px 0px rgba(0,0,0,0.15)", bg: "#fef3c7", border: "#92400e", preview: { stroke: "#92400e", sw: 3, dash: "" } },
                    { id: "double", label: "Double", stroke: "#1a1a2e", strokeWidth: 6, shadow: null, bg: "#ffffff", border: "#1a1a2e", preview: { stroke: "#1a1a2e", sw: 2, dash: "0 3" } },
                  ] as const).map(b => {
                    const isActive = b.id === "none"
                      ? (selectedObj.strokeWidth || 0) === 0
                      : selectedObj._borderStyle === b.id;
                    return (
                      <button
                        key={b.id}
                        onClick={() => {
                          const canvas = fabricRef.current;
                          const obj = canvas?.getActiveObject();
                          if (!obj) return;
                          if (b.id === "none") {
                            updateObj({ stroke: "", strokeWidth: 0, shadow: null });
                            obj._borderStyle = undefined;
                            canvas?.fire("object:modified", { target: obj, _historyLabel: "Bordure zone photo" });
                            forceRender((n: number) => n + 1);
                            return;
                          }
                          // Apply border preset. Await the fabric import
                          // BEFORE calling updateObj so the shadow and
                          // stroke commit together — previously updateObj
                          // ran synchronously and a late-resolving import
                          // could overwrite a subsequent "Aucune" click
                          // with stale shadow state.
                          obj._borderStyle = b.id;
                          const props: Record<string, any> = {
                            stroke: b.stroke,
                            strokeWidth: b.strokeWidth,
                            strokeUniform: true,
                            paintFirst: "stroke",
                          };
                          (async () => {
                            // Bail if selection changed while we waited
                            const currentStyle = b.id;
                            if (b.shadow) {
                              const fabric = await import("fabric");
                              if (obj._borderStyle !== currentStyle) return;
                              const m = b.shadow!.match(/([-\d.]+)(?:px)?\s+([-\d.]+)(?:px)?\s+([-\d.]+)(?:px)?\s+(.+)/);
                              if (m) obj.set({ shadow: new fabric.Shadow({ offsetX: parseFloat(m[1]), offsetY: parseFloat(m[2]), blur: parseFloat(m[3]), color: m[4].trim() }) });
                            } else {
                              obj.set({ shadow: null });
                            }
                            if (obj._borderStyle !== currentStyle) return;
                            updateObj(props);
                            canvas?.fire("object:modified", { target: obj, _historyLabel: "Bordure zone photo" });
                            forceRender((n: number) => n + 1);
                          })();
                        }}
                        className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all hover:scale-110 ${isActive ? "border-[#4f46e5] shadow-sm" : "border-gray-200 hover:border-gray-400"}`}
                        style={{ background: b.bg }}
                        title={b.label}
                      >
                        <svg width="16" height="12" viewBox="0 0 16 12">
                          <rect x="1" y="1" width="14" height="10" rx="1.5" fill="none" stroke={b.preview.stroke} strokeWidth={b.preview.sw} strokeDasharray={b.preview.dash || "none"} />
                        </svg>
                      </button>
                    );
                  })}
                </div>

                </>
              )}
            </>
    </>
  );
}
export { ShootToolbarComponent as ShootToolbar };
